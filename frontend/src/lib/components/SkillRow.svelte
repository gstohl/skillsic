<script lang="ts">
  import { link } from 'svelte-routing';
  import type { Skill } from '../types';

  export let skill: Skill;

  $: rating = skill.analysis?.ratings.overall ?? 0;
  $: ratingColor = getRatingColor(rating);
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

  function formatStars(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return n.toString();
  }

  function formatTimestampShort(nanos: bigint): string {
    const ms = Number(nanos / BigInt(1_000_000));
    if (ms === 0) return '';
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    return `${years}y`;
  }

  function formatTimestamp(nanos: bigint): string {
    const ms = Number(nanos / BigInt(1_000_000));
    if (ms === 0) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<a href={skillHref} use:link class="skill-row">
  <div class="col-rating">
    {#if skill.analysis}
      <span class="rating" style="color: {ratingColor}">{formatRating(rating)}</span>
    {:else}
      <span class="unrated">--</span>
    {/if}
  </div>

  <div class="col-stars">
    <span class="stars">{formatStars(skill.stars)}</span>
  </div>

  <div class="col-name">
    <span class="owner">{skill.owner}/</span><span class="name">{skill.name}</span>
  </div>

  <div class="col-desc">
    <span class="desc">{skill.description}</span>
  </div>

  <div class="col-category">
    {#if skill.analysis}
      <span class="category">{skill.analysis.primary_category}</span>
    {/if}
  </div>

  <div class="col-updated" title={skill.updated_at ? formatTimestamp(skill.updated_at) : ''}>
    <span class="updated">{skill.updated_at ? formatTimestampShort(skill.updated_at) : ''}</span>
  </div>

  <div class="col-installs">
    <span class="installs">{Number(skill.install_count).toLocaleString()}</span>
  </div>
</a>

<style>
  .skill-row {
    display: grid;
    grid-template-columns: 50px 60px 200px 1fr 130px 50px 70px;
    gap: var(--space-sm);
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    transition: background 0.1s ease;
    font-size: var(--font-size-sm);
    min-height: 36px;
    text-decoration: none;
    color: inherit;
  }

  .skill-row:hover {
    background: var(--bg-secondary);
  }

  .col-rating {
    text-align: right;
    font-weight: 600;
  }

  .unrated {
    color: var(--text-muted);
  }

  .col-stars {
    text-align: right;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  .col-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .owner {
    color: var(--text-muted);
  }

  .name {
    color: var(--accent-secondary);
    font-weight: 500;
  }

  .col-desc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .col-category {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category {
    font-size: var(--font-size-xs);
    padding: 1px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--accent-dim);
    border-radius: 3px;
    color: var(--accent-primary);
  }

  .col-updated {
    text-align: right;
    color: var(--text-muted);
    font-size: 10px;
    opacity: 0.7;
  }

  .col-installs {
    text-align: right;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  @media (max-width: 900px) {
    .skill-row {
      grid-template-columns: 45px 50px 1fr 60px;
    }

    .col-desc,
    .col-category,
    .col-updated {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .skill-row {
      grid-template-columns: 40px 1fr 50px;
    }

    .col-stars {
      display: none;
    }
  }
</style>
