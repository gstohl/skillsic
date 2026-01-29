<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let address: string;
  export let size: number = 16;
  
  const dispatch = createEventDispatcher();
  
  let showDropdown = false;
  let copied = false;
  
  // Generate a deterministic hash from the address
  function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  // Generate pixel art colors and pattern from address
  function generatePixelArt(addr: string): string[][] {
    const hash = hashCode(addr);
    const grid: string[][] = [];
    
    // Color palette - terminal-friendly colors
    const colors = [
      '#00ff9f', // accent green
      '#ff6b6b', // red
      '#4ecdc4', // teal
      '#ffe66d', // yellow
      '#a855f7', // purple
      '#f472b6', // pink
      '#38bdf8', // blue
      '#fb923c', // orange
    ];
    
    // Pick 2-3 colors based on hash
    const color1 = colors[hash % colors.length];
    const color2 = colors[(hash >> 4) % colors.length];
    const bgColor = 'transparent';
    
    // Generate 8x8 symmetric pattern (we mirror horizontally for aesthetics)
    for (let y = 0; y < 8; y++) {
      const row: string[] = [];
      for (let x = 0; x < 4; x++) {
        // Use different bits of the address to determine pixel
        const charIndex = (y * 4 + x) % addr.length;
        const charCode = addr.charCodeAt(charIndex);
        const bit = (charCode + hash + y * x) % 3;
        
        if (bit === 0) {
          row.push(bgColor);
        } else if (bit === 1) {
          row.push(color1);
        } else {
          row.push(color2);
        }
      }
      // Mirror horizontally for symmetry
      grid.push([...row, ...row.reverse()]);
    }
    
    return grid;
  }
  
  function generateSVG(addr: string): string {
    const grid = generatePixelArt(addr);
    const pixelSize = size / 8;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges">`;
    
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] !== 'transparent') {
          svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="${grid[y][x]}"/>`;
        }
      }
    }
    
    svg += '</svg>';
    return svg;
  }
  
  function toggleDropdown() {
    showDropdown = !showDropdown;
  }
  
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-container')) {
      showDropdown = false;
    }
  }
  
  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }
  
  function handleLogout() {
    showDropdown = false;
    dispatch('logout');
  }
  
  function handleSettings() {
    showDropdown = false;
    dispatch('settings');
  }
  
  $: svgContent = generateSVG(address);
</script>

<svelte:window on:click={handleClickOutside} />

<div class="avatar-container">
  <button class="avatar-btn" on:click={toggleDropdown} title="Account menu">
    {@html svgContent}
  </button>
  
  {#if showDropdown}
    <div class="dropdown">
      <div class="dropdown-header">
        <span class="label">Principal ID</span>
        <button class="copy-btn" on:click={copyAddress}>
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
      <div class="address">{address}</div>
      <div class="dropdown-divider"></div>
      <button class="dropdown-item" on:click={handleSettings}>
        settings
      </button>
      <button class="dropdown-item logout" on:click={handleLogout}>
        logout
      </button>
    </div>
  {/if}
</div>

<style>
  .avatar-container {
    position: relative;
  }
  
  .avatar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 4px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .avatar-btn:hover {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }
  
  .avatar-btn :global(svg) {
    display: block;
  }
  
  .dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 280px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: var(--space-sm);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
  }
  
  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xs);
  }
  
  .label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .copy-btn {
    font-size: var(--font-size-xs);
    color: var(--accent-primary);
    background: transparent;
    padding: 2px 6px;
    border-radius: 2px;
    transition: all 0.15s ease;
  }
  
  .copy-btn:hover {
    background: var(--accent-dim);
  }
  
  .address {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    word-break: break-all;
    padding: var(--space-xs);
    background: var(--bg-tertiary);
    border-radius: 4px;
    line-height: 1.4;
  }
  
  .dropdown-divider {
    height: 1px;
    background: var(--border-color);
    margin: var(--space-sm) 0;
  }
  
  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: transparent;
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  
  .dropdown-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .dropdown-item.logout:hover {
    color: var(--danger);
  }
</style>
