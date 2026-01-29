<script lang="ts">
  let copied = '';

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    copied = id;
    setTimeout(() => copied = '', 2000);
  }
</script>

<svelte:head>
  <title>API Reference | skillsic - Skills API for AI Coding Agents</title>
  <meta name="description" content="skillsic REST API reference. Query skills for Claude Code, Cursor, Windsurf & Cline. Analysis results and metadata from ICP." />
</svelte:head>

<div class="api">
  <h1 class="title">
    <span class="prompt">$</span> curl api.skillsic.com
  </h1>

  <section class="section">
    <h2>BASE URL</h2>
    <div class="endpoint">
      <code>https://api.skillsic.com/v1</code>
    </div>
  </section>

  <section class="section">
    <h2>ENDPOINTS</h2>

    <div class="endpoint-group">
      <h3>GET /skills</h3>
      <p>List all indexed skills</p>
      <div class="code-block">
        <pre>curl https://api.skillsic.com/v1/skills</pre>
        <button class="copy-btn" on:click={() => copy('curl https://api.skillsic.com/v1/skills', 'list')}>
          {copied === 'list' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /skills/search?q=:query</h3>
      <p>Search skills by keyword</p>
      <div class="code-block">
        <pre>curl "https://api.skillsic.com/v1/skills/search?q=rust"</pre>
        <button class="copy-btn" on:click={() => copy('curl "https://api.skillsic.com/v1/skills/search?q=rust"', 'search')}>
          {copied === 'search' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /skills/:id</h3>
      <p>Get skill by ID (owner/repo)</p>
      <div class="code-block">
        <pre>curl https://api.skillsic.com/v1/skills/vercel-labs/agent-skills</pre>
        <button class="copy-btn" on:click={() => copy('curl https://api.skillsic.com/v1/skills/vercel-labs/agent-skills', 'get')}>
          {copied === 'get' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /skills/top?limit=:n</h3>
      <p>Get top rated skills</p>
      <div class="code-block">
        <pre>curl "https://api.skillsic.com/v1/skills/top?limit=10"</pre>
        <button class="copy-btn" on:click={() => copy('curl "https://api.skillsic.com/v1/skills/top?limit=10"', 'top')}>
          {copied === 'top' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /skills/category/:cat</h3>
      <p>Get skills by category</p>
      <div class="code-block">
        <pre>curl https://api.skillsic.com/v1/skills/category/web</pre>
        <button class="copy-btn" on:click={() => copy('curl https://api.skillsic.com/v1/skills/category/web', 'cat')}>
          {copied === 'cat' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /categories</h3>
      <p>List all categories</p>
      <div class="code-block">
        <pre>curl https://api.skillsic.com/v1/categories</pre>
        <button class="copy-btn" on:click={() => copy('curl https://api.skillsic.com/v1/categories', 'cats')}>
          {copied === 'cats' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>

    <div class="endpoint-group">
      <h3>GET /stats</h3>
      <p>Get platform stats</p>
      <div class="code-block">
        <pre>curl https://api.skillsic.com/v1/stats</pre>
        <button class="copy-btn" on:click={() => copy('curl https://api.skillsic.com/v1/stats', 'stats')}>
          {copied === 'stats' ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>MCP SERVER</h2>
    <p>Install the skillsic skill to enable MCP access:</p>
    <div class="code-block">
      <pre>npx skillsic add skillsic/skillsic</pre>
      <button class="copy-btn" on:click={() => copy('npx skillsic add skillsic/skillsic', 'mcp')}>
        {copied === 'mcp' ? 'copied!' : 'copy'}
      </button>
    </div>
    <p class="note">This installs the skill and configures the MCP server automatically.</p>
  </section>

  <section class="section">
    <h2>CANISTER (ICP)</h2>
    <p>Direct canister calls via dfx:</p>
    <div class="code-block wide">
      <pre>dfx canister --network ic call skillsic_backend get_stats '()'</pre>
      <button class="copy-btn" on:click={() => copy("dfx canister --network ic call skillsic_backend get_stats '()'", 'dfx')}>
        {copied === 'dfx' ? 'copied!' : 'copy'}
      </button>
    </div>
  </section>

  <section class="section">
    <h2>RESPONSE FORMAT</h2>
    <div class="code-block wide">
      <pre>{`{
  "id": "vercel-labs/agent-skills",
  "name": "Agent Skills",
  "description": "...",
  "owner": "vercel-labs",
  "repo": "agent-skills",
  "stars": 1240,
  "analysis": {
    "overall_rating": 4.7,
    "quality_score": 88,
    "has_mcp": false,
    "primary_category": "web",
    "tags": ["vercel", "nextjs"],
    "summary": "...",
    "strengths": [...],
    "weaknesses": [...],
    "use_cases": [...]
  },
  "install_count": 12847
}`}</pre>
    </div>
  </section>
</div>

<style>
  .api {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-xl) 0;
  }

  .title {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-xl);
    color: var(--text-primary);
  }

  .prompt {
    color: var(--accent-primary);
  }

  .section {
    margin-bottom: var(--space-2xl);
  }

  h2 {
    font-size: var(--font-size-md);
    color: var(--accent-primary);
    margin-bottom: var(--space-md);
    font-weight: 600;
  }

  h3 {
    font-size: var(--font-size-sm);
    color: var(--accent-secondary);
    margin-bottom: var(--space-xs);
    font-family: var(--font-mono);
  }

  p {
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .note {
    margin-top: var(--space-md);
  }

  .endpoint {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    display: inline-block;
  }

  .endpoint code {
    color: var(--accent-primary);
    background: transparent;
    padding: 0;
  }

  .endpoint-group {
    margin-bottom: var(--space-lg);
    padding-left: var(--space-md);
    border-left: 2px solid var(--border-color);
  }

  .code-block {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .code-block.wide {
    flex-direction: column;
  }

  .code-block.wide .copy-btn {
    align-self: flex-end;
  }

  .code-block pre {
    margin: 0;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    overflow-x: auto;
    flex: 1;
  }

  .copy-btn {
    background: var(--bg-tertiary);
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: var(--font-size-xs);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .copy-btn:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }
</style>
