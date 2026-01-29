import { Actor, HttpAgent } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import type { Skill, SkillSearchResult, SkillAnalysis, AnalysisResult, Stats, UserProfile } from './types';
import { skillCache } from './cache';

// ============================================================================
// Canister IDs
// ============================================================================

const BACKEND_CANISTER_ID = 'fs4ea-5qaaa-aaaak-qvwfq-cai';
const IC_HOST = 'https://icp0.io';
const LOCAL_HOST = 'http://127.0.0.1:4943';

// ============================================================================
// IDL Factory (generated from .did)
// ============================================================================

const AnalysisModel = IDL.Variant({
  Haiku: IDL.Null,
  Sonnet: IDL.Null,
  Opus: IDL.Null,
});

const RatingTopic = IDL.Variant({
  Quality: IDL.Null,
  Documentation: IDL.Null,
  Maintainability: IDL.Null,
  Completeness: IDL.Null,
  Security: IDL.Null,
  Malicious: IDL.Null,
  Privacy: IDL.Null,
  Usability: IDL.Null,
  Compatibility: IDL.Null,
  Performance: IDL.Null,
  Trustworthiness: IDL.Null,
  Maintenance: IDL.Null,
  Community: IDL.Null,
});

const FlagType = IDL.Variant({
  SecurityRisk: IDL.Null,
  MaliciousPattern: IDL.Null,
  PrivacyConcern: IDL.Null,
  Unmaintained: IDL.Null,
  Deprecated: IDL.Null,
  ExcessivePermissions: IDL.Null,
  UnverifiedSource: IDL.Null,
  KnownVulnerability: IDL.Null,
});

const FlagSeverity = IDL.Variant({
  Info: IDL.Null,
  Warning: IDL.Null,
  Critical: IDL.Null,
});

const TopicRating = IDL.Record({
  topic: RatingTopic,
  score: IDL.Nat8,
  confidence: IDL.Nat8,
  reasoning: IDL.Text,
});

const RatingFlag = IDL.Record({
  flag_type: FlagType,
  severity: FlagSeverity,
  message: IDL.Text,
});

const Ratings = IDL.Record({
  overall: IDL.Float32,
  topics: IDL.Vec(TopicRating),
  flags: IDL.Vec(RatingFlag),
});

const McpDependency = IDL.Record({
  name: IDL.Text,
  package: IDL.Text,
  required: IDL.Bool,
  indexed: IDL.Bool,
  verified: IDL.Bool,
  ratings: IDL.Opt(Ratings),
});

const SoftwareDependency = IDL.Record({
  name: IDL.Text,
  install_cmd: IDL.Opt(IDL.Text),
  url: IDL.Opt(IDL.Text),
  required: IDL.Bool,
  ratings: IDL.Opt(Ratings),
});

const SkillFileType = IDL.Variant({
  SkillMd: IDL.Null,
  Reference: IDL.Null,
  Asset: IDL.Null,
  Config: IDL.Null,
  Other: IDL.Null,
});

const SkillFile = IDL.Record({
  path: IDL.Text,
  content: IDL.Text,
  checksum: IDL.Text,
  size_bytes: IDL.Nat64,
  file_type: SkillFileType,
});

const ReferencedFileIDL = IDL.Record({
  path: IDL.Text,
  context: IDL.Text,
  resolved: IDL.Bool,
});

const ReferencedUrlIDL = IDL.Record({
  url: IDL.Text,
  context: IDL.Text,
  fetched: IDL.Bool,
});

const SkillAnalysisIDL = IDL.Record({
  ratings: Ratings,
  primary_category: IDL.Text,
  secondary_categories: IDL.Vec(IDL.Text),
  tags: IDL.Vec(IDL.Text),
  has_mcp: IDL.Bool,
  provides_mcp: IDL.Bool,
  required_mcps: IDL.Vec(McpDependency),
  software_deps: IDL.Vec(SoftwareDependency),
  has_references: IDL.Bool,
  has_assets: IDL.Bool,
  estimated_token_usage: IDL.Nat32,
  summary: IDL.Text,
  strengths: IDL.Vec(IDL.Text),
  weaknesses: IDL.Vec(IDL.Text),
  use_cases: IDL.Vec(IDL.Text),
  compatibility_notes: IDL.Text,
  prerequisites: IDL.Vec(IDL.Text),
  referenced_files: IDL.Vec(ReferencedFileIDL),
  referenced_urls: IDL.Vec(ReferencedUrlIDL),
  analyzed_at: IDL.Nat64,
  analyzed_by: IDL.Principal,
  model_used: IDL.Text,
  analysis_version: IDL.Text,
  tee_worker_version: IDL.Opt(IDL.Text),
  prompt_version: IDL.Opt(IDL.Text),
});

const SkillIDL = IDL.Record({
  id: IDL.Text,
  name: IDL.Text,
  description: IDL.Text,
  owner: IDL.Text,
  repo: IDL.Text,
  github_url: IDL.Opt(IDL.Text),
  skill_md_url: IDL.Opt(IDL.Text),
  skill_md_content: IDL.Opt(IDL.Text),
  files: IDL.Vec(SkillFile),
  files_checksum: IDL.Opt(IDL.Text),
  stars: IDL.Nat32,
  analysis: IDL.Opt(SkillAnalysisIDL),
  analysis_history: IDL.Vec(SkillAnalysisIDL),
  install_count: IDL.Nat64,
  created_at: IDL.Nat64,
  updated_at: IDL.Nat64,
  source: IDL.Text,
});

const SkillSearchResultIDL = IDL.Record({
  skill: SkillIDL,
  relevance_score: IDL.Float32,
});

const UserProfileIDL = IDL.Record({
  principal: IDL.Principal,
  anthropic_api_key: IDL.Opt(IDL.Text),
  encrypted_anthropic_key: IDL.Opt(IDL.Text),
  analyses_performed: IDL.Nat64,
  created_at: IDL.Nat64,
  last_active: IDL.Nat64,
});

const AnalysisResultIDL = IDL.Record({
  success: IDL.Bool,
  skill_id: IDL.Text,
  analysis: IDL.Opt(SkillAnalysisIDL),
  error: IDL.Opt(IDL.Text),
});

const AnalysisPromptIDL = IDL.Record({
  id: IDL.Text,
  name: IDL.Text,
  version: IDL.Text,
  prompt_template: IDL.Text,
  created_by: IDL.Principal,
  created_at: IDL.Nat64,
  is_default: IDL.Bool,
});

const FileVerifyResultIDL = IDL.Record({
  path: IDL.Text,
  is_valid: IDL.Bool,
  stored_checksum: IDL.Text,
  provided_checksum: IDL.Text,
});

const SkillVerifyResultIDL = IDL.Record({
  skill_id: IDL.Text,
  is_valid: IDL.Bool,
  files_checked: IDL.Nat32,
  files_valid: IDL.Nat32,
  files_invalid: IDL.Vec(FileVerifyResultIDL),
  missing_files: IDL.Vec(IDL.Text),
  extra_files: IDL.Vec(IDL.Text),
});

const ResultText = IDL.Variant({ Ok: IDL.Null, Err: IDL.Text });
const ResultTextText = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text });
const ResultNat32Text = IDL.Variant({ Ok: IDL.Nat32, Err: IDL.Text });
const ResultNat64Text = IDL.Variant({ Ok: IDL.Nat64, Err: IDL.Text });
const ResultAnalysis = IDL.Variant({ Ok: AnalysisResultIDL, Err: IDL.Text });

const JobStatusIDL = IDL.Variant({
  Pending: IDL.Null,
  Processing: IDL.Null,
  Completed: IDL.Null,
  Failed: IDL.Null,
});

const EnrichmentJobStatusIDL = IDL.Variant({
  Pending: IDL.Null,
  Processing: IDL.Null,
  Completed: IDL.Null,
  Failed: IDL.Null,
  NotFound: IDL.Null,
});

const ResultFileVerify = IDL.Variant({ Ok: FileVerifyResultIDL, Err: IDL.Text });
const ResultSkillVerify = IDL.Variant({ Ok: SkillVerifyResultIDL, Err: IDL.Text });

const idlFactory = ({ IDL: _IDL }: any) => {
  return IDL.Service({
    // User auth
    whoami: IDL.Func([], [IDL.Principal], ['query']),
    is_logged_in: IDL.Func([], [IDL.Bool], ['query']),
    get_my_profile: IDL.Func([], [IDL.Opt(UserProfileIDL)], ['query']),
    set_my_anthropic_key: IDL.Func([IDL.Text], [ResultText], []),
    remove_my_anthropic_key: IDL.Func([], [ResultText], []),
    has_anthropic_key: IDL.Func([], [IDL.Bool], ['query']),

    // TEE-encrypted key
    set_my_encrypted_key: IDL.Func([IDL.Text], [ResultText], []),

    // Admin
    add_admin: IDL.Func([IDL.Principal], [ResultText], []),
    set_analysis_enabled: IDL.Func([IDL.Bool], [ResultText], []),
    set_tee_worker_url: IDL.Func([IDL.Text], [ResultText], []),
    get_tee_worker_url: IDL.Func([], [IDL.Opt(IDL.Text)], ['query']),
    is_tee_analysis_available: IDL.Func([], [IDL.Bool], ['query']),

    // Prompt Management
    create_prompt: IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [ResultTextText], []),
    set_default_prompt: IDL.Func([IDL.Text], [ResultText], []),
    delete_prompt: IDL.Func([IDL.Text], [ResultText], []),
    get_prompt: IDL.Func([IDL.Text], [IDL.Opt(AnalysisPromptIDL)], ['query']),
    list_prompts: IDL.Func([], [IDL.Vec(AnalysisPromptIDL)], ['query']),
    get_default_prompt: IDL.Func([], [IDL.Opt(AnalysisPromptIDL)], ['query']),

    // Skills
    add_skill: IDL.Func([SkillIDL], [ResultTextText], []),
    add_skills_batch: IDL.Func([IDL.Vec(SkillIDL)], [ResultNat32Text], []),
    get_skill: IDL.Func([IDL.Text], [IDL.Opt(SkillIDL)], ['query']),
    list_skills: IDL.Func([], [IDL.Vec(SkillIDL)], ['query']),
    list_skills_page: IDL.Func([IDL.Nat32, IDL.Nat32], [IDL.Vec(SkillIDL), IDL.Nat32], ['query']),
    list_skills_filtered: IDL.Func([IDL.Nat32, IDL.Nat32, IDL.Text, IDL.Text, IDL.Text], [IDL.Vec(SkillIDL), IDL.Nat32], ['query']),
    search_skills: IDL.Func([IDL.Text], [IDL.Vec(SkillSearchResultIDL)], ['query']),
    get_skills_by_category: IDL.Func([IDL.Text], [IDL.Vec(SkillIDL)], ['query']),
    get_skills_with_dependencies: IDL.Func([], [IDL.Vec(SkillIDL)], ['query']),
    get_skills_providing_mcp: IDL.Func([], [IDL.Vec(SkillIDL)], ['query']),
    get_top_rated_skills: IDL.Func([IDL.Nat32], [IDL.Vec(SkillIDL)], ['query']),
    get_categories: IDL.Func([], [IDL.Vec(IDL.Text)], ['query']),
    get_unanalyzed_skills: IDL.Func([], [IDL.Vec(SkillIDL)], ['query']),
    get_install_command: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
    record_install: IDL.Func([IDL.Text], [ResultNat64Text], []),

    // Checksum & Files
    get_skill_checksum: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
    get_skill_file_checksums: IDL.Func([IDL.Text], [IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)))], ['query']),
    get_skill_file: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(SkillFile)], ['query']),
    get_skill_files: IDL.Func([IDL.Text], [IDL.Opt(IDL.Vec(SkillFile))], ['query']),
    verify_file_checksum: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [ResultFileVerify], ['query']),
    verify_skill_files: IDL.Func([IDL.Text, IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [ResultSkillVerify], ['query']),
    verify_skills_batch: IDL.Func([IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Bool, IDL.Opt(IDL.Text)))], ['query']),
    set_skill_files: IDL.Func([IDL.Text, IDL.Vec(SkillFile)], [ResultTextText], []),
    add_skill_file: IDL.Func([IDL.Text, SkillFile], [ResultTextText], []),

    // Analysis (legacy HTTP outcall path - deprecated, use job queue instead)
    analyze_skill: IDL.Func([IDL.Text, AnalysisModel], [ResultAnalysis], []),

    // Analysis Job Queue
    request_analysis: IDL.Func([IDL.Text, AnalysisModel], [ResultTextText], []),
    get_job_status: IDL.Func([IDL.Text], [IDL.Opt(IDL.Tuple(JobStatusIDL, IDL.Opt(IDL.Text)))], ['query']),
    get_analyzed_models: IDL.Func([IDL.Text], [IDL.Vec(IDL.Text)], ['query']),
    get_pending_job_count: IDL.Func([], [IDL.Nat64], ['query']),

    // Enrichment Job Queue
    request_enrichment: IDL.Func([IDL.Text, IDL.Bool], [ResultTextText], []),
    get_enrichment_job_status: IDL.Func([IDL.Text], [IDL.Opt(IDL.Tuple(EnrichmentJobStatusIDL, IDL.Opt(IDL.Text)))], ['query']),
    get_pending_enrichment_count: IDL.Func([], [IDL.Nat64], ['query']),

    // Analysis History
    get_analysis_history: IDL.Func([IDL.Text], [IDL.Vec(SkillAnalysisIDL)], ['query']),
    get_all_analysis_history: IDL.Func(
      [IDL.Nat32, IDL.Nat32],
      [IDL.Vec(IDL.Tuple(IDL.Text, SkillAnalysisIDL)), IDL.Nat32],
      ['query'],
    ),
    get_analysis_history_stats: IDL.Func([], [IDL.Nat64, IDL.Nat64], ['query']),

    // Memory
    get_memory_stats: IDL.Func([], [IDL.Nat64, IDL.Nat64, IDL.Nat64, IDL.Nat64], ['query']),

    // Stats
    get_stats: IDL.Func([], [IDL.Nat64, IDL.Nat64, IDL.Nat64, IDL.Nat64], ['query']),
    get_analysis_stats: IDL.Func([], [IDL.Nat64, IDL.Nat64, IDL.Nat64, IDL.Nat64], ['query']),
    get_skills_with_flags: IDL.Func([], [IDL.Vec(IDL.Tuple(SkillIDL, IDL.Vec(RatingFlag)))], ['query']),
    get_skill_topic_rating: IDL.Func([IDL.Text, RatingTopic], [IDL.Opt(TopicRating)], ['query']),
    get_skills_by_topic_rating: IDL.Func([RatingTopic, IDL.Nat32], [IDL.Vec(SkillIDL)], ['query']),
  });
};

// ============================================================================
// Actor creation
// ============================================================================

let cachedActor: any = null;
let cachedAgent: HttpAgent | null = null;

function isLocal(): boolean {
  return !import.meta.env.PROD;
}

/**
 * Create an anonymous agent (for query calls that don't need auth)
 */
async function createAnonymousAgent(): Promise<HttpAgent> {
  const agent = new HttpAgent({
    host: isLocal() ? LOCAL_HOST : IC_HOST,
  });
  if (isLocal()) {
    await agent.fetchRootKey();
  }
  return agent;
}

/**
 * Get or create the backend actor (anonymous for queries)
 */
export async function getActor(): Promise<any> {
  if (cachedActor && cachedAgent) {
    return cachedActor;
  }
  const agent = await createAnonymousAgent();
  cachedAgent = agent;
  cachedActor = Actor.createActor(idlFactory, {
    agent,
    canisterId: BACKEND_CANISTER_ID,
  });
  return cachedActor;
}

/**
 * Create an authenticated actor using the given agent (for update calls)
 */
export function getAuthenticatedActor(agent: HttpAgent): any {
  return Actor.createActor(idlFactory, {
    agent,
    canisterId: BACKEND_CANISTER_ID,
  });
}

/**
 * Reset cached actor (call after login/logout to refresh identity)
 */
export function resetActor(): void {
  cachedActor = null;
  cachedAgent = null;
}

// ============================================================================
// Helper: convert Candid types to TS types
// ============================================================================

function unwrapOpt<T>(opt: [] | [T]): T | null {
  return opt.length > 0 ? opt[0]! : null;
}

function unwrapVariantKey(variant: Record<string, any>): string {
  return Object.keys(variant)[0];
}

function convertRatings(raw: any): any {
  if (!raw) return null;
  return {
    overall: raw.overall,
    topics: raw.topics.map((t: any) => ({
      topic: unwrapVariantKey(t.topic),
      score: t.score,
      confidence: t.confidence,
      reasoning: t.reasoning,
    })),
    flags: raw.flags.map((f: any) => ({
      flag_type: unwrapVariantKey(f.flag_type),
      severity: unwrapVariantKey(f.severity),
      message: f.message,
    })),
  };
}

function convertAnalysis(raw: any): SkillAnalysis | null {
  if (!raw) return null;
  return {
    ratings: convertRatings(raw.ratings),
    primary_category: raw.primary_category,
    secondary_categories: raw.secondary_categories,
    tags: raw.tags,
    has_mcp: raw.has_mcp,
    provides_mcp: raw.provides_mcp,
    required_mcps: raw.required_mcps.map((m: any) => ({
      name: m.name,
      package: m.package,
      required: m.required,
      indexed: m.indexed,
      verified: m.verified,
      ratings: m.ratings.length > 0 ? convertRatings(m.ratings[0]) : null,
    })),
    software_deps: raw.software_deps.map((s: any) => ({
      name: s.name,
      install_cmd: unwrapOpt(s.install_cmd),
      url: unwrapOpt(s.url),
      required: s.required,
      ratings: s.ratings.length > 0 ? convertRatings(s.ratings[0]) : null,
    })),
    has_references: raw.has_references,
    has_assets: raw.has_assets,
    estimated_token_usage: raw.estimated_token_usage,
    summary: raw.summary,
    strengths: raw.strengths,
    weaknesses: raw.weaknesses,
    use_cases: raw.use_cases,
    compatibility_notes: raw.compatibility_notes,
    prerequisites: raw.prerequisites,
    referenced_files: (raw.referenced_files || []).map((f: any) => ({
      path: f.path,
      context: f.context,
      resolved: f.resolved,
    })),
    referenced_urls: (raw.referenced_urls || []).map((u: any) => ({
      url: u.url,
      context: u.context,
      fetched: u.fetched,
    })),
    analyzed_at: raw.analyzed_at,
    analyzed_by: raw.analyzed_by.toString(),
    model_used: raw.model_used,
    analysis_version: raw.analysis_version,
    tee_worker_version: raw.tee_worker_version ? unwrapOpt(raw.tee_worker_version) : null,
    prompt_version: raw.prompt_version ? unwrapOpt(raw.prompt_version) : null,
  };
}

function convertSkill(raw: any): Skill {
  const analysis = raw.analysis.length > 0 ? convertAnalysis(raw.analysis[0]) : null;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    owner: raw.owner,
    repo: raw.repo,
    github_url: unwrapOpt(raw.github_url),
    skill_md_url: unwrapOpt(raw.skill_md_url),
    skill_md_content: unwrapOpt(raw.skill_md_content),
    files: raw.files.map((f: any) => ({
      path: f.path,
      content: f.content,
      checksum: f.checksum,
      size_bytes: f.size_bytes,
      file_type: unwrapVariantKey(f.file_type),
    })),
    files_checksum: unwrapOpt(raw.files_checksum),
    stars: raw.stars,
    analysis,
    analysis_history: (raw.analysis_history || []).map((a: any) => convertAnalysis(a)).filter(Boolean) as SkillAnalysis[],
    install_count: raw.install_count,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    source: raw.source,
  };
}

// ============================================================================
// Public API
// ============================================================================

/** Fetch all skills from the canister */
export async function listSkills(): Promise<Skill[]> {
  const actor = await getActor();
  const raw = await actor.list_skills();
  return raw.map(convertSkill);
}

/** Fetch a page of skills (sorted by stars desc on canister). Returns [skills, totalCount]. */
export async function listSkillsPage(limit: number, offset: number): Promise<{ skills: Skill[]; total: number }> {
  const actor = await getActor();
  const [raw, total] = await actor.list_skills_page(limit, offset);
  return {
    skills: raw.map(convertSkill),
    total: Number(total),
  };
}

/** Server-side paginated + filtered + sorted skill listing. */
export async function listSkillsFiltered(
  limit: number,
  offset: number,
  sortBy: string,
  search: string,
  category: string,
): Promise<{ skills: Skill[]; total: number }> {
  // Check cache first
  const cacheKey = `${limit}:${offset}:${sortBy}:${search}:${category}`;
  const cached = skillCache.getSkillsList(cacheKey);
  if (cached) {
    return cached;
  }
  
  const actor = await getActor();
  const [raw, total] = await actor.list_skills_filtered(limit, offset, sortBy, search, category);
  const result = {
    skills: raw.map(convertSkill),
    total: Number(total),
  };
  
  // Cache the result
  skillCache.setSkillsList(cacheKey, result);
  
  return result;
}

/** Record an install for a skill (increments install_count) */
export async function recordInstall(skillId: string): Promise<number> {
  const actor = await getActor();
  const result = await actor.record_install(skillId);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  return Number(result.Ok);
}

/** Search skills by query string */
export async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  // Check cache first
  const cached = skillCache.getSearch(query);
  if (cached) {
    return cached;
  }
  
  const actor = await getActor();
  const raw = await actor.search_skills(query);
  const result = raw.map((r: any) => ({
    skill: convertSkill(r.skill),
    relevance_score: r.relevance_score,
  }));
  
  // Cache the result
  skillCache.setSearch(query, result);
  
  return result;
}

/** Get a single skill by ID */
export async function getSkill(id: string): Promise<Skill | null> {
  // Check cache first
  const cached = skillCache.getSkill(id);
  if (cached) {
    return cached;
  }
  
  const actor = await getActor();
  const raw = await actor.get_skill(id);
  const result = unwrapOpt(raw);
  const skill = result ? convertSkill(result) : null;
  
  // Cache the result
  if (skill) {
    skillCache.setSkill(id, skill);
  }
  
  return skill;
}

/** Get skills by category */
export async function getSkillsByCategory(category: string): Promise<Skill[]> {
  const actor = await getActor();
  const raw = await actor.get_skills_by_category(category);
  return raw.map(convertSkill);
}

/** Get top rated skills */
export async function getTopRatedSkills(limit: number): Promise<Skill[]> {
  const actor = await getActor();
  const raw = await actor.get_top_rated_skills(limit);
  return raw.map(convertSkill);
}

/** Get all categories */
export async function getCategories(): Promise<string[]> {
  const actor = await getActor();
  return await actor.get_categories();
}

/** Get stats: [total, analyzed, installs, users] */
export async function getStats(): Promise<Stats> {
  const actor = await getActor();
  const [total, analyzed, installs, users] = await actor.get_stats();
  return {
    total_skills: Number(total),
    analyzed_skills: Number(analyzed),
    total_installs: Number(installs),
    total_users: Number(users),
  };
}

/** Fetch the default analysis prompt from the canister */
export async function getDefaultPrompt(): Promise<{ id: string; name: string; version: string; prompt_template: string } | null> {
  const actor = await getActor();
  const raw = await actor.get_default_prompt();
  const result = unwrapOpt(raw) as { id: string; name: string; version: string; prompt_template: string } | null;
  if (!result) return null;
  return {
    id: result.id,
    name: result.name,
    version: result.version,
    prompt_template: result.prompt_template,
  };
}

// ============================================================================
// Analysis History
// ============================================================================

/** Get analysis history for a specific skill */
export async function getAnalysisHistory(skillId: string): Promise<SkillAnalysis[]> {
  const actor = await getActor();
  const raw = await actor.get_analysis_history(skillId);
  return raw.map((a: any) => convertAnalysis(a)).filter(Boolean) as SkillAnalysis[];
}

/** Get global analysis history across all skills (paginated, latest first) */
export async function getAllAnalysisHistory(
  limit: number,
  offset: number,
): Promise<{ entries: { skill_id: string; analysis: SkillAnalysis }[]; total: number }> {
  const actor = await getActor();
  const [rawEntries, total] = await actor.get_all_analysis_history(limit, offset);
  const entries = rawEntries
    .map((entry: any) => {
      const analysis = convertAnalysis(entry[1]);
      if (!analysis) return null;
      return { skill_id: entry[0] as string, analysis };
    })
    .filter(Boolean) as { skill_id: string; analysis: SkillAnalysis }[];
  return { entries, total: Number(total) };
}

/** Get analysis history stats: [total_entries, skills_with_history] */
export async function getAnalysisHistoryStats(): Promise<{ total_entries: number; skills_with_history: number }> {
  const actor = await getActor();
  const [total, skills] = await actor.get_analysis_history_stats();
  return { total_entries: Number(total), skills_with_history: Number(skills) };
}

// ============================================================================
// User Auth API
// ============================================================================

/** Check if the authenticated user has an API key set */
export async function hasApiKeyOnCanister(agent: HttpAgent): Promise<boolean> {
  const actor = getAuthenticatedActor(agent);
  return await actor.has_anthropic_key();
}

/** Save the user's Anthropic API key to the canister */
export async function setAnthropicKey(agent: HttpAgent, key: string): Promise<void> {
  const actor = getAuthenticatedActor(agent);
  const result = await actor.set_my_anthropic_key(key);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

/** Remove the user's Anthropic API key from the canister */
export async function removeAnthropicKey(agent: HttpAgent): Promise<void> {
  const actor = getAuthenticatedActor(agent);
  const result = await actor.remove_my_anthropic_key();
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

/** Analyze a skill using the user's API key (legacy direct Anthropic call) */
export async function analyzeSkill(agent: HttpAgent, skillId: string, model: string): Promise<AnalysisResult> {
  const actor = getAuthenticatedActor(agent);
  const modelVariant: Record<string, null> = {};
  modelVariant[model] = null;
  const result = await actor.analyze_skill(skillId, modelVariant);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  const raw = result.Ok;
  return {
    success: raw.success,
    skill_id: raw.skill_id,
    analysis: raw.analysis.length > 0 ? convertAnalysis(raw.analysis[0]) : null,
    error: raw.error.length > 0 ? raw.error[0] : null,
  };
}

// ============================================================================
// TEE Integration — Phala Cloud
// ============================================================================

/** Store a TEE-encrypted API key on the canister */
export async function setEncryptedKey(agent: HttpAgent, encryptedKeyHex: string): Promise<void> {
  const actor = getAuthenticatedActor(agent);
  const result = await actor.set_my_encrypted_key(encryptedKeyHex);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
}

/** Check if TEE analysis is available (admin has configured a TEE worker) */
export async function isTeeAvailable(): Promise<boolean> {
  const actor = await getActor();
  return await actor.is_tee_analysis_available();
}

/** Get the TEE worker URL */
export async function getTeeWorkerUrl(): Promise<string | null> {
  const actor = await getActor();
  return unwrapOpt(await actor.get_tee_worker_url());
}

// NOTE: analyzeSkillTee was removed in v1.8.0. Use analyzeSkillQueued instead.

// ============================================================================
// Analysis Job Queue — async analysis via TEE worker
// ============================================================================

/** Submit an analysis request to the job queue. Returns a job_id for polling. */
export async function requestAnalysis(agent: HttpAgent, skillId: string, model: string): Promise<string> {
  const actor = getAuthenticatedActor(agent);
  const modelVariant: Record<string, null> = {};
  modelVariant[model] = null;
  const result = await actor.request_analysis(skillId, modelVariant);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  return result.Ok;
}

/** Poll job status. Returns { status, error } or null if job not found. */
export async function getJobStatus(jobId: string): Promise<{ status: string; error: string | null } | null> {
  const actor = await getActor();
  const raw = await actor.get_job_status(jobId);
  const result = unwrapOpt(raw);
  if (!result) return null;
  // Candid Tuple returns as an array-like
  const tuple = result as any;
  const statusVariant = tuple[0];
  const errorOpt = tuple[1];
  return {
    status: unwrapVariantKey(statusVariant),
    error: unwrapOpt(errorOpt),
  };
}

/** Get which models have already analyzed a skill. */
export async function getAnalyzedModels(skillId: string): Promise<string[]> {
  const actor = await getActor();
  return await actor.get_analyzed_models(skillId);
}

/**
 * Request analysis and poll until complete. Returns the updated skill.
 * This is the main function the frontend should call for analysis.
 */
export async function analyzeSkillQueued(
  agent: HttpAgent,
  skillId: string,
  model: string,
  onStatus?: (status: string) => void,
): Promise<AnalysisResult> {
  // Submit the job
  onStatus?.('Submitting analysis request...');
  const jobId = await requestAnalysis(agent, skillId, model);

  // Poll until complete
  onStatus?.('Waiting for TEE worker...');
  const maxWaitMs = 300_000; // 5 minutes
  const pollIntervalMs = 3_000; // 3 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus) {
      throw new Error('Job not found');
    }

    if (jobStatus.status === 'Completed') {
      onStatus?.('Analysis complete!');
      // Invalidate cache before fetching updated skill
      skillCache.invalidateSkill(skillId);
      // Fetch the updated skill to get the analysis
      const skill = await getSkill(skillId);
      if (skill?.analysis) {
        return {
          success: true,
          skill_id: skillId,
          analysis: skill.analysis,
          error: null,
        };
      }
      // Skill updated but analysis not found — shouldn't happen
      return { success: true, skill_id: skillId, analysis: null, error: null };
    }

    if (jobStatus.status === 'Failed') {
      throw new Error(jobStatus.error || 'Analysis failed');
    }

    if (jobStatus.status === 'Processing') {
      onStatus?.('TEE worker is analyzing...');
    }
  }

  throw new Error('Analysis timed out after 2 minutes');
}

// ============================================================================
// Enrichment Job Queue — fetch SKILL.md via TEE worker
// ============================================================================

/** Submit an enrichment request. Returns a job_id for polling. */
export async function requestEnrichment(agent: HttpAgent, skillId: string, autoAnalyze: boolean): Promise<string> {
  const actor = getAuthenticatedActor(agent);
  const result = await actor.request_enrichment(skillId, autoAnalyze);
  if ('Err' in result) {
    throw new Error(result.Err);
  }
  return result.Ok;
}

/** Poll enrichment job status. Returns { status, error } or null if not found. */
export async function getEnrichmentJobStatus(jobId: string): Promise<{ status: string; error: string | null } | null> {
  const actor = await getActor();
  const raw = await actor.get_enrichment_job_status(jobId);
  const result = unwrapOpt(raw);
  if (!result) return null;
  const tuple = result as any;
  const statusVariant = tuple[0];
  const errorOpt = tuple[1];
  return {
    status: unwrapVariantKey(statusVariant),
    error: unwrapOpt(errorOpt),
  };
}

/**
 * Request enrichment and poll until complete. Returns the updated skill.
 * If autoAnalyze is true and content is found, an analysis job is auto-queued.
 */
export async function enrichSkillQueued(
  agent: HttpAgent,
  skillId: string,
  autoAnalyze: boolean,
  onStatus?: (status: string) => void,
): Promise<{ found: boolean; skill: Skill | null }> {
  onStatus?.('Submitting enrichment request...');
  const jobId = await requestEnrichment(agent, skillId, autoAnalyze);

  onStatus?.('Waiting for TEE worker to fetch SKILL.md...');
  const maxWaitMs = 60_000; // 1 minute (enrichment is fast)
  const pollIntervalMs = 2_000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    const jobStatus = await getEnrichmentJobStatus(jobId);
    if (!jobStatus) {
      throw new Error('Enrichment job not found');
    }

    if (jobStatus.status === 'Completed') {
      onStatus?.('SKILL.md found and stored!');
      // Invalidate cache before fetching updated skill
      skillCache.invalidateSkill(skillId);
      const skill = await getSkill(skillId);
      return { found: true, skill };
    }

    if (jobStatus.status === 'NotFound') {
      onStatus?.('SKILL.md not found on GitHub');
      return { found: false, skill: null };
    }

    if (jobStatus.status === 'Failed') {
      throw new Error(jobStatus.error || 'Enrichment failed');
    }

    if (jobStatus.status === 'Processing') {
      onStatus?.('TEE worker is fetching from GitHub...');
    }
  }

  throw new Error('Enrichment timed out after 1 minute');
}

/**
 * Encrypt an API key using the TEE worker's encryption key.
 * Fetches the TEE's derived AES-256 key via /public-key, then encrypts locally using AES-256-GCM.
 * Returns hex-encoded ciphertext: iv (12) || authTag (16) || ciphertext
 */
export async function encryptApiKeyForTee(apiKey: string, teeWorkerUrl: string): Promise<string> {
  // Fetch the TEE's encryption key (the actual 32-byte AES key, hex-encoded)
  const response = await fetch(`${teeWorkerUrl}/public-key`);
  if (!response.ok) {
    throw new Error(`Failed to fetch TEE public key: ${response.status}`);
  }
  const { public_key } = await response.json();

  // The public_key IS the 32-byte AES-256 encryption key (hex-encoded)
  const encKey = hexToBytes(public_key);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt with AES-256-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const plainBytes = new TextEncoder().encode(apiKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    cryptoKey,
    plainBytes
  );

  // AES-GCM in WebCrypto appends the auth tag to the ciphertext
  // We need to separate: ciphertext || authTag (16 bytes)
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);

  // Pack as: iv (12) || authTag (16) || ciphertext (matches TEE worker format)
  const result = new Uint8Array(12 + 16 + ciphertext.length);
  result.set(iv, 0);
  result.set(authTag, 12);
  result.set(ciphertext, 28);

  return bytesToHex(result);
}

// ============================================================================
// Crypto helpers
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}


