import { HttpAgent, Actor } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import type { Skill, SkillSearchResult, Stats, SkillsicConfig } from './types.js';

const DEFAULT_CONFIG: SkillsicConfig = {
  canisterHost: 'https://icp0.io',
  canisterId: 'fs4ea-5qaaa-aaaak-qvwfq-cai',
};

// Minimal IDL for the query methods we need
function createIdlFactory() {
  const SkillAnalysisIDL = IDL.Record({
    ratings: IDL.Record({
      overall: IDL.Float32,
      topics: IDL.Vec(IDL.Record({
        topic: IDL.Variant({
          Quality: IDL.Null, Documentation: IDL.Null, Maintainability: IDL.Null,
          Completeness: IDL.Null, Security: IDL.Null, Malicious: IDL.Null,
          Privacy: IDL.Null, Usability: IDL.Null, Compatibility: IDL.Null,
          Performance: IDL.Null, Trustworthiness: IDL.Null, Maintenance: IDL.Null,
          Community: IDL.Null,
        }),
        score: IDL.Nat8,
        confidence: IDL.Nat8,
        reasoning: IDL.Text,
      })),
      flags: IDL.Vec(IDL.Record({
        flag_type: IDL.Variant({
          SecurityRisk: IDL.Null, MaliciousPattern: IDL.Null, PrivacyConcern: IDL.Null,
          Unmaintained: IDL.Null, Deprecated: IDL.Null, ExcessivePermissions: IDL.Null,
          UnverifiedSource: IDL.Null, KnownVulnerability: IDL.Null,
        }),
        severity: IDL.Variant({ Info: IDL.Null, Warning: IDL.Null, Critical: IDL.Null }),
        message: IDL.Text,
      })),
    }),
    primary_category: IDL.Text,
    secondary_categories: IDL.Vec(IDL.Text),
    tags: IDL.Vec(IDL.Text),
    has_mcp: IDL.Bool,
    provides_mcp: IDL.Bool,
    required_mcps: IDL.Vec(IDL.Record({
      name: IDL.Text, package: IDL.Text, required: IDL.Bool,
      indexed: IDL.Bool, verified: IDL.Bool,
      ratings: IDL.Opt(IDL.Record({ overall: IDL.Float32, topics: IDL.Vec(IDL.Unknown), flags: IDL.Vec(IDL.Unknown) })),
    })),
    software_deps: IDL.Vec(IDL.Record({
      name: IDL.Text, install_cmd: IDL.Opt(IDL.Text), url: IDL.Opt(IDL.Text),
      required: IDL.Bool, ratings: IDL.Opt(IDL.Record({ overall: IDL.Float32, topics: IDL.Vec(IDL.Unknown), flags: IDL.Vec(IDL.Unknown) })),
    })),
    has_references: IDL.Bool,
    has_assets: IDL.Bool,
    estimated_token_usage: IDL.Nat32,
    summary: IDL.Text,
    strengths: IDL.Vec(IDL.Text),
    weaknesses: IDL.Vec(IDL.Text),
    use_cases: IDL.Vec(IDL.Text),
    compatibility_notes: IDL.Text,
    prerequisites: IDL.Vec(IDL.Text),
    analyzed_at: IDL.Nat64,
    analyzed_by: IDL.Principal,
    model_used: IDL.Text,
    analysis_version: IDL.Text,
  });

  const SkillFileType = IDL.Variant({ SkillMd: IDL.Null, Reference: IDL.Null, Asset: IDL.Null, Config: IDL.Null, Other: IDL.Null });
  const SkillFile = IDL.Record({ path: IDL.Text, content: IDL.Text, checksum: IDL.Text, size_bytes: IDL.Nat64, file_type: SkillFileType });

  const SkillIDL = IDL.Record({
    id: IDL.Text, name: IDL.Text, description: IDL.Text,
    owner: IDL.Text, repo: IDL.Text,
    github_url: IDL.Opt(IDL.Text), skill_md_url: IDL.Opt(IDL.Text), skill_md_content: IDL.Opt(IDL.Text),
    files: IDL.Vec(SkillFile), files_checksum: IDL.Opt(IDL.Text),
    stars: IDL.Nat32, analysis: IDL.Opt(SkillAnalysisIDL),
    install_count: IDL.Nat64, created_at: IDL.Nat64, updated_at: IDL.Nat64, source: IDL.Text,
  });

  const SkillSearchResultIDL = IDL.Record({ skill: SkillIDL, relevance_score: IDL.Float32 });

  return ({ IDL: _IDL }: any) => IDL.Service({
    list_skills: IDL.Func([], [IDL.Vec(SkillIDL)], ['query']),
    get_skill: IDL.Func([IDL.Text], [IDL.Opt(SkillIDL)], ['query']),
    search_skills: IDL.Func([IDL.Text], [IDL.Vec(SkillSearchResultIDL)], ['query']),
    get_skills_by_category: IDL.Func([IDL.Text], [IDL.Vec(SkillIDL)], ['query']),
    get_top_rated_skills: IDL.Func([IDL.Nat32], [IDL.Vec(SkillIDL)], ['query']),
    get_categories: IDL.Func([], [IDL.Vec(IDL.Text)], ['query']),
    get_stats: IDL.Func([], [IDL.Tuple(IDL.Nat64, IDL.Nat64, IDL.Nat64, IDL.Nat64)], ['query']),
    get_install_command: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
  });
}

// ============================================================================
// Convert Candid -> TS
// ============================================================================

function unwrapOpt<T>(opt: [] | [T]): T | null {
  return opt.length > 0 ? opt[0]! : null;
}

function variantKey(v: Record<string, any>): string {
  return Object.keys(v)[0];
}

function convertSkill(raw: any): Skill {
  const analysis = raw.analysis.length > 0 ? raw.analysis[0] : null;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    owner: raw.owner,
    repo: raw.repo,
    github_url: unwrapOpt(raw.github_url),
    skill_md_url: unwrapOpt(raw.skill_md_url),
    skill_md_content: unwrapOpt(raw.skill_md_content),
    stars: raw.stars,
    analysis: analysis ? {
      ratings: {
        overall: analysis.ratings.overall,
        topics: analysis.ratings.topics.map((t: any) => ({
          topic: variantKey(t.topic),
          score: t.score,
          confidence: t.confidence,
          reasoning: t.reasoning,
        })),
        flags: analysis.ratings.flags.map((f: any) => ({
          flag_type: variantKey(f.flag_type),
          severity: variantKey(f.severity),
          message: f.message,
        })),
      },
      primary_category: analysis.primary_category,
      secondary_categories: analysis.secondary_categories,
      tags: analysis.tags,
      has_mcp: analysis.has_mcp,
      provides_mcp: analysis.provides_mcp,
      required_mcps: analysis.required_mcps,
      software_deps: analysis.software_deps.map((d: any) => ({
        name: d.name,
        install_cmd: unwrapOpt(d.install_cmd),
        url: unwrapOpt(d.url),
        required: d.required,
        ratings: null,
      })),
      has_references: analysis.has_references,
      has_assets: analysis.has_assets,
      estimated_token_usage: analysis.estimated_token_usage,
      summary: analysis.summary,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      use_cases: analysis.use_cases,
      compatibility_notes: analysis.compatibility_notes,
      prerequisites: analysis.prerequisites,
      analyzed_at: Number(analysis.analyzed_at),
      analyzed_by: analysis.analyzed_by.toString(),
      model_used: analysis.model_used,
      analysis_version: analysis.analysis_version,
    } : null,
    install_count: Number(raw.install_count),
    created_at: Number(raw.created_at),
    updated_at: Number(raw.updated_at),
    source: raw.source,
  };
}

// ============================================================================
// Client
// ============================================================================

export class SkillsicClient {
  private config: SkillsicConfig;
  private actor: any = null;

  constructor(config: Partial<SkillsicConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async getActor(): Promise<any> {
    if (this.actor) return this.actor;

    const agent = new HttpAgent({ host: this.config.canisterHost });
    this.actor = Actor.createActor(createIdlFactory(), {
      agent,
      canisterId: this.config.canisterId,
    });
    return this.actor;
  }

  async searchSkills(query: string): Promise<SkillSearchResult[]> {
    const actor = await this.getActor();
    const raw = await actor.search_skills(query);
    return raw.map((r: any) => ({
      skill: convertSkill(r.skill),
      relevance_score: r.relevance_score,
    }));
  }

  async getSkill(id: string): Promise<Skill | null> {
    const actor = await this.getActor();
    const raw = await actor.get_skill(id);
    const result = unwrapOpt(raw);
    return result ? convertSkill(result) : null;
  }

  async getTopRatedSkills(limit: number = 10): Promise<Skill[]> {
    const actor = await this.getActor();
    const raw = await actor.get_top_rated_skills(limit);
    return raw.map(convertSkill);
  }

  async getSkillsByCategory(category: string): Promise<Skill[]> {
    const actor = await this.getActor();
    const raw = await actor.get_skills_by_category(category);
    return raw.map(convertSkill);
  }

  async getCategories(): Promise<string[]> {
    const actor = await this.getActor();
    return await actor.get_categories();
  }

  async getStats(): Promise<Stats> {
    const actor = await this.getActor();
    const [total, analyzed, installs, users] = await actor.get_stats();
    return {
      total_skills: Number(total),
      analyzed_skills: Number(analyzed),
      total_installs: Number(installs),
      total_users: Number(users),
    };
  }

  getInstallCommand(skill: Skill): string {
    if (skill.repo === skill.name) {
      return `npx skills add ${skill.owner}/${skill.repo}`;
    }
    return `npx skills add ${skill.owner}/${skill.repo} --skill ${skill.name}`;
  }
}
