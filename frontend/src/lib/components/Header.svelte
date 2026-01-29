<script lang="ts">
  import { link } from 'svelte-routing';
  import { isAuthenticated, principalString, hasApiKey, login, logout, getAgent } from '../auth';
  import { hasApiKeyOnCanister } from '../canister';

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
</script>

<header class="header">
  <div class="header-content">
    <div class="logo">
      <span class="logo-bracket">[</span>
      <span class="logo-text">skillsic</span>
      <span class="logo-bracket">]</span>
      <span class="logo-tld">.com</span>
    </div>
    
    <nav class="nav">
      <a href="/" class="nav-link">skills</a>
      <a href="/history" class="nav-link">history</a>
      <a href="/docs" class="nav-link">docs</a>
    </nav>



    <div class="auth">
      <a href="https://github.com/gstohl/skillsic" target="_blank" rel="noopener" class="github-link">github</a>
      {#if $isAuthenticated}
        <div class="user-info">
          <span class="principal">{$principalString}</span>
          <a href="/settings" use:link class="settings-link">settings</a>
          <button class="logout-btn" on:click={handleLogout}>logout</button>
        </div>
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
    align-items: baseline;
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

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-xs);
  }

  .principal {
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .logout-btn,
  .settings-link,
  .github-link {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: 2px;
    transition: color 0.15s ease;
    text-decoration: none;
  }

  .logout-btn:hover,
  .settings-link:hover,
  .github-link:hover {
    color: var(--accent-primary);
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
