<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate, link } from 'svelte-routing';
  import type { Skill, TopicRating, RatingFlag, SkillFileVersion } from '../types';
  import { isAuthenticated, hasApiKey, getAgent } from '../auth';
  import { selectedModel } from '../store';
  import { getSkill, analyzeSkill, analyzeSkillQueued, enrichSkillQueued, isTeeAvailable, getDefaultPrompt, getAnalyzedModels } from '../canister';

  /** The wildcard portion of the URL, e.g. "owner/name" or "owner/repo/name" */
  export let wildcard: string = '';

  let skill: Skill | null = null;
  let isLoading = true;
  let loadError: string | null = null;

  // Analysis state
  let analyzing = false;
  let analyzeError: string | null = null;
  let analyzeStatus: string = '';

  // Enrichment state
  let enriching = false;
  let enrichError: string | null = null;
  let enrichStatus: string = '';

  // Prompt display
  let showPrompt = false;
  let promptTemplate: string | null = null;
  let promptVersion: string | null = null;
  let loadingPrompt = false;

  // Models that have already analyzed this skill
  let analyzedModels: string[] = [];
  
  // All available models with their canister IDs (using aliases for latest)
  const allModels: Array<{ 
    id: 'Haiku' | 'Opus', 
    modelId: string, 
    label: string, 
    strength: number,
    description: string,
    speed: string,
    cost: string,
    icon: string
  }> = [
    { 
      id: 'Haiku', 
      modelId: 'claude-haiku-4-5', 
      label: 'Haiku 4.5', 
      strength: 1,
      description: 'Fast & efficient',
      speed: '~15s',
      cost: '~$0.01',
      icon: '⚡'
    },
    { 
      id: 'Opus', 
      modelId: 'claude-opus-4-5', 
      label: 'Opus 4.5', 
      strength: 2,
      description: 'Deep analysis',
      speed: '~60s',
      cost: '~$0.15',
      icon: '🔬'
    },
  ];
  
  // Models available for new analysis (not yet used)
  $: availableModels = allModels.filter(m => !analyzedModels.includes(m.modelId));

  $: rating = skill?.analysis?.ratings.overall ?? 0;
  $: ratingColor = getRatingColor(rating);
  $: installCmd = skill ? (skill.repo === skill.name
    ? `npx skillsic add ${skill.owner}/${skill.repo}`
    : `npx skillsic add ${skill.owner}/${skill.repo}/${skill.name}`) : '';
  $: topics = skill?.analysis?.ratings.topics ?? [];
  $: flags = skill?.analysis?.ratings.flags ?? [];
  // Can analyze if authenticated with API key (whether skill has analysis or not)
  $: canAnalyze = $isAuthenticated && $hasApiKey && skill;
  // Can re-analyze if skill already has an analysis
  $: canReanalyze = canAnalyze && skill?.analysis;
  // Can re-fetch SKILL.md if authenticated
  $: canRefetch = $isAuthenticated && skill;

  onMount(async () => {
    await loadSkill();
  });

  async function loadSkill() {
    isLoading = true;
    loadError = null;

    // The wildcard is the skill ID directly (e.g. "owner/repo/name" or "owner/repo")
    const skillId = decodeURIComponent(wildcard).replace(/\/$/, '');
    if (!skillId || !skillId.includes('/')) {
      loadError = 'Invalid skill path. Expected /skill/{owner}/{repo}/{name}';
      isLoading = false;
      return;
    }

    try {
      const result = await getSkill(skillId);
      if (result) {
        skill = result;
        // Load which models have already analyzed this skill
        try {
          analyzedModels = await getAnalyzedModels(skillId);
        } catch {
          analyzedModels = [];
        }
      } else {
        loadError = `Skill "${skillId}" not found`;
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load skill';
    } finally {
      isLoading = false;
    }
  }

  // --- Helper functions ---

  function getRatingColor(r: number): string {
    if (r >= 4.5) return 'var(--rating-5)';
    if (r >= 3.5) return 'var(--rating-4)';
    if (r >= 2.5) return 'var(--rating-3)';
    if (r >= 1.5) return 'var(--rating-2)';
    return 'var(--rating-1)';
  }

  function getTopicScoreColor(score: number): string {
    if (score >= 80) return '#00ff88';
    if (score >= 60) return '#88cc44';
    if (score >= 40) return '#ccaa00';
    if (score >= 20) return '#cc6600';
    return '#ff4444';
  }

  function getFlagSeverityColor(severity: string): string {
    if (severity === 'Critical') return '#ff4444';
    if (severity === 'Warning') return '#ccaa00';
    return '#666';
  }

  function getTopicIcon(topic: string): string {
    const icons: Record<string, string> = {
      Quality: 'Q', Documentation: 'D', Maintainability: 'M', Completeness: 'C',
      Security: 'S', Malicious: '!', Privacy: 'P', Usability: 'U',
      Compatibility: '~', Performance: '^', Trustworthiness: 'T',
      Maintenance: 'R', Community: '#',
    };
    return icons[topic] || '?';
  }

  function getTopicGroup(topic: string): string {
    if (['Quality', 'Documentation', 'Maintainability', 'Completeness'].includes(topic)) return 'code';
    if (['Security', 'Malicious', 'Privacy'].includes(topic)) return 'safety';
    if (['Usability', 'Compatibility', 'Performance'].includes(topic)) return 'usability';
    return 'trust';
  }

  function shortenPrincipal(p: string): string {
    if (!p || p.length < 15) return p;
    return p.slice(0, 5) + '...' + p.slice(-3);
  }

  function formatAnalysisDate(nanos: bigint): string {
    const ms = Number(nanos / BigInt(1_000_000));
    if (ms === 0) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function shortenModelName(model: string): string {
    const m = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    const parts = m.split('-');
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const version = parts.slice(1).join('.');
    return version ? `${name} ${version}` : name;
  }

  // File explorer state
  let selectedFile: { path: string; content: string; file_type?: string; checksum?: string | null } | null = null;
  let showFiles = false;
  let showFileHistory = false;
  let expandedHistoryEntry: number | null = null;
  let showAnalysisHistory = false;
  let expandedAnalysisEntry: number | null = null;

  function copyToClipboard(text: string) {
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }

  function toggleHistoryEntry(index: number) {
    expandedHistoryEntry = expandedHistoryEntry === index ? null : index;
  }

  function toggleAnalysisEntry(index: number) {
    expandedAnalysisEntry = expandedAnalysisEntry === index ? null : index;
  }

  interface DisplayFile {
    path: string;
    content: string;
    file_type: string;
    size: number;
    checksum: string | null;
  }

  // Build unified file list: SKILL.md first (from skill_md_content), then sub-files
  $: allFiles = buildFileList(skill);
  $: hasFiles = allFiles.length > 0;
  $: totalFilesSize = allFiles.reduce((sum, f) => sum + f.size, 0);

  function buildFileList(s: Skill | null): DisplayFile[] {
    if (!s) return [];
    const files: DisplayFile[] = [];
    // SKILL.md from skill_md_content (the main skill definition)
    if (s.skill_md_content) {
      // Try to get checksum from file_history
      const historyEntry = s.file_history?.find(h => h.path === 'SKILL.md');
      files.push({
        path: 'SKILL.md',
        content: s.skill_md_content,
        file_type: 'SkillMd',
        size: s.skill_md_content.length,
        checksum: historyEntry?.checksum || null,
      });
    }
    // Sub-files from files[]
    for (const f of s.files ?? []) {
      files.push({
        path: f.path,
        content: f.content,
        file_type: f.file_type || 'Other',
        size: f.content?.length || 0,
        checksum: f.checksum || null,
      });
    }
    return files;
  }

  function selectFile(file: DisplayFile) {
    if (selectedFile?.path === file.path) {
      selectedFile = null;
    } else {
      selectedFile = file;
    }
  }

  function getFileIcon(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (path.toLowerCase().endsWith('skill.md')) return 'S';
    if (ext === 'md' || ext === 'txt') return 'D';
    if (ext === 'py') return 'P';
    if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') return 'J';
    if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return 'C';
    if (ext === 'xml' || ext === 'xsd') return 'X';
    if (ext === 'sh' || ext === 'bash') return '$';
    if (ext === 'html' || ext === 'css' || ext === 'svelte' || ext === 'vue') return 'W';
    return 'F';
  }

  function getFileTypeBadge(ft: string): string {
    const badges: Record<string, string> = {
      SkillMd: 'skill',
      Reference: 'ref',
      Asset: 'asset',
      Config: 'config',
      Other: 'file',
    };
    return badges[ft] || 'file';
  }

  function getFileTypeBadgeColor(ft: string): string {
    const colors: Record<string, string> = {
      SkillMd: 'var(--accent-primary)',
      Reference: 'var(--accent-secondary)',
      Asset: '#ccaa00',
      Config: '#cc6600',
      Other: 'var(--text-muted)',
    };
    return colors[ft] || 'var(--text-muted)';
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  function formatTimestamp(nanos: bigint): string {
    const ms = Number(nanos / BigInt(1_000_000));
    if (ms === 0) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTimestampRelative(nanos: bigint): string {
    const ms = Number(nanos / BigInt(1_000_000));
    if (ms === 0) return '';
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return '1 month ago';
    if (months < 12) return `${months} months ago`;
    const years = Math.floor(months / 12);
    if (years === 1) return '1 year ago';
    return `${years} years ago`;
  }

  // SEO: dynamic page title and meta description
  $: pageTitle = skill
    ? `${skill.name} by ${skill.owner} - AI Coding Agent Skill | skillsic`
    : 'Loading... | skillsic';
  $: pageDescription = skill
    ? (skill.analysis?.summary || skill.description || `Skill for Claude Code, Cursor, Windsurf & Cline: ${skill.name}`)
    : 'Loading skill details...';

  let copied = false;
  function copyInstallCmd() {
    navigator.clipboard.writeText(installCmd);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function togglePrompt() {
    if (showPrompt) {
      showPrompt = false;
      return;
    }
    if (!promptTemplate) {
      loadingPrompt = true;
      try {
        const prompt = await getDefaultPrompt();
        if (prompt) {
          promptTemplate = prompt.prompt_template;
          promptVersion = prompt.version;
        }
      } catch (e) {
        console.error('Failed to load prompt:', e);
      } finally {
        loadingPrompt = false;
      }
    }
    showPrompt = true;
  }

  async function handleAnalyze() {
    if (!skill) return;
    analyzing = true;
    analyzeError = null;
    analyzeStatus = '';
    try {
      const agent = await getAgent();
      if (!agent) throw new Error('Not authenticated');

      // Auto-fetch SKILL.md first if not present
      if (!skill.skill_md_content && (!skill.files || skill.files.length === 0)) {
        analyzeStatus = 'Fetching SKILL.md from GitHub...';
        const enrichResult = await enrichSkillQueued(agent, skill.id, false, (status: string) => {
          analyzeStatus = status;
        });
        if (enrichResult.found && enrichResult.skill) {
          skill = enrichResult.skill;
        } else {
          throw new Error('SKILL.md not found on GitHub. Cannot analyze without skill definition.');
        }
      }

      let result;
      const teeAvailable = await isTeeAvailable();
      if (teeAvailable) {
        result = await analyzeSkillQueued(agent, skill.id, $selectedModel, (status: string) => {
          analyzeStatus = status;
        });
      } else {
        analyzeStatus = 'Calling Anthropic directly...';
        result = await analyzeSkill(agent, skill.id, $selectedModel);
      }

      if (result.analysis && skill) {
        skill.analysis = result.analysis;
        skill = skill;
        // Refresh analyzed models list
        try {
          analyzedModels = await getAnalyzedModels(skill.id);
        } catch {
          // Add current model to list manually
          const modelId = allModels.find(m => m.id === $selectedModel)?.modelId;
          if (modelId && !analyzedModels.includes(modelId)) {
            analyzedModels = [...analyzedModels, modelId];
          }
        }
      }
    } catch (e: any) {
      analyzeError = e.message || 'Analysis failed';
    } finally {
      analyzing = false;
      analyzeStatus = '';
    }
  }

  async function handleEnrich() {
    if (!skill) return;
    enriching = true;
    enrichError = null;
    enrichStatus = '';
    try {
      const agent = await getAgent();
      if (!agent) throw new Error('Not authenticated');

      const autoAnalyze = $hasApiKey;
      const result = await enrichSkillQueued(agent, skill.id, autoAnalyze, (status: string) => {
        enrichStatus = status;
      });

      if (result.found && result.skill) {
        skill = result.skill;
        enrichStatus = autoAnalyze ? 'SKILL.md fetched! Analysis auto-queued.' : 'SKILL.md fetched and stored.';
      } else {
        enrichStatus = 'SKILL.md not found on GitHub.';
      }
    } catch (e: any) {
      enrichError = e.message || 'Enrichment failed';
    } finally {
      enriching = false;
    }
  }

  /** Build the URL path for a skill */
  function skillPath(s: Skill): string {
    return `/skill/${s.owner}/${s.name}`;
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  {#if skill}
    <meta property="og:title" content="{skill.name} - AI Coding Agent Skill" />
    <meta property="og:description" content={pageDescription} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://skillsic.com/skill/{skill.id}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{skill.name} - Skill for Claude Code, Cursor & more" />
    <meta name="twitter:description" content={pageDescription} />
  {/if}
</svelte:head>

<div class="skill-page">
  {#if isLoading}
    <div class="loading">
      <span class="loading-text">Loading skill from ICP canister</span>
      <span class="cursor"></span>
    </div>
  {:else if loadError}
    <div class="error-page">
      <span class="error-icon">[!]</span>
      <h2>{loadError}</h2>
      <button class="back-btn" on:click={() => navigate('/')}>back to skills</button>
    </div>
  {:else if skill}
    <nav class="breadcrumb">
      <a href="/" class="crumb-link">skills</a>
      <span class="crumb-sep">/</span>
      <a href="/builder/{skill.owner}" use:link class="crumb-owner crumb-link">{skill.owner}</a>
      <span class="crumb-sep">/</span>
      <span class="crumb-repo">{skill.repo}</span>
      <span class="crumb-sep">/</span>
      <span class="crumb-name">{skill.name}</span>
    </nav>

    <header class="page-header">
      <div class="header-top">
        <div class="skill-identity">
          <h1 class="skill-name">{skill.name}</h1>
          <div class="skill-meta">
            <a href="/builder/{skill.owner}" use:link class="owner owner-link">{skill.owner}</a>
            <span class="sep">/</span>
            <span class="repo">{skill.repo}</span>
            {#if skill.stars > 0}
              <span class="stars">{skill.stars} stars</span>
            {/if}
            <span class="installs">{skill.install_count.toLocaleString()} installs</span>
            {#if skill.updated_at}
              <span class="timestamp" title="Updated: {formatTimestamp(skill.updated_at)}">
                updated {formatTimestampRelative(skill.updated_at)}
              </span>
            {/if}
            {#if skill.created_at}
              <span class="timestamp" title="Created: {formatTimestamp(skill.created_at)}">
                created {formatTimestamp(skill.created_at)}
              </span>
            {/if}
          </div>
        </div>
        {#if skill.analysis}
          <div class="rating-badge" style="--rating-color: {ratingColor}">
            <span class="rating-value">{rating.toFixed(1)}</span>
            <span class="rating-max">/5</span>
          </div>
        {/if}
      </div>
      <p class="skill-desc">{skill.description}</p>
    </header>

    <!-- Install command -->
    <div class="install-section">
      <div class="install-cmd">
        <span class="cmd-prompt">$</span>
        <code class="cmd-text">{installCmd}</code>
        <button class="copy-btn" on:click={copyInstallCmd}>
          {copied ? 'copied!' : '[copy]'}
        </button>
      </div>
    </div>

    <!-- Skill Files (SKILL.md + sub-files) -->
    {#if hasFiles}
      <section class="files-section">
        <button class="files-toggle" on:click={() => showFiles = !showFiles}>
          {showFiles ? '[-]' : '[+]'} {allFiles.length} file{allFiles.length !== 1 ? 's' : ''} ({formatFileSize(totalFilesSize)})
        </button>

        {#if showFiles}
          <div class="files-explorer">
            <div class="file-list">
              {#each allFiles as file}
                <button
                  class="file-entry"
                  class:active={selectedFile?.path === file.path}
                  on:click={() => selectFile(file)}
                >
                  <span class="file-icon">[{getFileIcon(file.path)}]</span>
                  <span class="file-type-badge" style="color: {getFileTypeBadgeColor(file.file_type)}">{getFileTypeBadge(file.file_type)}</span>
                  <span class="file-path">{file.path}</span>
                  <span class="file-size">{formatFileSize(file.size)}</span>
                </button>
              {/each}
            </div>

            {#if selectedFile}
              <div class="file-viewer">
                <div class="file-viewer-header">
                  <span class="viewer-path">{selectedFile.path}</span>
                  <span class="viewer-size">{formatFileSize(selectedFile.content?.length || 0)}</span>
                  {#if selectedFile.checksum}
                    <span class="viewer-checksum" title="SHA-256: {selectedFile.checksum}">
                      #{selectedFile.checksum.substring(0, 8)}
                    </span>
                    <button class="copy-btn-small" on:click={() => copyToClipboard(selectedFile?.checksum || '')}>[copy hash]</button>
                  {/if}
                </div>
                <pre class="file-content">{selectedFile.content}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {:else}
      <!-- No files: offer to fetch SKILL.md from GitHub -->
      <section class="files-section">
        <div class="enrich-prompt">
          <span class="enrich-icon">[~]</span>
          <span class="enrich-text">No SKILL.md fetched yet.</span>
          {#if $isAuthenticated}
            <button class="enrich-btn" on:click={handleEnrich} disabled={enriching}>
              {enriching ? 'fetching...' : '[fetch SKILL.md]'}
            </button>
          {:else}
            <span class="enrich-hint">login to fetch</span>
          {/if}
        </div>
        {#if enrichStatus}
          <div class="enrich-status">{enrichStatus}</div>
        {/if}
        {#if enrichError}
          <div class="enrich-error">{enrichError}</div>
        {/if}
      </section>
    {/if}

    <!-- File History & Checksums -->
    {#if skill.file_history && skill.file_history.length > 0}
      <section class="history-section">
        <button class="history-toggle" on:click={() => showFileHistory = !showFileHistory}>
          {showFileHistory ? '[-]' : '[+]'} file history ({skill.file_history.length} version{skill.file_history.length !== 1 ? 's' : ''})
        </button>
        
        {#if showFileHistory}
          <div class="history-list">
            {#each skill.file_history as version, i}
              <button class="history-entry-btn" on:click={() => toggleHistoryEntry(i)} class:expanded={expandedHistoryEntry === i}>
                <div class="history-entry-summary">
                  <span class="h-icon">{expandedHistoryEntry === i ? '[-]' : '[+]'}</span>
                  <span class="h-path">{version.path}</span>
                  <span class="h-size">{formatFileSize(Number(version.size_bytes))}</span>
                  <span class="h-date" title={formatTimestamp(version.fetched_at)}>{formatTimestampRelative(version.fetched_at)}</span>
                </div>
                {#if expandedHistoryEntry === i}
                  <div class="history-entry-details">
                    <div class="detail-row">
                      <span class="detail-label">SHA-256:</span>
                      <code class="detail-checksum">{version.checksum}</code>
                      <button class="copy-btn-small" on:click|stopPropagation={() => copyToClipboard(version.checksum)}>[copy]</button>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Size:</span>
                      <span class="detail-value">{Number(version.size_bytes).toLocaleString()} bytes</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Fetched:</span>
                      <span class="detail-value">{formatTimestamp(version.fetched_at)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Fetched by:</span>
                      <span class="detail-value detail-principal" title={version.fetched_by}>{shortenPrincipal(version.fetched_by)}</span>
                    </div>
                    {#if version.source_url}
                      <div class="detail-row">
                        <span class="detail-label">Source:</span>
                        <a href={version.source_url} target="_blank" rel="noopener" class="detail-link">{version.source_url}</a>
                      </div>
                    {/if}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
          <div class="checksum-info">
            <span class="checksum-label">Current combined checksum:</span>
            <code class="checksum-value">{skill.files_checksum || 'N/A'}</code>
            <button class="copy-checksum" on:click={() => copyToClipboard(skill?.files_checksum || '')}>
              [copy]
            </button>
          </div>
        {/if}
      </section>
    {/if}

    {#if skill.analysis}
      <section class="analysis">
        <!-- Flags / Warnings -->
        {#if flags.length > 0}
          <div class="flags-section">
            <h3>! Flags</h3>
            {#each flags as flag}
              <div class="flag" style="--flag-color: {getFlagSeverityColor(flag.severity)}">
                <span class="flag-severity">[{flag.severity}]</span>
                <span class="flag-type">{flag.flag_type}:</span>
                <span class="flag-msg">{flag.message}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Rating Topics Breakdown -->
        <div class="topics-section">
          <h3>% Topic Ratings</h3>
          
          <div class="topic-group">
            <span class="group-label">Code Quality</span>
            {#each topics.filter(t => getTopicGroup(t.topic) === 'code') as topic}
              <div class="topic-row" title={topic.reasoning || ''}>
                <span class="topic-icon">[{getTopicIcon(topic.topic)}]</span>
                <span class="topic-name">{topic.topic}</span>
                <div class="topic-bar-bg">
                  <div class="topic-bar" style="width: {topic.score}%; background: {getTopicScoreColor(topic.score)}"></div>
                </div>
                <span class="topic-score" style="color: {getTopicScoreColor(topic.score)}">{topic.score}</span>
                <span class="topic-confidence">({topic.confidence}%)</span>
                {#if topic.reasoning}
                  <span class="topic-reasoning">{topic.reasoning}</span>
                {/if}
              </div>
            {/each}
          </div>

          <div class="topic-group">
            <span class="group-label">Security & Safety</span>
            {#each topics.filter(t => getTopicGroup(t.topic) === 'safety') as topic}
              <div class="topic-row" class:topic-highlight={topic.topic === 'Malicious'} title={topic.reasoning || ''}>
                <span class="topic-icon">[{getTopicIcon(topic.topic)}]</span>
                <span class="topic-name">{topic.topic}</span>
                <div class="topic-bar-bg">
                  <div class="topic-bar" style="width: {topic.score}%; background: {getTopicScoreColor(topic.score)}"></div>
                </div>
                <span class="topic-score" style="color: {getTopicScoreColor(topic.score)}">{topic.score}</span>
                <span class="topic-confidence">({topic.confidence}%)</span>
                {#if topic.reasoning}
                  <span class="topic-reasoning">{topic.reasoning}</span>
                {/if}
              </div>
            {/each}
          </div>

          <div class="topic-group">
            <span class="group-label">Usability</span>
            {#each topics.filter(t => getTopicGroup(t.topic) === 'usability') as topic}
              <div class="topic-row" title={topic.reasoning || ''}>
                <span class="topic-icon">[{getTopicIcon(topic.topic)}]</span>
                <span class="topic-name">{topic.topic}</span>
                <div class="topic-bar-bg">
                  <div class="topic-bar" style="width: {topic.score}%; background: {getTopicScoreColor(topic.score)}"></div>
                </div>
                <span class="topic-score" style="color: {getTopicScoreColor(topic.score)}">{topic.score}</span>
                <span class="topic-confidence">({topic.confidence}%)</span>
                {#if topic.reasoning}
                  <span class="topic-reasoning">{topic.reasoning}</span>
                {/if}
              </div>
            {/each}
          </div>

          <div class="topic-group">
            <span class="group-label">Trust & Reputation</span>
            {#each topics.filter(t => getTopicGroup(t.topic) === 'trust') as topic}
              <div class="topic-row" title={topic.reasoning || ''}>
                <span class="topic-icon">[{getTopicIcon(topic.topic)}]</span>
                <span class="topic-name">{topic.topic}</span>
                <div class="topic-bar-bg">
                  <div class="topic-bar" style="width: {topic.score}%; background: {getTopicScoreColor(topic.score)}"></div>
                </div>
                <span class="topic-score" style="color: {getTopicScoreColor(topic.score)}">{topic.score}</span>
                <span class="topic-confidence">({topic.confidence}%)</span>
                {#if topic.reasoning}
                  <span class="topic-reasoning">{topic.reasoning}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="analysis-section">
          <h3># Summary</h3>
          <p>{skill.analysis.summary}</p>
        </div>

        <div class="analysis-section">
          <h3>+ Strengths</h3>
          <ul>
            {#each skill.analysis.strengths as strength}
              <li>{strength}</li>
            {/each}
          </ul>
        </div>

        <div class="analysis-section">
          <h3>- Weaknesses</h3>
          <ul>
            {#each skill.analysis.weaknesses as weakness}
              <li>{weakness}</li>
            {/each}
          </ul>
        </div>

        <div class="analysis-section">
          <h3>@ Use Cases</h3>
          <ul>
            {#each skill.analysis.use_cases as useCase}
              <li>{useCase}</li>
            {/each}
          </ul>
        </div>

        <div class="analysis-section">
          <h3>~ Compatibility</h3>
          <p>{skill.analysis.compatibility_notes}</p>
        </div>

        {#if skill.analysis.prerequisites && skill.analysis.prerequisites.length > 0}
          <div class="analysis-section">
            <h3>* Prerequisites</h3>
            <ul>
              {#each skill.analysis.prerequisites as prereq}
                <li>{prereq}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Referenced Files & URLs -->
        {#if (skill.analysis.referenced_files && skill.analysis.referenced_files.length > 0) || (skill.analysis.referenced_urls && skill.analysis.referenced_urls.length > 0)}
          <div class="refs-section">
            <h3>^ References</h3>
            {#if skill.analysis.referenced_files && skill.analysis.referenced_files.length > 0}
              <div class="ref-group">
                <span class="ref-group-label">Files referenced in SKILL.md:</span>
                {#each skill.analysis.referenced_files as ref}
                  <div class="ref-item" class:ref-resolved={ref.resolved} class:ref-missing={!ref.resolved}>
                    <span class="ref-status">{ref.resolved ? '[OK]' : '[??]'}</span>
                    <span class="ref-path">{ref.path}</span>
                    <span class="ref-context">{ref.context}</span>
                  </div>
                {/each}
              </div>
            {/if}
            {#if skill.analysis.referenced_urls && skill.analysis.referenced_urls.length > 0}
              <div class="ref-group">
                <span class="ref-group-label">URLs referenced in SKILL.md:</span>
                {#each skill.analysis.referenced_urls as ref}
                  <div class="ref-item" class:ref-fetched={ref.fetched} class:ref-pending={!ref.fetched}>
                    <span class="ref-status">{ref.fetched ? '[OK]' : '[->]'}</span>
                    <a href={ref.url} target="_blank" rel="noopener" class="ref-url">{ref.url}</a>
                    <span class="ref-context">{ref.context}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Dependencies -->
        {#if skill.analysis.required_mcps.length > 0 || skill.analysis.software_deps.length > 0}
          <div class="deps-section">
            <h3>& Dependencies</h3>
            {#if skill.analysis.required_mcps.length > 0}
              <div class="dep-group">
                <span class="dep-group-label">MCP Servers:</span>
                {#each skill.analysis.required_mcps as mcp}
                  <div class="dep-item">
                    <span class="dep-name">{mcp.name}</span>
                    <span class="dep-package">({mcp.package})</span>
                    {#if mcp.required}<span class="dep-required">required</span>{/if}
                    {#if mcp.indexed}<span class="dep-indexed" title="Indexed on skillsic">[indexed]</span>{/if}
                    {#if mcp.verified}<span class="dep-verified" title="Verified MCP server">[verified]</span>{/if}
                    {#if mcp.ratings}
                      <span class="dep-rating" style="color: {getTopicScoreColor(mcp.ratings.overall * 20)}">{mcp.ratings.overall.toFixed(1)}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            {#if skill.analysis.software_deps.length > 0}
              <div class="dep-group">
                <span class="dep-group-label">Software:</span>
                {#each skill.analysis.software_deps as dep}
                  <div class="dep-item">
                    {#if dep.url}
                      <a href={dep.url} target="_blank" rel="noopener" class="dep-name dep-link">{dep.name}</a>
                    {:else}
                      <span class="dep-name">{dep.name}</span>
                    {/if}
                    {#if dep.install_cmd}
                      <code class="dep-cmd">{dep.install_cmd}</code>
                    {/if}
                    {#if dep.required}<span class="dep-required">required</span>{/if}
                    {#if dep.ratings}
                      <span class="dep-rating" style="color: {getTopicScoreColor(dep.ratings.overall * 20)}">{dep.ratings.overall.toFixed(1)}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div class="analysis-meta">
          <span class="meta-item" title={skill.analysis.analyzed_by}>
            paid by {shortenPrincipal(skill.analysis.analyzed_by)}
          </span>
          <span class="meta-sep">|</span>
          <span class="meta-item">{shortenModelName(skill.analysis.model_used)}</span>
          {#if skill.analysis.analyzed_at}
            <span class="meta-sep">|</span>
            <span class="meta-item">{formatAnalysisDate(skill.analysis.analyzed_at)}</span>
          {/if}
          <span class="meta-sep">|</span>
          <span class="meta-item">v{skill.analysis.analysis_version}</span>
          {#if skill.analysis.tee_worker_version}
            <span class="meta-sep">|</span>
            <span class="meta-item">tee v{skill.analysis.tee_worker_version}</span>
          {/if}
          {#if skill.analysis.provides_mcp}
            <span class="meta-sep">|</span>
            <span class="provides-mcp">[provides MCP]</span>
          {/if}
          <span class="meta-sep">|</span>
          <button class="prompt-toggle" on:click={togglePrompt}>
            {loadingPrompt ? 'loading...' : showPrompt ? '[hide prompt]' : '[view prompt]'}
          </button>
          {#if canReanalyze && availableModels.length > 0}
            <span class="meta-sep">|</span>
            <span class="analyze-with-model">
              <span class="analyze-label">also analyze with:</span>
              {#each availableModels as model}
                <button 
                  class="model-btn-enhanced" 
                  class:active={$selectedModel === model.id}
                  on:click={() => { $selectedModel = model.id; handleAnalyze(); }}
                  disabled={analyzing}
                  title="{model.description} • {model.speed} • {model.cost}"
                >
                  <span class="model-btn-icon">{model.icon}</span>
                  <span class="model-btn-label">{model.label}</span>
                </button>
              {/each}
            </span>
          {:else if canReanalyze && availableModels.length === 0}
            <span class="meta-sep">|</span>
            <span class="all-models-done">✓ analyzed by all models</span>
          {/if}
          {#if canRefetch}
            <span class="meta-sep">|</span>
            <button class="refetch-btn" on:click={handleEnrich} disabled={enriching}>
              {enriching ? 'fetching...' : '[re-fetch files]'}
            </button>
          {/if}
        </div>
        {#if analyzeStatus}
          <div class="analyze-status">{analyzeStatus}</div>
        {/if}
        {#if analyzeError}
          <div class="analyze-error">{analyzeError}</div>
        {/if}
        {#if enrichStatus}
          <div class="enrich-status">{enrichStatus}</div>
        {/if}
        {#if enrichError}
          <div class="enrich-error">{enrichError}</div>
        {/if}

        {#if showPrompt && promptTemplate}
          <div class="prompt-display">
            <div class="prompt-header">
              <span class="prompt-label">System Prompt</span>
              {#if promptVersion}<span class="prompt-version">v{promptVersion}</span>{/if}
              <span class="prompt-source">loaded from ICP canister</span>
            </div>
            <pre class="prompt-content">{promptTemplate}</pre>
          </div>
        {/if}
      </section>

      <!-- Tags & Indicators -->
      <section class="tags-block">
        <div class="tags-section">
          <span class="tags-label">categories:</span>
          <span class="tag tag-cat">{skill.analysis.primary_category}</span>
          {#each skill.analysis.secondary_categories as cat}
            <span class="tag tag-cat">{cat}</span>
          {/each}
        </div>
        <div class="tags-section">
          <span class="tags-label">tags:</span>
          {#each skill.analysis.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
        <div class="tags-section indicators">
          {#if skill.analysis.has_mcp}
            <span class="indicator" title="This skill uses MCP servers">[MCP]</span>
          {/if}
          {#if skill.analysis.provides_mcp}
            <span class="indicator indicator-provides" title="This skill provides an MCP server">[provides MCP]</span>
          {/if}
          {#if skill.analysis.has_references}
            <span class="indicator" title="Has reference files">[refs]</span>
          {/if}
          {#if skill.analysis.has_assets}
            <span class="indicator" title="Has asset files">[assets]</span>
          {/if}
          {#if skill.analysis.estimated_token_usage > 0}
            <span class="indicator indicator-tokens" title="Estimated token usage when loaded">~{skill.analysis.estimated_token_usage.toLocaleString()} tokens</span>
          {/if}
        </div>
      </section>

      <!-- Analysis History -->
      {#if skill.analysis_history && skill.analysis_history.length > 1}
        <section class="analysis-history-section">
          <button class="history-toggle" on:click={() => showAnalysisHistory = !showAnalysisHistory}>
            {showAnalysisHistory ? '[-]' : '[+]'} analysis history ({skill.analysis_history.length} version{skill.analysis_history.length !== 1 ? 's' : ''})
          </button>
          
          {#if showAnalysisHistory}
            <div class="analysis-history-list">
              {#each skill.analysis_history as analysis, i}
                <button class="analysis-history-entry" on:click={() => toggleAnalysisEntry(i)} class:expanded={expandedAnalysisEntry === i}>
                  <div class="ah-summary">
                    <span class="ah-icon">{expandedAnalysisEntry === i ? '[-]' : '[+]'}</span>
                    <span class="ah-rating" style="color: {getRatingColor(analysis.ratings.overall)}">{analysis.ratings.overall.toFixed(1)}</span>
                    <span class="ah-model">{shortenModelName(analysis.model_used)}</span>
                    <span class="ah-date">{formatAnalysisDate(analysis.analyzed_at)}</span>
                    {#if i === 0}<span class="ah-current">[current]</span>{/if}
                  </div>
                  {#if expandedAnalysisEntry === i}
                    <div class="ah-details">
                      <p class="ah-summary-text">{analysis.summary}</p>
                      <div class="ah-meta">
                        <span>Analyzed by: {shortenPrincipal(analysis.analyzed_by)}</span>
                        <span>Version: {analysis.analysis_version}</span>
                        {#if analysis.tee_worker_version}
                          <span>TEE: v{analysis.tee_worker_version}</span>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {:else}
      <!-- Unanalyzed -->
      <section class="unanalyzed-section">
        <div class="unanalyzed">
          <span class="unanalyzed-icon">[?]</span>
          <span>This skill has not been analyzed yet.</span>
        </div>
        {#if canAnalyze}
          <div class="model-picker">
            <div class="model-picker-label">Select AI model for analysis:</div>
            <div class="model-cards">
              {#each allModels as model}
                <button 
                  class="model-card" 
                  class:selected={$selectedModel === model.id}
                  class:analyzing={analyzing && $selectedModel === model.id}
                  on:click={() => $selectedModel = model.id}
                  disabled={analyzing}
                >
                  <div class="model-card-icon">{model.icon}</div>
                  <div class="model-card-info">
                    <div class="model-card-name">{model.label}</div>
                    <div class="model-card-desc">{model.description}</div>
                  </div>
                  <div class="model-card-meta">
                    <span class="model-card-speed" title="Estimated time">{model.speed}</span>
                    <span class="model-card-cost" title="Estimated cost">{model.cost}</span>
                  </div>
                  {#if $selectedModel === model.id}
                    <div class="model-card-check">✓</div>
                  {/if}
                </button>
              {/each}
            </div>
            <div class="analyze-action">
              <button class="analyze-btn-large" on:click={handleAnalyze} disabled={analyzing}>
                {#if analyzing}
                  <span class="analyze-spinner"></span>
                  analyzing with {allModels.find(m => m.id === $selectedModel)?.label}...
                {:else}
                  Analyze with {allModels.find(m => m.id === $selectedModel)?.label}
                {/if}
              </button>
              {#if !skill.skill_md_content && !analyzing}
                <span class="auto-fetch-note">Will auto-fetch SKILL.md from GitHub</span>
              {/if}
            </div>
          </div>
        {:else if $isAuthenticated && !$hasApiKey}
          <div class="no-key-notice">
            <a href="/settings" use:link>Add an API key</a> to analyze this skill
          </div>
        {:else if !$isAuthenticated}
          <div class="no-key-notice">
            Sign in to analyze this skill
          </div>
        {/if}
        {#if enrichStatus}
          <div class="enrich-status">{enrichStatus}</div>
        {/if}
        {#if enrichError}
          <div class="enrich-error">{enrichError}</div>
        {/if}
        {#if analyzeStatus}
          <div class="analyze-status">{analyzeStatus}</div>
        {/if}
        {#if analyzeError}
          <div class="analyze-error">{analyzeError}</div>
        {/if}
        <div class="unanalyzed-prompt">
          <button class="prompt-toggle" on:click={togglePrompt}>
            {loadingPrompt ? 'loading...' : showPrompt ? '[hide system prompt]' : '[view system prompt]'}
          </button>
        </div>
        {#if showPrompt && promptTemplate}
          <div class="prompt-display">
            <div class="prompt-header">
              <span class="prompt-label">System Prompt</span>
              {#if promptVersion}<span class="prompt-version">v{promptVersion}</span>{/if}
              <span class="prompt-source">loaded from ICP canister</span>
            </div>
            <pre class="prompt-content">{promptTemplate}</pre>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Source links -->
    {#if skill.github_url || skill.skill_md_url}
      <section class="source-section">
        <span class="source-label">source:</span>
        {#if skill.github_url}
          <a href={skill.github_url} target="_blank" rel="noopener" class="github-link">{skill.github_url}</a>
        {/if}
        {#if skill.skill_md_url}
          <span class="source-sep">|</span>
          <a href={skill.skill_md_url} target="_blank" rel="noopener" class="skill-md-link">[SKILL.md]</a>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .skill-page {
    max-width: 800px;
    margin: 0 auto;
  }

  /* Loading / Error states */
  .loading {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
  }

  .loading-text {
    color: var(--text-secondary);
  }

  .error-page {
    text-align: center;
    padding: var(--space-2xl);
  }

  .error-icon {
    font-size: var(--font-size-2xl);
    color: var(--rating-1);
  }

  .error-page h2 {
    color: var(--text-secondary);
    font-weight: 400;
    margin: var(--space-md) 0;
  }

  .back-btn {
    background: var(--bg-secondary);
    color: var(--accent-primary);
    border: 1px solid var(--accent-dim);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 0.15s;
  }

  .back-btn:hover {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  /* Breadcrumb */
  .breadcrumb {
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-xl);
    color: var(--text-muted);
  }

  .crumb-link {
    color: var(--accent-primary);
  }

  .crumb-link:hover {
    text-decoration: underline;
  }

  .crumb-sep {
    margin: 0 var(--space-xs);
    color: var(--border-color);
  }

  .crumb-owner {
    color: var(--text-secondary);
  }

  .crumb-owner:hover {
    color: var(--accent-primary);
  }

  .crumb-repo {
    color: var(--accent-secondary);
  }

  .crumb-name {
    color: var(--text-primary);
  }

  /* Header */
  .page-header {
    margin-bottom: var(--space-xl);
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .skill-name {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }

  .skill-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .owner { color: var(--text-secondary); }
  .owner-link { 
    color: var(--text-secondary); 
    transition: color 0.15s ease;
  }
  .owner-link:hover { 
    color: var(--accent-primary); 
    text-decoration: underline;
  }
  .sep { color: var(--border-color); }
  .repo { color: var(--accent-secondary); }

  .stars, .installs, .timestamp {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  .skill-desc {
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .rating-badge {
    flex-shrink: 0;
    text-align: center;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--rating-color);
    border-radius: 6px;
  }

  .rating-badge .rating-value {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--rating-color);
    display: block;
  }

  .rating-badge .rating-max {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  /* Install command */
  .install-section {
    margin-bottom: var(--space-xl);
  }

  .install-cmd {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg-secondary);
    padding: var(--space-sm) var(--space-md);
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .cmd-prompt { color: var(--accent-primary); font-weight: 600; }
  .cmd-text { flex: 1; color: var(--text-primary); background: transparent; padding: 0; }

  .copy-btn {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    transition: color 0.15s ease;
  }
  .copy-btn:hover { color: var(--accent-primary); }

  /* Analysis section */
  .analysis {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  /* Flags */
  .flags-section {
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-color);
  }
  .flags-section h3 {
    color: #ff4444;
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }
  .flag {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 68, 68, 0.05);
    border-left: 2px solid var(--flag-color);
    border-radius: 0 3px 3px 0;
  }
  .flag-severity { color: var(--flag-color); font-weight: 600; }
  .flag-type { color: var(--text-secondary); font-weight: 500; }
  .flag-msg { color: var(--text-muted); }

  /* Topic Ratings */
  .topics-section {
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-color);
  }
  .topics-section h3 {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-md);
  }
  .topic-group { margin-bottom: var(--space-md); }
  .group-label {
    display: block;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-xs);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .topic-row {
    display: grid;
    grid-template-columns: 28px 130px 1fr 36px 48px;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: 3px;
    font-size: var(--font-size-xs);
    cursor: help;
  }
  .topic-row:hover {
    background: var(--bg-tertiary, rgba(255,255,255,0.02));
  }
  .topic-row:hover .topic-reasoning {
    display: block;
  }
  .topic-highlight {
    background: rgba(255, 68, 68, 0.05);
    padding: 2px 4px;
    border-radius: 3px;
  }
  .topic-icon { color: var(--text-muted); font-size: 10px; }
  .topic-name { color: var(--text-secondary); }
  .topic-bar-bg {
    height: 6px;
    background: var(--bg-tertiary, rgba(255,255,255,0.05));
    border-radius: 3px;
    overflow: hidden;
  }
  .topic-bar {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .topic-score {
    text-align: right;
    font-weight: 600;
    font-family: var(--font-mono);
  }
  .topic-confidence {
    color: var(--text-muted);
    font-size: 9px;
    text-align: right;
  }
  .topic-reasoning {
    display: none;
    grid-column: 2 / -1;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
    padding: 4px 0 2px 0;
    line-height: 1.4;
  }

  /* Analysis sections */
  .analysis-section { margin-bottom: var(--space-md); }
  .analysis-section h3 {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-xs);
  }
  .analysis-section p {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }
  .analysis-section ul {
    list-style: none;
    padding-left: var(--space-md);
  }
  .analysis-section li {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-xs);
    position: relative;
  }
  .analysis-section li::before {
    content: '>';
    position: absolute;
    left: -16px;
    color: var(--text-muted);
  }

  /* References */
  .refs-section {
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-color);
  }
  .refs-section h3 {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }
  .ref-group { margin-bottom: var(--space-sm); }
  .ref-group-label {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-xs);
    display: block;
  }
  .ref-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    font-size: var(--font-size-xs);
    margin-bottom: 3px;
    padding: var(--space-xs) var(--space-sm);
    border-radius: 3px;
  }
  .ref-resolved {
    background: rgba(0, 255, 136, 0.05);
    border-left: 2px solid #00ff88;
  }
  .ref-missing {
    background: rgba(204, 170, 0, 0.05);
    border-left: 2px solid #ccaa00;
  }
  .ref-fetched {
    background: rgba(0, 255, 136, 0.05);
    border-left: 2px solid #00ff88;
  }
  .ref-pending {
    background: rgba(136, 136, 255, 0.05);
    border-left: 2px solid #8888ff;
  }
  .ref-status {
    font-weight: 600;
    flex-shrink: 0;
    width: 30px;
  }
  .ref-resolved .ref-status { color: #00ff88; }
  .ref-missing .ref-status { color: #ccaa00; }
  .ref-fetched .ref-status { color: #00ff88; }
  .ref-pending .ref-status { color: #8888ff; }
  .ref-path {
    color: var(--accent-secondary);
    font-weight: 500;
    flex-shrink: 0;
  }
  .ref-url {
    color: var(--accent-secondary);
    font-weight: 500;
    word-break: break-all;
  }
  .ref-url:hover { color: var(--accent-primary); }
  .ref-context {
    color: var(--text-muted);
    font-style: italic;
  }

  /* Dependencies */
  .deps-section {
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-color);
  }
  .deps-section h3 {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }
  .dep-group { margin-bottom: var(--space-sm); }
  .dep-group-label {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-xs);
    display: block;
  }
  .dep-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-xs);
    margin-bottom: 2px;
  }
  .dep-name { color: var(--text-secondary); font-weight: 500; }
  .dep-package { color: var(--text-muted); }
  .dep-cmd {
    color: var(--accent-secondary);
    background: var(--bg-tertiary, rgba(255,255,255,0.05));
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 10px;
  }
  .dep-required {
    color: #ccaa00;
    font-size: 9px;
    border: 1px solid rgba(204, 170, 0, 0.3);
    padding: 0 4px;
    border-radius: 2px;
  }
  .dep-indexed {
    color: var(--accent-primary);
    font-size: 9px;
    border: 1px solid var(--accent-dim);
    padding: 0 4px;
    border-radius: 2px;
  }
  .dep-verified {
    color: #00ff88;
    font-size: 9px;
    border: 1px solid rgba(0, 255, 136, 0.3);
    padding: 0 4px;
    border-radius: 2px;
  }
  .dep-link {
    color: var(--accent-secondary);
    text-decoration: none;
  }
  .dep-link:hover {
    color: var(--accent-primary);
    text-decoration: underline;
  }
  .dep-rating { font-weight: 600; }

  /* Analysis meta */
  .analysis-meta {
    margin-top: var(--space-md);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border-color);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .meta-sep { color: var(--border-color); }
  .provides-mcp { color: var(--accent-primary); }

  .prompt-toggle {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: color 0.15s ease;
    padding: 0;
    border: none;
    font-family: var(--font-mono);
  }
  .prompt-toggle:hover { color: var(--accent-primary); }

  .prompt-display {
    margin-top: var(--space-md);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }
  .prompt-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-tertiary, rgba(255,255,255,0.02));
  }
  .prompt-label { color: var(--accent-primary); font-size: var(--font-size-xs); font-weight: 600; }
  .prompt-version { color: var(--text-muted); font-size: var(--font-size-xs); }
  .prompt-source {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
  }
  .prompt-content {
    padding: var(--space-md);
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 400px;
    overflow-y: auto;
    margin: 0;
    font-family: var(--font-mono);
  }

  /* Tags */
  .tags-block {
    margin-bottom: var(--space-xl);
  }

  .tags-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    flex-wrap: wrap;
  }
  .tags-label { color: var(--text-muted); font-size: var(--font-size-xs); }
  .tag {
    font-size: var(--font-size-xs);
    padding: 2px 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-secondary);
  }
  .tag-cat {
    color: var(--accent-primary);
    border-color: var(--accent-dim);
  }

  /* Indicators */
  .indicators {
    margin-top: var(--space-sm);
  }
  .indicator {
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    background: var(--bg-tertiary, rgba(255,255,255,0.03));
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-muted);
    cursor: help;
  }
  .indicator-provides {
    color: var(--accent-primary);
    border-color: var(--accent-dim);
  }
  .indicator-tokens {
    color: var(--accent-secondary);
  }

  /* Analysis History Section */
  .analysis-history-section {
    margin-bottom: var(--space-xl);
  }
  .analysis-history-list {
    margin-top: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }
  .analysis-history-entry {
    display: block;
    width: 100%;
    background: var(--bg-secondary);
    border: none;
    border-bottom: 1px solid var(--border-color);
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }
  .analysis-history-entry:last-child {
    border-bottom: none;
  }
  .analysis-history-entry:hover {
    background: var(--bg-tertiary, rgba(255,255,255,0.03));
  }
  .analysis-history-entry.expanded {
    background: var(--bg-tertiary, rgba(255,255,255,0.02));
  }
  .ah-summary {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
  }
  .ah-icon { color: var(--text-muted); width: 20px; }
  .ah-rating { font-weight: 600; width: 30px; }
  .ah-model { color: var(--text-secondary); flex: 1; }
  .ah-date { color: var(--text-muted); }
  .ah-current {
    color: var(--accent-primary);
    font-size: 10px;
  }
  .ah-details {
    padding: var(--space-sm) var(--space-md) var(--space-md);
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
  }
  .ah-summary-text {
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    line-height: 1.5;
    margin-bottom: var(--space-sm);
    font-family: var(--font-sans);
  }
  .ah-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    color: var(--text-muted);
    font-size: 10px;
  }

  /* Unanalyzed */
  .unanalyzed-section {
    margin-bottom: var(--space-xl);
  }

  .unanalyzed {
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: 6px;
    padding: var(--space-lg);
    margin-bottom: var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--text-muted);
    flex-wrap: wrap;
  }
  .unanalyzed-icon { color: var(--text-secondary); font-size: var(--font-size-lg); }

  /* Model Picker */
  .model-picker {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-lg);
  }
  .model-picker-label {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-md);
  }
  .model-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .model-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  .model-card:hover {
    border-color: var(--accent-secondary);
    background: var(--bg-tertiary);
  }
  .model-card.selected {
    border-color: var(--accent-primary);
    background: rgba(0, 255, 136, 0.05);
  }
  .model-card.analyzing {
    opacity: 0.7;
    cursor: wait;
  }
  .model-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .model-card-icon {
    font-size: 24px;
    flex-shrink: 0;
  }
  .model-card-info {
    flex: 1;
    min-width: 0;
  }
  .model-card-name {
    color: var(--text-primary);
    font-weight: 600;
    font-size: var(--font-size-md);
    margin-bottom: 2px;
  }
  .model-card-desc {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }
  .model-card-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .model-card-speed {
    color: var(--accent-secondary);
    font-size: 10px;
    font-family: var(--font-mono);
  }
  .model-card-cost {
    color: var(--text-muted);
    font-size: 10px;
    font-family: var(--font-mono);
  }
  .model-card-check {
    position: absolute;
    top: 8px;
    right: 8px;
    color: var(--accent-primary);
    font-size: 12px;
    font-weight: bold;
  }

  .analyze-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
  }
  .analyze-btn-large {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    background: var(--accent-primary);
    color: var(--bg-primary);
    padding: var(--space-md) var(--space-xl);
    border-radius: 6px;
    font-size: var(--font-size-md);
    font-weight: 600;
    transition: all 0.15s ease;
    min-width: 280px;
  }
  .analyze-btn-large:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  .analyze-btn-large:disabled {
    opacity: 0.7;
    cursor: wait;
    transform: none;
  }
  .analyze-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--bg-primary);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .auto-fetch-note {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-style: italic;
  }
  .no-key-notice {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-top: var(--space-md);
    text-align: center;
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: 8px;
  }
  .no-key-notice a {
    color: var(--accent-primary);
  }
  .no-key-notice a:hover {
    text-decoration: underline;
  }
  .analyze-status {
    color: var(--accent-primary);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(0, 255, 136, 0.05);
    border: 1px solid rgba(0, 255, 136, 0.2);
    border-radius: 3px;
  }
  .analyze-error {
    color: #ff4444;
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-md);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 3px;
  }
  .unanalyzed-prompt {
    margin-bottom: var(--space-md);
  }

  /* Enrich prompt (no files state) */
  .enrich-prompt {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    font-size: var(--font-size-sm);
  }
  .enrich-icon {
    color: var(--accent-secondary);
    font-weight: 600;
  }
  .enrich-text {
    color: var(--text-muted);
    flex: 1;
  }
  .enrich-hint {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-style: italic;
  }
  .enrich-btn {
    background: transparent;
    color: var(--accent-primary);
    border: 1px solid var(--accent-dim);
    border-radius: 4px;
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .enrich-btn:hover {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }
  .enrich-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .enrich-btn:disabled:hover {
    background: transparent;
    color: var(--accent-primary);
  }
  .enrich-btn-inline {
    background: transparent;
    color: var(--accent-secondary);
    border: 1px solid var(--accent-secondary);
    border-radius: 4px;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .enrich-btn-inline:hover {
    background: var(--accent-secondary);
    color: var(--bg-primary);
  }
  .enrich-btn-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .enrich-btn-inline:disabled:hover {
    background: transparent;
    color: var(--accent-secondary);
  }
  .enrich-status {
    color: var(--accent-secondary);
    font-size: var(--font-size-xs);
    margin-top: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(136, 136, 255, 0.05);
    border: 1px solid rgba(136, 136, 255, 0.2);
    border-radius: 3px;
  }
  .enrich-error {
    color: #ff4444;
    font-size: var(--font-size-xs);
    margin-top: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 3px;
  }

  /* File Explorer */
  .files-section {
    margin-bottom: var(--space-xl);
  }

  .files-toggle {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }
  .files-toggle:hover {
    border-color: var(--accent-primary);
  }

  .files-explorer {
    margin-top: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }

  .file-list {
    border-bottom: 1px solid var(--border-color);
  }

  .file-entry {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-secondary);
    border: none;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    transition: background 0.1s ease;
    text-align: left;
  }
  .file-entry:last-child {
    border-bottom: none;
  }
  .file-entry:hover {
    background: var(--bg-tertiary, rgba(255,255,255,0.03));
  }
  .file-entry.active {
    background: var(--bg-tertiary, rgba(255,255,255,0.05));
    color: var(--accent-primary);
    border-left: 2px solid var(--accent-primary);
    padding-left: calc(var(--space-md) - 2px);
  }

  .file-icon {
    color: var(--text-muted);
    flex-shrink: 0;
    font-size: 10px;
    width: 22px;
  }
  .file-type-badge {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 600;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0 4px;
    opacity: 0.7;
  }
  .file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-size {
    color: var(--text-muted);
    font-size: 10px;
    flex-shrink: 0;
  }

  .file-viewer {
    background: var(--bg-primary);
  }
  .file-viewer-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-tertiary, rgba(255,255,255,0.02));
  }
  .viewer-path {
    color: var(--accent-primary);
    font-size: var(--font-size-xs);
    font-weight: 600;
    flex: 1;
  }
  .viewer-size {
    color: var(--text-muted);
    font-size: 10px;
  }
  .viewer-checksum {
    color: var(--accent-secondary);
    font-size: 10px;
    font-family: var(--font-mono);
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 2px;
    cursor: help;
  }
  .file-content {
    padding: var(--space-md);
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 500px;
    overflow-y: auto;
    margin: 0;
    font-family: var(--font-mono);
  }

  /* Source */
  .source-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xl);
  }
  .source-label { color: var(--text-muted); font-size: var(--font-size-xs); }
  .source-sep { color: var(--border-color); }
  .github-link {
    color: var(--accent-secondary);
    font-size: var(--font-size-xs);
  }
  .github-link:hover { color: var(--accent-primary); }
  .skill-md-link {
    color: var(--accent-primary);
    font-size: var(--font-size-xs);
  }
  .skill-md-link:hover { color: var(--text-primary); }

  /* Re-analyze and Re-fetch buttons */
  .reanalyze-btn, .refetch-btn {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    border: none;
    transition: color 0.15s ease;
  }
  .reanalyze-btn:hover { color: var(--accent-primary); }
  .refetch-btn:hover { color: var(--accent-secondary); }
  .reanalyze-btn:disabled, .refetch-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Model selection buttons for analysis */
  .analyze-with-model {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .analyze-label {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }
  .model-btn-enhanced {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .model-btn-enhanced:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    background: var(--accent-dim);
    transform: translateY(-1px);
  }
  .model-btn-enhanced:disabled {
    opacity: 0.5;
    cursor: wait;
    transform: none;
  }
  .model-btn-icon {
    font-size: 12px;
  }
  .model-btn-label {
    font-weight: 500;
  }
  .all-models-done {
    color: var(--accent-primary);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  /* File History Section */
  .history-section {
    margin-bottom: var(--space-xl);
  }
  .history-toggle {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--accent-secondary);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }
  .history-toggle:hover {
    border-color: var(--accent-secondary);
  }
  .history-list {
    margin-top: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }
  .history-entry-btn {
    display: block;
    width: 100%;
    background: var(--bg-secondary);
    border: none;
    border-bottom: 1px solid var(--border-color);
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }
  .history-entry-btn:last-child {
    border-bottom: none;
  }
  .history-entry-btn:hover {
    background: var(--bg-tertiary, rgba(255,255,255,0.03));
  }
  .history-entry-btn.expanded {
    background: var(--bg-tertiary, rgba(255,255,255,0.02));
  }
  .history-entry-summary {
    display: grid;
    grid-template-columns: 30px 1fr 60px 80px;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    align-items: center;
  }
  .h-icon { color: var(--text-muted); }
  .h-path { color: var(--accent-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .h-size { color: var(--text-muted); text-align: right; }
  .h-date { color: var(--text-muted); text-align: right; }
  .history-entry-details {
    padding: var(--space-sm) var(--space-md) var(--space-md);
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
  }
  .detail-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-xs);
  }
  .detail-row:last-child { margin-bottom: 0; }
  .detail-label {
    color: var(--text-muted);
    min-width: 80px;
    flex-shrink: 0;
  }
  .detail-value { color: var(--text-secondary); }
  .detail-checksum {
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 2px;
    word-break: break-all;
    flex: 1;
  }
  .detail-principal {
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .detail-link {
    color: var(--accent-secondary);
    word-break: break-all;
  }
  .detail-link:hover { color: var(--accent-primary); }
  .copy-btn-small {
    background: transparent;
    color: var(--text-muted);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    border: none;
    flex-shrink: 0;
  }
  .copy-btn-small:hover { color: var(--accent-primary); }
  .checksum-info {
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-xs);
  }
  .checksum-label { color: var(--text-muted); }
  .checksum-value {
    flex: 1;
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .copy-checksum {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    border: none;
    transition: color 0.15s ease;
  }
  .copy-checksum:hover { color: var(--accent-primary); }

  @media (max-width: 600px) {
    .header-top {
      flex-direction: column;
    }

    .skill-meta {
      flex-wrap: wrap;
    }

    .topic-row {
      grid-template-columns: 24px 100px 1fr 30px 40px;
    }
  }
</style>
