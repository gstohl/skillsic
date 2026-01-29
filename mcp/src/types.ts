// Rating System
export type RatingTopic =
  | 'Quality' | 'Documentation' | 'Maintainability' | 'Completeness'
  | 'Security' | 'Malicious' | 'Privacy'
  | 'Usability' | 'Compatibility' | 'Performance'
  | 'Trustworthiness' | 'Maintenance' | 'Community';

export type FlagType =
  | 'SecurityRisk' | 'MaliciousPattern' | 'PrivacyConcern'
  | 'Unmaintained' | 'Deprecated' | 'ExcessivePermissions'
  | 'UnverifiedSource' | 'KnownVulnerability';

export type FlagSeverity = 'Info' | 'Warning' | 'Critical';

export interface TopicRating {
  topic: RatingTopic;
  score: number;
  confidence: number;
  reasoning: string;
}

export interface RatingFlag {
  flag_type: FlagType;
  severity: FlagSeverity;
  message: string;
}

export interface Ratings {
  overall: number;
  topics: TopicRating[];
  flags: RatingFlag[];
}

// Dependencies
export interface McpDependency {
  name: string;
  package: string;
  required: boolean;
  indexed: boolean;
  verified: boolean;
  ratings: Ratings | null;
}

export interface SoftwareDependency {
  name: string;
  install_cmd: string | null;
  url: string | null;
  required: boolean;
  ratings: Ratings | null;
}

// Skill Analysis
export interface SkillAnalysis {
  ratings: Ratings;
  primary_category: string;
  secondary_categories: string[];
  tags: string[];
  has_mcp: boolean;
  provides_mcp: boolean;
  required_mcps: McpDependency[];
  software_deps: SoftwareDependency[];
  has_references: boolean;
  has_assets: boolean;
  estimated_token_usage: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  use_cases: string[];
  compatibility_notes: string;
  prerequisites: string[];
  analyzed_at: number;
  analyzed_by: string;
  model_used: string;
  analysis_version: string;
}

// Skill
export interface Skill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  github_url: string | null;
  skill_md_url: string | null;
  skill_md_content: string | null;
  stars: number;
  analysis: SkillAnalysis | null;
  install_count: number;
  created_at: number;
  updated_at: number;
  source: string;
}

export interface SkillSearchResult {
  skill: Skill;
  relevance_score: number;
}

export interface Stats {
  total_skills: number;
  analyzed_skills: number;
  total_installs: number;
  total_users: number;
}

export interface SkillsicConfig {
  canisterHost: string;
  canisterId: string;
}
