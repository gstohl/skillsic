# skillsic

> Safety-first skill discovery for AI coding agents, powered by ICP + Phala TEE

**[skillsic.com](https://skillsic.com)** is a community-driven curation platform for AI coding agent skills. Whether you're using Claude Code, Cursor, Windsurf, Cline, or any other AI coding assistant - skillsic helps you find and install skills safely.

We've indexed 104k+ skills from the ecosystem. Anyone can analyze them using their own API key, and all analysis results are stored on-chain for everyone to benefit from.

## How It Works

1. **Browse** 104k+ indexed skills at [skillsic.com](https://skillsic.com)
2. **Analyze** any skill using your own Anthropic API key (encrypted in-browser, processed in TEE)
3. **Benefit** from community analysis - all results stored on-chain permanently
4. **Install** safely with `npx skillsic add` - warns on dangerous, blocks malicious

## Quick Start

```bash
# Search and install skills with safety checks
npx skillsic add react

# Search for skills
npx skillsic search "typescript patterns"

# Check a skill's safety rating
npx skillsic check owner/repo

# View platform stats
npx skillsic stats
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   skillsic.com  │────▶│  ICP Canister    │────▶│   Phala TEE     │
│   (Frontend)    │     │  (On-Chain DB)   │     │   (AI Analysis) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │     Your API key      │                        │
        │   (encrypted in TEE)  │                        ▼
        ▼                       ▼                ┌─────────────────┐
┌─────────────────┐     ┌──────────────────┐     │  AI Providers   │
│  npm: skillsic  │     │  Analysis stored │     │  (Anthropic)    │
│  (CLI Tool)     │     │  on-chain forever│     └─────────────────┘
└─────────────────┘     └──────────────────┘
```

## Key Features

- **Agent Agnostic**: Works with Claude Code, Cursor, Windsurf, Cline, and any SKILL.md-compatible agent
- **Community-Powered Analysis**: Use your API key to analyze skills, results benefit everyone
- **On-Chain Storage**: All analysis history stored permanently on ICP
- **TEE Security**: Your API key is encrypted in-browser, decrypted only inside Phala TEE
- **Multi-Model Support**: Analyze with Haiku 4.5 (fast) or Opus 4.5 (thorough)
- **Analysis History**: See how ratings evolved over time with different models
- **Builder Profiles**: View all skills by a specific author
- **Job Queue**: Real-time view of analysis and enrichment jobs
- **Consistent Identity**: Same principal across skillsic.com, www.skillsic.com, and canister URLs

## Components

### `/canister` - ICP Backend (Rust)
- Skill index storage (104k+ skills from skills.sh ecosystem)
- On-chain analysis history (immutable, transparent)
- Multi-model tracking (Haiku → Opus)
- TEE worker authentication
- Job queue for async analysis/enrichment

### `/frontend` - Web UI (Svelte + TypeScript)
- Browse & search skills at [skillsic.com](https://skillsic.com)
- Enhanced AI model selection with cost/speed estimates
- Trigger analysis with your own API key
- View community analysis & ratings
- Builder profiles and job queue monitoring
- Terminal-inspired aesthetic

### `/tee-worker` - Phala TEE Worker (TypeScript)
- Runs Claude analysis in Trusted Execution Environment
- Your API key never leaves the secure enclave
- Verifiable attestation
- Results submitted back to ICP canister

### `/npm-package` - CLI Tool (`skillsic`)
- `npx skillsic add <skill>` - Search, check safety, install
- `npx skillsic search <query>` - Find skills
- `npx skillsic check <skill-id>` - Check safety rating
- Blocks dangerous skills, warns on unknown

### `/mcp` - MCP Server (experimental)
- Model Context Protocol server for AI agents
- Search, rate, and install skills programmatically

### `/skillsic` - Meta Skill
- SKILL.md that teaches AI coding agents how to use skillsic

## Safety Ratings

| Rating | Score | Meaning |
|--------|-------|---------|
| SAFE | 4.5+ | Thoroughly reviewed, no concerns |
| OK | 3.5-4.4 | Generally safe with minor notes |
| CAUTION | 2.5-3.4 | Review recommended before use |
| WARNING | 1.5-2.4 | Significant concerns identified |
| DANGER | <1.5 | Do not install |

## Supported AI Coding Agents

skillsic works with any AI coding assistant that uses SKILL.md or similar skill formats:

- **Claude Code** - Anthropic's coding assistant
- **Cursor** - AI-powered code editor
- **Windsurf** - Codeium's AI IDE
- **Cline** - VS Code AI assistant
- **And more** - Any agent supporting SKILL.md format

## Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Build frontend
cd frontend && npm run build

# Deploy to IC (requires dfx + identity)
dfx deploy --network ic --identity Deployment

# npm package
cd npm-package && npm install && npm run build

# TEE worker (local)
cd tee-worker && npm install && npm run dev
```

## Deployment

| Resource | Value |
|----------|-------|
| Frontend | [skillsic.com](https://skillsic.com) |
| Frontend Canister | `fh3vn-4yaaa-aaaak-qvwga-cai` |
| Backend Canister | `fs4ea-5qaaa-aaaak-qvwfq-cai` |
| npm Package | `skillsic` |
| TEE Worker | Phala Network dstack |

## Tech Stack

- **Frontend**: Svelte 4 + TypeScript + Vite
- **Backend**: Rust + IC CDK (Internet Computer)
- **TEE**: Phala Network dstack
- **AI**: Claude Haiku 4.5 / Opus 4.5 via Anthropic API
- **CLI**: TypeScript + Commander

## Roadmap

- [ ] DFX CLI Authentication - Authenticate CLI with dfx for automatic analysis
- [ ] Pay-per-Analysis - Use platform API keys via payment
- [ ] MCP Server Integration - Enhanced AI agent capabilities

## License

MIT
