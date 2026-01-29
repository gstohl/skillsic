# skillsic

> Safety-first skill discovery for Claude Code, powered by ICP + Phala TEE

**[skillsic.com](https://skillsic.com)** is a community-driven curation platform for Claude Code skills. We've indexed 104k+ skills from the ecosystem - anyone can analyze them using their own API key, and all analysis results are stored on-chain for everyone to benefit from.

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
│   (Frontend)    │     │  (On-Chain)      │     │   (AI Analysis) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │     Your API key      │
        │   (encrypted in TEE)  │
        ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  npm: skillsic  │     │  Analysis stored │
│  (CLI Tool)     │     │  on-chain forever│
└─────────────────┘     └──────────────────┘
```

## Key Features

- **Community-Powered Analysis**: Use your API key to analyze skills, results benefit everyone
- **On-Chain Storage**: All analysis history stored permanently on ICP
- **TEE Security**: Your API key is encrypted in-browser, decrypted only inside Phala TEE
- **Multi-Model Support**: Analyze with Haiku (fast), Sonnet (balanced), or Opus (thorough)
- **Analysis History**: See how ratings evolved over time with different models
- **No Central Authority**: Decentralized, transparent, community-driven

## Components

### `/canister` - ICP Backend (Rust)
- Skill index storage (104k+ skills from skills.sh ecosystem)
- On-chain analysis history (immutable, transparent)
- Multi-model tracking (Haiku → Sonnet → Opus)
- TEE worker authentication

### `/frontend` - Web UI (Svelte + TypeScript)
- Browse & search skills at [skillsic.com](https://skillsic.com)
- Trigger analysis with your own API key
- View community analysis & ratings
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
- SKILL.md that teaches Claude Code how to use skillsic

## Safety Ratings

| Rating | Score | Meaning |
|--------|-------|---------|
| SAFE | 4.5+ | Thoroughly reviewed, no concerns |
| OK | 3.5-4.4 | Generally safe with minor notes |
| CAUTION | 2.5-3.4 | Review recommended before use |
| WARNING | 1.5-2.4 | Significant concerns identified |
| DANGER | <1.5 | Do not install |

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

## Tech Stack

- **Frontend**: Svelte 4 + TypeScript + Vite
- **Backend**: Rust + IC CDK (Internet Computer)
- **TEE**: Phala Network dstack
- **AI**: Claude (Haiku/Sonnet/Opus) via Anthropic API
- **CLI**: TypeScript + Commander
- **Fonts**: JetBrains Mono (self-hosted)

## License

MIT
