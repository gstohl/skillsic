<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-routing';
  import { getAllAnalysisHistory, getAnalysisHistoryStats } from '../canister';
  import type { SkillAnalysis } from '../types';

  interface HistoryEntry {
    skill_id: string;
    analysis: SkillAnalysis;
  }

  let entries: HistoryEntry[] = [];
  let total = 0;
  let totalEntries = 0;
  let skillsWithHistory = 0;
  let isLoading = true;
  let loadError: string | null = null;

  // Pagination
  const PAGE_SIZE = 25;
  let currentPage = 1;
  $: totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function shortenPrincipal(p: string): string {
    if (!p || p.length < 20) return p;
    return p.slice(0, 5) + '...' + p.slice(-3);
  }

  function shortenModelName(model: string): string {
    if (model.includes('haiku')) return 'Haiku 4.5';
    if (model.includes('sonnet')) return 'Sonnet 4.5';
    if (model.includes('opus')) return 'Opus 4.5';
    return model;
  }

  function formatDate(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    return new Date(ms).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function ratingColor(rating: number): string {
    if (rating >= 4.0) return 'var(--rating-5)';
    if (rating >= 3.0) return 'var(--rating-3)';
    if (rating >= 2.0) return 'var(--rating-2)';
    return 'var(--rating-1)';
  }

  async function loadPage(page: number) {
    isLoading = true;
    loadError = null;
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await getAllAnalysisHistory(PAGE_SIZE, offset);
      entries = result.entries;
      total = result.total;
      currentPage = page;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      isLoading = false;
    }
  }

  /** Build a skill page URL from a skill_id like "owner/repo/name" or "owner/repo" */
  function skillUrl(skillId: string): string {
    const parts = skillId.split('/');
    if (parts.length >= 3) {
      const [owner, repo, name] = parts;
      // Use shorter URL when repo === name to avoid ugly /skill/owner/repo/repo
      if (repo === name) {
        return `/skill/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      }
      // owner/repo/name -> /skill/owner/repo/name
      return `/skill/${parts.map(p => encodeURIComponent(p)).join('/')}`;
    }
    // owner/repo -> /skill/owner/repo
    return `/skill/${parts.map(p => encodeURIComponent(p)).join('/')}`;
  }

  onMount(async () => {
    try {
      const [_, statsResult] = await Promise.all([
        loadPage(1),
        getAnalysisHistoryStats(),
      ]);
      totalEntries = statsResult.total_entries;
      skillsWithHistory = statsResult.skills_with_history;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Analysis History | skillsic</title>
  <meta name="description" content="Browse the complete analysis history of Claude Code skills on skillsic. Every analysis with full provenance." />
</svelte:head>

<div class="history-page">
  <section class="hero">
    <h1 class="title">
      <span class="bracket">[</span>analysis history<span class="bracket">]</span>
    </h1>
    <p class="subtitle">every analysis ever run, with full provenance</p>
    <div class="stats-row">
      <span class="stat">{totalEntries} total analyses</span>
      <span class="stat-sep">|</span>
      <span class="stat">{skillsWithHistory} skills analyzed</span>
    </div>
  </section>

  {#if loadError}
    <div class="error">Error: {loadError}</div>
  {/if}

  {#if isLoading && entries.length === 0}
    <div class="loading">loading analysis history...</div>
  {:else if entries.length === 0}
    <div class="empty">No analyses have been performed yet.</div>
  {:else}
    <div class="table-container">
      <table class="history-table">
        <thead>
          <tr>
            <th class="col-date">date</th>
            <th class="col-skill">skill</th>
            <th class="col-rating">rtg</th>
            <th class="col-model">model</th>
            <th class="col-version">version</th>
            <th class="col-worker">tee worker</th>
            <th class="col-user">paid by</th>
            <th class="col-summary">summary</th>
          </tr>
        </thead>
        <tbody>
          {#each entries as entry}
            <tr class="history-row">
              <td class="col-date">{formatDate(entry.analysis.analyzed_at)}</td>
              <td class="col-skill">
                <a href={skillUrl(entry.skill_id)} use:link class="skill-link">{entry.skill_id}</a>
              </td>
              <td class="col-rating">
                <span class="rating" style="color: {ratingColor(entry.analysis.ratings.overall)}">
                  {entry.analysis.ratings.overall.toFixed(1)}
                </span>
              </td>
              <td class="col-model">{shortenModelName(entry.analysis.model_used)}</td>
              <td class="col-version">v{entry.analysis.analysis_version}</td>
              <td class="col-worker">
                {#if entry.analysis.tee_worker_version}
                  v{entry.analysis.tee_worker_version}
                {:else}
                  <span class="muted">--</span>
                {/if}
              </td>
              <td class="col-user" title={entry.analysis.analyzed_by}>
                {shortenPrincipal(entry.analysis.analyzed_by)}
              </td>
              <td class="col-summary">
                <span class="summary-text">{entry.analysis.summary}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <nav class="pagination">
        <button class="page-btn" disabled={currentPage <= 1} on:click={() => loadPage(1)}>
          first
        </button>
        <button class="page-btn" disabled={currentPage <= 1} on:click={() => loadPage(currentPage - 1)}>
          prev
        </button>
        <span class="page-info">page {currentPage} / {totalPages} ({total} entries)</span>
        <button class="page-btn" disabled={currentPage >= totalPages} on:click={() => loadPage(currentPage + 1)}>
          next
        </button>
        <button class="page-btn" disabled={currentPage >= totalPages} on:click={() => loadPage(totalPages)}>
          last
        </button>
      </nav>
    {/if}
  {/if}
</div>



<style>
  .history-page {
    max-width: 1400px;
    margin: 0 auto;
  }

  .hero {
    text-align: center;
    margin-bottom: var(--space-2xl);
  }

  .title {
    font-size: var(--font-size-2xl);
    font-weight: 400;
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }

  .bracket {
    color: var(--accent-primary);
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: var(--font-size-md);
  }

  .stats-row {
    margin-top: var(--space-md);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .stat-sep {
    margin: 0 var(--space-sm);
    color: var(--border-color);
  }

  .loading, .empty, .error {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--text-secondary);
  }

  .error {
    color: var(--rating-1);
  }

  .table-container {
    overflow-x: auto;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .history-table th {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-color);
    font-weight: 400;
    white-space: nowrap;
  }

  .history-table td {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--bg-tertiary);
    vertical-align: top;
  }

  .history-row {
    transition: background 0.1s;
  }

  .history-row:hover {
    background: var(--bg-hover);
  }

  .col-date {
    white-space: nowrap;
    color: var(--text-secondary);
    min-width: 140px;
  }

  .col-skill {
    max-width: 250px;
  }

  .skill-link {
    color: var(--accent-primary);
    word-break: break-all;
    text-decoration: none;
  }

  .skill-link:hover {
    text-decoration: underline;
  }

  .col-rating {
    text-align: center;
    min-width: 40px;
  }

  .rating {
    font-weight: 600;
  }

  .col-model, .col-version, .col-worker {
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .col-user {
    white-space: nowrap;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  .col-summary {
    max-width: 400px;
  }

  .summary-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text-secondary);
  }

  .muted {
    color: var(--text-muted);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl) 0;
  }

  .page-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: var(--font-size-xs);
    transition: all 0.15s;
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .page-info {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    padding: 0 var(--space-md);
  }

  @media (max-width: 900px) {
    .col-summary, .col-worker, .col-version {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .col-user, .col-model {
      display: none;
    }
  }
</style>
