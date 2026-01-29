<script lang="ts">
  import { onMount } from 'svelte';
  import { isAuthenticated, userPrincipal, hasApiKey, getAgent } from '../auth';
  import { 
    hasApiKeyOnCanister, 
    removeAnthropicKey,
    isTeeAvailable, 
    getTeeWorkerUrl, 
    encryptApiKeyForTee, 
    setEncryptedKey 
  } from '../canister';
  import { navigate } from 'svelte-routing';

  // Provider configs
  const providers = [
    { 
      id: 'anthropic', 
      name: 'Anthropic', 
      prefix: 'sk-ant-',
      placeholder: 'sk-ant-api03-...',
      url: 'https://console.anthropic.com/settings/keys',
      description: 'Required for skill analysis. Powers Claude models (Haiku, Sonnet, Opus).',
      enabled: true,
    },
    { 
      id: 'openai', 
      name: 'OpenAI', 
      prefix: 'sk-',
      placeholder: 'sk-proj-...',
      url: 'https://platform.openai.com/api-keys',
      description: 'Coming soon. Will enable GPT-4o analysis.',
      enabled: false,
    },
    { 
      id: 'google', 
      name: 'Google AI', 
      prefix: 'AIza',
      placeholder: 'AIzaSy...',
      url: 'https://aistudio.google.com/apikey',
      description: 'Coming soon. Will enable Gemini analysis.',
      enabled: false,
    },
  ];

  // State
  let loading = true;
  let teeEnabled = false;
  let keyStatus: Record<string, boolean> = {};
  let editingProvider: string | null = null;
  let apiKeyInput = '';
  let saving = false;
  let saveError = '';
  let saveStatus = '';
  let deleteConfirm: string | null = null;

  onMount(async () => {
    // Redirect if not authenticated
    if (!$isAuthenticated) {
      navigate('/');
      return;
    }

    // Check TEE availability
    try {
      teeEnabled = await isTeeAvailable();
    } catch {
      teeEnabled = false;
    }

    // Check which keys are set
    await refreshKeyStatus();
    loading = false;
  });

  async function refreshKeyStatus() {
    try {
      const agent = await getAgent();
      if (agent) {
        // For now only Anthropic is supported
        keyStatus['anthropic'] = await hasApiKeyOnCanister(agent);
        hasApiKey.set(keyStatus['anthropic']);
      }
    } catch (e) {
      console.error('Failed to check key status:', e);
    }
  }

  function startEdit(providerId: string) {
    editingProvider = providerId;
    apiKeyInput = '';
    saveError = '';
    saveStatus = '';
  }

  function cancelEdit() {
    editingProvider = null;
    apiKeyInput = '';
    saveError = '';
    saveStatus = '';
  }

  async function saveKey(providerId: string) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Validate prefix
    if (!apiKeyInput.startsWith(provider.prefix)) {
      saveError = `Invalid key format. Must start with "${provider.prefix}"`;
      return;
    }

    saving = true;
    saveError = '';
    saveStatus = '';

    try {
      const agent = await getAgent();
      if (!agent) {
        saveError = 'Not authenticated';
        return;
      }

      if (providerId === 'anthropic') {
        if (teeEnabled) {
          saveStatus = 'Fetching TEE encryption key...';
          const teeUrl = await getTeeWorkerUrl();
          if (!teeUrl) throw new Error('TEE worker URL not configured');
          
          saveStatus = 'Encrypting API key in browser...';
          const encryptedHex = await encryptApiKeyForTee(apiKeyInput, teeUrl);
          
          saveStatus = 'Storing encrypted key on-chain...';
          await setEncryptedKey(agent, encryptedHex);
        } else {
          saveStatus = 'Storing key on-chain...';
          const { setAnthropicKey } = await import('../canister');
          await setAnthropicKey(agent, apiKeyInput);
        }
      }

      keyStatus[providerId] = true;
      hasApiKey.set(true);
      editingProvider = null;
      apiKeyInput = '';
    } catch (e: any) {
      saveError = e.message || 'Failed to save key';
    } finally {
      saving = false;
      saveStatus = '';
    }
  }

  function startDelete(providerId: string) {
    deleteConfirm = providerId;
  }

  function cancelDelete() {
    deleteConfirm = null;
  }

  async function confirmDelete(providerId: string) {
    try {
      const agent = await getAgent();
      if (!agent) return;

      if (providerId === 'anthropic') {
        await removeAnthropicKey(agent);
        keyStatus[providerId] = false;
        hasApiKey.set(false);
      }

      deleteConfirm = null;
    } catch (e: any) {
      console.error('Failed to delete key:', e);
    }
  }

  // Reactive: redirect if logged out
  $: if (!$isAuthenticated && !loading) {
    navigate('/');
  }
</script>

<div class="settings-page">
  <header class="page-header">
    <h1>Settings</h1>
    <p class="subtitle">Manage your API keys and preferences</p>
  </header>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <section class="section">
      <h2 class="section-title">
        <span class="section-icon">[key]</span>
        API Keys
      </h2>
      <p class="section-desc">
        Your API keys are {teeEnabled ? 'encrypted in-browser using TEE enclave keys and stored as encrypted blobs' : 'stored securely'} on the ICP blockchain.
        {#if teeEnabled}
          Only the secure TEE worker can decrypt them.
        {/if}
      </p>

      <div class="providers">
        {#each providers as provider}
          <div class="provider-card" class:disabled={!provider.enabled}>
            <div class="provider-header">
              <div class="provider-info">
                <span class="provider-name">{provider.name}</span>
                {#if keyStatus[provider.id]}
                  <span class="key-badge configured">[configured]</span>
                {:else if provider.enabled}
                  <span class="key-badge not-configured">[not set]</span>
                {:else}
                  <span class="key-badge coming-soon">[coming soon]</span>
                {/if}
              </div>
              {#if provider.enabled}
                <div class="provider-actions">
                  {#if keyStatus[provider.id]}
                    {#if deleteConfirm === provider.id}
                      <span class="delete-confirm">
                        <span>delete?</span>
                        <button class="btn-confirm-yes" on:click={() => confirmDelete(provider.id)}>yes</button>
                        <button class="btn-confirm-no" on:click={cancelDelete}>no</button>
                      </span>
                    {:else}
                      <button class="btn-edit" on:click={() => startEdit(provider.id)}>change</button>
                      <button class="btn-delete" on:click={() => startDelete(provider.id)}>remove</button>
                    {/if}
                  {:else}
                    <button class="btn-add" on:click={() => startEdit(provider.id)}>+ add key</button>
                  {/if}
                </div>
              {/if}
            </div>

            <p class="provider-desc">{provider.description}</p>

            {#if editingProvider === provider.id}
              <div class="key-form">
                <div class="input-group">
                  <span class="input-prefix">$</span>
                  <input
                    type="password"
                    placeholder={provider.placeholder}
                    bind:value={apiKeyInput}
                    class="key-input"
                    disabled={saving}
                  />
                </div>
                {#if saveError}
                  <p class="form-error">{saveError}</p>
                {/if}
                {#if saveStatus}
                  <p class="form-status">{saveStatus}</p>
                {/if}
                <div class="form-footer">
                  <a href={provider.url} target="_blank" rel="noopener" class="get-key-link">
                    Get API key
                  </a>
                  <div class="form-actions">
                    <button class="btn-cancel" on:click={cancelEdit} disabled={saving}>cancel</button>
                    <button class="btn-save" on:click={() => saveKey(provider.id)} disabled={saving || !apiKeyInput}>
                      {saving ? 'saving...' : 'save'}
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">
        <span class="section-icon">[id]</span>
        Account
      </h2>

      <div class="account-info">
        <div class="info-row">
          <span class="info-label">Principal ID</span>
          <code class="info-value">{$userPrincipal?.toString() || 'Unknown'}</code>
        </div>
        <div class="info-row">
          <span class="info-label">Authentication</span>
          <span class="info-value">Internet Identity</span>
        </div>
        <div class="info-row">
          <span class="info-label">TEE Security</span>
          <span class="info-value">{teeEnabled ? 'Enabled (Phala Network)' : 'Disabled'}</span>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .settings-page {
    max-width: 800px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: var(--space-xl);
  }

  .page-header h1 {
    font-size: var(--font-size-xxl);
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }

  .subtitle {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .loading {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl);
  }

  .section {
    margin-bottom: var(--space-xxl);
  }

  .section-title {
    font-size: var(--font-size-lg);
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .section-icon {
    color: var(--accent-primary);
    font-size: var(--font-size-sm);
  }

  .section-desc {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-lg);
    line-height: 1.5;
  }

  .providers {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .provider-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-lg);
  }

  .provider-card.disabled {
    opacity: 0.6;
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .provider-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .provider-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .key-badge {
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .key-badge.configured {
    color: var(--accent-primary);
    background: var(--accent-dim);
  }

  .key-badge.not-configured {
    color: var(--text-muted);
    background: var(--bg-primary);
  }

  .key-badge.coming-soon {
    color: var(--accent-secondary);
    background: rgba(0, 204, 255, 0.1);
  }

  .provider-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .provider-desc {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .btn-add, .btn-edit, .btn-delete {
    background: transparent;
    font-size: var(--font-size-xs);
    padding: 4px 8px;
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .btn-add {
    color: var(--accent-primary);
    border: 1px solid var(--accent-dim);
  }

  .btn-add:hover {
    background: var(--accent-dim);
  }

  .btn-edit {
    color: var(--text-secondary);
  }

  .btn-edit:hover {
    color: var(--accent-primary);
  }

  .btn-delete {
    color: var(--text-muted);
  }

  .btn-delete:hover {
    color: #ff4444;
  }

  .delete-confirm {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-xs);
    color: #ff4444;
  }

  .btn-confirm-yes, .btn-confirm-no {
    background: transparent;
    font-size: var(--font-size-xs);
    padding: 2px 6px;
  }

  .btn-confirm-yes {
    color: #ff4444;
  }

  .btn-confirm-yes:hover {
    background: rgba(255, 68, 68, 0.1);
  }

  .btn-confirm-no {
    color: var(--text-muted);
  }

  .btn-confirm-no:hover {
    color: var(--text-primary);
  }

  .key-form {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border-color);
  }

  .input-group {
    display: flex;
    align-items: center;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .input-group:focus-within {
    border-color: var(--accent-primary);
    box-shadow: var(--glow);
  }

  .input-prefix {
    color: var(--accent-primary);
    margin-right: var(--space-sm);
  }

  .key-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    outline: none;
  }

  .form-error {
    color: #ff4444;
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 3px;
  }

  .form-status {
    color: var(--accent-primary);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(0, 255, 136, 0.05);
    border: 1px solid rgba(0, 255, 136, 0.2);
    border-radius: 3px;
  }

  .form-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .get-key-link {
    font-size: var(--font-size-xs);
    color: var(--accent-secondary);
  }

  .get-key-link:hover {
    color: var(--accent-primary);
  }

  .form-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
  }

  .btn-cancel:hover {
    color: var(--text-primary);
  }

  .btn-save {
    background: var(--accent-primary);
    color: var(--bg-primary);
    font-size: var(--font-size-sm);
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    font-weight: 600;
  }

  .btn-save:hover {
    opacity: 0.9;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .account-info {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-lg);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
  }

  .info-row:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }

  .info-label {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .info-value {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  code.info-value {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
