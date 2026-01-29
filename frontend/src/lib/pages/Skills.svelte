<script lang="ts">
  import { onMount } from 'svelte';
  import SearchBar from '../components/SearchBar.svelte';
  import SkillCard from '../components/SkillCard.svelte';
  import SkillRow from '../components/SkillRow.svelte';
  import { skills, isLoading, viewMode, sortBy, searchQuery, selectedCategory, totalFiltered, currentPage } from '../store';
  import { listSkillsFiltered } from '../canister';
  import type { Skill } from '../types';
  import type { ViewMode } from '../types';

  let loadError: string | null = null;

  // Pagination
  const PAGE_SIZE = 15;

  $: totalPages = Math.max(1, Math.ceil($totalFiltered / PAGE_SIZE));
  $: startIdx = ($totalFiltered === 0) ? 0 : ($currentPage - 1) * PAGE_SIZE + 1;
  $: endIdx = Math.min($currentPage * PAGE_SIZE, $totalFiltered);

  // Re-fetch when sort, search, category, or page changes
  let initialized = false;
  $: if (initialized) {
    void fetchPage($currentPage, $sortBy, $searchQuery, $selectedCategory);
  }

  // Reset to page 1 when filters/sort change (but not on page change itself)
  let prevSort = $sortBy;
  let prevSearch = $searchQuery;
  let prevCategory = $selectedCategory;
  $: {
    if (initialized && ($sortBy !== prevSort || $searchQuery !== prevSearch || $selectedCategory !== prevCategory)) {
      prevSort = $sortBy;
      prevSearch = $searchQuery;
      prevCategory = $selectedCategory;
      currentPage.set(1);
    }
  }

  onMount(async () => {
    isLoading.set(true);
    loadError = null;
    try {
      const result = await listSkillsFiltered(PAGE_SIZE, 0, $sortBy, $searchQuery || '', $selectedCategory || '');
      skills.set(result.skills);
      totalFiltered.set(result.total);
    } catch (e: any) {
      console.error('Failed to load skills from canister:', e);
      loadError = e.message || 'Failed to connect to canister';
    } finally {
      isLoading.set(false);
      initialized = true;
    }
  });

  async function fetchPage(page: number, sort: string, search: string | null, category: string | null) {
    isLoading.set(true);
    loadError = null;
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await listSkillsFiltered(PAGE_SIZE, offset, sort, search || '', category || '');
      skills.set(result.skills);
      totalFiltered.set(result.total);
    } catch (e: any) {
      console.error('Failed to load skills:', e);
      loadError = e.message || 'Failed to fetch skills';
    } finally {
      isLoading.set(false);
    }
  }

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(page, totalPages));
    currentPage.set(clamped);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleView() {
    viewMode.update((m: ViewMode) => m === 'cards' ? 'compact' : 'cards');
  }
</script>

<svelte:head>
  <title>skillsic | Safe Skills for Claude Code, Cursor, Windsurf, Cline & AI Coding Agents</title>
  <meta name="description" content="Discover and install safe, analyzed skills for Claude Code, Cursor, Windsurf, Cline, and other AI coding agents. Security-first skill curation powered by AI analysis on ICP." />
  <meta property="og:title" content="skillsic - Safe Skills for AI Coding Agents" />
  <meta property="og:description" content="Security-first skill discovery for Claude Code, Cursor, Windsurf, Cline and more. AI-powered analysis ensures safe installations." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://skillsic.com/" />
</svelte:head>

<section class="hero">
  <h1 class="hero-title">
    <span class="bracket">[</span>skillsic<span class="bracket">]</span>
  </h1>
  <p class="hero-subtitle">
    <span class="prompt">$</span> discover curated skills for all your agents
  </p>
  <p class="hero-desc">
    AI-analyzed. Community-rated. Install via <code>npx skillsic add owner/repo</code>
  </p>
</section>

<section class="search-section">
  <SearchBar />
</section>

<section class="toolbar">
  <div class="result-info">
    {#if !$isLoading && !loadError}
      <span class="result-count">{$totalFiltered.toLocaleString()} skills</span>
      {#if $totalFiltered > PAGE_SIZE}
        <span class="page-info">showing {startIdx}-{endIdx}</span>
      {/if}
    {/if}
  </div>
  <div class="view-toggle">
    <button
      class="toggle-btn"
      class:active={$viewMode === 'cards'}
      on:click={() => viewMode.set('cards')}
      title="Card view"
    >
      <span class="icon-cards">:::</span>
    </button>
    <button
      class="toggle-btn"
      class:active={$viewMode === 'compact'}
      on:click={() => viewMode.set('compact')}
      title="Compact view"
    >
      <span class="icon-rows">===</span>
    </button>
  </div>
</section>

{#if $viewMode === 'compact' && !$isLoading && !loadError && $skills.length > 0}
  <div class="row-header">
    <div class="rh-rating">rtg</div>
    <div class="rh-stars">stars</div>
    <div class="rh-name">name</div>
    <div class="rh-desc">description</div>
    <div class="rh-category">category</div>
    <div class="rh-updated">upd</div>
    <div class="rh-installs">inst</div>
  </div>
{/if}

<section class="skills-list" class:grid-view={$viewMode === 'cards'} class:compact-view={$viewMode === 'compact'}>
  {#if $isLoading}
    <div class="loading">
      <span class="loading-text">Fetching skills from ICP canister</span>
      <span class="cursor"></span>
    </div>
  {:else if loadError}
    <div class="empty">
      <span class="empty-icon">[!]</span>
      <span>Failed to load: {loadError}</span>
    </div>
  {:else if $skills.length === 0}
    <div class="empty">
      <span class="empty-icon">[0]</span>
      <span>No skills found matching your query.</span>
    </div>
  {:else}
    {#each $skills as skill (skill.id + skill.name)}
      {#if $viewMode === 'cards'}
        <SkillCard {skill} />
      {:else}
        <SkillRow {skill} />
      {/if}
    {/each}
  {/if}
</section>

{#if !$isLoading && !loadError && totalPages > 1}
  <nav class="pagination">
    <button class="page-btn" disabled={$currentPage <= 1} on:click={() => goToPage(1)}>&lt;&lt;</button>
    <button class="page-btn" disabled={$currentPage <= 1} on:click={() => goToPage($currentPage - 1)}>&lt;</button>
    
    {#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
      {#if page === 1 || page === totalPages || (page >= $currentPage - 2 && page <= $currentPage + 2)}
        <button
          class="page-btn"
          class:active={page === $currentPage}
          on:click={() => goToPage(page)}
        >
          {page}
        </button>
      {:else if page === $currentPage - 3 || page === $currentPage + 3}
        <span class="page-ellipsis">...</span>
      {/if}
    {/each}

    <button class="page-btn" disabled={$currentPage >= totalPages} on:click={() => goToPage($currentPage + 1)}>&gt;</button>
    <button class="page-btn" disabled={$currentPage >= totalPages} on:click={() => goToPage(totalPages)}>&gt;&gt;</button>
  </nav>
{/if}



<style>
  .hero {
    text-align: center;
    padding: var(--space-2xl) 0;
    margin-bottom: var(--space-xl);
  }

  .hero-title {
    font-size: 48px;
    font-weight: 700;
    margin-bottom: var(--space-md);
    letter-spacing: -1px;
  }

  .bracket {
    color: var(--accent-primary);
    text-shadow: var(--glow);
  }

  .hero-subtitle {
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }

  .prompt {
    color: var(--accent-primary);
    margin-right: var(--space-sm);
  }

  .hero-desc {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .hero-desc code {
    color: var(--accent-secondary);
  }

  .search-section {
    margin-bottom: var(--space-md);
  }

  /* Toolbar: result info + view toggle */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
    padding: 0 var(--space-xs);
  }

  .result-info {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    font-size: var(--font-size-sm);
  }

  .result-count {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .page-info {
    color: var(--text-muted);
  }

  .view-toggle {
    display: flex;
    gap: 2px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 2px;
  }

  .toggle-btn {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    padding: 4px 8px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-weight: 600;
    letter-spacing: 1px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .toggle-btn:hover {
    color: var(--text-secondary);
  }

  .toggle-btn.active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);
  }

  /* Compact view column header */
  .row-header {
    display: grid;
    grid-template-columns: 50px 60px 200px 1fr 130px 50px 70px;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    border-bottom: 1px solid var(--accent-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .rh-rating { text-align: right; }
  .rh-stars { text-align: right; }
  .rh-updated { text-align: right; }
  .rh-installs { text-align: right; }

  /* Skills list */
  .skills-list.grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: var(--space-lg);
  }

  .skills-list.compact-view {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }

  .loading,
  .empty {
    grid-column: 1 / -1;
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

  .empty-icon {
    color: var(--text-secondary);
    font-size: var(--font-size-xl);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xl) 0;
  }

  .page-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 4px 10px;
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    min-width: 32px;
    text-align: center;
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .page-btn.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
    border-color: var(--accent-primary);
    font-weight: 600;
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .page-ellipsis {
    color: var(--text-muted);
    padding: 0 var(--space-xs);
  }

  @media (max-width: 900px) {
    .row-header {
      grid-template-columns: 45px 50px 1fr 60px;
    }

    .rh-desc,
    .rh-category,
    .rh-updated {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .hero-title {
      font-size: 32px;
    }

    .skills-list.grid-view {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .row-header {
      grid-template-columns: 40px 1fr 50px;
    }

    .rh-stars {
      display: none;
    }
  }
</style>
