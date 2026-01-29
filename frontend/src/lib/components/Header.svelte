<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { isAuthenticated, principalString, hasApiKey, login, logout, getAgent } from '../auth';
  import { hasApiKeyOnCanister } from '../canister';
  import PixelAvatar from './PixelAvatar.svelte';

  async function handleLogin() {
    const success = await login();
    if (success) {
      // Check if user already has an API key on the canister
      try {
        const agent = await getAgent();
        if (agent) {
          const hasKey = await hasApiKeyOnCanister(agent);
          hasApiKey.set(hasKey);
        }
      } catch (e) {
        console.error('Failed to check API key status:', e);
      }
    }
  }

  async function handleLogout() {
    await logout();
  }

  function goToSettings() {
    navigate('/settings');
  }
</script>

<header class="header">
  <div class="header-content">
    <div class="logo">
      <span class="logo-bracket">[</span>
      <span class="logo-text">skillsic</span>
      <span class="logo-bracket">]</span>
      <span class="logo-tld">.com</span>
      <span class="beta-badge">beta</span>
      <a href="https://github.com/gstohl/skillsic" target="_blank" rel="noopener" class="github-link" title="View on GitHub">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
      </a>
    </div>
    
    <nav class="nav">
      <a href="/" class="nav-link">skills</a>
      <a href="/history" class="nav-link">history</a>
      <a href="/queue" class="nav-link">queue</a>
      <a href="/docs" class="nav-link">docs</a>
    </nav>



    <div class="auth">
      {#if $isAuthenticated && $principalString}
        <PixelAvatar 
          address={$principalString} 
          size={20} 
          on:logout={handleLogout}
          on:settings={goToSettings}
        />
      {:else}
        <button class="login-btn" on:click={handleLogin}>
          <span class="login-icon">II</span>
          sign in
        </button>
      {/if}
    </div>
  </div>
</header>



<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    padding: var(--space-md) var(--space-xl);
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
  }

  .logo {
    font-size: var(--font-size-xl);
    font-weight: 700;
    display: flex;
    align-items: center;
  }

  .logo-bracket {
    color: var(--accent-primary);
  }

  .logo-text {
    color: var(--text-primary);
  }

  .logo-tld {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    margin-left: 2px;
  }

  .beta-badge {
    font-size: 9px;
    font-weight: 600;
    color: var(--bg-primary);
    background: var(--accent-secondary);
    padding: 2px 5px;
    border-radius: 3px;
    margin-left: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  .logo .github-link {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    margin-left: 8px;
    transition: color 0.15s ease;
  }

  .logo .github-link:hover {
    color: var(--accent-primary);
  }

  .nav {
    display: flex;
    gap: var(--space-lg);
  }

  .nav-link {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    transition: color 0.15s ease;
  }

  .nav-link:hover,
  .nav-link.active {
    color: var(--accent-primary);
  }

  .auth {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .login-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg-secondary);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    font-size: var(--font-size-sm);
    transition: all 0.15s ease;
  }

  .login-btn:hover {
    background: var(--accent-dim);
  }

  .login-icon {
    font-weight: 700;
    font-size: var(--font-size-xs);
    padding: 2px 4px;
    background: var(--accent-primary);
    color: var(--bg-primary);
    border-radius: 2px;
  }

  .github-link {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s ease;
    text-decoration: none;
  }

  .github-link:hover {
    color: var(--accent-primary);
  }

  .github-link svg {
    display: block;
  }

  @media (max-width: 900px) {
    .header-content {
      flex-wrap: wrap;
      gap: var(--space-md);
    }

    .nav {
      order: 3;
      width: 100%;
      justify-content: center;
    }

    .stats {
      display: none;
    }
  }
</style>
