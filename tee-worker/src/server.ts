/**
 * skillsic TEE Analysis Worker
 * 
 * Runs inside a Phala Cloud CVM (Confidential VM / TEE).
 * 
 * Flow:
 * 1. ICP canister sends HTTP request with { encrypted_api_key, skill_data, model }
 * 2. Worker derives decryption key from dstack KMS (deterministic, TEE-bound)
 * 3. Decrypts user's Anthropic API key inside TEE memory
 * 4. Calls Anthropic API with the plaintext key
 * 5. Returns structured analysis JSON back to ICP canister
 * 
 * The API key is NEVER stored on disk or logged — only exists in TEE memory during the request.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { DstackClient } from '@phala/dstack-sdk';
import { decrypt, getPublicKeyHex } from './crypto.js';
import { callAnthropic } from './anthropic.js';
import { buildAnalysisPrompt, type SkillData, type AnalysisRequest } from './types.js';
import {
  getWorkerActor, getWorkerPrincipal,
  claimPendingJobs, submitJobResultWithMetadata, submitJobError,
  claimEnrichmentJobs, submitEnrichmentResult, submitEnrichmentError,
  fetchPromptTemplate, cachedPromptVersion,
  type PendingJob,
  type PendingEnrichmentJob,
  type EnrichmentResult,
} from './canister-client.js';

const WORKER_VERSION = '1.9.5';

const app = new Hono();

// Allow the ICP frontend to call /public-key from the browser
app.use('*', cors({
  origin: [
    'https://fh3vn-4yaaa-aaaak-qvwga-cai.icp0.io',
    'https://fh3vn-4yaaa-aaaak-qvwga-cai.raw.icp0.io',
    'http://localhost:5173',  // dev
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));
const PORT = Number(process.env.PORT || 3000);
const DEV_MODE = process.env.DEV_MODE === 'true';

// Key derivation path — deterministic within this TEE application
const KEY_PATH = 'skillsic/api-key-encryption/v1';

// dstack client for TEE key derivation and attestation (v0.5.x API)
let dstackClient: DstackClient | null = null;

function getDstackClient(): DstackClient {
  if (!dstackClient) {
    // DstackClient defaults to /var/run/dstack.sock (dstack v0.5.x)
    // Constructor throws if socket file doesn't exist, so this will fail
    // in dev mode (which is expected — TEE features are disabled in dev).
    dstackClient = new DstackClient();
  }
  return dstackClient;
}

/**
 * Derive the 32-byte encryption key from TEE KMS.
 * This key is deterministic — same app on same TEE always gets the same key.
 * Uses dstack v0.5.x getKey() API which returns raw Uint8Array.
 */
async function deriveEncryptionKey(): Promise<Uint8Array> {
  const client = getDstackClient();
  const result = await client.getKey(KEY_PATH, 'encryption');
  // getKey() returns { key: Uint8Array(32), signature_chain }
  return result.key;
}

// ============================================================================
// Health / Info
// ============================================================================

app.get('/', (c) => {
  return c.json({
    service: 'skillsic-tee-worker',
    version: WORKER_VERSION,
    status: 'running',
    tee: !DEV_MODE,
    description: 'Secure skill analysis via Phala TEE — API keys never leave the enclave',
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================================================
// GET /public-key — Returns the TEE-derived public key for encrypting API keys
// ============================================================================

app.get('/public-key', async (c) => {
  try {
    const keyBytes = await deriveEncryptionKey();
    const publicKeyHex = getPublicKeyHex(keyBytes);

    return c.json({
      public_key: publicKeyHex,
      key_path: KEY_PATH,
      algorithm: 'aes-256-gcm',
      note: 'Use this key to encrypt your Anthropic API key before storing on ICP',
    });
  } catch (error) {
    if (DEV_MODE) {
      return c.json({
        public_key: 'dev-mode-no-tee-available',
        key_path: KEY_PATH,
        algorithm: 'aes-256-gcm',
        note: 'DEV MODE — no real TEE key available',
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'Failed to derive TEE key', detail: message }, 500);
  }
});

// ============================================================================
// POST /analyze — Main analysis endpoint
// ============================================================================

app.post('/analyze', async (c) => {
  const startTime = Date.now();

  try {
    const body = await c.req.json<AnalysisRequest>();

    if (!body.encrypted_api_key && !body.api_key) {
      return c.json({ error: 'Missing encrypted_api_key or api_key' }, 400);
    }
    if (!body.skill) {
      return c.json({ error: 'Missing skill data' }, 400);
    }

    // Step 1: Get the API key
    let apiKey: string;

    if (body.encrypted_api_key) {
      try {
        const keyBytes = await deriveEncryptionKey();
        apiKey = decrypt(body.encrypted_api_key, keyBytes);
      } catch (error) {
        return c.json({ error: 'Failed to decrypt API key in TEE' }, 500);
      }
    } else if (body.api_key && DEV_MODE) {
      apiKey = body.api_key;
    } else {
      return c.json({ error: 'Encrypted API key required in production' }, 400);
    }

    // Step 2: Build prompt and call Anthropic
    const model = body.model || 'claude-sonnet-4-20250514';
    if (!body.prompt_template) {
      return c.json({ error: 'Missing prompt_template - required for direct /analyze endpoint' }, 400);
    }
    const prompt = buildAnalysisPrompt(body.skill, body.prompt_template);
    const analysis = await callAnthropic(apiKey, model, prompt);

    // Step 3: Clear key from memory
    apiKey = '';

    return c.json({
      success: true,
      analysis,
      metadata: {
        model_used: model,
        analysis_time_ms: Date.now() - startTime,
        tee_secured: !DEV_MODE,
        worker_version: WORKER_VERSION,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({
      success: false,
      error: message,
      metadata: {
        analysis_time_ms: Date.now() - startTime,
        tee_secured: !DEV_MODE,
      },
    }, 500);
  }
});

// ============================================================================
// POST /analyze-batch — Batch analysis (max 10 skills)
// ============================================================================

app.post('/analyze-batch', async (c) => {
  try {
    const body = await c.req.json<{
      encrypted_api_key?: string;
      api_key?: string;
      skills: SkillData[];
      model?: string;
      prompt_template?: string;
    }>();

    if (!body.skills || body.skills.length === 0) {
      return c.json({ error: 'Missing skills array' }, 400);
    }
    if (body.skills.length > 10) {
      return c.json({ error: 'Max 10 skills per batch' }, 400);
    }
    if (!body.prompt_template) {
      return c.json({ error: 'Missing prompt_template - required for direct /analyze-batch endpoint' }, 400);
    }

    let apiKey: string;
    if (body.encrypted_api_key) {
      const keyBytes = await deriveEncryptionKey();
      apiKey = decrypt(body.encrypted_api_key, keyBytes);
    } else if (body.api_key && DEV_MODE) {
      apiKey = body.api_key;
    } else {
      return c.json({ error: 'Encrypted API key required' }, 400);
    }

    const model = body.model || 'claude-sonnet-4-20250514';
    const results = [];

    for (const skill of body.skills) {
      try {
        const prompt = buildAnalysisPrompt(skill, body.prompt_template);
        const analysis = await callAnthropic(apiKey, model, prompt);
        results.push({ skill_id: skill.id, success: true, analysis });
      } catch (error) {
        results.push({
          skill_id: skill.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    apiKey = '';

    return c.json({
      success: true,
      results,
      metadata: {
        total: body.skills.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        model_used: model,
        tee_secured: !DEV_MODE,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// GET /attestation — TEE attestation report
// ============================================================================

app.get('/attestation', async (c) => {
  try {
    const client = getDstackClient();
    // v0.5.x: getQuote() takes raw report data (max 64 bytes), no hash_algorithm param
    // Hash the identifier to get a fixed-size report
    const { createHash } = await import('node:crypto');
    const reportData = createHash('sha256').update('skillsic-tee-worker-v1').digest();
    const attestation = await client.getQuote(reportData.subarray(0, 32));

    return c.json({
      quote: attestation.quote,
      event_log: attestation.event_log,
      timestamp: Date.now(),
      verify_url: 'https://ra-quote-explorer.vercel.app/',
    });
  } catch (error) {
    if (DEV_MODE) {
      return c.json({
        quote: 'dev-mode-no-attestation',
        note: 'DEV MODE — no real TEE attestation available',
      });
    }
    return c.json({ error: 'Failed to get attestation' }, 500);
  }
});

// ============================================================================
// GET /info — TEE application info
// ============================================================================

app.get('/info', async (c) => {
  try {
    const client = getDstackClient();
    const info = await client.info();
    return c.json(info);
  } catch (error) {
    if (DEV_MODE) {
      return c.json({ note: 'DEV MODE — no TEE info available' });
    }
    return c.json({ error: 'Failed to get TEE info' }, 500);
  }
});

// ============================================================================
// GET /worker-principal — Shows the TEE worker's IC principal (for registration)
// ============================================================================

app.get('/worker-principal', async (c) => {
  try {
    const keyBytes = await deriveEncryptionKey();
    const principal = getWorkerPrincipal(keyBytes);
    return c.json({
      principal,
      note: 'Register this principal as a worker on the canister via add_worker()',
    });
  } catch (error) {
    if (DEV_MODE) {
      return c.json({ principal: 'dev-mode-no-principal', note: 'DEV MODE' });
    }
    return c.json({ error: 'Failed to derive worker identity' }, 500);
  }
});

// ============================================================================
// Job Queue Polling Loop (Analysis + Enrichment)
// ============================================================================

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000); // 5s default
let isPolling = false;

async function pollJobQueue(): Promise<void> {
  if (isPolling || DEV_MODE) return;
  isPolling = true;

  try {
    const keyBytes = await deriveEncryptionKey();
    const actor = await getWorkerActor(keyBytes);

    // Poll analysis jobs
    const jobs = await claimPendingJobs(actor, 5);
    if (jobs.length > 0) {
      console.log(`[poll] Claimed ${jobs.length} analysis job(s)`);
    }
    for (const job of jobs) {
      await processJob(job, keyBytes, actor);
    }

    // Poll enrichment jobs
    const enrichJobs = await claimEnrichmentJobs(actor, 10);
    if (enrichJobs.length > 0) {
      console.log(`[poll] Claimed ${enrichJobs.length} enrichment job(s)`);
    }
    for (const job of enrichJobs) {
      await processEnrichmentJob(job, actor);
    }
  } catch (error) {
    // Silently skip polling errors (canister may be unreachable briefly)
    const msg = error instanceof Error ? error.message : String(error);
    // Only log real errors, not "no pending jobs"
    if (!msg.includes('Worker or admin role required')) {
      console.error(`[poll] Error: ${msg}`);
    }
  } finally {
    isPolling = false;
  }
}

async function processJob(job: PendingJob, keyBytes: Uint8Array, actor: any): Promise<void> {
  const startTime = Date.now();
  console.log(`[job ${job.job_id}] Processing skill ${job.skill_id} with model ${job.model}`);

  try {
    // Step 1: Decrypt the API key
    const apiKey = decrypt(job.encrypted_api_key, keyBytes);

    // Step 2: Fetch prompt template from canister + build prompt
    const promptResult = await fetchPromptTemplate(actor);
    const skillData: SkillData = {
      id: job.skill_id,
      name: job.skill_name,
      description: job.skill_description,
      owner: job.skill_owner,
      repo: job.skill_repo,
      skill_md_content: job.skill_md_content ?? undefined,
      skill_files: job.skill_files || [],
    };
    const prompt = buildAnalysisPrompt(skillData, promptResult);
    const analysis = await callAnthropic(apiKey, job.model, prompt);

    // Step 2b: Resolve referenced files — check if they exist in skill files
    if (analysis.referenced_files && analysis.referenced_files.length > 0) {
      const availableFiles = new Set(
        (job.skill_files || []).map(f => f.path.toLowerCase())
      );
      for (const ref of analysis.referenced_files) {
        const refPath = ref.path.toLowerCase();
        ref.resolved = availableFiles.has(refPath)
          || [...availableFiles].some(p => p.endsWith('/' + refPath) || p.endsWith(refPath));
      }
      const resolved = analysis.referenced_files.filter(f => f.resolved).length;
      const total = analysis.referenced_files.length;
      console.log(`[job ${job.job_id}] Referenced files: ${resolved}/${total} resolved`);
    }

    // Step 3: Submit result back to canister with TEE provenance metadata
    const analysisJson = JSON.stringify(analysis);
    // Get prompt version from cached prompt data
    const promptVersion = cachedPromptVersion || '';
    await submitJobResultWithMetadata(
      actor, job.job_id, analysisJson,
      WORKER_VERSION, promptVersion,
    );

    const elapsed = Date.now() - startTime;
    console.log(`[job ${job.job_id}] Completed in ${elapsed}ms`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[job ${job.job_id}] Failed: ${msg}`);

    try {
      await submitJobError(actor, job.job_id, msg);
    } catch (submitErr) {
      console.error(`[job ${job.job_id}] Failed to report error: ${submitErr}`);
    }
  }
}

// ============================================================================
// Enrichment Job Processing — Fetch SKILL.md from GitHub
// ============================================================================

/**
 * Fetch SKILL.md from GitHub. Tries multiple URL patterns and branches.
 * Returns { content, sourceUrl } or null if not found.
 */
async function fetchSkillMdFromGitHub(
  owner: string,
  repo: string,
  name: string,
): Promise<{ content: string; sourceUrl: string } | null> {
  const base = `https://raw.githubusercontent.com/${owner}/${repo}`;

  // Generate name variations to try (handles name/folder mismatches)
  // e.g., "vercel-react-best-practices" -> also try "react-best-practices"
  const nameVariations = new Set<string>([name]);
  
  // Strip owner-like prefixes (e.g., "vercel-" from "vercel-react-best-practices")
  const ownerLower = owner.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameLower = name.toLowerCase();
  if (nameLower.startsWith(ownerLower + '-')) {
    nameVariations.add(name.substring(ownerLower.length + 1));
  }
  // Also try stripping first word if it looks like a prefix
  const firstDash = name.indexOf('-');
  if (firstDash > 0 && firstDash < 15) {
    nameVariations.add(name.substring(firstDash + 1));
  }
  // Try stripping common suffixes like "-best-practices", "-guidelines", "-skill"
  const suffixes = ['-best-practices', '-guidelines', '-skill', '-rules', '-patterns'];
  for (const suffix of suffixes) {
    if (nameLower.endsWith(suffix)) {
      nameVariations.add(name.substring(0, name.length - suffix.length));
    }
  }
  // Also try just the first word (e.g., "remotion" from "remotion-best-practices")
  if (firstDash > 0) {
    nameVariations.add(name.substring(0, firstDash));
  }

  // Build candidate URLs in priority order (most likely first)
  const candidates: string[] = [];
  for (const branch of ['main', 'master']) {
    for (const n of nameVariations) {
      candidates.push(`${base}/${branch}/skills/${n}/SKILL.md`);
      candidates.push(`${base}/${branch}/.claude/skills/${n}/SKILL.md`);
    }
    candidates.push(`${base}/${branch}/SKILL.md`);
    for (const n of nameVariations) {
      candidates.push(`${base}/${branch}/skills/${n}/skill.md`);
      candidates.push(`${base}/${branch}/.claude/skills/${n}/skill.md`);
      candidates.push(`${base}/${branch}/skills/claude.ai/${n}/SKILL.md`);
      candidates.push(`${base}/${branch}/.agents/skills/${n}/SKILL.md`);
      candidates.push(`${base}/${branch}/${n}/SKILL.md`); // Direct subfolder
      // Monorepo patterns
      candidates.push(`${base}/${branch}/packages/skills/skills/${n}/SKILL.md`);
      candidates.push(`${base}/${branch}/packages/claude/skills/${n}/SKILL.md`);
    }
    candidates.push(`${base}/${branch}/skill.md`);
  }

  // Try candidates in parallel batches of 4
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const text = await res.text();
          if (text.trim().length > 10) {
            return { content: text, sourceUrl: url };
          }
        }
        throw new Error('not found');
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') return r.value;
    }
  }
  return null;
}

/**
 * Optionally fetch sub-files from the GitHub tree API for multi-file skills.
 * Returns an array of { path, content } for files in the skill directory.
 */
async function fetchSkillSubFiles(
  owner: string,
  repo: string,
  name: string,
  skillMdSourceUrl: string,
): Promise<{ path: string; content: string }[]> {
  // Determine the branch and path prefix from the source URL
  const branchMatch = skillMdSourceUrl.match(
    /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\/(.*?)SKILL\.md/i,
  );
  if (!branchMatch) return [];

  const branch = branchMatch[1];
  const pathPrefix = branchMatch[2]; // e.g. "skills/web-design-guidelines/"

  if (!pathPrefix) return []; // Root SKILL.md — no sub-directory to scan

  try {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(treeUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'skillsic-tee-worker' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { tree: { path: string; type: string; size?: number }[] };
    const MAX_FILE_SIZE = 500_000;
    const MAX_TOTAL_SIZE = 1_500_000;

    // Filter files in the skill directory (excluding SKILL.md itself)
    const skillFiles = data.tree.filter(
      (f) =>
        f.type === 'blob' &&
        f.path.startsWith(pathPrefix) &&
        !f.path.endsWith('SKILL.md') &&
        !f.path.endsWith('skill.md') &&
        (f.size || 0) < MAX_FILE_SIZE,
    );

    const results: { path: string; content: string }[] = [];
    let totalSize = 0;

    for (const file of skillFiles.slice(0, 50)) {
      if (totalSize >= MAX_TOTAL_SIZE) break;

      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
        const fileRes = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) });
        if (fileRes.ok) {
          const content = await fileRes.text();
          if (content.length > 0 && totalSize + content.length < MAX_TOTAL_SIZE) {
            // Store with relative path (strip the skill directory prefix)
            const relativePath = file.path.substring(pathPrefix.length);
            results.push({ path: relativePath, content });
            totalSize += content.length;
          }
        }
      } catch {
        // Skip individual file fetch failures
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function processEnrichmentJob(job: PendingEnrichmentJob, actor: any): Promise<void> {
  const startTime = Date.now();
  console.log(`[enrich ${job.job_id}] Fetching SKILL.md for ${job.owner}/${job.repo}/${job.name}`);

  try {
    const result = await fetchSkillMdFromGitHub(job.owner, job.repo, job.name);

    if (result) {
      console.log(
        `[enrich ${job.job_id}] Found SKILL.md (${result.content.length} chars) at ${result.sourceUrl}`,
      );

      // Try to fetch sub-files too
      const subFiles = await fetchSkillSubFiles(job.owner, job.repo, job.name, result.sourceUrl);
      if (subFiles.length > 0) {
        console.log(`[enrich ${job.job_id}] Also found ${subFiles.length} sub-file(s)`);
      }

      const enrichResult: EnrichmentResult = {
        found: true,
        content: result.content,
        source_url: result.sourceUrl,
        files_found: subFiles,
      };

      await submitEnrichmentResult(actor, job.job_id, enrichResult);
      const elapsed = Date.now() - startTime;
      console.log(
        `[enrich ${job.job_id}] Completed in ${elapsed}ms${job.auto_analyze ? ' (auto-analyze queued)' : ''}`,
      );
    } else {
      console.log(`[enrich ${job.job_id}] SKILL.md not found on GitHub`);
      const enrichResult: EnrichmentResult = {
        found: false,
        content: null,
        source_url: null,
        files_found: [],
      };
      await submitEnrichmentResult(actor, job.job_id, enrichResult);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[enrich ${job.job_id}] Failed: ${msg}`);

    try {
      await submitEnrichmentError(actor, job.job_id, msg);
    } catch (submitErr) {
      console.error(`[enrich ${job.job_id}] Failed to report error: ${submitErr}`);
    }
  }
}

// ============================================================================
// Start
// ============================================================================

console.log(`skillsic TEE Worker starting on port ${PORT}...`);
console.log(`Mode: ${DEV_MODE ? 'DEVELOPMENT (no TEE)' : 'PRODUCTION (TEE secured)'}`);
console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`TEE Worker listening on http://0.0.0.0:${PORT}`);

  // Start the job queue polling loop
  if (!DEV_MODE) {
    console.log('[poll] Starting job queue polling...');
    setInterval(pollJobQueue, POLL_INTERVAL_MS);
    // Run once immediately after startup
    setTimeout(pollJobQueue, 2000);
  }
});

export default app;
