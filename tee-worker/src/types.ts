/**
 * Types matching the ICP canister's Candid schema for skill analysis.
 * The TEE worker produces output in exactly this format so the canister
 * can store it directly.
 */

// ============================================================================
// Request types (from ICP canister / frontend)
// ============================================================================

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillData {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  skill_md_content?: string;
  skill_files?: SkillFile[];
}

export interface AnalysisRequest {
  encrypted_api_key?: string;  // Hex-encoded encrypted API key (production)
  api_key?: string;            // Plaintext API key (dev mode only)
  skill: SkillData;
  model?: string;              // Anthropic model ID
  prompt_template?: string;    // Optional prompt template (required if not using job queue)
}

// ============================================================================
// Analysis output types (matches canister SkillAnalysis exactly)
// ============================================================================

export interface TopicRating {
  topic: string;       // e.g. "Quality", "Security", "Malicious"
  score: number;       // 0-100
  confidence: number;  // 0-100
  reasoning: string;
}

export interface RatingFlag {
  flag_type: string;   // SecurityRisk | MaliciousPattern | PrivacyConcern | etc.
  severity: string;    // Info | Warning | Critical
  message: string;
}

export interface Ratings {
  overall: number;           // 0.0 - 5.0
  topics: TopicRating[];
  flags: RatingFlag[];
}

export interface McpDependency {
  name: string;
  package: string;
  required: boolean;
  indexed: boolean;
  verified: boolean;
  ratings?: Ratings;
}

export interface SoftwareDependency {
  name: string;
  install_cmd?: string;
  url?: string;
  required: boolean;
  ratings?: Ratings;
}

export interface ReferencedFile {
  path: string;        // e.g. "docx-js.md", "scripts/setup.py"
  context: string;     // Why it's referenced
  resolved: boolean;   // true if found in skill files
}

export interface ReferencedUrl {
  url: string;         // The URL found in the skill
  context: string;     // What the URL is for
  fetched: boolean;    // true if content was fetched
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
  referenced_files: ReferencedFile[];
  referenced_urls: ReferencedUrl[];
}

// ============================================================================
// Prompt builder — uses canister prompt template if provided, else hardcoded fallback
// ============================================================================

/**
 * Build the analysis prompt for a skill.
 * If a promptTemplate is provided (from canister), it uses placeholder substitution.
 * Otherwise falls back to the hardcoded default.
 */
/**
 * Build a section with all sub-files for the prompt.
 * Truncates individual files to 50KB and total to 200KB.
 */
function buildFilesSection(files: SkillFile[]): string {
  if (!files || files.length === 0) return '';

  const MAX_FILE_CHARS = 50_000;
  const MAX_TOTAL_CHARS = 200_000;
  let totalChars = 0;
  const sections: string[] = [];

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      sections.push(`\n--- (${files.length - sections.length} more files truncated) ---`);
      break;
    }
    const remaining = MAX_TOTAL_CHARS - totalChars;
    let content = file.content;
    if (content.length > MAX_FILE_CHARS) {
      content = content.substring(0, MAX_FILE_CHARS) + '\n... (truncated)';
    }
    if (content.length > remaining) {
      content = content.substring(0, remaining) + '\n... (truncated)';
    }
    sections.push(`\n--- FILE: ${file.path} ---\n${content}`);
    totalChars += content.length;
  }

  return `\n\nSUB-FILES (${files.length} companion files referenced by SKILL.md):\n${sections.join('\n')}`;
}

/**
 * Build the analysis prompt for a skill.
 * The promptTemplate MUST be loaded from the canister - no fallback.
 * @throws Error if promptTemplate is not provided
 */
export function buildAnalysisPrompt(skill: SkillData, promptTemplate: string): string {
  if (!promptTemplate) {
    throw new Error('Prompt template is required - must be loaded from canister');
  }

  const content = skill.skill_md_content || `# ${skill.name}\n\n${skill.description}`;
  const filesSection = buildFilesSection(skill.skill_files || []);

  return promptTemplate
    .replace(/\{owner\}/g, skill.owner)
    .replace(/\{repo\}/g, skill.repo)
    .replace(/\{name\}/g, skill.name)
    .replace(/\{description\}/g, skill.description)
    .replace(/\{content\}/g, content)
    .replace(/\{files\}/g, filesSection);
}
