<script lang="ts">
  import { link } from 'svelte-routing';
  import type { Skill } from '../types';

  export let skill: Skill;

  $: rating = skill.analysis?.ratings.overall ?? 0;
  $: ratingColor = getRatingColor(rating);
  $: installCmd = skill.repo === skill.name
    ? `npx skillsic add ${skill.owner}/${skill.repo}`
    : `npx skillsic add ${skill.owner}/${skill.repo}/${skill.name}`;
  // Use shorter URL when repo === name to avoid ugly /skill/owner/repo/repo
  $: skillHref = skill.repo === skill.name
    ? `/skill/${skill.owner}/${skill.repo}`
    : `/skill/${skill.id}`;

  function getRatingColor(r: number): string {
    if (r >= 4.5) return 'var(--rating-5)';
    if (r >= 3.5) return 'var(--rating-4)';
    if (r >= 2.5) return 'var(--rating-3)';
    if (r >= 1.5) return 'var(--rating-2)';
    return 'var(--rating-1)';
  }

  function formatRating(r: number): string {
    return r.toFixed(1);
  }

  function getSafetyLabel(r: number): string {
    if (r >= 4.5) return 'SAFE';
    if (r >= 3.5) return 'OK';
    if (r >= 2.5) return 'CAUTION';
    if (r >= 1.5) return 'WARNING';
    return 'DANGER';
  }

  let copied = false;
  function copyInstallCmd(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(installCmd);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<a href={skillHref} use:link class="skill-card-link">
  <header class="card-header">
    <div class="skill-id">
      <span class="owner">{skill.owner}</span>
      <span class="separator">/</span>
      <span class="repo">{skill.repo}</span>
    </div>
    {#if skill.analysis}
      <div class="rating" style="--rating-color: {ratingColor}">
        <span class="safety-label">{getSafetyLabel(rating)}</span>
        <span class="rating-value">{formatRating(rating)}</span>
      </div>
    {:else}
      <div class="unrated">[unrated]</div>
    {/if}
  </header>

  <h3 class="skill-name">{skill.name}</h3>
  <p class="skill-desc">{skill.description}</p>

  {#if skill.analysis}
    {@const securityTopic = skill.analysis.ratings.topics.find(t => t.topic === 'Security')}
    {@const qualityTopic = skill.analysis.ratings.topics.find(t => t.topic === 'Quality')}
    {@const usabilityTopic = skill.analysis.ratings.topics.find(t => t.topic === 'Usability')}
    <div class="ratings-compact">
      {#if securityTopic}<span class="mini-rating" title="Security">sec:{(securityTopic.score / 20).toFixed(1)}</span>{/if}
      {#if qualityTopic}<span class="mini-rating" title="Quality">qual:{(qualityTopic.score / 20).toFixed(1)}</span>{/if}
      {#if usabilityTopic}<span class="mini-rating" title="Usability">use:{(usabilityTopic.score / 20).toFixed(1)}</span>{/if}
    </div>
  {/if}

  <div class="tags">
    {#if skill.analysis}
      <span class="tag tag-category">{skill.analysis.primary_category}</span>
      {#each skill.analysis.tags.slice(0, 2) as tag}
        <span class="tag">{tag}</span>
      {/each}
    {/if}
  </div>

  <footer class="card-footer">
    <div class="install-cmd">
      <span class="cmd-prompt">$</span>
      <code class="cmd-text">{installCmd}</code>
      <button class="copy-btn" on:click={copyInstallCmd}>
        {copied ? '✓' : 'cp'}
      </button>
    </div>
    <span class="install-count">{skill.install_count.toLocaleString()}</span>
  </footer>
</a>

<style>
  .skill-card-link {
    display: flex;
    flex-direction: column;
    height: 200px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: var(--space-md);
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease;
    text-decoration: none;
    color: inherit;
    overflow: hidden;
  }

  .skill-card-link:hover {
    border-color: var(--accent-primary);
    transform: translateY(-2px);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xs);
    flex-shrink: 0;
  }

  .skill-id {
    font-size: 10px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .owner {
    color: var(--text-secondary);
  }

  .separator {
    color: var(--border-color);
    margin: 0 2px;
  }

  .repo {
    color: var(--accent-secondary);
  }

  .rating {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--rating-color);
    font-weight: 600;
    flex-shrink: 0;
  }

  .safety-label {
    font-size: 9px;
    padding: 1px 4px;
    background: var(--rating-color);
    color: var(--bg-primary);
    border-radius: 2px;
    font-weight: 700;
  }

  .rating-value {
    font-size: var(--font-size-sm);
  }

  .unrated {
    color: var(--text-muted);
    font-size: 10px;
  }

  .skill-name {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .skill-desc {
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.4;
    flex: 1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .ratings-compact {
    display: flex;
    gap: var(--space-sm);
    margin: var(--space-xs) 0;
    flex-shrink: 0;
  }

  .mini-rating {
    font-size: 9px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .tags {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    margin-bottom: var(--space-sm);
    overflow: hidden;
    flex-shrink: 0;
  }

  .tag {
    font-size: 9px;
    padding: 1px 5px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 2px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .tag-category {
    color: var(--accent-primary);
    border-color: var(--accent-dim);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border-color);
    margin-top: auto;
    flex-shrink: 0;
  }

  .install-cmd {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    max-width: 75%;
    overflow: hidden;
  }

  .cmd-prompt {
    color: var(--accent-primary);
    flex-shrink: 0;
  }

  .cmd-text {
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: transparent;
    padding: 0;
  }

  .copy-btn {
    flex-shrink: 0;
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .copy-btn:hover {
    color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .install-count {
    color: var(--text-muted);
    font-size: 10px;
    flex-shrink: 0;
  }
</style>
