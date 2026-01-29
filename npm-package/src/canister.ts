import { Actor, HttpAgent } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import type { Skill, SkillSearchResult } from './types.js';

// Canister ID on IC mainnet
const CANISTER_ID = 'fs4ea-5qaaa-aaaak-qvwfq-cai';
const IC_HOST = 'https://ic0.app';

// Minimal IDL for the methods we need
// We only decode the fields we care about for the CLI

const RatingTopicIDL = IDL.Variant({
  'Quality': IDL.Null,
  'Documentation': IDL.Null,
  'Maintainability': IDL.Null,
  'Completeness': IDL.Null,
  'Security': IDL.Null,
  'Malicious': IDL.Null,
  'Privacy': IDL.Null,
  'Usability': IDL.Null,
  'Compatibility': IDL.Null,
  'Performance': IDL.Null,
  'Trustworthiness': IDL.Null,
  'Maintenance': IDL.Null,
  'Community': IDL.Null,
});

const TopicRatingIDL = IDL.Record({
  'topic': RatingTopicIDL,
  'score': IDL.Nat8,
  'confidence': IDL.Nat8,
  'reasoning': IDL.Text,
});

const FlagTypeIDL = IDL.Variant({
  'SecurityRisk': IDL.Null,
  'MaliciousPattern': IDL.Null,
  'PrivacyConcern': IDL.Null,
  'Unmaintained': IDL.Null,
  'Deprecated': IDL.Null,
  'ExcessivePermissions': IDL.Null,
  'UnverifiedSource': IDL.Null,
  'KnownVulnerability': IDL.Null,
});

const FlagSeverityIDL = IDL.Variant({
  'Info': IDL.Null,
  'Warning': IDL.Null,
  'Critical': IDL.Null,
});

const RatingFlagIDL = IDL.Record({
  'flag_type': FlagTypeIDL,
  'severity': FlagSeverityIDL,
  'message': IDL.Text,
});

const RatingsIDL = IDL.Record({
  'overall': IDL.Float32,
  'topics': IDL.Vec(TopicRatingIDL),
  'flags': IDL.Vec(RatingFlagIDL),
});

const McpDependencyIDL = IDL.Record({
  'name': IDL.Text,
  'package': IDL.Text,
  'required': IDL.Bool,
  'indexed': IDL.Bool,
  'verified': IDL.Bool,
  'ratings': IDL.Opt(RatingsIDL),
});

const SoftwareDependencyIDL = IDL.Record({
  'name': IDL.Text,
  'install_cmd': IDL.Opt(IDL.Text),
  'url': IDL.Opt(IDL.Text),
  'required': IDL.Bool,
  'ratings': IDL.Opt(RatingsIDL),
});

const ReferencedFileIDL = IDL.Record({
  'path': IDL.Text,
  'context': IDL.Text,
  'resolved': IDL.Bool,
});

const ReferencedUrlIDL = IDL.Record({
  'url': IDL.Text,
  'context': IDL.Text,
  'fetched': IDL.Bool,
});

const SkillAnalysisIDL = IDL.Record({
  'ratings': RatingsIDL,
  'primary_category': IDL.Text,
  'secondary_categories': IDL.Vec(IDL.Text),
  'tags': IDL.Vec(IDL.Text),
  'has_mcp': IDL.Bool,
  'provides_mcp': IDL.Bool,
  'required_mcps': IDL.Vec(McpDependencyIDL),
  'software_deps': IDL.Vec(SoftwareDependencyIDL),
  'has_references': IDL.Bool,
  'has_assets': IDL.Bool,
  'estimated_token_usage': IDL.Nat32,
  'summary': IDL.Text,
  'strengths': IDL.Vec(IDL.Text),
  'weaknesses': IDL.Vec(IDL.Text),
  'use_cases': IDL.Vec(IDL.Text),
  'compatibility_notes': IDL.Text,
  'prerequisites': IDL.Vec(IDL.Text),
  'analyzed_at': IDL.Nat64,
  'analyzed_by': IDL.Principal,
  'model_used': IDL.Text,
  'analysis_version': IDL.Text,
  'referenced_files': IDL.Vec(ReferencedFileIDL),
  'referenced_urls': IDL.Vec(ReferencedUrlIDL),
  'tee_worker_version': IDL.Opt(IDL.Text),
  'prompt_version': IDL.Opt(IDL.Text),
});

const SkillFileTypeIDL = IDL.Variant({
  'SkillMd': IDL.Null,
  'Reference': IDL.Null,
  'Asset': IDL.Null,
  'Config': IDL.Null,
  'Other': IDL.Null,
});

const SkillFileIDL = IDL.Record({
  'path': IDL.Text,
  'content': IDL.Text,
  'checksum': IDL.Text,
  'size_bytes': IDL.Nat64,
  'file_type': SkillFileTypeIDL,
});

const SkillFileVersionIDL = IDL.Record({
  'path': IDL.Text,
  'checksum': IDL.Text,
  'size_bytes': IDL.Nat64,
  'fetched_at': IDL.Nat64,
  'fetched_by': IDL.Principal,
  'source_url': IDL.Opt(IDL.Text),
});

const SkillIDL = IDL.Record({
  'id': IDL.Text,
  'name': IDL.Text,
  'description': IDL.Text,
  'owner': IDL.Text,
  'repo': IDL.Text,
  'github_url': IDL.Opt(IDL.Text),
  'skill_md_url': IDL.Opt(IDL.Text),
  'skill_md_content': IDL.Opt(IDL.Text),
  'files': IDL.Vec(SkillFileIDL),
  'files_checksum': IDL.Opt(IDL.Text),
  'stars': IDL.Nat32,
  'analysis': IDL.Opt(SkillAnalysisIDL),
  'analysis_history': IDL.Vec(SkillAnalysisIDL),
  'file_history': IDL.Vec(SkillFileVersionIDL),
  'install_count': IDL.Nat64,
  'created_at': IDL.Nat64,
  'updated_at': IDL.Nat64,
  'source': IDL.Text,
});

const SkillSearchResultIDL = IDL.Record({
  'skill': SkillIDL,
  'relevance_score': IDL.Float32,
});

// IDL factory for our canister interface
const idlFactory = () => {
  return IDL.Service({
    'get_skill': IDL.Func([IDL.Text], [IDL.Opt(SkillIDL)], ['query']),
    'search_skills': IDL.Func([IDL.Text], [IDL.Vec(SkillSearchResultIDL)], ['query']),
    'list_skills_filtered': IDL.Func(
      [IDL.Nat32, IDL.Nat32, IDL.Text, IDL.Text, IDL.Text],
      [IDL.Vec(SkillIDL), IDL.Nat32],
      ['query']
    ),
    'get_stats': IDL.Func([], [IDL.Nat64, IDL.Nat64, IDL.Nat64, IDL.Nat64], ['query']),
  });
};

// Create agent and actor
let agent: HttpAgent | null = null;
let actor: any = null;

async function getActor() {
  if (actor) return actor;

  agent = new HttpAgent({ host: IC_HOST });
  
  // Don't fetch root key in production (IC mainnet)
  // agent.fetchRootKey() is only for local development
  
  actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: CANISTER_ID,
  });
  
  return actor;
}

/**
 * Get a skill by ID (e.g., "owner/repo" or "owner/repo/name")
 */
export async function getSkill(skillId: string): Promise<Skill | null> {
  const actor = await getActor();
  const result = await actor.get_skill(skillId);
  
  if (result.length === 0) {
    return null;
  }
  
  return transformSkill(result[0]);
}

/**
 * Search for skills by query
 */
export async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  const actor = await getActor();
  const results = await actor.search_skills(query);
  
  return results.map((r: any) => ({
    skill: transformSkill(r.skill),
    relevance_score: r.relevance_score,
  }));
}

/**
 * List skills with filters
 */
export async function listSkillsFiltered(
  limit: number,
  offset: number,
  sortBy: string,
  search: string,
  category: string
): Promise<{ skills: Skill[]; total: number }> {
  const actor = await getActor();
  const [skills, total] = await actor.list_skills_filtered(
    limit,
    offset,
    sortBy,
    search,
    category
  );
  
  return {
    skills: skills.map(transformSkill),
    total: Number(total),
  };
}

/**
 * Get canister stats
 */
export async function getStats(): Promise<{
  totalSkills: number;
  analyzedSkills: number;
  totalInstalls: number;
  totalUsers: number;
}> {
  const actor = await getActor();
  const [skills, analyzed, installs, users] = await actor.get_stats();
  
  return {
    totalSkills: Number(skills),
    analyzedSkills: Number(analyzed),
    totalInstalls: Number(installs),
    totalUsers: Number(users),
  };
}

// Transform canister response to our types
function transformSkill(raw: any): Skill {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    owner: raw.owner,
    repo: raw.repo,
    github_url: raw.github_url[0] || null,
    skill_md_url: raw.skill_md_url[0] || null,
    skill_md_content: raw.skill_md_content[0] || null,
    files: raw.files || [],
    files_checksum: raw.files_checksum[0] || null,
    stars: Number(raw.stars),
    analysis: raw.analysis[0] ? transformAnalysis(raw.analysis[0]) : null,
    analysis_history: (raw.analysis_history || []).map(transformAnalysis),
    file_history: raw.file_history || [],
    install_count: BigInt(raw.install_count),
    created_at: BigInt(raw.created_at),
    updated_at: BigInt(raw.updated_at),
    source: raw.source,
  };
}

function transformAnalysis(raw: any): any {
  return {
    ratings: {
      overall: raw.ratings.overall,
      topics: raw.ratings.topics,
      flags: raw.ratings.flags,
    },
    primary_category: raw.primary_category,
    secondary_categories: raw.secondary_categories,
    tags: raw.tags,
    has_mcp: raw.has_mcp,
    provides_mcp: raw.provides_mcp,
    required_mcps: raw.required_mcps,
    software_deps: raw.software_deps,
    has_references: raw.has_references,
    has_assets: raw.has_assets,
    estimated_token_usage: Number(raw.estimated_token_usage),
    summary: raw.summary,
    strengths: raw.strengths,
    weaknesses: raw.weaknesses,
    use_cases: raw.use_cases,
    compatibility_notes: raw.compatibility_notes,
    prerequisites: raw.prerequisites,
    analyzed_at: BigInt(raw.analyzed_at),
    analyzed_by: raw.analyzed_by.toString(),
    model_used: raw.model_used,
    analysis_version: raw.analysis_version,
    referenced_files: raw.referenced_files || [],
    referenced_urls: raw.referenced_urls || [],
    tee_worker_version: raw.tee_worker_version?.[0] || null,
    prompt_version: raw.prompt_version?.[0] || null,
  };
}
