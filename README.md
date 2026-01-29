# skillsic

> Safety-first skill discovery for Claude Code, powered by ICP + Phala TEE

**[skillsic.com](https://skillsic.com)** is a curation platform for Claude Code skills. We index 104k+ skills, analyze them with Claude in a Trusted Execution Environment (TEE), and provide safety ratings before you install.

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
│   (Frontend)    │     │  (Backend)       │     │   (AI Analysis) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  npm: skillsic  │────▶│  104k+ Skills    │
│  (CLI Tool)     │     │  (Indexed)       │
└─────────────────┘     └──────────────────┘
```

## Components

### `/canister` - ICP Backend (Rust)
- Skill index storage (104k+ skills from skills.sh ecosystem)
- Multi-model analysis tracking (Haiku → Sonnet → Opus)
- TEE worker authentication
- Query API for frontend and CLI

### `/frontend` - Web UI (Svelte + TypeScript)
- Browse & search skills at [skillsic.com](https://skillsic.com)
- View AI safety analysis & ratings
- Terminal-inspired aesthetic
- Self-hosted fonts (no external dependencies)

### `/tee-worker` - Phala TEE Worker (TypeScript)
- Runs Claude analysis in Trusted Execution Environment
- Secure API key storage (never exposed)
- Verifiable attestation
- Multi-model support (Haiku, Sonnet, Opus)

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
- Self-referential bootstrap

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
