export type AnalysisModel = 'Haiku' | 'Sonnet' | 'Opus';

// ============================================================================
// Rating System
// ============================================================================

export type RatingTopic = 
  | 'Quality'
  | 'Documentation'
  | 'Maintainability'
  | 'Completeness'
  | 'Security'
  | 'Malicious'
  | 'Privacy'
  | 'Usability'
  | 'Compatibility'
  | 'Performance'
  | 'Trustworthiness'
  | 'Maintenance'
  | 'Community';

export interface TopicRating {
  topic: RatingTopic;
  score: number;        // 0-100
  confidence: number;   // 0-100
  reasoning: string;
}

export type FlagType = 
  | 'SecurityRisk'
  | 'MaliciousPattern'
  | 'PrivacyConcern'
  | 'Unmaintained'
  | 'Deprecated'
  | 'ExcessivePermissions'
  | 'UnverifiedSource'
  | 'KnownVulnerability';

export type FlagSeverity = 'Info' | 'Warning' | 'Critical';

export interface RatingFlag {
  flag_type: FlagType;
  severity: FlagSeverity;
  message: string;
}

export interface Ratings {
  overall: number;           // 0-5 scale
  topics: TopicRating[];
  flags: RatingFlag[];
}

// ============================================================================
// Dependencies
// ============================================================================

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

// ============================================================================
// Skill Analysis
// ============================================================================

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
  // Ratings
  ratings: Ratings;
  
  // Categories & classification
  primary_category: string;
  secondary_categories: string[];
  tags: string[];
  
  // Capabilities
  has_mcp: boolean;
  provides_mcp: boolean;
  required_mcps: McpDependency[];
  software_deps: SoftwareDependency[];
  has_references: boolean;
  has_assets: boolean;
  estimated_token_usage: number;
  
  // Analysis content
  summary: string;
  strengths: string[];
  weaknesses: string[];
  use_cases: string[];
  compatibility_notes: string;
  prerequisites: string[];
  
  // Referenced files & URLs (v2.2.0+)
  referenced_files: ReferencedFile[];
  referenced_urls: ReferencedUrl[];
  
  // Metadata
  analyzed_at: bigint;
  analyzed_by: string;
  model_used: string;
  analysis_version: string;
  // TEE provenance (v2.1.0+)
  tee_worker_version: string | null;
  prompt_version: string | null;
}

export type SkillFileType = 'SkillMd' | 'Reference' | 'Asset' | 'Config' | 'Other';

export interface SkillFile {
  path: string;
  content: string;
  checksum: string;
  size_bytes: bigint;
  file_type: SkillFileType;
}

export interface SkillFileVersion {
  path: string;
  checksum: string;
  size_bytes: bigint;
  fetched_at: bigint;
  fetched_by: string;
  source_url: string | null;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  github_url: string | null;
  skill_md_url: string | null;
  skill_md_content: string | null; // Legacy, use files instead
  files: SkillFile[];
  files_checksum: string | null;   // Combined checksum for quick verification
  stars: number;
  analysis: SkillAnalysis | null;
  analysis_history: SkillAnalysis[];
  file_history: SkillFileVersion[];
  install_count: bigint;
  created_at: bigint;
  updated_at: bigint;
  source: string;
}

// Verification types
export interface FileVerifyResult {
  path: string;
  is_valid: boolean;
  stored_checksum: string;
  provided_checksum: string;
}

export interface SkillVerifyResult {
  skill_id: string;
  is_valid: boolean;
  files_checked: number;
  files_valid: number;
  files_invalid: FileVerifyResult[];
  missing_files: string[];
  extra_files: string[];
}

export interface SkillSearchResult {
  skill: Skill;
  relevance_score: number;
}

export interface UserProfile {
  principal: string;
  anthropic_api_key: string | null;
  analyses_performed: bigint;
  created_at: bigint;
  last_active: bigint;
}

export interface AnalysisResult {
  success: boolean;
  skill_id: string;
  analysis: SkillAnalysis | null;
  error: string | null;
}

export type SortOption = 'rating' | 'quality' | 'stars' | 'recent' | 'name' | 'installs';
export type ViewMode = 'cards' | 'compact';

export interface AnalysisRequest {
  skill_id: string;
  model: AnalysisModel;
}

export interface Stats {
  total_skills: number;
  analyzed_skills: number;
  total_installs: number;
  total_users: number;
}
