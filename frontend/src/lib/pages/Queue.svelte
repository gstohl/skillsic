<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-routing';
  import { getQueueStats, listAnalysisJobs, listEnrichmentJobs, cancelAnalysisJob, cancelEnrichmentJob } from '../canister';
  import type { QueueStats, AnalysisJobSummary, EnrichmentJobSummary } from '../canister';
  import { isAuthenticated, principalString, getAgent } from '../auth';

  let stats: QueueStats | null = null;
  let analysisJobs: AnalysisJobSummary[] = [];
  let enrichmentJobs: EnrichmentJobSummary[] = [];
  let loading = true;
  let error: string | null = null;
  let refreshInterval: number | null = null;
  let cancellingJob: string | null = null;

  async function loadData() {
    try {
      const [s, aj, ej] = await Promise.all([
        getQueueStats(),
        listAnalysisJobs(50),
        listEnrichmentJobs(50),
      ]);
      stats = s;
      analysisJobs = aj;
      enrichmentJobs = ej;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load queue data';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
    // Auto-refresh every 5 seconds
    refreshInterval = setInterval(loadData, 5000) as unknown as number;
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  function formatTimestamp(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    return new Date(ms).toLocaleString();
  }

  function formatTimeAgo(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'Pending': return 'status-pending';
      case 'Processing': return 'status-processing';
      case 'Completed': return 'status-completed';
      case 'Failed': return 'status-failed';
      case 'NotFound': return 'status-notfound';
      default: return '';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'Pending': return '○';
      case 'Processing': return '◐';
      case 'Completed': return '●';
      case 'Failed': return '✕';
      case 'NotFound': return '?';
      default: return '○';
    }
  }

  function canCancel(status: string, requester: string): boolean {
    // Can only cancel Pending or Processing jobs
    if (status !== 'Pending' && status !== 'Processing') return false;
    // Must be logged in and be the requester
    if (!$isAuthenticated || !$principalString) return false;
    return $principalString === requester;
  }

  async function handleCancelAnalysis(jobId: string) {
    if (cancellingJob) return;
    cancellingJob = jobId;
    try {
      const agent = await getAgent();
      if (!agent) throw new Error('Not authenticated');
      await cancelAnalysisJob(agent, jobId);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to cancel job');
    } finally {
      cancellingJob = null;
    }
  }

  async function handleCancelEnrichment(jobId: string) {
    if (cancellingJob) return;
    cancellingJob = jobId;
    try {
      const agent = await getAgent();
      if (!agent) throw new Error('Not authenticated');
      await cancelEnrichmentJob(agent, jobId);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to cancel job');
    } finally {
      cancellingJob = null;
    }
  }
</script>

<svelte:head>
  <title>Job Queue | skillsic - AI Skill Analysis Queue</title>
  <meta name="description" content="Real-time view of skill analysis and enrichment jobs for Claude Code, Cursor, Windsurf & Cline skills." />
</svelte:head>

<div class="queue-page">
  <header class="page-header">
    <h1 class="title">Job Queue</h1>
    <p class="subtitle">Real-time view of analysis and enrichment jobs</p>
  </header>

  {#if loading && !stats}
    <div class="loading">
      <span class="spinner">loading queue data...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <p class="error-text">{error}</p>
      <button class="retry-btn" on:click={loadData}>retry</button>
    </div>
  {:else if stats}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">Analysis Queue</div>
        <div class="stat-numbers">
          <div class="stat-item">
            <span class="stat-value pending">{stats.analysis_pending}</span>
            <span class="stat-label">pending</span>
          </div>
          <div class="stat-item">
            <span class="stat-value processing">{stats.analysis_processing}</span>
            <span class="stat-label">processing</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.analysis_total}</span>
            <span class="stat-label">total</span>
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">Enrichment Queue</div>
        <div class="stat-numbers">
          <div class="stat-item">
            <span class="stat-value pending">{stats.enrichment_pending}</span>
            <span class="stat-label">pending</span>
          </div>
          <div class="stat-item">
            <span class="stat-value processing">{stats.enrichment_processing}</span>
            <span class="stat-label">processing</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.enrichment_total}</span>
            <span class="stat-label">total</span>
          </div>
        </div>
      </div>
    </div>

    <div class="queues-container">
      <section class="queue-section">
        <h2 class="section-title">Analysis Jobs</h2>
        {#if analysisJobs.length === 0}
          <p class="empty-state">No analysis jobs in queue</p>
        {:else}
          <div class="jobs-table">
            <div class="table-header">
              <span class="col-status">Status</span>
              <span class="col-skill">Skill</span>
              <span class="col-model">Model</span>
              <span class="col-time">Created</span>
              <span class="col-error">Error</span>
              <span class="col-action">Action</span>
            </div>
            {#each analysisJobs as job (job.job_id)}
              <div class="table-row">
                <span class="col-status">
                  <span class="status-badge {getStatusClass(job.status)}" title={job.status}>
                    {getStatusIcon(job.status)} {job.status}
                  </span>
                </span>
                <span class="col-skill">
                  <a href="/skill/{job.skill_id}" use:link class="skill-link">{job.skill_id}</a>
                </span>
                <span class="col-model">{job.model}</span>
                <span class="col-time" title={formatTimestamp(job.created_at)}>{formatTimeAgo(job.created_at)}</span>
                <span class="col-error" title={job.error || ''}>
                  {#if job.error}
                    <span class="error-text">{job.error.slice(0, 50)}{job.error.length > 50 ? '...' : ''}</span>
                  {:else}
                    -
                  {/if}
                </span>
                <span class="col-action">
                  {#if canCancel(job.status, job.requester)}
                    <button 
                      class="cancel-btn" 
                      on:click={() => handleCancelAnalysis(job.job_id)}
                      disabled={cancellingJob === job.job_id}
                    >
                      {cancellingJob === job.job_id ? '...' : 'cancel'}
                    </button>
                  {:else}
                    -
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="queue-section">
        <h2 class="section-title">Enrichment Jobs</h2>
        {#if enrichmentJobs.length === 0}
          <p class="empty-state">No enrichment jobs in queue</p>
        {:else}
          <div class="jobs-table">
            <div class="table-header">
              <span class="col-status">Status</span>
              <span class="col-skill">Skill</span>
              <span class="col-owner">Owner/Repo</span>
              <span class="col-time">Created</span>
              <span class="col-error">Error</span>
              <span class="col-action">Action</span>
            </div>
            {#each enrichmentJobs as job (job.job_id)}
              <div class="table-row">
                <span class="col-status">
                  <span class="status-badge {getStatusClass(job.status)}" title={job.status}>
                    {getStatusIcon(job.status)} {job.status}
                  </span>
                </span>
                <span class="col-skill">
                  <a href="/skill/{job.skill_id}" use:link class="skill-link">{job.skill_id}</a>
                </span>
                <span class="col-owner">
                  <a href="/builder/{job.owner}" use:link class="owner-link">{job.owner}</a>/{job.repo}
                </span>
                <span class="col-time" title={formatTimestamp(job.created_at)}>{formatTimeAgo(job.created_at)}</span>
                <span class="col-error" title={job.error || ''}>
                  {#if job.error}
                    <span class="error-text">{job.error.slice(0, 50)}{job.error.length > 50 ? '...' : ''}</span>
                  {:else}
                    -
                  {/if}
                </span>
                <span class="col-action">
                  {#if canCancel(job.status, job.requester)}
                    <button 
                      class="cancel-btn" 
                      on:click={() => handleCancelEnrichment(job.job_id)}
                      disabled={cancellingJob === job.job_id}
                    >
                      {cancellingJob === job.job_id ? '...' : 'cancel'}
                    </button>
                  {:else}
                    -
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <div class="refresh-notice">
      Auto-refreshing every 5 seconds
    </div>
  {/if}
</div>

<style>
  .queue-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: var(--space-xl);
  }

  .title {
    font-size: var(--font-size-2xl);
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }

  .subtitle {
    color: var(--text-muted);
    font-size: var(--font-size-md);
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }

  .spinner {
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .error-state {
    text-align: center;
    padding: var(--space-xxl);
  }

  .error-state .error-text {
    color: var(--danger);
    margin-bottom: var(--space-md);
  }

  .retry-btn {
    background: var(--bg-secondary);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    cursor: pointer;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-lg);
  }

  .stat-header {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-md);
  }

  .stat-numbers {
    display: flex;
    gap: var(--space-xl);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-primary);
  }

  .stat-value.pending {
    color: var(--warning);
  }

  .stat-value.processing {
    color: var(--accent-secondary);
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .queues-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .queue-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-lg);
  }

  .section-title {
    font-size: var(--font-size-lg);
    color: var(--accent-primary);
    margin-bottom: var(--space-md);
    font-weight: 600;
  }

  .empty-state {
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
    padding: var(--space-lg);
  }

  .jobs-table {
    font-size: var(--font-size-sm);
  }

  .table-header {
    display: grid;
    grid-template-columns: 100px 1fr 100px 80px 1fr 60px;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: var(--font-size-xs);
    letter-spacing: 0.5px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 100px 1fr 100px 80px 1fr 60px;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }

  .status-pending {
    background: rgba(255, 170, 0, 0.15);
    color: var(--warning);
  }

  .status-processing {
    background: rgba(78, 205, 196, 0.15);
    color: var(--accent-secondary);
  }

  .status-completed {
    background: rgba(0, 255, 159, 0.15);
    color: var(--accent-primary);
  }

  .status-failed {
    background: rgba(255, 68, 68, 0.15);
    color: var(--danger);
  }

  .status-notfound {
    background: rgba(102, 102, 102, 0.15);
    color: var(--text-muted);
  }

  .skill-link, .owner-link {
    color: var(--accent-secondary);
    transition: color 0.15s ease;
    word-break: break-all;
  }

  .skill-link:hover, .owner-link:hover {
    color: var(--accent-primary);
  }

  .col-time {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  .col-error .error-text {
    color: var(--danger);
    font-size: var(--font-size-xs);
  }

  .col-model {
    color: var(--text-secondary);
  }

  .col-owner {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .col-action {
    text-align: center;
  }

  .cancel-btn {
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--danger);
    color: var(--bg-primary);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-notice {
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    margin-top: var(--space-lg);
    font-style: italic;
  }

  @media (max-width: 800px) {
    .table-header,
    .table-row {
      grid-template-columns: 80px 1fr 60px 50px;
    }

    .col-time,
    .col-error {
      display: none;
    }
  }
</style>
