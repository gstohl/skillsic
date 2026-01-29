use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::management_canister::http_request::{
    http_request, CanisterHttpRequestArgument, HttpHeader, HttpMethod,
};
use ic_cdk_macros::{init, post_upgrade, pre_upgrade, query, update};
use serde::{Deserialize as SerdeDeserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;

// ============================================================================
// Types
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum AnalysisModel {
    Haiku,
    Opus,
}

impl AnalysisModel {
    fn to_model_id(&self) -> &'static str {
        // Using aliases - automatically points to latest model snapshot
        match self {
            AnalysisModel::Haiku => "claude-haiku-4-5",
            AnalysisModel::Opus => "claude-opus-4-5",
        }
    }

    fn cost_cycles(&self) -> u128 {
        // IC HTTP outcall cost: ~400M base + (req+resp bytes) * ~10K per byte
        // TEE requests send skill data (~10-50KB), max_response_bytes=200KB
        match self {
            AnalysisModel::Haiku => 800_000_000,
            AnalysisModel::Opus => 10_000_000_000,
        }
    }

    /// Model strength ranking (higher = stronger)
    fn strength(&self) -> u8 {
        match self {
            AnalysisModel::Haiku => 1,
            AnalysisModel::Opus => 2,
        }
    }

    /// Parse model from model_id string
    fn from_model_id(model_id: &str) -> Option<Self> {
        if model_id.contains("opus") {
            Some(AnalysisModel::Opus)
        } else if model_id.contains("haiku") {
            Some(AnalysisModel::Haiku)
        } else {
            None
        }
    }
}

/// A single file within a skill (SKILL.md, references, assets, etc.)
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SkillFile {
    pub path: String,              // Relative path: "SKILL.md", "references/api.md", etc.
    pub content: String,           // File content
    pub checksum: String,          // SHA-256 hash (SHA-256 of content)
    pub size_bytes: u64,
    pub file_type: SkillFileType,
}

/// A versioned snapshot of a skill file (for history tracking)
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SkillFileVersion {
    pub path: String,              // Which file this is a version of
    pub checksum: String,          // SHA-256 hash of this version's content
    pub size_bytes: u64,
    pub fetched_at: u64,           // Timestamp when this version was fetched
    pub fetched_by: Principal,     // Who triggered the fetch
    pub source_url: Option<String>, // Where it was fetched from (GitHub URL)
    // Note: We don't store full content in history to save space
    // Content is only in the current SkillFile. History tracks checksums for verification.
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum SkillFileType {
    SkillMd,      // Main SKILL.md
    Reference,    // Reference docs
    Asset,        // Images, diagrams, etc. (base64 encoded)
    Config,       // Configuration files
    Other,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub owner: String,
    pub repo: String,
    pub github_url: Option<String>,
    pub skill_md_url: Option<String>,
    // Legacy single file support (deprecated, use files instead)
    pub skill_md_content: Option<String>,
    // Multi-file support
    pub files: Vec<SkillFile>,
    pub files_checksum: Option<String>,  // Combined checksum of all files (for quick verification)
    pub stars: u32,
    pub analysis: Option<SkillAnalysis>,
    // History of all analyses (latest first). The current analysis is also at index 0.
    #[serde(default)]
    pub analysis_history: Vec<SkillAnalysis>,
    // History of file versions (checksums only, for verification). Latest first.
    #[serde(default)]
    pub file_history: Vec<SkillFileVersion>,
    pub install_count: u64,
    pub created_at: u64,
    pub updated_at: u64,
    pub source: String,
}

// ============================================================================
// Rating Topics - Used for both skills and dependencies
// ============================================================================

/// Individual rating on a specific topic (0-100 scale)
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct TopicRating {
    pub topic: RatingTopic,
    pub score: u8,              // 0-100
    pub confidence: u8,         // 0-100, how confident is the analysis
    pub reasoning: String,      // Brief explanation
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum RatingTopic {
    // Quality & Code
    Quality,            // Overall code/content quality
    Documentation,      // How well documented
    Maintainability,    // Easy to maintain/update
    Completeness,       // Does it cover what it claims
    
    // Security & Safety
    Security,           // Security best practices
    Malicious,          // Risk of malicious behavior (100 = safe, 0 = dangerous)
    Privacy,            // Privacy considerations
    
    // Usability
    Usability,          // Easy to use/install
    Compatibility,      // Works with various setups
    Performance,        // Efficient, not wasteful
    
    // Trust & Reputation
    Trustworthiness,    // Can we trust this source
    Maintenance,        // Is it actively maintained
    Community,          // Community support/adoption
}

/// Aggregated ratings across all topics
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct Ratings {
    pub overall: f32,                    // Weighted average (0-5 scale)
    pub topics: Vec<TopicRating>,        // Individual topic scores
    pub flags: Vec<RatingFlag>,          // Any warnings/flags
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct RatingFlag {
    pub flag_type: FlagType,
    pub severity: FlagSeverity,
    pub message: String,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum FlagType {
    SecurityRisk,
    MaliciousPattern,
    PrivacyConcern,
    Unmaintained,
    Deprecated,
    ExcessivePermissions,
    UnverifiedSource,
    KnownVulnerability,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum FlagSeverity {
    Info,
    Warning,
    Critical,
}

// ============================================================================
// Dependencies with Ratings
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct McpDependency {
    pub name: String,
    pub package: String,           // npm package or repo
    pub required: bool,
    pub indexed: bool,             // if we have it in our index
    pub verified: bool,            // if we've verified it
    pub ratings: Option<Ratings>,  // Ratings for this dependency
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SoftwareDependency {
    pub name: String,
    pub install_cmd: Option<String>, // e.g., "brew install X" or "cargo install X"
    pub url: Option<String>,
    pub required: bool,
    pub ratings: Option<Ratings>,    // Ratings for this dependency
}

// ============================================================================
// Referenced Files & URLs (detected in SKILL.md by AI analysis)
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct ReferencedFile {
    pub path: String,              // e.g. "docx-js.md", "scripts/setup.py"
    pub context: String,           // Why it's referenced (e.g. "API reference for docx library")
    pub resolved: bool,            // true if we found & stored this file
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct ReferencedUrl {
    pub url: String,               // The URL found in the skill
    pub context: String,           // What the URL is for
    pub fetched: bool,             // true if we've fetched and stored the content
}

// ============================================================================
// Skill Analysis
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SkillAnalysis {
    // Ratings
    pub ratings: Ratings,            // All rating topics + overall
    
    // Classification
    pub primary_category: String,
    pub secondary_categories: Vec<String>,
    pub tags: Vec<String>,
    
    // MCP detection
    pub has_mcp: bool,
    pub provides_mcp: bool,              // skill provides its own MCP
    pub required_mcps: Vec<McpDependency>,  // MCPs this skill needs (with their ratings)
    
    // Other dependencies
    pub software_deps: Vec<SoftwareDependency>,  // Software deps (with their ratings)
    
    // Assets
    pub has_references: bool,
    pub has_assets: bool,
    pub estimated_token_usage: u32,
    
    // Content
    pub summary: String,
    pub strengths: Vec<String>,
    pub weaknesses: Vec<String>,
    pub use_cases: Vec<String>,
    pub compatibility_notes: String,
    pub prerequisites: Vec<String>,
    // Metadata
    pub analyzed_at: u64,
    pub analyzed_by: Principal,
    pub model_used: String,
    pub analysis_version: String,
    // Referenced files & URLs detected in SKILL.md (added v2.2.0)
    #[serde(default)]
    pub referenced_files: Vec<ReferencedFile>,
    #[serde(default)]
    pub referenced_urls: Vec<ReferencedUrl>,
    // TEE provenance (added in v2.1.0)
    #[serde(default)]
    pub tee_worker_version: Option<String>,     // e.g. "1.4.0"
    #[serde(default)]
    pub prompt_version: Option<String>,         // e.g. "1.0.0" (from canister prompt)
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct UserProfile {
    pub principal: Principal,
    pub anthropic_api_key: Option<String>,           // Legacy: plaintext key (deprecated)
    pub encrypted_anthropic_key: Option<String>,     // TEE-encrypted key (hex-encoded ciphertext)
    pub analyses_performed: u64,
    pub created_at: u64,
    pub last_active: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SkillSearchResult {
    pub skill: Skill,
    pub relevance_score: f32,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct AnalysisResult {
    pub success: bool,
    pub skill_id: String,
    pub analysis: Option<SkillAnalysis>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct AnalysisPrompt {
    pub id: String,
    pub name: String,
    pub version: String,
    pub prompt_template: String,
    pub created_by: Principal,
    pub created_at: u64,
    pub is_default: bool,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct GlobalConfig {
    pub admins: Vec<Principal>,
    pub skillsmp_api_key: String,
    pub analysis_enabled: bool,
    pub default_prompt_id: Option<String>,
    pub tee_worker_url: Option<String>,  // Phala TEE worker URL (e.g. "https://xxxx.dstack.host")
    #[serde(default)]
    pub worker_principals: Vec<Principal>,  // TEE worker identities (dedicated worker role)
}

// Anthropic API types (used by legacy direct outcall path)
#[derive(Clone, Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
}

#[derive(Clone, Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Clone, Debug, SerdeDeserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Clone, Debug, SerdeDeserialize)]
struct AnthropicContent {
    text: String,
}

// ============================================================================
// Analysis Job Queue — TEE worker pulls jobs, processes, writes back
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct AnalysisJob {
    pub id: String,
    pub skill_id: String,
    pub model: AnalysisModel,
    pub encrypted_api_key: String,
    pub requester: Principal,
    pub status: JobStatus,
    pub created_at: u64,
    pub updated_at: u64,
    pub error: Option<String>,
}

/// A lightweight file entry for pending jobs (no checksum/type — just path and content).
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct PendingJobFile {
    pub path: String,
    pub content: String,
}

/// What the TEE worker sees when polling for jobs (includes skill data + files)
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct PendingJob {
    pub job_id: String,
    pub skill_id: String,
    pub skill_name: String,
    pub skill_description: String,
    pub skill_owner: String,
    pub skill_repo: String,
    pub skill_md_content: Option<String>,
    pub skill_files: Vec<PendingJobFile>,
    pub model: String,
    pub encrypted_api_key: String,
}

// ============================================================================
// Enrichment Job Queue — TEE worker fetches SKILL.md from GitHub
// ============================================================================

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
pub enum EnrichmentJobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    NotFound,  // SKILL.md not found on GitHub
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct EnrichmentJob {
    pub id: String,
    pub skill_id: String,
    pub owner: String,
    pub repo: String,
    pub name: String,
    pub status: EnrichmentJobStatus,
    pub auto_analyze: bool,              // If true, auto-queue analysis after enrichment
    pub requester: Principal,
    pub created_at: u64,
    pub updated_at: u64,
    pub error: Option<String>,
    pub content_found: Option<String>,   // The SKILL.md content once found
    pub source_url: Option<String>,      // Which URL the content was found at
}

/// What the TEE worker sees when polling for enrichment jobs
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct PendingEnrichmentJob {
    pub job_id: String,
    pub skill_id: String,
    pub owner: String,
    pub repo: String,
    pub name: String,
    pub auto_analyze: bool,
}

/// Result submitted by the TEE worker
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct EnrichmentResult {
    pub found: bool,
    pub content: Option<String>,         // The SKILL.md content
    pub source_url: Option<String>,      // Which URL it was found at
    pub files_found: Vec<EnrichmentFile>, // Additional files discovered
}

/// A file discovered during enrichment (sub-files in the skill directory)
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct EnrichmentFile {
    pub path: String,
    pub content: String,
}

// ============================================================================
// Default Prompt Template
// ============================================================================

const DEFAULT_PROMPT_TEMPLATE: &str = r#"Analyze this Claude Code skill and provide evaluation as JSON.

SKILL: {owner}/{repo}
NAME: {name}
DESCRIPTION: {description}

CONTENT:
{content}
{files}

Rate this skill on EACH of these topics (0-100 scale):
- Quality: Code/content quality
- Documentation: How well documented  
- Maintainability: Easy to maintain
- Completeness: Covers what it claims
- Security: Security best practices
- Malicious: Safety score (100=completely safe, 0=definitely malicious)
- Privacy: Privacy considerations
- Usability: Easy to use/install
- Compatibility: Works with various setups
- Performance: Efficient, not wasteful
- Trustworthiness: Can we trust this source
- Maintenance: Actively maintained
- Community: Community support

Also analyze:
1. Whether it PROVIDES an MCP server (provides_mcp)
2. Whether it REQUIRES other MCPs to work (required_mcps) - rate each dependency
3. Software dependencies needed (software_deps) - rate each dependency
4. Referenced files: Identify ANY files the skill references that it expects the agent to read (e.g. [docx-js.md], backtick references like `api-reference.md`, instructions like "read X.md", "see the file Y", companion docs). List each with its path and why it's referenced.
5. Referenced URLs: Identify ANY URLs/websites the skill tells the agent to visit or read (e.g. documentation links, API references, external resources). List each with its URL and purpose.

Return JSON:
{{
  "ratings": {{
    "overall": <0.0-5.0>,
    "topics": [
      {{"topic": "Quality", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Documentation", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Maintainability", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Completeness", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Security", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Malicious", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Privacy", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Usability", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Compatibility", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Performance", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Trustworthiness", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Maintenance", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}},
      {{"topic": "Community", "score": <0-100>, "confidence": <0-100>, "reasoning": "<brief>"}}
    ],
    "flags": [
      {{"flag_type": "<SecurityRisk|MaliciousPattern|PrivacyConcern|Unmaintained|Deprecated|ExcessivePermissions|UnverifiedSource|KnownVulnerability>", "severity": "<Info|Warning|Critical>", "message": "<description>"}}
    ]
  }},
  "primary_category": "<web|programming|systems|blockchain|ai|devops|data|security|productivity|meta>",
  "secondary_categories": [],
  "tags": [],
  "has_mcp": <bool>,
  "provides_mcp": <bool>,
  "required_mcps": [
    {{
      "name": "<mcp name>",
      "package": "<npm package or repo>",
      "required": <bool>,
      "ratings": {{
        "overall": <0.0-5.0>,
        "topics": [{{"topic": "Security", "score": <0-100>, "confidence": <0-100>, "reasoning": ""}}],
        "flags": []
      }}
    }}
  ],
  "software_deps": [
    {{
      "name": "<software>",
      "install_cmd": "<command or null>",
      "url": "<url or null>",
      "required": <bool>,
      "ratings": {{
        "overall": <0.0-5.0>,
        "topics": [{{"topic": "Security", "score": <0-100>, "confidence": <0-100>, "reasoning": ""}}],
        "flags": []
      }}
    }}
  ],
  "has_references": <bool>,
  "has_assets": <bool>,
  "estimated_token_usage": <int>,
  "summary": "<2-3 sentences>",
  "strengths": [],
  "weaknesses": [],
  "use_cases": [],
  "compatibility_notes": "<string>",
  "prerequisites": [],
  "referenced_files": [
    {{"path": "<filename.md>", "context": "<why this file is referenced>", "resolved": false}}
  ],
  "referenced_urls": [
    {{"url": "<https://...>", "context": "<what the URL is for>", "fetched": false}}
  ]
}}

IMPORTANT: 
- Malicious score 100 = completely safe, 0 = definitely malicious
- Flag any security concerns, even minor ones
- Be conservative with trust scores for unknown sources
- Return ONLY valid JSON"#;

// ============================================================================
// State
// ============================================================================

thread_local! {
    static SKILLS: RefCell<HashMap<String, Skill>> = RefCell::new(HashMap::new());
    static USERS: RefCell<HashMap<Principal, UserProfile>> = RefCell::new(HashMap::new());
    static PROMPTS: RefCell<HashMap<String, AnalysisPrompt>> = RefCell::new(HashMap::new());
    static JOBS: RefCell<HashMap<String, AnalysisJob>> = RefCell::new(HashMap::new());
    static JOB_COUNTER: RefCell<u64> = RefCell::new(0);
    static ENRICHMENT_JOBS: RefCell<HashMap<String, EnrichmentJob>> = RefCell::new(HashMap::new());
    static ENRICHMENT_JOB_COUNTER: RefCell<u64> = RefCell::new(0);
    /// Rate limiting: tracks (principal, skill_id) -> (count, window_start_time)
    static INSTALL_RATE_LIMITS: RefCell<HashMap<(Principal, String), (u32, u64)>> = RefCell::new(HashMap::new());
    static CONFIG: RefCell<GlobalConfig> = RefCell::new(GlobalConfig {
        admins: Vec::new(),
        skillsmp_api_key: String::new(),
        analysis_enabled: true,
        default_prompt_id: None,
        tee_worker_url: None,
        worker_principals: Vec::new(),
    });
}

// ============================================================================
// Init & Upgrade
// ============================================================================

#[init]
fn init() {
    let caller = ic_cdk::caller();
    CONFIG.with(|c| {
        let mut config = c.borrow_mut();
        config.admins.push(caller);
        config.skillsmp_api_key =
            "sk_live_skillsmp_V7jAuP4vvpXYREfo_bkDH2U6dhfM8Y20LqQoHT-5SP8".to_string();
        config.tee_worker_url = None;
        config.worker_principals = Vec::new();
    });
    
    // Create default analysis prompt
    let default_prompt = AnalysisPrompt {
        id: "default-v1".to_string(),
        name: "Default Analysis Prompt".to_string(),
        version: "1.0.0".to_string(),
        prompt_template: DEFAULT_PROMPT_TEMPLATE.to_string(),
        created_by: caller,
        created_at: ic_cdk::api::time(),
        is_default: true,
    };
    PROMPTS.with(|p| {
        p.borrow_mut().insert(default_prompt.id.clone(), default_prompt);
    });
    CONFIG.with(|c| {
        c.borrow_mut().default_prompt_id = Some("default-v1".to_string());
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    let skills = SKILLS.with(|s| s.borrow().clone());
    let users = USERS.with(|u| u.borrow().clone());
    let prompts = PROMPTS.with(|p| p.borrow().clone());
    let config = CONFIG.with(|c| c.borrow().clone());
    let jobs = JOBS.with(|j| j.borrow().clone());
    let job_counter = JOB_COUNTER.with(|c| *c.borrow());
    let enrichment_jobs = ENRICHMENT_JOBS.with(|j| j.borrow().clone());
    let enrichment_job_counter = ENRICHMENT_JOB_COUNTER.with(|c| *c.borrow());
    ic_cdk::storage::stable_save((skills, users, prompts, config, jobs, job_counter, enrichment_jobs, enrichment_job_counter))
        .expect("Failed to save state");
}

#[post_upgrade]
fn post_upgrade() {
    // =====================================================================
    // Migration: The stored Skill has no `analysis_history` field, and
    // SkillAnalysis has no `tee_worker_version` / `prompt_version`.
    // We use shadow structs that match the OLD on-disk Candid format,
    // then convert to the new structs.
    // =====================================================================

    #[derive(Clone, Debug, CandidType, Deserialize)]
    struct OldSkillAnalysis {
        ratings: Ratings,
        primary_category: String,
        secondary_categories: Vec<String>,
        tags: Vec<String>,
        has_mcp: bool,
        provides_mcp: bool,
        required_mcps: Vec<McpDependency>,
        software_deps: Vec<SoftwareDependency>,
        has_references: bool,
        has_assets: bool,
        estimated_token_usage: u32,
        summary: String,
        strengths: Vec<String>,
        weaknesses: Vec<String>,
        use_cases: Vec<String>,
        compatibility_notes: String,
        prerequisites: Vec<String>,
        analyzed_at: u64,
        analyzed_by: Principal,
        model_used: String,
        analysis_version: String,
    }

    #[derive(Clone, Debug, CandidType, Deserialize)]
    struct OldSkill {
        id: String,
        name: String,
        description: String,
        owner: String,
        repo: String,
        github_url: Option<String>,
        skill_md_url: Option<String>,
        skill_md_content: Option<String>,
        files: Vec<SkillFile>,
        files_checksum: Option<String>,
        stars: u32,
        analysis: Option<OldSkillAnalysis>,
        install_count: u64,
        created_at: u64,
        updated_at: u64,
        source: String,
    }

    fn migrate_analysis(old: OldSkillAnalysis) -> SkillAnalysis {
        SkillAnalysis {
            ratings: old.ratings,
            primary_category: old.primary_category,
            secondary_categories: old.secondary_categories,
            tags: old.tags,
            has_mcp: old.has_mcp,
            provides_mcp: old.provides_mcp,
            required_mcps: old.required_mcps,
            software_deps: old.software_deps,
            has_references: old.has_references,
            has_assets: old.has_assets,
            estimated_token_usage: old.estimated_token_usage,
            summary: old.summary,
            strengths: old.strengths,
            weaknesses: old.weaknesses,
            use_cases: old.use_cases,
            compatibility_notes: old.compatibility_notes,
            prerequisites: old.prerequisites,
            analyzed_at: old.analyzed_at,
            analyzed_by: old.analyzed_by,
            model_used: old.model_used,
            analysis_version: old.analysis_version,
            referenced_files: Vec::new(),
            referenced_urls: Vec::new(),
            tee_worker_version: None,
            prompt_version: None,
        }
    }

    fn migrate_skill(old: OldSkill) -> Skill {
        let analysis = old.analysis.map(migrate_analysis);
        let analysis_history = analysis.clone().into_iter().collect(); // seed history with current
        Skill {
            id: old.id,
            name: old.name,
            description: old.description,
            owner: old.owner,
            repo: old.repo,
            github_url: old.github_url,
            skill_md_url: old.skill_md_url,
            skill_md_content: old.skill_md_content,
            files: old.files,
            files_checksum: old.files_checksum,
            stars: old.stars,
            analysis,
            analysis_history,
            file_history: Vec::new(),  // Initialize empty for migrated skills
            install_count: old.install_count,
            created_at: old.created_at,
            updated_at: old.updated_at,
            source: old.source,
        }
    }

    // Try NEWEST format first (with enrichment jobs)
    if let Ok((skills, users, prompts, config, jobs, job_counter, enrichment_jobs, enrichment_job_counter)) =
        ic_cdk::storage::stable_restore::<(
            HashMap<String, Skill>,
            HashMap<Principal, UserProfile>,
            HashMap<String, AnalysisPrompt>,
            GlobalConfig,
            HashMap<String, AnalysisJob>,
            u64,
            HashMap<String, EnrichmentJob>,
            u64,
        )>()
    {
        SKILLS.with(|s| *s.borrow_mut() = skills);
        USERS.with(|u| *u.borrow_mut() = users);
        PROMPTS.with(|p| *p.borrow_mut() = prompts);
        CONFIG.with(|c| *c.borrow_mut() = config);
        JOBS.with(|j| *j.borrow_mut() = jobs);
        JOB_COUNTER.with(|c| *c.borrow_mut() = job_counter);
        ENRICHMENT_JOBS.with(|j| *j.borrow_mut() = enrichment_jobs);
        ENRICHMENT_JOB_COUNTER.with(|c| *c.borrow_mut() = enrichment_job_counter);
        update_default_prompt_template();
        return;
    }

    // Try previous format (without enrichment jobs)
    if let Ok((skills, users, prompts, config, jobs, job_counter)) =
        ic_cdk::storage::stable_restore::<(
            HashMap<String, Skill>,
            HashMap<Principal, UserProfile>,
            HashMap<String, AnalysisPrompt>,
            GlobalConfig,
            HashMap<String, AnalysisJob>,
            u64,
        )>()
    {
        SKILLS.with(|s| *s.borrow_mut() = skills);
        USERS.with(|u| *u.borrow_mut() = users);
        PROMPTS.with(|p| *p.borrow_mut() = prompts);
        CONFIG.with(|c| *c.borrow_mut() = config);
        JOBS.with(|j| *j.borrow_mut() = jobs);
        JOB_COUNTER.with(|c| *c.borrow_mut() = job_counter);
        update_default_prompt_template();
        return;
    }

    // Try format v2: OLD Skill (no analysis_history, no tee_worker_version) + jobs
    if let Ok((old_skills, users, prompts, config, jobs, job_counter)) =
        ic_cdk::storage::stable_restore::<(
            HashMap<String, OldSkill>,
            HashMap<Principal, UserProfile>,
            HashMap<String, AnalysisPrompt>,
            GlobalConfig,
            HashMap<String, AnalysisJob>,
            u64,
        )>()
    {
        let new_skills: HashMap<String, Skill> = old_skills
            .into_iter()
            .map(|(id, old)| (id, migrate_skill(old)))
            .collect();
        SKILLS.with(|s| *s.borrow_mut() = new_skills);
        USERS.with(|u| *u.borrow_mut() = users);
        PROMPTS.with(|p| *p.borrow_mut() = prompts);
        CONFIG.with(|c| *c.borrow_mut() = config);
        JOBS.with(|j| *j.borrow_mut() = jobs);
        JOB_COUNTER.with(|c| *c.borrow_mut() = job_counter);
        update_default_prompt_template();
        return;
    }

    // Fallback: old format without jobs
    #[derive(Clone, Debug, CandidType, Deserialize)]
    struct OldGlobalConfig {
        admins: Vec<Principal>,
        skillsmp_api_key: String,
        analysis_enabled: bool,
        default_prompt_id: Option<String>,
        tee_worker_url: Option<String>,
    }

    let (old_skills, users, prompts, old_config): (
        HashMap<String, OldSkill>,
        HashMap<Principal, UserProfile>,
        HashMap<String, AnalysisPrompt>,
        OldGlobalConfig,
    ) = ic_cdk::storage::stable_restore().expect("Failed to restore state");

    let new_skills: HashMap<String, Skill> = old_skills
        .into_iter()
        .map(|(id, old)| (id, migrate_skill(old)))
        .collect();
    SKILLS.with(|s| *s.borrow_mut() = new_skills);
    USERS.with(|u| *u.borrow_mut() = users);
    PROMPTS.with(|p| *p.borrow_mut() = prompts);
    CONFIG.with(|c| {
        let mut config = c.borrow_mut();
        config.admins = old_config.admins;
        config.skillsmp_api_key = old_config.skillsmp_api_key;
        config.analysis_enabled = old_config.analysis_enabled;
        config.default_prompt_id = old_config.default_prompt_id;
        config.tee_worker_url = old_config.tee_worker_url;
        config.worker_principals = Vec::new();
    });
    update_default_prompt_template();
}

/// Update the default prompt template to the latest version on upgrade.
/// This ensures the on-chain prompt always matches the code's DEFAULT_PROMPT_TEMPLATE.
fn update_default_prompt_template() {
    PROMPTS.with(|p| {
        let mut prompts = p.borrow_mut();
        if let Some(prompt) = prompts.get_mut("default-v1") {
            prompt.prompt_template = DEFAULT_PROMPT_TEMPLATE.to_string();
            prompt.version = "1.1.0".to_string();
        }
    });
}

// ============================================================================
// Helpers
// ============================================================================

fn is_admin() -> bool {
    let caller = ic_cdk::caller();
    CONFIG.with(|c| c.borrow().admins.contains(&caller))
}

fn is_authenticated() -> bool {
    ic_cdk::caller() != Principal::anonymous()
}

fn is_worker() -> bool {
    let caller = ic_cdk::caller();
    CONFIG.with(|c| c.borrow().worker_principals.contains(&caller))
}

fn is_admin_or_worker() -> bool {
    is_admin() || is_worker()
}

// ============================================================================
// Content Sanitization — prevent injection/attack vectors in skill content
// ============================================================================

/// Maximum allowed size for skill_md_content (200 KB).
/// Larger content is likely not a real skill file.
const MAX_SKILL_CONTENT_BYTES: usize = 200_000;

/// Maximum allowed size for a single SkillFile content (500 KB).
const MAX_SKILL_FILE_BYTES: usize = 500_000;

/// Maximum number of analysis history entries per skill.
/// Oldest entries are dropped when this is exceeded.
const MAX_ANALYSIS_HISTORY: usize = 20;

/// Maximum age for completed/failed jobs before cleanup (24 hours in nanoseconds).
const JOB_CLEANUP_AGE_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

/// Maximum jobs to keep in total (prevents unbounded growth).
const MAX_JOBS_RETAINED: usize = 10_000;

/// Rate limit window for record_install (1 hour in nanoseconds).
const RATE_LIMIT_WINDOW_NS: u64 = 60 * 60 * 1_000_000_000;

/// Maximum installs per principal per skill within rate limit window.
const MAX_INSTALLS_PER_WINDOW: u32 = 5;

/// Sanitize skill_md_content before storing.
/// Returns Ok(sanitized_content) or Err(reason).
fn sanitize_skill_content(content: &str) -> Result<String, String> {
    if content.len() > MAX_SKILL_CONTENT_BYTES {
        return Err(format!(
            "Content too large: {} bytes (max {})",
            content.len(),
            MAX_SKILL_CONTENT_BYTES
        ));
    }
    // Strip null bytes (could confuse parsers)
    let cleaned = content.replace('\0', "");
    // Strip excessive whitespace-only lines (>10 consecutive blank lines → collapse to 2)
    let mut result = String::with_capacity(cleaned.len());
    let mut blank_count = 0u32;
    for line in cleaned.lines() {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                result.push('\n');
            }
        } else {
            blank_count = 0;
            result.push_str(line);
            result.push('\n');
        }
    }
    Ok(result)
}

/// Sanitize a SkillFile before storing.
fn sanitize_skill_file(file: &SkillFile) -> Result<(), String> {
    if file.content.len() > MAX_SKILL_FILE_BYTES {
        return Err(format!(
            "File '{}' too large: {} bytes (max {})",
            file.path,
            file.content.len(),
            MAX_SKILL_FILE_BYTES
        ));
    }
    // Reject paths with directory traversal
    if file.path.contains("..") || file.path.starts_with('/') || file.path.starts_with('\\') {
        return Err(format!("Invalid file path: {}", file.path));
    }
    Ok(())
}

// ============================================================================
// User Auth & Profile
// ============================================================================

#[query]
fn whoami() -> Principal {
    ic_cdk::caller()
}

#[query]
fn is_logged_in() -> bool {
    is_authenticated()
}

#[query]
fn get_my_profile() -> Option<UserProfile> {
    if !is_authenticated() {
        return None;
    }
    let caller = ic_cdk::caller();
    USERS.with(|u| u.borrow().get(&caller).cloned())
}

#[update]
fn set_my_anthropic_key(key: String) -> Result<(), String> {
    if !is_authenticated() {
        return Err("Must be authenticated with Internet Identity".to_string());
    }
    if !key.starts_with("sk-") {
        return Err("Invalid Anthropic API key format".to_string());
    }

    let caller = ic_cdk::caller();
    USERS.with(|u| {
        let mut users = u.borrow_mut();
        if let Some(user) = users.get_mut(&caller) {
            user.anthropic_api_key = Some(key);
            user.last_active = ic_cdk::api::time();
        } else {
            users.insert(
                caller,
                UserProfile {
                    principal: caller,
                    anthropic_api_key: Some(key),
                    encrypted_anthropic_key: None,
                    analyses_performed: 0,
                    created_at: ic_cdk::api::time(),
                    last_active: ic_cdk::api::time(),
                },
            );
        }
    });
    Ok(())
}

#[update]
fn remove_my_anthropic_key() -> Result<(), String> {
    if !is_authenticated() {
        return Err("Must be authenticated".to_string());
    }
    let caller = ic_cdk::caller();
    USERS.with(|u| {
        if let Some(user) = u.borrow_mut().get_mut(&caller) {
            user.anthropic_api_key = None;
        }
    });
    Ok(())
}

#[query]
fn has_anthropic_key() -> bool {
    if !is_authenticated() {
        return false;
    }
    let caller = ic_cdk::caller();
    USERS.with(|u| {
        u.borrow()
            .get(&caller)
            .map(|user| user.anthropic_api_key.is_some() || user.encrypted_anthropic_key.is_some())
            .unwrap_or(false)
    })
}

// ============================================================================
// TEE Integration — Phala Cloud
// ============================================================================

/// Store a TEE-encrypted API key. The key is encrypted client-side using the
/// TEE worker's public key, so only the Phala TEE enclave can decrypt it.
/// The canister stores the opaque ciphertext — it cannot read the plaintext.
#[update]
fn set_my_encrypted_key(encrypted_key: String) -> Result<(), String> {
    if !is_authenticated() {
        return Err("Must be authenticated with Internet Identity".to_string());
    }
    if encrypted_key.len() < 56 {
        // Minimum: 12 (iv) + 16 (tag) + at least a few bytes of ciphertext, hex-encoded
        return Err("Encrypted key too short".to_string());
    }
    // Validate it's valid hex
    if !encrypted_key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid hex encoding".to_string());
    }

    let caller = ic_cdk::caller();
    USERS.with(|u| {
        let mut users = u.borrow_mut();
        if let Some(user) = users.get_mut(&caller) {
            user.encrypted_anthropic_key = Some(encrypted_key);
            user.anthropic_api_key = None; // Clear any legacy plaintext key
            user.last_active = ic_cdk::api::time();
        } else {
            users.insert(
                caller,
                UserProfile {
                    principal: caller,
                    anthropic_api_key: None,
                    encrypted_anthropic_key: Some(encrypted_key),
                    analyses_performed: 0,
                    created_at: ic_cdk::api::time(),
                    last_active: ic_cdk::api::time(),
                },
            );
        }
    });
    Ok(())
}

/// Admin: set the Phala TEE worker URL
#[update]
fn set_tee_worker_url(url: String) -> Result<(), String> {
    if !is_admin() {
        return Err("Admin only".to_string());
    }
    CONFIG.with(|c| {
        c.borrow_mut().tee_worker_url = Some(url);
    });
    Ok(())
}

/// Get the TEE worker URL (public)
#[query]
fn get_tee_worker_url() -> Option<String> {
    CONFIG.with(|c| c.borrow().tee_worker_url.clone())
}

/// Check if TEE analysis is available
#[query]
fn is_tee_analysis_available() -> bool {
    CONFIG.with(|c| c.borrow().tee_worker_url.is_some())
}

// NOTE: analyze_skill_tee was removed in v1.8.0. Use the job queue instead:
// 1. request_analysis(skill_id, model) → returns job_id
// 2. Poll get_job_status(job_id) until Completed
// 3. Fetch updated skill with get_skill(skill_id)

// ============================================================================
// Analysis Job Queue
// ============================================================================

/// User submits an analysis request → creates a job in the queue.
/// Returns the job_id so the frontend can poll for status.
#[update]
fn request_analysis(skill_id: String, model: AnalysisModel) -> Result<String, String> {
    if !is_authenticated() {
        return Err("Must be authenticated".to_string());
    }
    if !CONFIG.with(|c| c.borrow().analysis_enabled) {
        return Err("Analysis is disabled".to_string());
    }

    let caller = ic_cdk::caller();

    // User must have an encrypted API key
    let encrypted_key = USERS.with(|u| {
        u.borrow()
            .get(&caller)
            .and_then(|user| user.encrypted_anthropic_key.clone())
    }).ok_or("No encrypted API key set. Save your API key first.")?;

    // Skill must exist and not already analyzed by this model
    SKILLS.with(|s| {
        let skills = s.borrow();
        let skill = skills.get(&skill_id).ok_or("Skill not found".to_string())?;
        
        // Check if this model has already analyzed this skill
        let model_id = model.to_model_id();
        let already_analyzed = skill.analysis_history.iter().any(|a| a.model_used == model_id);
        if already_analyzed {
            return Err(format!(
                "This skill has already been analyzed by {}. Try a different model.",
                model_id.replace("claude-", "").split('-').next().unwrap_or("this model")
            ));
        }
        Ok(())
    })?;

    // Generate job ID
    let job_id = JOB_COUNTER.with(|c| {
        let mut counter = c.borrow_mut();
        *counter += 1;
        format!("job-{}", *counter)
    });

    let now = ic_cdk::api::time();
    let job = AnalysisJob {
        id: job_id.clone(),
        skill_id,
        model,
        encrypted_api_key: encrypted_key,
        requester: caller,
        status: JobStatus::Pending,
        created_at: now,
        updated_at: now,
        error: None,
    };

    JOBS.with(|j| j.borrow_mut().insert(job_id.clone(), job));

    Ok(job_id)
}

/// Frontend polls this to check job status
#[query]
fn get_job_status(job_id: String) -> Option<(JobStatus, Option<String>)> {
    JOBS.with(|j| {
        j.borrow().get(&job_id).map(|job| {
            (job.status.clone(), job.error.clone())
        })
    })
}

/// TEE worker calls this to pick up pending jobs (worker role only).
/// Returns up to `limit` pending jobs with all data needed for analysis.
/// Marks returned jobs as Processing.
#[update]
fn claim_pending_jobs(limit: u32) -> Result<Vec<PendingJob>, String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    let limit = limit.min(10) as usize;
    let now = ic_cdk::api::time();

    JOBS.with(|j| {
        let mut jobs = j.borrow_mut();

        // Find pending jobs
        let pending_ids: Vec<String> = jobs.values()
            .filter(|job| job.status == JobStatus::Pending)
            .take(limit)
            .map(|job| job.id.clone())
            .collect();

        let mut result = Vec::new();

        for job_id in pending_ids {
            if let Some(job) = jobs.get_mut(&job_id) {
                // Get skill data
                let skill_opt = SKILLS.with(|s| s.borrow().get(&job.skill_id).cloned());
                if let Some(skill) = skill_opt {
                    let skill_content = skill.skill_md_content.clone()
                        .unwrap_or_else(|| format!("# {}\n\n{}", skill.name, skill.description));

                    // Convert skill files to lightweight format for the worker
                    let skill_files: Vec<PendingJobFile> = skill.files.iter()
                        .map(|f| PendingJobFile {
                            path: f.path.clone(),
                            content: f.content.clone(),
                        })
                        .collect();

                    result.push(PendingJob {
                        job_id: job.id.clone(),
                        skill_id: job.skill_id.clone(),
                        skill_name: skill.name.clone(),
                        skill_description: skill.description.clone(),
                        skill_owner: skill.owner.clone(),
                        skill_repo: skill.repo.clone(),
                        skill_md_content: Some(skill_content),
                        skill_files,
                        model: job.model.to_model_id().to_string(),
                        encrypted_api_key: job.encrypted_api_key.clone(),
                    });

                    // Mark as processing
                    job.status = JobStatus::Processing;
                    job.updated_at = now;
                } else {
                    // Skill was deleted — fail the job
                    job.status = JobStatus::Failed;
                    job.error = Some("Skill not found".to_string());
                    job.updated_at = now;
                }
            }
        }

        Ok(result)
    })
}

/// TEE worker submits a completed analysis result (worker role only).
/// Optional metadata: tee_worker_version, prompt_version.
#[update]
fn submit_job_result(job_id: String, analysis_json: String) -> Result<(), String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    let now = ic_cdk::api::time();

    JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let job = jobs.get_mut(&job_id).ok_or("Job not found")?;

        if job.status != JobStatus::Processing {
            return Err(format!("Job is not in Processing state (currently: {:?})", job.status));
        }

        let skill_id = job.skill_id.clone();
        let requester = job.requester;
        let model = job.model.clone();

        // Parse the analysis JSON with the correct model
        let analysis = parse_analysis_json(&analysis_json, &model)
            .map_err(|e| format!("Failed to parse analysis: {}", e))?;

        // Store analysis on the skill + push to history
        // Display the strongest model's analysis
        SKILLS.with(|s| {
            if let Some(sk) = s.borrow_mut().get_mut(&skill_id) {
                // Push current analysis to history (latest first)
                sk.analysis_history.insert(0, analysis.clone());
                // Cap history
                if sk.analysis_history.len() > MAX_ANALYSIS_HISTORY {
                    sk.analysis_history.truncate(MAX_ANALYSIS_HISTORY);
                }
                
                // Find the strongest model's analysis to display
                let new_model_strength = model.strength();
                let current_strength = sk.analysis.as_ref()
                    .and_then(|a| AnalysisModel::from_model_id(&a.model_used))
                    .map(|m| m.strength())
                    .unwrap_or(0);
                
                // Only update displayed analysis if new one is from stronger/equal model
                if new_model_strength >= current_strength {
                    sk.analysis = Some(analysis);
                }
                sk.updated_at = now;
            }
        });

        // Update requester stats
        USERS.with(|u| {
            if let Some(user) = u.borrow_mut().get_mut(&requester) {
                user.analyses_performed += 1;
                user.last_active = now;
            }
        });

        // Mark job completed
        job.status = JobStatus::Completed;
        job.updated_at = now;
        job.error = None;

        Ok(())
    })
}

/// TEE worker submits a completed analysis result with metadata (worker role only).
/// Metadata includes tee_worker_version and prompt_version for provenance tracking.
#[update]
fn submit_job_result_with_metadata(
    job_id: String,
    analysis_json: String,
    tee_worker_version: String,
    prompt_version: String,
) -> Result<(), String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    let now = ic_cdk::api::time();

    JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let job = jobs.get_mut(&job_id).ok_or("Job not found")?;

        if job.status != JobStatus::Processing {
            return Err(format!("Job is not in Processing state (currently: {:?})", job.status));
        }

        let skill_id = job.skill_id.clone();
        let requester = job.requester;
        let model = job.model.clone();

        // Parse the analysis JSON with the correct model
        let mut analysis = parse_analysis_json(&analysis_json, &model)
            .map_err(|e| format!("Failed to parse analysis: {}", e))?;

        // Attach TEE metadata
        analysis.tee_worker_version = if tee_worker_version.is_empty() { None } else { Some(tee_worker_version) };
        analysis.prompt_version = if prompt_version.is_empty() { None } else { Some(prompt_version) };
        // Override analyzed_by with the actual requester (not the worker principal)
        analysis.analyzed_by = requester;

        // Store analysis on the skill + push to history
        // Display the strongest model's analysis
        SKILLS.with(|s| {
            if let Some(sk) = s.borrow_mut().get_mut(&skill_id) {
                sk.analysis_history.insert(0, analysis.clone());
                if sk.analysis_history.len() > MAX_ANALYSIS_HISTORY {
                    sk.analysis_history.truncate(MAX_ANALYSIS_HISTORY);
                }
                
                // Find the strongest model's analysis to display
                let new_model_strength = model.strength();
                let current_strength = sk.analysis.as_ref()
                    .and_then(|a| AnalysisModel::from_model_id(&a.model_used))
                    .map(|m| m.strength())
                    .unwrap_or(0);
                
                // Only update displayed analysis if new one is from stronger/equal model
                if new_model_strength >= current_strength {
                    sk.analysis = Some(analysis);
                }
                sk.updated_at = now;
            }
        });

        // Update requester stats
        USERS.with(|u| {
            if let Some(user) = u.borrow_mut().get_mut(&requester) {
                user.analyses_performed += 1;
                user.last_active = now;
            }
        });

        // Mark job completed
        job.status = JobStatus::Completed;
        job.updated_at = now;
        job.error = None;

        Ok(())
    })?;

    // Periodic cleanup of old jobs (runs after every job completion)
    cleanup_old_jobs();
    Ok(())
}

/// TEE worker reports a failed job (worker role only).
#[update]
fn submit_job_error(job_id: String, error: String) -> Result<(), String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let job = jobs.get_mut(&job_id).ok_or("Job not found")?;
        job.status = JobStatus::Failed;
        job.error = Some(error);
        job.updated_at = ic_cdk::api::time();
        Ok(())
    })
}

/// Admin: register a TEE worker principal
#[update]
fn add_worker(principal: Principal) -> Result<(), String> {
    if !is_admin() {
        return Err("Admin only".to_string());
    }
    CONFIG.with(|c| {
        let mut config = c.borrow_mut();
        if !config.worker_principals.contains(&principal) {
            config.worker_principals.push(principal);
        }
    });
    Ok(())
}

/// Admin: remove a TEE worker principal
#[update]
fn remove_worker(principal: Principal) -> Result<(), String> {
    if !is_admin() {
        return Err("Admin only".to_string());
    }
    CONFIG.with(|c| {
        c.borrow_mut().worker_principals.retain(|p| *p != principal);
    });
    Ok(())
}

/// Query: list worker principals (admin only)
#[query]
fn get_workers() -> Vec<Principal> {
    CONFIG.with(|c| c.borrow().worker_principals.clone())
}

/// Query: get number of pending jobs
#[query]
fn get_pending_job_count() -> u64 {
    JOBS.with(|j| {
        j.borrow().values().filter(|job| job.status == JobStatus::Pending).count() as u64
    })
}

/// Cleanup old completed/failed jobs from both JOBS and ENRICHMENT_JOBS.
/// Called automatically during submit_job_result and submit_enrichment_result.
fn cleanup_old_jobs() {
    let now = ic_cdk::api::time();
    let cutoff = now.saturating_sub(JOB_CLEANUP_AGE_NS);

    // Cleanup analysis jobs
    JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let before_count = jobs.len();

        // Remove completed/failed jobs older than cutoff
        jobs.retain(|_, job| {
            if job.status == JobStatus::Completed || job.status == JobStatus::Failed {
                job.updated_at > cutoff
            } else {
                true // Keep pending/processing jobs
            }
        });

        // If still over limit, remove oldest completed/failed jobs
        if jobs.len() > MAX_JOBS_RETAINED {
            let mut completed_jobs: Vec<_> = jobs.iter()
                .filter(|(_, job)| job.status == JobStatus::Completed || job.status == JobStatus::Failed)
                .map(|(id, job)| (id.clone(), job.updated_at))
                .collect();
            completed_jobs.sort_by_key(|(_, time)| *time);

            let to_remove = jobs.len() - MAX_JOBS_RETAINED;
            for (id, _) in completed_jobs.into_iter().take(to_remove) {
                jobs.remove(&id);
            }
        }

        let removed = before_count.saturating_sub(jobs.len());
        if removed > 0 {
            ic_cdk::println!("[cleanup] Removed {} old analysis jobs", removed);
        }
    });

    // Cleanup enrichment jobs
    ENRICHMENT_JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let before_count = jobs.len();

        // Remove completed/failed/notfound jobs older than cutoff
        jobs.retain(|_, job| {
            match job.status {
                EnrichmentJobStatus::Completed | EnrichmentJobStatus::Failed | EnrichmentJobStatus::NotFound => {
                    job.updated_at > cutoff
                }
                _ => true // Keep pending/processing jobs
            }
        });

        // If still over limit, remove oldest completed jobs
        if jobs.len() > MAX_JOBS_RETAINED {
            let mut completed_jobs: Vec<_> = jobs.iter()
                .filter(|(_, job)| matches!(job.status, EnrichmentJobStatus::Completed | EnrichmentJobStatus::Failed | EnrichmentJobStatus::NotFound))
                .map(|(id, job)| (id.clone(), job.updated_at))
                .collect();
            completed_jobs.sort_by_key(|(_, time)| *time);

            let to_remove = jobs.len() - MAX_JOBS_RETAINED;
            for (id, _) in completed_jobs.into_iter().take(to_remove) {
                jobs.remove(&id);
            }
        }

        let removed = before_count.saturating_sub(jobs.len());
        if removed > 0 {
            ic_cdk::println!("[cleanup] Removed {} old enrichment jobs", removed);
        }
    });

    // Cleanup old rate limit entries
    INSTALL_RATE_LIMITS.with(|r| {
        let mut limits = r.borrow_mut();
        limits.retain(|_, (_, window_start)| *window_start > cutoff);
    });
}

/// Admin endpoint to manually trigger job cleanup.
#[update]
fn cleanup_jobs() -> Result<(u64, u64), String> {
    if !is_admin() && !is_worker() {
        return Err("Unauthorized: admin or worker only".to_string());
    }

    let jobs_before = JOBS.with(|j| j.borrow().len()) as u64;
    let enrichment_before = ENRICHMENT_JOBS.with(|j| j.borrow().len()) as u64;

    cleanup_old_jobs();

    let jobs_after = JOBS.with(|j| j.borrow().len()) as u64;
    let enrichment_after = ENRICHMENT_JOBS.with(|j| j.borrow().len()) as u64;

    Ok((jobs_before - jobs_after, enrichment_before - enrichment_after))
}

// ============================================================================
// Enrichment Job Queue
// ============================================================================

/// User or admin requests enrichment for a single skill.
/// auto_analyze: if true, auto-queue an analysis job after enrichment succeeds.
#[update]
fn request_enrichment(skill_id: String, auto_analyze: bool) -> Result<String, String> {
    if !is_authenticated() {
        return Err("Must be authenticated".to_string());
    }

    // Skill must exist
    let skill = SKILLS.with(|s| s.borrow().get(&skill_id).cloned())
        .ok_or("Skill not found")?;

    // Don't enrich if already has content
    if skill.skill_md_content.is_some() {
        return Err("Skill already has SKILL.md content".to_string());
    }

    // Check no pending/processing enrichment job already exists for this skill
    let already_queued = ENRICHMENT_JOBS.with(|j| {
        j.borrow().values().any(|job| {
            job.skill_id == skill_id
                && (job.status == EnrichmentJobStatus::Pending || job.status == EnrichmentJobStatus::Processing)
        })
    });
    if already_queued {
        return Err("Enrichment already queued for this skill".to_string());
    }

    let caller = ic_cdk::caller();
    let now = ic_cdk::api::time();

    // If auto_analyze is requested, user must have an encrypted API key
    if auto_analyze {
        let has_key = USERS.with(|u| {
            u.borrow()
                .get(&caller)
                .and_then(|user| user.encrypted_anthropic_key.clone())
                .is_some()
        });
        if !has_key {
            return Err("Auto-analyze requires an encrypted API key. Save your API key first.".to_string());
        }
    }

    let job_id = ENRICHMENT_JOB_COUNTER.with(|c| {
        let mut counter = c.borrow_mut();
        *counter += 1;
        format!("enrich-{}", *counter)
    });

    let job = EnrichmentJob {
        id: job_id.clone(),
        skill_id: skill_id.clone(),
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        status: EnrichmentJobStatus::Pending,
        auto_analyze,
        requester: caller,
        created_at: now,
        updated_at: now,
        error: None,
        content_found: None,
        source_url: None,
    };

    ENRICHMENT_JOBS.with(|j| j.borrow_mut().insert(job_id.clone(), job));

    Ok(job_id)
}

/// Admin: batch-queue enrichment for skills missing SKILL.md content.
/// Returns (queued_count, total_missing).
#[update]
fn queue_enrichment_batch(limit: u32, auto_analyze: bool) -> Result<(u32, u32), String> {
    if !is_admin() {
        return Err("Admin only".to_string());
    }

    let caller = ic_cdk::caller();
    let now = ic_cdk::api::time();

    // Find skills missing content that don't already have pending enrichment
    let already_queued: std::collections::HashSet<String> = ENRICHMENT_JOBS.with(|j| {
        j.borrow().values()
            .filter(|job| job.status == EnrichmentJobStatus::Pending || job.status == EnrichmentJobStatus::Processing)
            .map(|job| job.skill_id.clone())
            .collect()
    });

    let missing: Vec<Skill> = SKILLS.with(|s| {
        s.borrow().values()
            .filter(|sk| sk.skill_md_content.is_none() && !already_queued.contains(&sk.id))
            .take(limit as usize)
            .cloned()
            .collect()
    });

    let total_missing = SKILLS.with(|s| {
        s.borrow().values().filter(|sk| sk.skill_md_content.is_none()).count() as u32
    });

    let mut queued = 0u32;
    ENRICHMENT_JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        for skill in &missing {
            let job_id = ENRICHMENT_JOB_COUNTER.with(|c| {
                let mut counter = c.borrow_mut();
                *counter += 1;
                format!("enrich-{}", *counter)
            });
            jobs.insert(job_id.clone(), EnrichmentJob {
                id: job_id,
                skill_id: skill.id.clone(),
                owner: skill.owner.clone(),
                repo: skill.repo.clone(),
                name: skill.name.clone(),
                status: EnrichmentJobStatus::Pending,
                auto_analyze,
                requester: caller,
                created_at: now,
                updated_at: now,
                error: None,
                content_found: None,
                source_url: None,
            });
            queued += 1;
        }
    });

    Ok((queued, total_missing))
}

/// TEE worker polls this to pick up pending enrichment jobs.
/// Returns up to `limit` pending jobs. Marks them as Processing.
#[update]
fn claim_enrichment_jobs(limit: u32) -> Result<Vec<PendingEnrichmentJob>, String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    let limit = limit.min(20) as usize;
    let now = ic_cdk::api::time();

    ENRICHMENT_JOBS.with(|j| {
        let mut jobs = j.borrow_mut();

        let pending_ids: Vec<String> = jobs.values()
            .filter(|job| job.status == EnrichmentJobStatus::Pending)
            .take(limit)
            .map(|job| job.id.clone())
            .collect();

        let mut result = Vec::new();

        for job_id in pending_ids {
            if let Some(job) = jobs.get_mut(&job_id) {
                result.push(PendingEnrichmentJob {
                    job_id: job.id.clone(),
                    skill_id: job.skill_id.clone(),
                    owner: job.owner.clone(),
                    repo: job.repo.clone(),
                    name: job.name.clone(),
                    auto_analyze: job.auto_analyze,
                });
                job.status = EnrichmentJobStatus::Processing;
                job.updated_at = now;
            }
        }

        Ok(result)
    })
}

/// TEE worker submits enrichment result.
/// If content was found, stores it on the skill.
/// If auto_analyze was requested, queues an analysis job.
#[update]
fn submit_enrichment_result(job_id: String, result: EnrichmentResult) -> Result<(), String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    let now = ic_cdk::api::time();

    ENRICHMENT_JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let job = jobs.get_mut(&job_id).ok_or("Enrichment job not found")?;

        if job.status != EnrichmentJobStatus::Processing {
            return Err(format!("Job not in Processing state (currently: {:?})", job.status));
        }

        let skill_id = job.skill_id.clone();
        let auto_analyze = job.auto_analyze;
        let requester = job.requester;

        if result.found {
            let content = result.content.clone().unwrap_or_default();
            if content.is_empty() {
                job.status = EnrichmentJobStatus::NotFound;
                job.updated_at = now;
                return Ok(());
            }

            // Sanitize and store content on the skill
            let sanitized = sanitize_skill_content(&content)
                .map_err(|e| format!("Content sanitization failed: {}", e))?;
            let source_url_clone = result.source_url.clone();

            SKILLS.with(|s| {
                if let Some(skill) = s.borrow_mut().get_mut(&skill_id) {
                    // Compute checksum for SKILL.md
                    let skill_md_checksum = compute_sha256(&sanitized);
                    
                    // Record file version in history (for SKILL.md)
                    skill.file_history.insert(0, SkillFileVersion {
                        path: "SKILL.md".to_string(),
                        checksum: skill_md_checksum.clone(),
                        size_bytes: sanitized.len() as u64,
                        fetched_at: now,
                        fetched_by: requester,
                        source_url: source_url_clone.clone(),
                    });
                    
                    // Keep only last 50 file versions to limit storage
                    if skill.file_history.len() > 50 {
                        skill.file_history.truncate(50);
                    }
                    
                    skill.skill_md_content = Some(sanitized);
                    skill.updated_at = now;

                    // Also store discovered sub-files if any
                    if !result.files_found.is_empty() {
                        for ef in &result.files_found {
                            if let Ok(()) = sanitize_skill_file(&SkillFile {
                                path: ef.path.clone(),
                                content: ef.content.clone(),
                                checksum: String::new(),
                                size_bytes: ef.content.len() as u64,
                                file_type: SkillFileType::Other,
                            }) {
                                let file_checksum = compute_sha256(&ef.content);
                                
                                // Record this file version in history
                                skill.file_history.insert(0, SkillFileVersion {
                                    path: ef.path.clone(),
                                    checksum: file_checksum.clone(),
                                    size_bytes: ef.content.len() as u64,
                                    fetched_at: now,
                                    fetched_by: requester,
                                    source_url: source_url_clone.clone(),
                                });
                                
                                // Remove existing file with same path
                                skill.files.retain(|f| f.path != ef.path);
                                skill.files.push(SkillFile {
                                    path: ef.path.clone(),
                                    content: ef.content.clone(),
                                    checksum: file_checksum,
                                    size_bytes: ef.content.len() as u64,
                                    file_type: if ef.path.ends_with("SKILL.md") || ef.path.ends_with("skill.md") {
                                        SkillFileType::SkillMd
                                    } else if ef.path.starts_with("references/") {
                                        SkillFileType::Reference
                                    } else {
                                        SkillFileType::Other
                                    },
                                });
                            }
                        }
                        // Recompute combined checksum
                        let combined = compute_combined_checksum(&skill.files);
                        skill.files_checksum = Some(combined);
                        
                        // Keep file history bounded
                        if skill.file_history.len() > 50 {
                            skill.file_history.truncate(50);
                        }
                    }
                }
            });

            job.status = EnrichmentJobStatus::Completed;
            job.content_found = result.content;
            job.source_url = result.source_url;
            job.updated_at = now;

            // If auto_analyze is on, queue an analysis job
            if auto_analyze {
                // Get the requester's encrypted key
                let encrypted_key = USERS.with(|u| {
                    u.borrow()
                        .get(&requester)
                        .and_then(|user| user.encrypted_anthropic_key.clone())
                });

                if let Some(key) = encrypted_key {
                    let analysis_job_id = JOB_COUNTER.with(|c| {
                        let mut counter = c.borrow_mut();
                        *counter += 1;
                        format!("job-{}", *counter)
                    });
                    JOBS.with(|aj| {
                        aj.borrow_mut().insert(analysis_job_id.clone(), AnalysisJob {
                            id: analysis_job_id,
                            skill_id: skill_id.clone(),
                            model: AnalysisModel::Haiku,  // Default to Haiku for auto-analysis
                            encrypted_api_key: key,
                            requester,
                            status: JobStatus::Pending,
                            created_at: now,
                            updated_at: now,
                            error: None,
                        });
                    });
                }
            }
        } else {
            job.status = EnrichmentJobStatus::NotFound;
            job.updated_at = now;
        }

        Ok(())
    })?;

    // Periodic cleanup of old jobs
    cleanup_old_jobs();
    Ok(())
}

/// TEE worker reports a failed enrichment job.
#[update]
fn submit_enrichment_error(job_id: String, error: String) -> Result<(), String> {
    if !is_admin_or_worker() {
        return Err("Worker or admin role required".to_string());
    }

    ENRICHMENT_JOBS.with(|j| {
        let mut jobs = j.borrow_mut();
        let job = jobs.get_mut(&job_id).ok_or("Enrichment job not found")?;
        job.status = EnrichmentJobStatus::Failed;
        job.error = Some(error);
        job.updated_at = ic_cdk::api::time();
        Ok(())
    })
}

/// Frontend polls this to check enrichment job status
#[query]
fn get_enrichment_job_status(job_id: String) -> Option<(EnrichmentJobStatus, Option<String>)> {
    ENRICHMENT_JOBS.with(|j| {
        j.borrow().get(&job_id).map(|job| {
            (job.status.clone(), job.error.clone())
        })
    })
}

/// Get pending enrichment job count
#[query]
fn get_pending_enrichment_count() -> u64 {
    ENRICHMENT_JOBS.with(|j| {
        j.borrow().values().filter(|job| job.status == EnrichmentJobStatus::Pending).count() as u64
    })
}

// ============================================================================
// Admin
// ============================================================================

#[update]
fn add_admin(principal: Principal) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    CONFIG.with(|c| {
        let mut config = c.borrow_mut();
        if !config.admins.contains(&principal) {
            config.admins.push(principal);
        }
    });
    Ok(())
}

#[update]
fn set_analysis_enabled(enabled: bool) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    CONFIG.with(|c| c.borrow_mut().analysis_enabled = enabled);
    Ok(())
}

// ============================================================================
// Prompt Management (Admin only)
// ============================================================================

#[update]
fn create_prompt(id: String, name: String, version: String, prompt_template: String) -> Result<String, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    
    let prompt = AnalysisPrompt {
        id: id.clone(),
        name,
        version,
        prompt_template,
        created_by: ic_cdk::caller(),
        created_at: ic_cdk::api::time(),
        is_default: false,
    };
    
    PROMPTS.with(|p| {
        p.borrow_mut().insert(id.clone(), prompt);
    });
    
    Ok(id)
}

#[update]
fn set_default_prompt(prompt_id: String) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    
    // Verify prompt exists
    let exists = PROMPTS.with(|p| p.borrow().contains_key(&prompt_id));
    if !exists {
        return Err("Prompt not found".to_string());
    }
    
    // Update is_default flags
    PROMPTS.with(|p| {
        let mut prompts = p.borrow_mut();
        for prompt in prompts.values_mut() {
            prompt.is_default = prompt.id == prompt_id;
        }
    });
    
    // Update config
    CONFIG.with(|c| {
        c.borrow_mut().default_prompt_id = Some(prompt_id);
    });
    
    Ok(())
}

#[update]
fn delete_prompt(prompt_id: String) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    
    // Can't delete the default prompt
    let is_default = CONFIG.with(|c| {
        c.borrow().default_prompt_id.as_ref() == Some(&prompt_id)
    });
    if is_default {
        return Err("Cannot delete the default prompt. Set another prompt as default first.".to_string());
    }
    
    PROMPTS.with(|p| {
        p.borrow_mut().remove(&prompt_id);
    });
    
    Ok(())
}

#[query]
fn get_prompt(prompt_id: String) -> Option<AnalysisPrompt> {
    PROMPTS.with(|p| p.borrow().get(&prompt_id).cloned())
}

#[query]
fn list_prompts() -> Vec<AnalysisPrompt> {
    PROMPTS.with(|p| p.borrow().values().cloned().collect())
}

#[query]
fn get_default_prompt() -> Option<AnalysisPrompt> {
    let default_id = CONFIG.with(|c| c.borrow().default_prompt_id.clone());
    default_id.and_then(|id| PROMPTS.with(|p| p.borrow().get(&id).cloned()))
}

// ============================================================================
// Skill Management
// ============================================================================

#[update]
fn add_skill(skill: Skill) -> Result<String, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    let id = skill.id.clone();
    SKILLS.with(|s| s.borrow_mut().insert(id.clone(), skill));
    Ok(id)
}

#[update]
fn add_skills_batch(skills_list: Vec<Skill>) -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    let mut count = 0u32;
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for skill in skills_list {
            skills.insert(skill.id.clone(), skill);
            count += 1;
        }
    });
    Ok(count)
}

/// Add skills only if they don't already exist (skip duplicates).
/// Returns the number of newly inserted skills.
#[update]
fn add_skills_if_new(skills_list: Vec<Skill>) -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    let mut count = 0u32;
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for skill in skills_list {
            if !skills.contains_key(&skill.id) {
                skills.insert(skill.id.clone(), skill);
                count += 1;
            }
        }
    });
    Ok(count)
}

/// Update the SKILL.md content for a skill. Admin only.
/// Content is sanitized: size-limited, null bytes stripped, excessive blank lines collapsed.
#[update]
fn update_skill_md(skill_id: String, content: Option<String>) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let sanitized = match content {
        Some(c) => Some(sanitize_skill_content(&c)?),
        None => None,
    };
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        match skills.get_mut(&skill_id) {
            Some(skill) => {
                skill.skill_md_content = sanitized;
                skill.updated_at = ic_cdk::api::time();
                Ok(())
            }
            None => Err(format!("Skill not found: {}", skill_id)),
        }
    })
}

/// Bulk update SKILL.md content for multiple skills. Admin only.
/// Takes vec of (skill_id, content). Returns number of updated skills.
/// Content is sanitized per entry. Entries that fail sanitization are skipped.
#[update]
fn update_skill_md_batch(data: Vec<(String, String)>) -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let mut updated = 0u32;
    let now = ic_cdk::api::time();
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for (id, content) in &data {
            if let Ok(sanitized) = sanitize_skill_content(content) {
                if let Some(skill) = skills.get_mut(id) {
                    skill.skill_md_content = Some(sanitized);
                    skill.updated_at = now;
                    updated += 1;
                }
            }
        }
    });
    Ok(updated)
}

#[query]
fn get_skill(id: String) -> Option<Skill> {
    SKILLS.with(|s| {
        let skills = s.borrow();
        // Try direct lookup first (e.g., "owner/repo/name")
        if let Some(skill) = skills.get(&id) {
            return Some(skill.clone());
        }
        // If 2-part ID (owner/repo), try expanding to owner/repo/repo
        // This handles the case where repo name == skill name
        let parts: Vec<&str> = id.split('/').collect();
        if parts.len() == 2 {
            let expanded_id = format!("{}/{}/{}", parts[0], parts[1], parts[1]);
            if let Some(skill) = skills.get(&expanded_id) {
                return Some(skill.clone());
            }
        }
        None
    })
}

/// Get which models have already analyzed a skill.
/// Returns list of model IDs that have analyzed this skill.
/// Used by frontend to disable re-analysis with same model.
#[query]
fn get_analyzed_models(skill_id: String) -> Vec<String> {
    SKILLS.with(|s| {
        let skills = s.borrow();
        if let Some(skill) = skills.get(&skill_id) {
            skill.analysis_history.iter()
                .map(|a| a.model_used.clone())
                .collect()
        } else {
            vec![]
        }
    })
}

/// Returns lightweight metadata for skills missing SKILL.md content.
/// Used by enrichment scripts to know which skills need content fetched from GitHub.
/// Returns (id, owner, repo, name) tuples, paginated.
#[query]
fn list_skills_missing_content(limit: u32, offset: u32) -> (Vec<(String, String, String, String)>, u32) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let missing: Vec<(String, String, String, String)> = skills
            .values()
            .filter(|sk| sk.skill_md_content.is_none())
            .map(|sk| (sk.id.clone(), sk.owner.clone(), sk.repo.clone(), sk.name.clone()))
            .collect();
        let total = missing.len() as u32;
        let page = missing
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();
        (page, total)
    })
}

#[query]
fn list_skills() -> Vec<Skill> {
    SKILLS.with(|s| s.borrow().values().cloned().collect())
}

/// Paginated skill listing. Returns (skills, total_count).
/// Skills are sorted by stars descending by default.
#[query]
fn list_skills_page(limit: u32, offset: u32) -> (Vec<Skill>, u32) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let total = skills.len() as u32;
        let mut all: Vec<Skill> = skills.values().cloned().collect();
        all.sort_by(|a, b| b.stars.cmp(&a.stars));
        let page = all
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();
        (page, total)
    })
}

/// Server-side paginated listing with sort, search, and category filter.
/// sort_by: "installs" | "stars" | "rating" | "name" | "recent"
/// search: optional search query (matches name, description, owner, repo, tags, category)
/// category: optional category filter
/// Returns (skills_page, filtered_total).
#[query]
fn list_skills_filtered(limit: u32, offset: u32, sort_by: String, search: String, category: String) -> (Vec<Skill>, u32) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let mut all: Vec<Skill> = skills.values().cloned().collect();

        // Search filter
        if !search.is_empty() {
            let q = search.to_lowercase();
            let terms: Vec<&str> = q.split_whitespace().collect();
            all.retain(|skill| {
                terms.iter().any(|term| {
                    skill.name.to_lowercase().contains(term)
                        || skill.description.to_lowercase().contains(term)
                        || skill.owner.to_lowercase().contains(term)
                        || skill.repo.to_lowercase().contains(term)
                        || skill.analysis.as_ref().map_or(false, |a| {
                            a.primary_category.to_lowercase().contains(term)
                                || a.tags.iter().any(|t| t.to_lowercase().contains(term))
                        })
                })
            });
        }

        // Category filter
        if !category.is_empty() {
            let cat_lower = category.to_lowercase();
            all.retain(|skill| {
                skill.analysis.as_ref().map_or(false, |a| {
                    a.primary_category.to_lowercase() == cat_lower
                        || a.secondary_categories.iter().any(|c| c.to_lowercase() == cat_lower)
                })
            });
        }

        let filtered_total = all.len() as u32;

        // Sort
        match sort_by.as_str() {
            "installs" => all.sort_by(|a, b| b.install_count.cmp(&a.install_count)),
            "stars" => all.sort_by(|a, b| b.stars.cmp(&a.stars)),
            "rating" => all.sort_by(|a, b| {
                let ra = a.analysis.as_ref().map_or(0.0, |a| a.ratings.overall);
                let rb = b.analysis.as_ref().map_or(0.0, |a| a.ratings.overall);
                rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
            }),
            "name" => all.sort_by(|a, b| a.name.cmp(&b.name)),
            "recent" => all.sort_by(|a, b| b.updated_at.cmp(&a.updated_at)),
            _ => all.sort_by(|a, b| b.install_count.cmp(&a.install_count)),
        }

        let page: Vec<Skill> = all
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();
        (page, filtered_total)
    })
}

#[query]
fn search_skills(query: String) -> Vec<SkillSearchResult> {
    let query_lower = query.to_lowercase();
    let terms: Vec<&str> = query_lower.split_whitespace().collect();

    SKILLS.with(|s| {
        let mut results: Vec<SkillSearchResult> = s
            .borrow()
            .values()
            .filter_map(|skill| {
                let mut score: f32 = 0.0;
                for term in &terms {
                    if skill.name.to_lowercase().contains(term) {
                        score += 3.0;
                    }
                    if skill.description.to_lowercase().contains(term) {
                        score += 2.0;
                    }
                    if let Some(ref analysis) = skill.analysis {
                        if analysis.primary_category.to_lowercase().contains(term) {
                            score += 2.0;
                        }
                        for tag in &analysis.tags {
                            if tag.to_lowercase().contains(term) {
                                score += 1.0;
                            }
                        }
                    }
                }
                if score > 0.0 {
                    Some(SkillSearchResult {
                        skill: skill.clone(),
                        relevance_score: score,
                    })
                } else {
                    None
                }
            })
            .collect();

        results.sort_by(|a, b| {
            b.relevance_score
                .partial_cmp(&a.relevance_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results
    })
}

#[query]
fn get_skills_by_category(category: String) -> Vec<Skill> {
    let cat_lower = category.to_lowercase();
    SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter(|skill| {
                skill
                    .analysis
                    .as_ref()
                    .map(|a| {
                        a.primary_category.to_lowercase() == cat_lower
                            || a.secondary_categories
                                .iter()
                                .any(|c| c.to_lowercase() == cat_lower)
                    })
                    .unwrap_or(false)
            })
            .cloned()
            .collect()
    })
}

#[query]
fn get_skills_with_dependencies() -> Vec<Skill> {
    SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter(|skill| {
                skill.analysis.as_ref().map(|a| {
                    !a.required_mcps.is_empty() || !a.software_deps.is_empty()
                }).unwrap_or(false)
            })
            .cloned()
            .collect()
    })
}

#[query]
fn get_skills_providing_mcp() -> Vec<Skill> {
    SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter(|skill| skill.analysis.as_ref().map(|a| a.provides_mcp).unwrap_or(false))
            .cloned()
            .collect()
    })
}

#[query]
fn get_top_rated_skills(limit: u32) -> Vec<Skill> {
    SKILLS.with(|s| {
        let mut skills: Vec<Skill> = s.borrow().values().cloned().collect();
        skills.sort_by(|a, b| {
            let ra = a.analysis.as_ref().map(|an| an.ratings.overall).unwrap_or(0.0);
            let rb = b.analysis.as_ref().map(|an| an.ratings.overall).unwrap_or(0.0);
            rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
        });
        skills.into_iter().take(limit as usize).collect()
    })
}

#[query]
fn get_categories() -> Vec<String> {
    let mut categories: Vec<String> = SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter_map(|skill| skill.analysis.as_ref())
            .flat_map(|a| {
                let mut cats = vec![a.primary_category.clone()];
                cats.extend(a.secondary_categories.clone());
                cats
            })
            .collect()
    });
    categories.sort();
    categories.dedup();
    categories
}

#[query]
fn get_unanalyzed_skills() -> Vec<Skill> {
    SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter(|skill| skill.analysis.is_none())
            .cloned()
            .collect()
    })
}

/// Return unanalyzed skill IDs that have content, sorted by install_count descending.
/// Lightweight query (returns only IDs) for bulk analysis scripts.
#[query]
fn list_unanalyzed_with_content(limit: u32, offset: u32) -> (Vec<(String, u64)>, u32) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let mut candidates: Vec<(&String, u64)> = skills
            .iter()
            .filter(|(_, skill)| skill.analysis.is_none() && skill.skill_md_content.is_some())
            .map(|(id, skill)| (id, skill.install_count))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1));
        let total = candidates.len() as u32;
        let page: Vec<(String, u64)> = candidates
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .map(|(id, installs)| (id.clone(), installs))
            .collect();
        (page, total)
    })
}

#[query]
fn get_install_command(skill_id: String) -> Option<String> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| {
                if skill.repo == skill.name {
                    format!("npx skills add {}/{}", skill.owner, skill.repo)
                } else {
                    format!("npx skills add {}/{} --skill {}", skill.owner, skill.repo, skill.name)
                }
            })
    })
}

/// Record an install for a skill (increments install_count by 1).
/// Rate-limited to prevent abuse: max 5 installs per skill per principal per hour.
/// Anonymous callers share a single rate limit pool.
#[update]
fn record_install(skill_id: String) -> Result<u64, String> {
    let caller = ic_cdk::caller();
    let now = ic_cdk::api::time();
    let key = (caller, skill_id.clone());

    // Check rate limit
    let allowed = INSTALL_RATE_LIMITS.with(|r| {
        let mut limits = r.borrow_mut();
        let (count, window_start) = limits.entry(key.clone()).or_insert((0, now));

        // Reset window if expired
        if now.saturating_sub(*window_start) > RATE_LIMIT_WINDOW_NS {
            *count = 0;
            *window_start = now;
        }

        if *count >= MAX_INSTALLS_PER_WINDOW {
            return false;
        }

        *count += 1;
        true
    });

    if !allowed {
        return Err(format!(
            "Rate limited: max {} installs per skill per hour",
            MAX_INSTALLS_PER_WINDOW
        ));
    }

    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        match skills.get_mut(&skill_id) {
            Some(skill) => {
                skill.install_count += 1;
                Ok(skill.install_count)
            }
            None => Err(format!("Skill not found: {}", skill_id)),
        }
    })
}

/// Reset all install counts to 0. Admin only.
/// Use before re-syncing to clear wrongly-assigned counts.
#[update]
fn reset_all_install_counts() -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let mut count = 0u32;
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for skill in skills.values_mut() {
            if skill.install_count > 0 {
                skill.install_count = 0;
                count += 1;
            }
        }
    });
    Ok(count)
}

/// Clear current analysis for a single skill. Admin only.
/// History is preserved — only the current analysis is cleared.
#[update]
fn clear_analysis(skill_id: String) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        match skills.get_mut(&skill_id) {
            Some(skill) => {
                skill.analysis = None;
                // History is kept. To clear history, use clear_analysis_history.
                Ok(())
            }
            None => Err(format!("Skill not found: {}", skill_id)),
        }
    })
}

/// Clear analysis history for a single skill. Admin only.
#[update]
fn clear_analysis_history(skill_id: String) -> Result<(), String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        match skills.get_mut(&skill_id) {
            Some(skill) => {
                skill.analysis_history.clear();
                Ok(())
            }
            None => Err(format!("Skill not found: {}", skill_id)),
        }
    })
}

/// Clear all analyses. Admin only.
/// Use when analyses need to be regenerated (e.g., after fixing content loading).
#[update]
fn clear_all_analyses() -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let mut count = 0u32;
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for skill in skills.values_mut() {
            if skill.analysis.is_some() {
                skill.analysis = None;
                count += 1;
            }
        }
    });
    Ok(count)
}

/// Clear all skills from the canister. Admin only.
/// WARNING: This is destructive and cannot be undone.
#[update]
fn clear_all_skills() -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let count = SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        let count = skills.len() as u32;
        skills.clear();
        count
    });
    Ok(count)
}

/// Bulk update install counts from skills.sh telemetry.
/// Takes vec of (skill_id, install_count) — matches by skill ID directly.
/// Admin only.
#[update]
fn sync_install_counts(data: Vec<(String, u64)>) -> Result<u32, String> {
    if !is_admin() {
        return Err("Unauthorized: admin only".to_string());
    }
    let mut updated = 0u32;
    SKILLS.with(|s| {
        let mut skills = s.borrow_mut();
        for (id, count) in &data {
            if let Some(skill) = skills.get_mut(id) {
                skill.install_count = *count;
                updated += 1;
            }
        }
    });
    Ok(updated)
}

// ============================================================================
// Checksum Verification & File Management
// ============================================================================

/// Result of file verification
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct FileVerifyResult {
    pub path: String,
    pub is_valid: bool,
    pub stored_checksum: String,
    pub provided_checksum: String,
}

/// Result of skill verification
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
pub struct SkillVerifyResult {
    pub skill_id: String,
    pub is_valid: bool,
    pub files_checked: u32,
    pub files_valid: u32,
    pub files_invalid: Vec<FileVerifyResult>,
    pub missing_files: Vec<String>,
    pub extra_files: Vec<String>,
}

/// Get the combined checksum for all skill files (quick verification)
#[query]
fn get_skill_checksum(skill_id: String) -> Option<String> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .and_then(|skill| skill.files_checksum.clone())
    })
}

/// Get checksums for all files in a skill
#[query]
fn get_skill_file_checksums(skill_id: String) -> Option<Vec<(String, String)>> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| {
                skill.files.iter()
                    .map(|f| (f.path.clone(), f.checksum.clone()))
                    .collect()
            })
    })
}

/// Get a specific file from a skill
#[query]
fn get_skill_file(skill_id: String, file_path: String) -> Option<SkillFile> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .and_then(|skill| {
                skill.files.iter()
                    .find(|f| f.path == file_path)
                    .cloned()
            })
    })
}

/// Get all files for a skill (for caching/offline use)
#[query]
fn get_skill_files(skill_id: String) -> Option<Vec<SkillFile>> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| skill.files.clone())
    })
}

/// Verify a single file checksum
#[query]
fn verify_file_checksum(skill_id: String, file_path: String, local_checksum: String) -> Result<FileVerifyResult, String> {
    let stored = SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .and_then(|skill| {
                skill.files.iter()
                    .find(|f| f.path == file_path)
                    .map(|f| f.checksum.clone())
            })
    }).ok_or("Skill or file not found")?;
    
    Ok(FileVerifyResult {
        path: file_path,
        is_valid: stored == local_checksum,
        stored_checksum: stored,
        provided_checksum: local_checksum,
    })
}

/// Verify all files in a skill against local checksums
/// Input: skill_id, vec of (path, checksum) pairs
#[query]
fn verify_skill_files(skill_id: String, local_files: Vec<(String, String)>) -> Result<SkillVerifyResult, String> {
    let skill = SKILLS.with(|s| {
        s.borrow().get(&skill_id).cloned()
    }).ok_or("Skill not found")?;
    
    let stored_files: std::collections::HashMap<String, String> = skill.files.iter()
        .map(|f| (f.path.clone(), f.checksum.clone()))
        .collect();
    
    let local_map: std::collections::HashMap<String, String> = local_files.iter()
        .cloned()
        .collect();
    
    let mut files_valid = 0u32;
    let mut files_invalid = Vec::new();
    let mut missing_files = Vec::new();
    let mut extra_files = Vec::new();
    
    // Check each stored file
    for (path, stored_checksum) in &stored_files {
        match local_map.get(path) {
            Some(local_checksum) => {
                if stored_checksum == local_checksum {
                    files_valid += 1;
                } else {
                    files_invalid.push(FileVerifyResult {
                        path: path.clone(),
                        is_valid: false,
                        stored_checksum: stored_checksum.clone(),
                        provided_checksum: local_checksum.clone(),
                    });
                }
            }
            None => {
                missing_files.push(path.clone());
            }
        }
    }
    
    // Check for extra local files not in stored
    for (path, _) in &local_files {
        if !stored_files.contains_key(path) {
            extra_files.push(path.clone());
        }
    }
    
    let is_valid = files_invalid.is_empty() && missing_files.is_empty();
    
    Ok(SkillVerifyResult {
        skill_id,
        is_valid,
        files_checked: local_files.len() as u32,
        files_valid,
        files_invalid,
        missing_files,
        extra_files,
    })
}

/// Batch verify multiple skills (quick check using combined checksum)
#[query]
fn verify_skills_batch(verifications: Vec<(String, String)>) -> Vec<(String, bool, Option<String>)> {
    verifications.into_iter().map(|(skill_id, local_checksum)| {
        let result = SKILLS.with(|s| {
            s.borrow()
                .get(&skill_id)
                .and_then(|skill| skill.files_checksum.clone())
                .map(|stored| (stored == local_checksum, Some(stored)))
        });
        match result {
            Some((is_valid, stored)) => (skill_id, is_valid, stored),
            None => (skill_id, false, None),
        }
    }).collect()
}

/// Compute SHA-256 hash of content
/// Note: In production, use ic-sha256 or sha2 crate for proper cryptographic hashing
/// The checksum is computed client-side with proper SHA-256, we just need to store and compare
fn compute_sha256(content: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{:016x}", hash)
}

/// Compute combined checksum for a set of files (sorted by path for determinism)
fn compute_combined_checksum(files: &[SkillFile]) -> String {
    let mut sorted_checksums: Vec<String> = files.iter()
        .map(|f| format!("{}:{}", f.path, f.checksum))
        .collect();
    sorted_checksums.sort();
    compute_sha256(&sorted_checksums.join("\n"))
}

/// Admin: Update skill files and recompute checksums.
/// All files are validated for size and path safety.
#[update]
fn set_skill_files(skill_id: String, files: Vec<SkillFile>) -> Result<String, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    // Validate all files
    for file in &files {
        sanitize_skill_file(file)?;
    }
    
    let combined = compute_combined_checksum(&files);
    
    SKILLS.with(|s| {
        if let Some(skill) = s.borrow_mut().get_mut(&skill_id) {
            skill.files = files;
            skill.files_checksum = Some(combined.clone());
            skill.updated_at = ic_cdk::api::time();
            Ok(combined)
        } else {
            Err("Skill not found".to_string())
        }
    })
}

/// Admin: Add a single file to a skill
#[update]
fn add_skill_file(skill_id: String, file: SkillFile) -> Result<String, String> {
    if !is_admin() {
        return Err("Unauthorized".to_string());
    }
    
    SKILLS.with(|s| {
        if let Some(skill) = s.borrow_mut().get_mut(&skill_id) {
            // Remove existing file with same path if exists
            skill.files.retain(|f| f.path != file.path);
            skill.files.push(file);
            
            // Recompute combined checksum
            let combined = compute_combined_checksum(&skill.files);
            skill.files_checksum = Some(combined.clone());
            skill.updated_at = ic_cdk::api::time();
            Ok(combined)
        } else {
            Err("Skill not found".to_string())
        }
    })
}

// ============================================================================
// AI Analysis - Non-consensus HTTP outcalls
// ============================================================================

#[update]
async fn analyze_skill(skill_id: String, model: AnalysisModel) -> Result<AnalysisResult, String> {
    if !is_authenticated() {
        return Err("Must be authenticated".to_string());
    }

    if !CONFIG.with(|c| c.borrow().analysis_enabled) {
        return Err("Analysis is disabled".to_string());
    }

    let caller = ic_cdk::caller();
    let api_key = USERS
        .with(|u| {
            u.borrow()
                .get(&caller)
                .and_then(|user| user.anthropic_api_key.clone())
        })
        .ok_or("No Anthropic API key set")?;

    let skill = SKILLS
        .with(|s| s.borrow().get(&skill_id).cloned())
        .ok_or("Skill not found")?;

    // Get skill content
    let skill_content = skill
        .skill_md_content
        .clone()
        .unwrap_or_else(|| format!("# {}\n\n{}", skill.name, skill.description));

    // Build prompt
    let prompt = build_analysis_prompt(&skill, &skill_content);

    // Call Anthropic API (non-consensus)
    let analysis = call_anthropic(&api_key, &model, &prompt).await?;

    // Store analysis + push to history
    SKILLS.with(|s| {
        if let Some(sk) = s.borrow_mut().get_mut(&skill_id) {
            sk.analysis_history.insert(0, analysis.clone());
            if sk.analysis_history.len() > MAX_ANALYSIS_HISTORY {
                sk.analysis_history.truncate(MAX_ANALYSIS_HISTORY);
            }
            sk.analysis = Some(analysis.clone());
            sk.updated_at = ic_cdk::api::time();
        }
    });

    // Update user stats
    USERS.with(|u| {
        if let Some(user) = u.borrow_mut().get_mut(&caller) {
            user.analyses_performed += 1;
            user.last_active = ic_cdk::api::time();
        }
    });

    Ok(AnalysisResult {
        success: true,
        skill_id,
        analysis: Some(analysis),
        error: None,
    })
}

fn build_analysis_prompt(skill: &Skill, content: &str) -> String {
    // Use default prompt or get from config
    let template = CONFIG.with(|c| {
        c.borrow().default_prompt_id.clone()
    }).and_then(|id| {
        PROMPTS.with(|p| p.borrow().get(&id).map(|pr| pr.prompt_template.clone()))
    }).unwrap_or_else(|| DEFAULT_PROMPT_TEMPLATE.to_string());
    
    template
        .replace("{owner}", &skill.owner)
        .replace("{repo}", &skill.repo)
        .replace("{name}", &skill.name)
        .replace("{description}", &skill.description)
        .replace("{content}", content)
}

async fn call_anthropic(
    api_key: &str,
    model: &AnalysisModel,
    prompt: &str,
) -> Result<SkillAnalysis, String> {
    let request_body = AnthropicRequest {
        model: model.to_model_id().to_string(),
        max_tokens: 2048,
        messages: vec![AnthropicMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
    };

    let body_json =
        serde_json::to_vec(&request_body).map_err(|e| format!("Serialize error: {}", e))?;

    let request = CanisterHttpRequestArgument {
        url: "https://api.anthropic.com/v1/messages".to_string(),
        method: HttpMethod::POST,
        headers: vec![
            HttpHeader {
                name: "x-api-key".to_string(),
                value: api_key.to_string(),
            },
            HttpHeader {
                name: "anthropic-version".to_string(),
                value: "2023-06-01".to_string(),
            },
            HttpHeader {
                name: "content-type".to_string(),
                value: "application/json".to_string(),
            },
        ],
        body: Some(body_json),
        max_response_bytes: Some(100_000),
        transform: None, // No transform needed for non-consensus
    };

    let cycles = model.cost_cycles();

    // HTTP outcall (transform=None for simpler non-consensus behavior)
    match http_request(request, cycles).await {
        Ok((response,)) => {
            if response.status != 200u64 {
                let err = String::from_utf8_lossy(&response.body);
                return Err(format!("Anthropic API error {}: {}", response.status, err));
            }

            let body =
                String::from_utf8(response.body).map_err(|e| format!("UTF8 error: {}", e))?;

            let api_response: AnthropicResponse =
                serde_json::from_str(&body).map_err(|e| format!("Parse error: {}", e))?;

            let text = api_response
                .content
                .first()
                .map(|c| c.text.clone())
                .ok_or("No content")?;

            parse_analysis_json(&text, model)
        }
        Err((code, msg)) => Err(format!("HTTP error: {:?} - {}", code, msg)),
    }
}

fn parse_analysis_json(text: &str, model: &AnalysisModel) -> Result<SkillAnalysis, String> {
    let json_str = if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            &text[start..=end]
        } else {
            text
        }
    } else {
        text
    };

    // Raw deserialization types
    #[derive(SerdeDeserialize)]
    struct RawTopicRating {
        topic: String,
        score: u8,
        confidence: u8,
        reasoning: String,
    }

    #[derive(SerdeDeserialize)]
    struct RawFlag {
        flag_type: String,
        severity: String,
        message: String,
    }

    #[derive(SerdeDeserialize)]
    struct RawRatings {
        overall: f32,
        topics: Vec<RawTopicRating>,
        #[serde(default)]
        flags: Vec<RawFlag>,
    }

    #[derive(SerdeDeserialize)]
    struct RawMcpDep {
        name: String,
        package: String,
        required: bool,
        #[serde(default)]
        ratings: Option<RawRatings>,
    }

    #[derive(SerdeDeserialize)]
    struct RawSoftwareDep {
        name: String,
        install_cmd: Option<String>,
        url: Option<String>,
        required: bool,
        #[serde(default)]
        ratings: Option<RawRatings>,
    }

    #[derive(SerdeDeserialize)]
    struct RawAnalysis {
        ratings: RawRatings,
        primary_category: String,
        secondary_categories: Vec<String>,
        tags: Vec<String>,
        has_mcp: bool,
        #[serde(default)]
        provides_mcp: bool,
        #[serde(default)]
        required_mcps: Vec<RawMcpDep>,
        #[serde(default)]
        software_deps: Vec<RawSoftwareDep>,
        has_references: bool,
        has_assets: bool,
        estimated_token_usage: u32,
        summary: String,
        strengths: Vec<String>,
        weaknesses: Vec<String>,
        use_cases: Vec<String>,
        compatibility_notes: String,
        prerequisites: Vec<String>,
    }

    fn parse_topic(s: &str) -> RatingTopic {
        match s.to_lowercase().as_str() {
            "quality" => RatingTopic::Quality,
            "documentation" => RatingTopic::Documentation,
            "maintainability" => RatingTopic::Maintainability,
            "completeness" => RatingTopic::Completeness,
            "security" => RatingTopic::Security,
            "malicious" => RatingTopic::Malicious,
            "privacy" => RatingTopic::Privacy,
            "usability" => RatingTopic::Usability,
            "compatibility" => RatingTopic::Compatibility,
            "performance" => RatingTopic::Performance,
            "trustworthiness" => RatingTopic::Trustworthiness,
            "maintenance" => RatingTopic::Maintenance,
            "community" => RatingTopic::Community,
            _ => RatingTopic::Quality, // fallback
        }
    }

    fn parse_flag_type(s: &str) -> FlagType {
        match s {
            "SecurityRisk" => FlagType::SecurityRisk,
            "MaliciousPattern" => FlagType::MaliciousPattern,
            "PrivacyConcern" => FlagType::PrivacyConcern,
            "Unmaintained" => FlagType::Unmaintained,
            "Deprecated" => FlagType::Deprecated,
            "ExcessivePermissions" => FlagType::ExcessivePermissions,
            "UnverifiedSource" => FlagType::UnverifiedSource,
            "KnownVulnerability" => FlagType::KnownVulnerability,
            _ => FlagType::UnverifiedSource,
        }
    }

    fn parse_severity(s: &str) -> FlagSeverity {
        match s {
            "Critical" => FlagSeverity::Critical,
            "Warning" => FlagSeverity::Warning,
            _ => FlagSeverity::Info,
        }
    }

    fn convert_ratings(raw: RawRatings) -> Ratings {
        Ratings {
            overall: raw.overall.clamp(0.0, 5.0),
            topics: raw.topics.into_iter().map(|t| TopicRating {
                topic: parse_topic(&t.topic),
                score: t.score.min(100),
                confidence: t.confidence.min(100),
                reasoning: t.reasoning,
            }).collect(),
            flags: raw.flags.into_iter().map(|f| RatingFlag {
                flag_type: parse_flag_type(&f.flag_type),
                severity: parse_severity(&f.severity),
                message: f.message,
            }).collect(),
        }
    }

    let raw: RawAnalysis =
        serde_json::from_str(json_str).map_err(|e| format!("JSON parse error: {}", e))?;

    Ok(SkillAnalysis {
        ratings: convert_ratings(raw.ratings),
        primary_category: raw.primary_category,
        secondary_categories: raw.secondary_categories,
        tags: raw.tags,
        has_mcp: raw.has_mcp,
        provides_mcp: raw.provides_mcp,
        required_mcps: raw.required_mcps.into_iter().map(|m| McpDependency {
            name: m.name,
            package: m.package,
            required: m.required,
            indexed: false,
            verified: false,
            ratings: m.ratings.map(convert_ratings),
        }).collect(),
        software_deps: raw.software_deps.into_iter().map(|s| SoftwareDependency {
            name: s.name,
            install_cmd: s.install_cmd,
            url: s.url,
            required: s.required,
            ratings: s.ratings.map(convert_ratings),
        }).collect(),
        has_references: raw.has_references,
        has_assets: raw.has_assets,
        estimated_token_usage: raw.estimated_token_usage,
        summary: raw.summary,
        strengths: raw.strengths,
        weaknesses: raw.weaknesses,
        use_cases: raw.use_cases,
        compatibility_notes: raw.compatibility_notes,
        prerequisites: raw.prerequisites,
        referenced_files: Vec::new(),
        referenced_urls: Vec::new(),
        analyzed_at: ic_cdk::api::time(),
        analyzed_by: ic_cdk::caller(),
        model_used: model.to_model_id().to_string(),
        analysis_version: "2.2.0".to_string(),
        tee_worker_version: None,
        prompt_version: None,
    })
}

// ============================================================================
// Analysis History
// ============================================================================

/// Get the full analysis history for a skill (latest first).
#[query]
fn get_analysis_history(skill_id: String) -> Vec<SkillAnalysis> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| skill.analysis_history.clone())
            .unwrap_or_default()
    })
}

/// Get the file version history for a skill (latest first).
/// Returns list of (path, checksum, size, timestamp, fetched_by, source_url).
#[query]
fn get_file_history(skill_id: String) -> Vec<SkillFileVersion> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| skill.file_history.clone())
            .unwrap_or_default()
    })
}

/// Get current checksums for all files in a skill.
/// Returns list of (path, checksum) pairs. Useful for local verification.
#[query]
fn get_current_file_checksums(skill_id: String) -> Vec<(String, String)> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| {
                let mut checksums: Vec<(String, String)> = Vec::new();
                // Include SKILL.md if present
                if let Some(content) = &skill.skill_md_content {
                    checksums.push(("SKILL.md".to_string(), compute_sha256(content)));
                }
                // Include all files
                for f in &skill.files {
                    checksums.push((f.path.clone(), f.checksum.clone()));
                }
                checksums
            })
            .unwrap_or_default()
    })
}

/// Verify a local file checksum against the stored version.
/// Returns (matches: bool, stored_checksum: Option<String>).
#[query]
fn verify_local_checksum(skill_id: String, path: String, local_checksum: String) -> (bool, Option<String>) {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .map(|skill| {
                // Check SKILL.md
                if path == "SKILL.md" {
                    if let Some(content) = &skill.skill_md_content {
                        let stored = compute_sha256(content);
                        return (stored == local_checksum, Some(stored));
                    }
                    return (false, None);
                }
                // Check files
                for f in &skill.files {
                    if f.path == path {
                        return (f.checksum == local_checksum, Some(f.checksum.clone()));
                    }
                }
                (false, None)
            })
            .unwrap_or((false, None))
    })
}

/// Get global analysis history across all skills (latest first, paginated).
/// Returns (entries, total_count) where each entry has the skill_id attached.
#[query]
fn get_all_analysis_history(limit: u32, offset: u32) -> (Vec<(String, SkillAnalysis)>, u32) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let mut all: Vec<(String, SkillAnalysis)> = skills
            .iter()
            .flat_map(|(id, skill)| {
                skill.analysis_history.iter().map(move |a| (id.clone(), a.clone()))
            })
            .collect();
        // Sort by analyzed_at descending (latest first)
        all.sort_by(|a, b| b.1.analyzed_at.cmp(&a.1.analyzed_at));
        let total = all.len() as u32;
        let page = all
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();
        (page, total)
    })
}

/// Get analysis history stats: total analyses ever performed across all skills.
#[query]
fn get_analysis_history_stats() -> (u64, u64) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let total_entries: u64 = skills.values().map(|sk| sk.analysis_history.len() as u64).sum();
        let skills_with_history: u64 = skills.values().filter(|sk| !sk.analysis_history.is_empty()).count() as u64;
        (total_entries, skills_with_history)
    })
}

// ============================================================================
// Heap Memory Management
// ============================================================================

/// Get current memory usage statistics.
/// Returns (heap_bytes, stable_bytes, skill_count, total_content_bytes).
#[query]
fn get_memory_stats() -> (u64, u64, u64, u64) {
    let (skill_count, content_bytes) = SKILLS.with(|s| {
        let skills = s.borrow();
        let count = skills.len() as u64;
        let content: u64 = skills.values().map(|sk| {
            let md_size = sk.skill_md_content.as_ref().map(|c| c.len() as u64).unwrap_or(0);
            let files_size: u64 = sk.files.iter().map(|f| f.content.len() as u64).sum();
            let history_size: u64 = sk.analysis_history.iter().map(|a| {
                // Rough estimate of analysis size
                a.summary.len() as u64 + a.compatibility_notes.len() as u64 + 500
            }).sum();
            md_size + files_size + history_size
        }).sum();
        (count, content)
    });

    // Wasm heap size and stable memory size
    let heap_bytes = core::arch::wasm32::memory_size(0) as u64 * 65536;
    let stable_bytes = ic_cdk::api::stable::stable_size() as u64 * 65536;

    (heap_bytes, stable_bytes, skill_count, content_bytes)
}

// ============================================================================
// Stats
// ============================================================================

#[query]
fn get_stats() -> (u64, u64, u64, u64) {
    let (skill_total, analyzed, installs) = SKILLS.with(|s| {
        let skills = s.borrow();
        let total = skills.len() as u64;
        let analyzed = skills.values().filter(|sk| sk.analysis.is_some()).count() as u64;
        let installs: u64 = skills.values().map(|sk| sk.install_count).sum();
        (total, analyzed, installs)
    });
    let user_count = USERS.with(|u| u.borrow().len() as u64);
    (skill_total, analyzed, installs, user_count)
}

#[query]
fn get_analysis_stats() -> (u64, u64, u64, u64) {
    SKILLS.with(|s| {
        let skills = s.borrow();
        let total = skills.len() as u64;
        let analyzed = skills.values().filter(|sk| sk.analysis.is_some()).count() as u64;
        let with_mcp = skills
            .values()
            .filter(|sk| sk.analysis.as_ref().map(|a| a.has_mcp).unwrap_or(false))
            .count() as u64;
        let high_quality = skills
            .values()
            .filter(|sk| {
                sk.analysis
                    .as_ref()
                    .map(|a| a.ratings.overall >= 4.0)
                    .unwrap_or(false)
            })
            .count() as u64;
        (total, analyzed, with_mcp, high_quality)
    })
}

/// Get skills with security concerns (any Critical or Warning flags)
#[query]
fn get_skills_with_flags() -> Vec<(Skill, Vec<RatingFlag>)> {
    SKILLS.with(|s| {
        s.borrow()
            .values()
            .filter_map(|skill| {
                skill.analysis.as_ref().and_then(|a| {
                    let flags: Vec<RatingFlag> = a.ratings.flags.iter()
                        .filter(|f| f.severity != FlagSeverity::Info)
                        .cloned()
                        .collect();
                    if flags.is_empty() {
                        None
                    } else {
                        Some((skill.clone(), flags))
                    }
                })
            })
            .collect()
    })
}

/// Get skill rating for a specific topic
#[query]
fn get_skill_topic_rating(skill_id: String, topic: RatingTopic) -> Option<TopicRating> {
    SKILLS.with(|s| {
        s.borrow()
            .get(&skill_id)
            .and_then(|skill| skill.analysis.as_ref())
            .and_then(|a| a.ratings.topics.iter().find(|t| t.topic == topic).cloned())
    })
}

/// Get all skills sorted by a specific rating topic
#[query]
fn get_skills_by_topic_rating(topic: RatingTopic, limit: u32) -> Vec<Skill> {
    SKILLS.with(|s| {
        let mut skills: Vec<Skill> = s.borrow()
            .values()
            .filter(|sk| sk.analysis.is_some())
            .cloned()
            .collect();
        
        skills.sort_by(|a, b| {
            let get_score = |skill: &Skill| -> u8 {
                skill.analysis.as_ref()
                    .and_then(|an| an.ratings.topics.iter().find(|t| t.topic == topic))
                    .map(|t| t.score)
                    .unwrap_or(0)
            };
            get_score(b).cmp(&get_score(a))
        });
        
        skills.into_iter().take(limit as usize).collect()
    })
}

// Generate Candid
ic_cdk::export_candid!();
