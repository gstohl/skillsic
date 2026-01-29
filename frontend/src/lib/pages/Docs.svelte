<script lang="ts">
  let copiedCmd = '';
  
  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    copiedCmd = id;
    setTimeout(() => copiedCmd = '', 2000);
  }
</script>

<svelte:head>
  <title>Documentation | skillsic</title>
  <meta name="description" content="Learn how to use skillsic - the safety-first skill installer for Claude Code." />
</svelte:head>

<div class="docs">
  <h1 class="title">Documentation</h1>
  <p class="subtitle">Safety-first skill discovery and installation for Claude Code</p>

  <section class="section">
    <h2>Quick Start</h2>
    <p>Install skills safely with a single command:</p>
    <div class="code-block">
      <code>npx skillsic add react</code>
      <button class="copy-btn" on:click={() => copyToClipboard('npx skillsic add react', 'quick')}>
        {copiedCmd === 'quick' ? 'copied!' : 'copy'}
      </button>
    </div>
    <p class="note">This searches skillsic, finds the best safe match, checks its safety rating, and installs it.</p>
  </section>

  <section class="section">
    <h2>What is skillsic?</h2>
    <p>
      <strong>skillsic</strong> is a safety layer for Claude Code skills. Before installing any skill,
      it checks the skill's safety rating from our database of 100k+ analyzed skills.
    </p>
    <div class="features">
      <div class="feature">
        <span class="feature-icon">✓</span>
        <div>
          <strong>Safety First</strong>
          <p>Every skill is analyzed for malicious patterns, security issues, and quality</p>
        </div>
      </div>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <div>
          <strong>AI-Powered Analysis</strong>
          <p>Skills are analyzed by Claude (Haiku/Sonnet/Opus) running in a secure TEE</p>
        </div>
      </div>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <div>
          <strong>Decentralized</strong>
          <p>All data stored on the Internet Computer - no single point of failure</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>CLI Commands</h2>
    
    <h3>Install a skill</h3>
    <div class="code-block">
      <code>npx skillsic add &lt;skill&gt;</code>
      <button class="copy-btn" on:click={() => copyToClipboard('npx skillsic add', 'add')}>
        {copiedCmd === 'add' ? 'copied!' : 'copy'}
      </button>
    </div>
    <p>Searches for a skill, checks safety, and installs if safe. Examples:</p>
    <div class="examples">
      <code>npx skillsic add react</code>
      <code>npx skillsic add typescript</code>
      <code>npx skillsic add vercel-labs/agent-skills/vercel-react-best-practices</code>
    </div>

    <h3>Search for skills</h3>
    <div class="code-block">
      <code>npx skillsic search "react patterns"</code>
      <button class="copy-btn" on:click={() => copyToClipboard('npx skillsic search "react patterns"', 'search')}>
        {copiedCmd === 'search' ? 'copied!' : 'copy'}
      </button>
    </div>
    <p>Shows only analyzed and safe skills by default. Use <code>--all</code> to include unanalyzed skills.</p>

    <h3>Check a skill's safety</h3>
    <div class="code-block">
      <code>npx skillsic check &lt;skill-id&gt;</code>
      <button class="copy-btn" on:click={() => copyToClipboard('npx skillsic check', 'check')}>
        {copiedCmd === 'check' ? 'copied!' : 'copy'}
      </button>
    </div>
    <p>Shows detailed safety report without installing.</p>

    <h3>View platform stats</h3>
    <div class="code-block">
      <code>npx skillsic stats</code>
      <button class="copy-btn" on:click={() => copyToClipboard('npx skillsic stats', 'stats')}>
        {copiedCmd === 'stats' ? 'copied!' : 'copy'}
      </button>
    </div>
  </section>

  <section class="section">
    <h2>Safety Levels</h2>
    <div class="safety-levels">
      <div class="level safe">
        <span class="badge">✓ SAFE</span>
        <p>Analyzed, no issues found. OK to install.</p>
      </div>
      <div class="level caution">
        <span class="badge">⚠ CAUTION</span>
        <p>Minor concerns. Review before installing.</p>
      </div>
      <div class="level warning">
        <span class="badge">⚠ WARNING</span>
        <p>Potential security issues. Use <code>--force</code> to install.</p>
      </div>
      <div class="level danger">
        <span class="badge">✗ DANGER</span>
        <p>Serious issues detected. Installation blocked.</p>
      </div>
      <div class="level unknown">
        <span class="badge">? UNKNOWN</span>
        <p>Not yet analyzed. Request analysis on skillsic.com.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Run Your Own Analysis</h2>
    <p>
      Sign in with Internet Identity and add your Anthropic API key in 
      <a href="/settings">settings</a> to analyze any skill yourself.
    </p>
    <div class="models">
      <div class="model">
        <strong>Haiku</strong>
        <p>Fast, affordable analysis</p>
      </div>
      <div class="model">
        <strong>Sonnet</strong>
        <p>Balanced quality and speed</p>
      </div>
      <div class="model">
        <strong>Opus</strong>
        <p>Deep, thorough analysis</p>
      </div>
    </div>
    <p class="note">
      Your API key is encrypted in your browser and only decrypted inside our secure TEE worker.
      It never touches our servers in plaintext.
    </p>
  </section>

  <section class="section">
    <h2>How It Works</h2>
    <ol class="steps">
      <li>
        <strong>Skill Index</strong>
        <p>We index 100k+ skills from skills.sh and other sources</p>
      </li>
      <li>
        <strong>AI Analysis</strong>
        <p>Claude models analyze each skill for quality, security, and malicious patterns</p>
      </li>
      <li>
        <strong>TEE Security</strong>
        <p>Analysis runs in Phala TEE - your API keys never leave the secure enclave</p>
      </li>
      <li>
        <strong>On-Chain Storage</strong>
        <p>All ratings stored on Internet Computer for decentralized access</p>
      </li>
    </ol>
  </section>

  <section class="section">
    <h2>Links</h2>
    <div class="links">
      <a href="https://www.npmjs.com/package/skillsic" target="_blank">npm package</a>
      <a href="https://skills.sh" target="_blank">skills.sh</a>
      <a href="https://internetcomputer.org" target="_blank">Internet Computer</a>
    </div>
  </section>
</div>

<style>
  .docs {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-md);
  }

  .title {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }

  .subtitle {
    color: var(--text-secondary);
    margin-bottom: var(--space-2xl);
    font-size: var(--font-size-lg);
  }

  .section {
    margin-bottom: var(--space-2xl);
  }

  h2 {
    font-size: var(--font-size-xl);
    color: var(--accent-primary);
    margin-bottom: var(--space-md);
    font-weight: 600;
  }

  h3 {
    font-size: var(--font-size-md);
    color: var(--text-primary);
    margin-top: var(--space-lg);
    margin-bottom: var(--space-sm);
    font-weight: 600;
  }

  p {
    color: var(--text-secondary);
    line-height: 1.7;
    margin-bottom: var(--space-sm);
  }

  .note {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    font-style: italic;
  }

  .code-block {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .code-block code {
    flex: 1;
    color: var(--accent-primary);
  }

  .copy-btn {
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .copy-btn:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .examples {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-tertiary);
    border-radius: 4px;
    margin-bottom: var(--space-md);
  }

  .examples code {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  code {
    font-family: var(--font-mono);
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: var(--font-size-sm);
  }

  .features {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }

  .feature {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .feature-icon {
    color: var(--accent-primary);
    font-size: var(--font-size-lg);
    flex-shrink: 0;
  }

  .feature strong {
    color: var(--text-primary);
    display: block;
    margin-bottom: 4px;
  }

  .feature p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .safety-levels {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .level {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-radius: 4px;
    border-left: 3px solid;
  }

  .level.safe { border-color: #00ff88; }
  .level.caution { border-color: #ffcc00; }
  .level.warning { border-color: #ff8800; }
  .level.danger { border-color: #ff4444; }
  .level.unknown { border-color: #666666; }

  .badge {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 600;
    min-width: 100px;
  }

  .level.safe .badge { color: #00ff88; }
  .level.caution .badge { color: #ffcc00; }
  .level.warning .badge { color: #ff8800; }
  .level.danger .badge { color: #ff4444; }
  .level.unknown .badge { color: #666666; }

  .level p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .models {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
    margin: var(--space-md) 0;
  }

  .model {
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    text-align: center;
  }

  .model strong {
    color: var(--accent-primary);
    display: block;
    margin-bottom: var(--space-xs);
  }

  .model p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .steps {
    list-style: none;
    padding: 0;
    counter-reset: step;
  }

  .steps li {
    counter-increment: step;
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    padding-left: var(--space-md);
    position: relative;
  }

  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    color: var(--accent-primary);
    font-weight: 600;
  }

  .steps li strong {
    color: var(--text-primary);
    display: block;
    margin-bottom: 4px;
  }

  .steps li p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .links {
    display: flex;
    gap: var(--space-lg);
  }

  a {
    color: var(--accent-secondary);
    transition: color 0.15s ease;
  }

  a:hover {
    color: var(--accent-primary);
  }

  @media (max-width: 600px) {
    .models {
      grid-template-columns: 1fr;
    }
  }
</style>
