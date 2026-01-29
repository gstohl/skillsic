/**
 * Anthropic API client for the TEE worker.
 * 
 * Calls the Anthropic Messages API with the decrypted API key.
 * The key only exists in TEE memory — never logged, never written to disk.
 */

import type { SkillAnalysis } from './types.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
}

interface AnthropicContentBlock {
  type: string;
  text: string;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Call the Anthropic Messages API and parse the response into SkillAnalysis.
 */
export async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<SkillAnalysis> {
  const requestBody: AnthropicRequest = {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as AnthropicResponse;

  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error('No content in Anthropic response');
  }

  return parseAnalysisJson(text);
}

/**
 * Parse the JSON from Claude's response text.
 * Handles cases where the JSON is wrapped in markdown code blocks or extra text.
 */
function parseAnalysisJson(text: string): SkillAnalysis {
  // Try to extract JSON from the response
  let jsonStr = text;

  // Strip markdown code fences if present
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    // Find the outermost { ... }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = text.substring(firstBrace, lastBrace + 1);
    }
  }

  let raw: any;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse analysis JSON: ${(e as Error).message}\nRaw text: ${text.substring(0, 500)}`);
  }

  // Validate and normalize the analysis
  return normalizeAnalysis(raw);
}

/**
 * Normalize and validate the raw parsed JSON into our SkillAnalysis format.
 * Handles missing fields gracefully.
 */
function normalizeAnalysis(raw: any): SkillAnalysis {
  // Validate ratings
  const ratings = raw.ratings || {};
  const topics = (ratings.topics || []).map((t: any) => ({
    topic: String(t.topic || 'Unknown'),
    score: clamp(Number(t.score) || 0, 0, 100),
    confidence: clamp(Number(t.confidence) || 50, 0, 100),
    reasoning: String(t.reasoning || ''),
  }));

  const flags = (ratings.flags || []).map((f: any) => ({
    flag_type: String(f.flag_type || 'UnverifiedSource'),
    severity: String(f.severity || 'Info'),
    message: String(f.message || ''),
  }));

  // Normalize MCP dependencies
  const requiredMcps = (raw.required_mcps || []).map((m: any) => ({
    name: String(m.name || ''),
    package: String(m.package || ''),
    required: Boolean(m.required),
    indexed: Boolean(m.indexed),   // Whether MCP is indexed in skillsic
    verified: Boolean(m.verified), // Whether MCP is verified
    ratings: m.ratings ? {
      overall: clamp(Number(m.ratings.overall) || 0, 0, 5),
      topics: (m.ratings.topics || []).map((t: any) => ({
        topic: String(t.topic || ''),
        score: clamp(Number(t.score) || 0, 0, 100),
        confidence: clamp(Number(t.confidence) || 50, 0, 100),
        reasoning: String(t.reasoning || ''),
      })),
      flags: (m.ratings.flags || []).map((f: any) => ({
        flag_type: String(f.flag_type || ''),
        severity: String(f.severity || 'Info'),
        message: String(f.message || ''),
      })),
    } : undefined,
  }));

  // Normalize software dependencies
  const softwareDeps = (raw.software_deps || []).map((d: any) => ({
    name: String(d.name || ''),
    install_cmd: d.install_cmd ? String(d.install_cmd) : undefined,
    url: d.url ? String(d.url) : undefined,
    required: Boolean(d.required),
    ratings: d.ratings ? {
      overall: clamp(Number(d.ratings.overall) || 0, 0, 5),
      topics: (d.ratings.topics || []).map((t: any) => ({
        topic: String(t.topic || ''),
        score: clamp(Number(t.score) || 0, 0, 100),
        confidence: clamp(Number(t.confidence) || 50, 0, 100),
        reasoning: String(t.reasoning || ''),
      })),
      flags: (d.ratings.flags || []).map((f: any) => ({
        flag_type: String(f.flag_type || ''),
        severity: String(f.severity || 'Info'),
        message: String(f.message || ''),
      })),
    } : undefined,
  }));

  // Normalize referenced files
  const referencedFiles = (raw.referenced_files || []).map((f: any) => ({
    path: String(f.path || ''),
    context: String(f.context || ''),
    resolved: Boolean(f.resolved),
  }));

  // Normalize referenced URLs
  const referencedUrls = (raw.referenced_urls || []).map((u: any) => ({
    url: String(u.url || ''),
    context: String(u.context || ''),
    fetched: Boolean(u.fetched),
  }));

  return {
    ratings: {
      overall: clamp(Number(ratings.overall) || 0, 0, 5),
      topics,
      flags,
    },
    primary_category: String(raw.primary_category || 'meta'),
    secondary_categories: ensureStringArray(raw.secondary_categories),
    tags: ensureStringArray(raw.tags),
    has_mcp: Boolean(raw.has_mcp),
    provides_mcp: Boolean(raw.provides_mcp),
    required_mcps: requiredMcps,
    software_deps: softwareDeps,
    has_references: Boolean(raw.has_references),
    has_assets: Boolean(raw.has_assets),
    estimated_token_usage: Number(raw.estimated_token_usage) || 0,
    summary: String(raw.summary || ''),
    strengths: ensureStringArray(raw.strengths),
    weaknesses: ensureStringArray(raw.weaknesses),
    use_cases: ensureStringArray(raw.use_cases),
    compatibility_notes: String(raw.compatibility_notes || ''),
    prerequisites: ensureStringArray(raw.prerequisites),
    referenced_files: referencedFiles,
    referenced_urls: referencedUrls,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureStringArray(val: any): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v));
}
