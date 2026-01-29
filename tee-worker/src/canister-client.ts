/**
 * IC Canister client for the TEE worker.
 * 
 * The TEE worker uses a deterministic Ed25519 identity derived from
 * the dstack KMS. This gives it a stable principal that can be
 * registered as a "worker" on the canister.
 * 
 * Endpoints used:
 * - claim_pending_jobs(limit) → Vec<PendingJob>
 * - submit_job_result(job_id, analysis_json) → ()
 * - submit_job_error(job_id, error) → ()
 */

import { HttpAgent, Actor } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { createHash } from 'node:crypto';

const BACKEND_CANISTER_ID = 'fs4ea-5qaaa-aaaak-qvwfq-cai';
const IC_HOST = 'https://icp0.io';

// ============================================================================
// IDL (minimal — only the endpoints we need)
// ============================================================================

const AnalysisModel = IDL.Variant({
  Haiku: IDL.Null,
  Sonnet: IDL.Null,
  Opus: IDL.Null,
});

const PendingJobFileIDL = IDL.Record({
  path: IDL.Text,
  content: IDL.Text,
});

const PendingJobIDL = IDL.Record({
  job_id: IDL.Text,
  skill_id: IDL.Text,
  skill_name: IDL.Text,
  skill_description: IDL.Text,
  skill_owner: IDL.Text,
  skill_repo: IDL.Text,
  skill_md_content: IDL.Opt(IDL.Text),
  skill_files: IDL.Vec(PendingJobFileIDL),
  model: IDL.Text,
  encrypted_api_key: IDL.Text,
});

const ResultText = IDL.Variant({ Ok: IDL.Null, Err: IDL.Text });
const ResultVecPending = IDL.Variant({ Ok: IDL.Vec(PendingJobIDL), Err: IDL.Text });
const ResultJobId = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text });

const AnalysisPromptIDL = IDL.Record({
  id: IDL.Text,
  name: IDL.Text,
  version: IDL.Text,
  prompt_template: IDL.Text,
  created_by: IDL.Principal,
  created_at: IDL.Nat64,
  is_default: IDL.Bool,
});

// Enrichment Job IDL
const PendingEnrichmentJobIDL = IDL.Record({
  job_id: IDL.Text,
  skill_id: IDL.Text,
  owner: IDL.Text,
  repo: IDL.Text,
  name: IDL.Text,
  auto_analyze: IDL.Bool,
});

const EnrichmentFileIDL = IDL.Record({
  path: IDL.Text,
  content: IDL.Text,
});

const EnrichmentResultIDL = IDL.Record({
  found: IDL.Bool,
  content: IDL.Opt(IDL.Text),
  source_url: IDL.Opt(IDL.Text),
  files_found: IDL.Vec(EnrichmentFileIDL),
});

const ResultVecEnrichment = IDL.Variant({ Ok: IDL.Vec(PendingEnrichmentJobIDL), Err: IDL.Text });

const workerIdlFactory = ({ IDL: _IDL }: any) => {
  return IDL.Service({
    claim_pending_jobs: IDL.Func([IDL.Nat32], [ResultVecPending], []),
    submit_job_result: IDL.Func([IDL.Text, IDL.Text], [ResultText], []),
    submit_job_result_with_metadata: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [ResultText],
      [],
    ),
    submit_job_error: IDL.Func([IDL.Text, IDL.Text], [ResultText], []),
    get_default_prompt: IDL.Func([], [IDL.Opt(AnalysisPromptIDL)], ['query']),
    // Enrichment endpoints
    claim_enrichment_jobs: IDL.Func([IDL.Nat32], [ResultVecEnrichment], []),
    submit_enrichment_result: IDL.Func([IDL.Text, EnrichmentResultIDL], [ResultText], []),
    submit_enrichment_error: IDL.Func([IDL.Text, IDL.Text], [ResultText], []),
  });
};

// ============================================================================
// Types
// ============================================================================

export interface PendingJobFile {
  path: string;
  content: string;
}

export interface PendingJob {
  job_id: string;
  skill_id: string;
  skill_name: string;
  skill_description: string;
  skill_owner: string;
  skill_repo: string;
  skill_md_content: string | null;
  skill_files: PendingJobFile[];
  model: string;
  encrypted_api_key: string;
}

// ============================================================================
// Identity & Agent
// ============================================================================

/**
 * Derive a deterministic Ed25519 identity from the TEE's KMS key material.
 * This gives the TEE worker a stable IC principal.
 */
export function deriveWorkerIdentity(keyMaterial: Uint8Array): Ed25519KeyIdentity {
  // Derive a 32-byte seed for the Ed25519 key from the KMS material
  const seed = createHash('sha256')
    .update(Buffer.from(keyMaterial))
    .update('skillsic-worker-identity-v1')
    .digest();
  
  return Ed25519KeyIdentity.generate(seed);
}

let cachedActor: any = null;
let cachedIdentity: Ed25519KeyIdentity | null = null;

/**
 * Get an authenticated actor using the TEE worker's identity.
 */
export async function getWorkerActor(keyMaterial: Uint8Array): Promise<any> {
  if (cachedActor && cachedIdentity) {
    return cachedActor;
  }

  const identity = deriveWorkerIdentity(keyMaterial);
  cachedIdentity = identity;

  const agent = await HttpAgent.create({
    host: IC_HOST,
    identity,
  });

  cachedActor = Actor.createActor(workerIdlFactory, {
    agent,
    canisterId: BACKEND_CANISTER_ID,
  });

  return cachedActor;
}

/**
 * Get the worker's IC principal (for registering as a worker on the canister).
 */
export function getWorkerPrincipal(keyMaterial: Uint8Array): string {
  const identity = deriveWorkerIdentity(keyMaterial);
  return identity.getPrincipal().toText();
}

// ============================================================================
// Canister API calls
// ============================================================================

function unwrapOpt<T>(opt: [] | [T]): T | null {
  return opt.length > 0 ? opt[0]! : null;
}

export async function claimPendingJobs(actor: any, limit: number): Promise<PendingJob[]> {
  const result = await actor.claim_pending_jobs(limit);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  return result.Ok.map((j: any) => ({
    job_id: j.job_id,
    skill_id: j.skill_id,
    skill_name: j.skill_name,
    skill_description: j.skill_description,
    skill_owner: j.skill_owner,
    skill_repo: j.skill_repo,
    skill_md_content: unwrapOpt(j.skill_md_content),
    skill_files: (j.skill_files || []).map((f: any) => ({
      path: f.path,
      content: f.content,
    })),
    model: j.model,
    encrypted_api_key: j.encrypted_api_key,
  }));
}

export async function submitJobResult(actor: any, jobId: string, analysisJson: string): Promise<void> {
  const result = await actor.submit_job_result(jobId, analysisJson);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

export async function submitJobResultWithMetadata(
  actor: any,
  jobId: string,
  analysisJson: string,
  teeWorkerVersion: string,
  promptVersion: string,
): Promise<void> {
  const result = await actor.submit_job_result_with_metadata(
    jobId, analysisJson, teeWorkerVersion, promptVersion,
  );
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

export async function submitJobError(actor: any, jobId: string, error: string): Promise<void> {
  const result = await actor.submit_job_error(jobId, error);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

// ============================================================================
// Enrichment Job API
// ============================================================================

export interface PendingEnrichmentJob {
  job_id: string;
  skill_id: string;
  owner: string;
  repo: string;
  name: string;
  auto_analyze: boolean;
}

export interface EnrichmentResult {
  found: boolean;
  content: string | null;
  source_url: string | null;
  files_found: { path: string; content: string }[];
}

export async function claimEnrichmentJobs(actor: any, limit: number): Promise<PendingEnrichmentJob[]> {
  const result = await actor.claim_enrichment_jobs(limit);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  return result.Ok.map((j: any) => ({
    job_id: j.job_id,
    skill_id: j.skill_id,
    owner: j.owner,
    repo: j.repo,
    name: j.name,
    auto_analyze: j.auto_analyze,
  }));
}

export async function submitEnrichmentResult(
  actor: any,
  jobId: string,
  result: EnrichmentResult,
): Promise<void> {
  const candidResult = {
    found: result.found,
    content: result.content ? [result.content] : [],
    source_url: result.source_url ? [result.source_url] : [],
    files_found: result.files_found,
  };
  const res = await actor.submit_enrichment_result(jobId, candidResult);
  if ('Err' in res) {
    throw new Error(res.Err);
  }
}

export async function submitEnrichmentError(actor: any, jobId: string, error: string): Promise<void> {
  const result = await actor.submit_enrichment_error(jobId, error);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

// ============================================================================
// Prompt fetching (cached)
// ============================================================================

let cachedPromptTemplate: string | null = null;
export let cachedPromptVersion: string = '';
let promptFetchedAt = 0;
const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // Re-fetch every 5 minutes

/**
 * Fetch the default analysis prompt template from the canister.
 * Caches for 5 minutes to avoid excessive queries.
 * THROWS if no prompt is available (no fallback - prompt must come from canister).
 */
export async function fetchPromptTemplate(actor: any): Promise<string> {
  const now = Date.now();
  if (cachedPromptTemplate && (now - promptFetchedAt) < PROMPT_CACHE_TTL_MS) {
    return cachedPromptTemplate;
  }

  try {
    const raw = await actor.get_default_prompt();
    const result = unwrapOpt(raw) as { prompt_template: string; version: string } | null;
    if (result && result.prompt_template) {
      cachedPromptTemplate = result.prompt_template;
      cachedPromptVersion = result.version || '';
      promptFetchedAt = now;
      console.log(`[prompt] Loaded prompt v${result.version} from canister (${cachedPromptTemplate!.length} chars)`);
      return cachedPromptTemplate;
    }
  } catch (e) {
    console.error('[prompt] Failed to fetch from canister:', e);
    // Fall through to stale cache check
  }

  // Return stale cache if available, otherwise throw
  if (cachedPromptTemplate) {
    console.warn('[prompt] Using stale cached prompt (canister fetch failed)');
    return cachedPromptTemplate;
  }

  throw new Error('No prompt template available. Cannot proceed without canister prompt.');
}
