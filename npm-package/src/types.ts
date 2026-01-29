// Types matching the ICP canister

export interface TopicRating {
  topic: RatingTopic;
  score: number;        // 0-100
  confidence: number;   // 0-100
  reasoning: string;
}

export type RatingTopic =
  | { Quality: null }
  | { Documentation: null }
  | { Maintainability: null }
  | { Completeness: null }
  | { Security: null }
  | { Malicious: null }     // 100 = safe, 0 = dangerous
  | { Privacy: null }
  | { Usability: null }
  | { Compatibility: null }
  | { Performance: null }
  | { Trustworthiness: null }
  | { Maintenance: null }
  | { Community: null };

export type FlagType =
  | { SecurityRisk: null }
  | { MaliciousPattern: null }
  | { PrivacyConcern: null }
  | { Unmaintained: null }
  | { Deprecated: null }
  | { ExcessivePermissions: null }
  | { UnverifiedSource: null }
  | { KnownVulnerability: null };

export type FlagSeverity =
  | { Info: null }
  | { Warning: null }
  | { Critical: null };

export interface RatingFlag {
  flag_type: FlagType;
  severity: FlagSeverity;
  message: string;
}

export interface Ratings {
  overall: number;              // 0-5 scale
  topics: TopicRating[];
  flags: RatingFlag[];
}

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

export interface ReferencedFile {
  path: string;
  context: string;
  resolved: boolean;
}

export interface ReferencedUrl {
  url: string;
  context: string;
  fetched: boolean;
}

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
  analyzed_at: bigint;
  analyzed_by: string;
  model_used: string;
  analysis_version: string;
  referenced_files: ReferencedFile[];
  referenced_urls: ReferencedUrl[];
  tee_worker_version: string | null;
  prompt_version: string | null;
}

export interface SkillFile {
  path: string;
  content: string;
  checksum: string;
  size_bytes: bigint;
  file_type: SkillFileType;
}

export type SkillFileType =
  | { SkillMd: null }
  | { Reference: null }
  | { Asset: null }
  | { Config: null }
  | { Other: null };

export interface Skill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  github_url: string | null;
  skill_md_url: string | null;
  skill_md_content: string | null;
  files: SkillFile[];
  files_checksum: string | null;
  stars: number;
  analysis: SkillAnalysis | null;
  analysis_history: SkillAnalysis[];
  file_history: any[];
  install_count: bigint;
  created_at: bigint;
  updated_at: bigint;
  source: string;
}

export interface SkillSearchResult {
  skill: Skill;
  relevance_score: number;
}

// CLI-specific types

export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'danger' | 'unknown';

export interface SafetyCheck {
  level: SafetyLevel;
  overallRating: number | null;      // 0-5 scale
  maliciousScore: number | null;     // 0-100 (100 = safe)
  securityScore: number | null;      // 0-100
  flags: RatingFlag[];
  isAnalyzed: boolean;
  summary: string;
  recommendations: string[];
}

export function getTopicName(topic: RatingTopic): string {
  const key = Object.keys(topic)[0];
  return key || 'Unknown';
}

export function getFlagTypeName(flagType: FlagType): string {
  const key = Object.keys(flagType)[0];
  return key || 'Unknown';
}

export function getFlagSeverityName(severity: FlagSeverity): string {
  const key = Object.keys(severity)[0];
  return key || 'Unknown';
}
