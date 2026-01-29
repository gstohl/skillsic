<script lang="ts">
  import { searchQuery, selectedCategory, sortBy, categories } from '../store';
  import type { SortOption } from '../types';

  let inputValue = '';
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    inputValue = target.value;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery.set(inputValue);
    }, 200);
  }

  function clearSearch() {
    inputValue = '';
    searchQuery.set('');
  }

  function handleCategoryChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedCategory.set(target.value || null);
  }

  function handleSortChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    sortBy.set(target.value as SortOption);
  }
</script>

<div class="search-container">
  <div class="search-box">
    <span class="search-prompt">$</span>
    <input
      type="text"
      placeholder="search skills..."
      value={inputValue}
      on:input={handleInput}
      class="search-input"
    />
    {#if inputValue}
      <button class="clear-btn" on:click={clearSearch}>x</button>
    {/if}
  </div>

  <div class="filters">
    <div class="filter">
      <label class="filter-label">cat:</label>
      <select class="filter-select" on:change={handleCategoryChange}>
        <option value="">all</option>
        {#each $categories as cat}
          <option value={cat}>{cat}</option>
        {/each}
      </select>
    </div>

    <div class="filter">
      <label class="filter-label">sort:</label>
      <select class="filter-select" on:change={handleSortChange}>
        <option value="rating">rating</option>
        <option value="installs">installs</option>
        <option value="stars">stars</option>
        <option value="recent">recent</option>
        <option value="name">name</option>
      </select>
    </div>
  </div>
</div>

<style>
  .search-container {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex-wrap: wrap;
  }

  .search-box {
    flex: 1;
    min-width: 300px;
    display: flex;
    align-items: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .search-box:focus-within {
    border-color: var(--accent-primary);
    box-shadow: var(--glow);
  }

  .search-prompt {
    color: var(--accent-primary);
    margin-right: var(--space-sm);
    font-weight: 600;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size-md);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .clear-btn {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    padding: 2px 6px;
    border-radius: 2px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .clear-btn:hover {
    color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .filters {
    display: flex;
    gap: var(--space-md);
  }

  .filter {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .filter-label {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .filter-select {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .filter-select:hover,
  .filter-select:focus {
    border-color: var(--accent-primary);
  }

  @media (max-width: 600px) {
    .search-box {
      min-width: 100%;
    }
    
    .filters {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
