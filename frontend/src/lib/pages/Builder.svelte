<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-routing';
  import type { Skill } from '../types';
  import { getSkillsByOwner } from '../canister';
  import SkillCard from '../components/SkillCard.svelte';

  // Get owner from URL path
  export let owner: string = '';

  let skills: Skill[] = [];
  let loading = true;
  let error: string | null = null;

  $: totalInstalls = skills.reduce((sum, s) => sum + Number(s.install_count), 0);
  $: totalAnalyzed = skills.filter(s => s.analysis).length;

  onMount(async () => {
    if (!owner) {
      error = 'No builder specified';
      loading = false;
      return;
    }

    try {
      skills = await getSkillsByOwner(owner);
      if (skills.length === 0) {
        error = `No skills found for builder "${owner}"`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load skills';
    } finally {
      loading = false;
    }
  });
</script>

<div class="builder-page">
  <a href="/" use:link class="back-link">&larr; all skills</a>

  {#if loading}
    <div class="loading">
      <span class="spinner">loading...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <p class="error-text">{error}</p>
      <a href="/" use:link class="back-btn">back to skills</a>
    </div>
  {:else}
    <header class="builder-header">
      <div class="builder-avatar">
        <img 
          src="https://github.com/{owner}.png?size=80" 
          alt="{owner}'s avatar"
          class="avatar-img"
        />
      </div>
      <div class="builder-info">
        <h1 class="builder-name">{owner}</h1>
        <a 
          href="https://github.com/{owner}" 
          target="_blank" 
          rel="noopener"
          class="github-link"
        >
          github.com/{owner}
        </a>
      </div>
    </header>

    <div class="builder-stats">
      <div class="stat">
        <span class="stat-value">{skills.length}</span>
        <span class="stat-label">skills</span>
      </div>
      <div class="stat">
        <span class="stat-value">{totalAnalyzed}</span>
        <span class="stat-label">analyzed</span>
      </div>
      <div class="stat">
        <span class="stat-value">{totalInstalls.toLocaleString()}</span>
        <span class="stat-label">installs</span>
      </div>
    </div>

    <section class="skills-section">
      <h2 class="section-title">Skills by {owner}</h2>
      <div class="skills-grid">
        {#each skills as skill (skill.id)}
          <SkillCard {skill} />
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .builder-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  .back-link {
    display: inline-block;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin-bottom: var(--space-lg);
    transition: color 0.15s ease;
  }

  .back-link:hover {
    color: var(--accent-primary);
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 300px;
  }

  .spinner {
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .error-state {
    text-align: center;
    padding: var(--space-xxl);
  }

  .error-text {
    color: var(--text-muted);
    margin-bottom: var(--space-lg);
  }

  .back-btn {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
  }

  .builder-header {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .builder-avatar {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-tertiary);
    flex-shrink: 0;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .builder-info {
    flex: 1;
  }

  .builder-name {
    font-size: var(--font-size-xxl);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }

  .github-link {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    transition: color 0.15s ease;
  }

  .github-link:hover {
    color: var(--accent-primary);
  }

  .builder-stats {
    display: flex;
    gap: var(--space-xl);
    margin-bottom: var(--space-xl);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--accent-primary);
    font-family: var(--font-mono);
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .skills-section {
    margin-bottom: var(--space-xxl);
  }

  .section-title {
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    margin-bottom: var(--space-lg);
    font-weight: 400;
  }

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-lg);
  }

  @media (max-width: 600px) {
    .builder-header {
      flex-direction: column;
      text-align: center;
    }

    .builder-stats {
      justify-content: center;
      flex-wrap: wrap;
    }

    .skills-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
