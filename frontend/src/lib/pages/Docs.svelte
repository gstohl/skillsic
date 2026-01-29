<script lang="ts">
  import { onMount } from 'svelte';
  
  let copiedCmd = '';
  let activeSection = 'quick-start';
  
  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    copiedCmd = id;
    setTimeout(() => copiedCmd = '', 2000);
  }

  const sections = [
    { id: 'quick-start', label: 'Quick Start' },
    { id: 'what-is', label: 'What is skillsic?' },
    { id: 'cli-commands', label: 'CLI Commands' },
    { id: 'safety-levels', label: 'Safety Levels' },
    { id: 'run-analysis', label: 'Run Your Own Analysis' },
    { id: 'how-it-works', label: 'How It Works' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'links', label: 'Links' },
  ];

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      activeSection = id;
    }
  }

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            activeSection = entry.target.id;
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Documentation | skillsic - Skills for Claude Code, Cursor, Windsurf & Cline</title>
  <meta name="description" content="Learn how to install and analyze skills for Claude Code, Cursor, Windsurf, Cline and other AI coding agents. CLI commands, safety levels, and TEE-secured analysis." />
</svelte:head>

<div class="docs-layout">
  <nav class="docs-nav">
    <div class="nav-title">Contents</div>
    {#each sections as section}
      <button 
        class="nav-item" 
        class:active={activeSection === section.id}
        on:click={() => scrollToSection(section.id)}
      >
        {section.label}
      </button>
    {/each}
  </nav>

  <div class="docs-content">
    <h1 class="title">Documentation</h1>
    <p class="subtitle">Safety-first skill discovery and installation for AI coding agents</p>

    <section id="quick-start" class="section">
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

    <section id="what-is" class="section">
      <h2>What is skillsic?</h2>
      <p>
        <strong>skillsic</strong> is a safety layer for AI coding agent skills. Whether you're using 
        Claude Code, Cursor, Windsurf, Cline, or any other AI coding assistant that supports skills,
        skillsic checks the skill's safety rating before installation from our database of 100k+ analyzed skills.
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
            <p>Skills are analyzed by Claude (Haiku/Opus) running in a secure TEE</p>
          </div>
        </div>
        <div class="feature">
          <span class="feature-icon">✓</span>
          <div>
            <strong>Decentralized</strong>
            <p>All data stored on the Internet Computer - no single point of failure</p>
          </div>
        </div>
        <div class="feature">
          <span class="feature-icon">✓</span>
          <div>
            <strong>Agent Agnostic</strong>
            <p>Works with any AI coding agent that uses SKILL.md or similar skill formats</p>
          </div>
        </div>
      </div>
    </section>

    <section id="cli-commands" class="section">
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

    <section id="safety-levels" class="section">
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

    <section id="run-analysis" class="section">
      <h2>Run Your Own Analysis</h2>
      <p>
        Sign in with Internet Identity and add your Anthropic API key in 
        <a href="/settings">settings</a> to analyze any skill yourself.
      </p>
      <div class="models">
        <div class="model">
          <strong>Haiku 4.5</strong>
          <p>Fast, affordable analysis</p>
        </div>
        <div class="model">
          <strong>Opus 4.5</strong>
          <p>Deep, thorough analysis</p>
        </div>
      </div>
      <p class="note">
        Your API key is encrypted in your browser and only decrypted inside our secure TEE worker.
        It never touches our servers in plaintext.
      </p>
    </section>

    <section id="how-it-works" class="section">
      <h2>How It Works</h2>
      
      <div class="architecture-diagram">
        <svg viewBox="0 0 900 420" class="diagram-svg">
          <!-- User/CLI -->
          <rect x="20" y="160" width="100" height="70" rx="8" fill="var(--bg-secondary)" stroke="var(--border-color)" stroke-width="2"/>
          <text x="70" y="190" text-anchor="middle" fill="var(--text-primary)" font-size="13" font-weight="600">User</text>
          <text x="70" y="208" text-anchor="middle" fill="var(--text-muted)" font-size="10">npx skillsic</text>
          
          <!-- ICP Canister -->
          <rect x="170" y="110" width="150" height="170" rx="8" fill="var(--bg-secondary)" stroke="var(--accent-primary)" stroke-width="2"/>
          <text x="245" y="138" text-anchor="middle" fill="var(--accent-primary)" font-size="13" font-weight="600">Internet Computer</text>
          <rect x="182" y="150" width="126" height="45" rx="4" fill="var(--bg-tertiary)" stroke="var(--border-color)"/>
          <text x="245" y="172" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Skill Database</text>
          <text x="245" y="186" text-anchor="middle" fill="var(--text-muted)" font-size="9">100k+ skills</text>
          <rect x="182" y="202" width="126" height="45" rx="4" fill="var(--bg-tertiary)" stroke="var(--border-color)"/>
          <text x="245" y="224" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Analysis Results</text>
          <text x="245" y="238" text-anchor="middle" fill="var(--text-muted)" font-size="9">ratings & flags</text>
          
          <!-- Phala TEE -->
          <rect x="370" y="110" width="150" height="170" rx="8" fill="var(--bg-secondary)" stroke="var(--accent-secondary)" stroke-width="2"/>
          <text x="445" y="138" text-anchor="middle" fill="var(--accent-secondary)" font-size="13" font-weight="600">Phala TEE</text>
          <rect x="382" y="150" width="126" height="45" rx="4" fill="var(--bg-tertiary)" stroke="var(--border-color)"/>
          <text x="445" y="172" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Analysis Worker</text>
          <text x="445" y="186" text-anchor="middle" fill="var(--text-muted)" font-size="9">secure enclave</text>
          <rect x="382" y="202" width="126" height="45" rx="4" fill="var(--bg-tertiary)" stroke="var(--border-color)"/>
          <text x="445" y="224" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Key Encryption</text>
          <text x="445" y="238" text-anchor="middle" fill="var(--text-muted)" font-size="9">AES-256-GCM</text>
          
          <!-- AI Providers -->
          <rect x="570" y="110" width="130" height="100" rx="8" fill="var(--bg-secondary)" stroke="#a855f7" stroke-width="2"/>
          <text x="635" y="138" text-anchor="middle" fill="#a855f7" font-size="13" font-weight="600">AI Providers</text>
          <text x="635" y="162" text-anchor="middle" fill="var(--text-secondary)" font-size="11">Anthropic</text>
          <text x="635" y="180" text-anchor="middle" fill="var(--text-muted)" font-size="10">Claude Haiku/Opus</text>
          <text x="635" y="198" text-anchor="middle" fill="var(--text-muted)" font-size="9">(more coming)</text>
          
          <!-- GitHub -->
          <rect x="570" y="230" width="130" height="70" rx="8" fill="var(--bg-secondary)" stroke="var(--border-color)" stroke-width="2"/>
          <text x="635" y="260" text-anchor="middle" fill="var(--text-primary)" font-size="13" font-weight="600">GitHub</text>
          <text x="635" y="278" text-anchor="middle" fill="var(--text-muted)" font-size="10">SKILL.md files</text>
          
          <!-- Arrows -->
          <!-- User to ICP -->
          <path d="M 120 195 L 160 195" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
          <text x="140" y="187" text-anchor="middle" fill="var(--text-muted)" font-size="8">query</text>
          
          <!-- ICP to TEE -->
          <path d="M 320 195 L 360 195" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
          <text x="340" y="187" text-anchor="middle" fill="var(--text-muted)" font-size="8">analyze</text>
          
          <!-- TEE to AI Providers -->
          <path d="M 520 160 L 560 160" stroke="#a855f7" stroke-width="2" fill="none" marker-end="url(#arrowhead-purple)"/>
          <text x="540" y="152" text-anchor="middle" fill="var(--text-muted)" font-size="8">API call</text>
          
          <!-- TEE to GitHub -->
          <path d="M 520 230 L 560 260" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
          <text x="530" y="255" text-anchor="middle" fill="var(--text-muted)" font-size="8">fetch</text>
          
          <!-- TEE back to ICP -->
          <path d="M 370 260 L 320 260" stroke="var(--accent-primary)" stroke-width="2" fill="none" marker-end="url(#arrowhead-green)" stroke-dasharray="5,3"/>
          <text x="345" y="275" text-anchor="middle" fill="var(--text-muted)" font-size="8">store</text>
          
          <!-- Arrow markers -->
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)"/>
            </marker>
            <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent-primary)"/>
            </marker>
            <marker id="arrowhead-purple" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#a855f7"/>
            </marker>
          </defs>
          
          <!-- Flow numbers -->
          <circle cx="140" cy="195" r="9" fill="var(--accent-primary)"/>
          <text x="140" y="199" text-anchor="middle" fill="var(--bg-primary)" font-size="9" font-weight="600">1</text>
          
          <circle cx="340" cy="195" r="9" fill="var(--accent-primary)"/>
          <text x="340" y="199" text-anchor="middle" fill="var(--bg-primary)" font-size="9" font-weight="600">2</text>
          
          <circle cx="540" cy="160" r="9" fill="var(--accent-primary)"/>
          <text x="540" y="164" text-anchor="middle" fill="var(--bg-primary)" font-size="9" font-weight="600">3</text>
          
          <circle cx="540" cy="245" r="9" fill="var(--accent-primary)"/>
          <text x="540" y="249" text-anchor="middle" fill="var(--bg-primary)" font-size="9" font-weight="600">4</text>
          
          <circle cx="345" cy="260" r="9" fill="var(--accent-primary)"/>
          <text x="345" y="264" text-anchor="middle" fill="var(--bg-primary)" font-size="9" font-weight="600">5</text>
          
          <!-- Legend -->
          <text x="350" y="350" text-anchor="middle" fill="var(--text-secondary)" font-size="11">
            1. Query  →  2. Request analysis  →  3. Call AI  →  4. Fetch SKILL.md  →  5. Store on-chain
          </text>
        </svg>
      </div>
      
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

    <section id="roadmap" class="section">
      <h2>Roadmap</h2>
      <p>Upcoming features we're working on:</p>
      <div class="roadmap">
        <div class="roadmap-item">
          <span class="roadmap-status planned">[planned]</span>
          <div class="roadmap-content">
            <strong>DFX CLI Authentication</strong>
            <p>Authenticate your CLI with dfx for automatic analysis calls without manual API key setup</p>
          </div>
        </div>
        <div class="roadmap-item">
          <span class="roadmap-status planned">[planned]</span>
          <div class="roadmap-content">
            <strong>Pay-per-Analysis</strong>
            <p>Use different payment methods to analyze skills via the platform's shared API keys - no need to bring your own</p>
          </div>
        </div>
        <div class="roadmap-item">
          <span class="roadmap-status planned">[planned]</span>
          <div class="roadmap-content">
            <strong>MCP Server Integration</strong>
            <p>Direct integration with MCP servers for enhanced AI agent capabilities</p>
          </div>
        </div>
      </div>
    </section>

    <section id="links" class="section">
      <h2>Links</h2>
      <div class="links">
        <a href="https://www.npmjs.com/package/skillsic" target="_blank">npm package</a>
        <a href="https://skills.sh" target="_blank">skills.sh</a>
        <a href="https://internetcomputer.org" target="_blank">Internet Computer</a>
      </div>
    </section>
  </div>
</div>

<style>
  .docs-layout {
    display: flex;
    gap: var(--space-xl);
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-md);
  }

  .docs-nav {
    position: sticky;
    top: 80px;
    width: 180px;
    flex-shrink: 0;
    height: fit-content;
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .nav-title {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-sm);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--border-color);
  }

  .nav-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: 2px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .nav-item.active {
    color: var(--accent-primary);
    background: var(--accent-dim);
  }

  .docs-content {
    flex: 1;
    min-width: 0;
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
    scroll-margin-top: 100px;
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

  .architecture-diagram {
    margin: var(--space-lg) 0;
    padding: var(--space-md);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow-x: auto;
  }

  .diagram-svg {
    width: 100%;
    max-width: 900px;
    height: auto;
    min-height: 380px;
    display: block;
    margin: 0 auto;
  }

  .models {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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

  .roadmap {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }

  .roadmap-item {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    align-items: flex-start;
  }

  .roadmap-status {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .roadmap-status.planned {
    color: var(--accent-secondary);
    background: rgba(0, 204, 255, 0.1);
    border: 1px solid rgba(0, 204, 255, 0.3);
  }

  .roadmap-status.in-progress {
    color: var(--accent-primary);
    background: rgba(0, 255, 136, 0.1);
    border: 1px solid rgba(0, 255, 136, 0.3);
  }

  .roadmap-status.done {
    color: var(--text-muted);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
  }

  .roadmap-content strong {
    color: var(--text-primary);
    display: block;
    margin-bottom: 4px;
  }

  .roadmap-content p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  @media (max-width: 900px) {
    .docs-layout {
      flex-direction: column;
    }

    .docs-nav {
      position: static;
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
      padding: var(--space-sm);
    }

    .nav-title {
      width: 100%;
      margin-bottom: var(--space-xs);
      border-bottom: none;
    }

    .nav-item {
      width: auto;
      padding: var(--space-xs) var(--space-sm);
      margin-bottom: 0;
      font-size: var(--font-size-xs);
    }
  }

  @media (max-width: 600px) {
    .models {
      grid-template-columns: 1fr;
    }

    .roadmap-item {
      flex-direction: column;
      gap: var(--space-sm);
    }

    .links {
      flex-direction: column;
      gap: var(--space-sm);
    }
  }
</style>
