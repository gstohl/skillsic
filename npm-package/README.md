# skillsic

<p align="center">
  <strong>Safety-first skill checker for Claude Code</strong>
</p>

<p align="center">
  Verify skill ratings before installing to protect yourself from malicious or low-quality skills.
</p>

<p align="center">
  <a href="https://skillsic.com">Website</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#api">API</a>
</p>

---

## Why?

Claude Code skills can execute arbitrary code and access your files. A malicious skill could:

- 🔓 Exfiltrate sensitive data (API keys, credentials, source code)
- 💉 Inject backdoors into your codebase
- 💸 Consume excessive API credits
- 🐛 Cause unintended side effects

**skillsic** helps you verify skills before installing them by checking ratings from [skillsic.com](https://skillsic.com) — an Internet Computer (ICP) platform providing AI-powered skill analysis running in Phala TEE (Trusted Execution Environment).

## Installation

```bash
npm install -g skillsic
```

Or use directly with npx (no installation required):

```bash
npx skillsic check owner/repo/skill-name
```

## Usage

### Install a skill (with safety check)

The primary command - checks safety and installs if safe:

```bash
skillsic add vercel-labs/agent-skills/vercel-react-best-practices
```

**Output:**
```
vercel-labs/vercel-react-best-practices
React and Next.js performance optimization guidelines from Vercel Engineering.

[✓ SAFE]

Rating: ★★★★★ 4.7/5
Malicious check: 100/100
Security: 85/100

Summary:
  This skill has been analyzed and appears to be safe.

Installing skill...
Running: npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices

✓ Skill installed successfully!
```

**Options:**
| Flag | Description |
|------|-------------|
| `--force`, `-f` | Install even if skill has warnings (not danger) |
| `--yes`, `-y` | Skip confirmation for unanalyzed skills |

**Safety behavior:**
- ✅ **SAFE/CAUTION**: Installs automatically
- ⚠️ **WARNING**: Blocked unless `--force` flag used
- ❌ **DANGER**: Always blocked (find an alternative)
- ❓ **UNKNOWN**: Installs with warning (not yet analyzed)

### Check a skill without installing

```bash
skillsic check vercel-labs/agent-skills/vercel-react-best-practices
```

Add `-v` for verbose output with detailed analysis:

```bash
skillsic check vercel-labs/agent-skills/vercel-react-best-practices -v
```

### Search for safe skills

Search only returns **analyzed and safe** skills by default — protecting you from unvetted content:

```bash
skillsic search "react patterns"
```

**Output:**
```
Found 2 skills:

[✓ SAFE] vercel-labs/vercel-react-best-practices
   React and Next.js performance optimization guidelines...
   ★★★★★ 4.7/5 | 63,872 installs | programming

[⚠ CAUTION] remotion-dev/remotion-best-practices
   Best practices for Remotion - Video creation in React
   ★★★★☆ 4.2/5 | 45,200 installs | programming

Use `skillsic check <skill>` for detailed safety info
```

**Options:**
| Flag | Description |
|------|-------------|
| `--all` | Include unanalyzed skills |
| `--unsafe` | Include skills with warnings |
| `--limit <n>` | Limit results (default: 10) |

### Get detailed skill information

```bash
skillsic info vercel-labs/agent-skills/vercel-react-best-practices
```

Shows complete analysis including:
- Safety ratings and flags
- Category and tags
- Strengths and weaknesses
- Required dependencies
- Prerequisites

### View platform stats

```bash
skillsic stats
```

```
skillsic.com Statistics

  Total Skills:    104,411
  Analyzed Skills: 5 (0.0%)
  Total Installs:  722,687
  Users:           2

Visit https://skillsic.com for more information
```

## Safety Levels

| Level | Symbol | Meaning | Action |
|-------|--------|---------|--------|
| **SAFE** | ✓ | Analyzed, no issues found | OK to install |
| **CAUTION** | ⚠ | Minor concerns | Review before installing |
| **WARNING** | ⚠ | Potential security issues | Investigate carefully |
| **DANGER** | ✗ | Serious issues detected | **Do NOT install** |
| **UNKNOWN** | ? | Not yet analyzed | Request analysis at skillsic.com |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Safe or caution level |
| `1` | Warning level (potential issues) |
| `2` | Danger level (do not install) |

Use in CI/CD pipelines or scripts:

```bash
# Only install if safe
skillsic check owner/repo/skill && echo "Safe to install!"

# Gate skill installation
if skillsic check my-skill 2>/dev/null; then
  claude skill install my-skill
else
  echo "Skill failed safety check"
  exit 1
fi
```

## Programmatic API

```typescript
import { 
  getSkill, 
  checkSafety, 
  searchSkills, 
  filterSafeSkills,
  sortBySafety 
} from 'skillsic';

// Check a specific skill
const skill = await getSkill('owner/repo/name');
if (skill) {
  const safety = checkSafety(skill);
  
  console.log(safety.level);          // 'safe' | 'caution' | 'warning' | 'danger' | 'unknown'
  console.log(safety.overallRating);  // 0-5 scale
  console.log(safety.maliciousScore); // 0-100 (100 = completely safe)
  console.log(safety.securityScore);  // 0-100
  console.log(safety.flags);          // Array of warning flags
  console.log(safety.isAnalyzed);     // boolean
}

// Search for skills
const results = await searchSkills('react');
const skills = results.map(r => r.skill);

// Filter to only safe skills
const safeSkills = filterSafeSkills(skills);

// Sort by safety (safest first)
const sorted = sortBySafety(skills);

// Get platform stats
const stats = await getStats();
console.log(`${stats.totalSkills} skills indexed`);
```

### Types

```typescript
interface SafetyCheck {
  level: 'safe' | 'caution' | 'warning' | 'danger' | 'unknown';
  overallRating: number | null;    // 0-5 scale
  maliciousScore: number | null;   // 0-100 (100 = safe)
  securityScore: number | null;    // 0-100
  flags: RatingFlag[];
  isAnalyzed: boolean;
  summary: string;
  recommendations: string[];
}

interface Skill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  stars: number;
  install_count: bigint;
  analysis: SkillAnalysis | null;
  // ... more fields
}
```

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  skillsic   │────▶│  ICP Canister │────▶│  Phala TEE  │
│    CLI      │     │  (Backend)    │     │  (Analysis) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  100k+ Skills │
                    │    Indexed    │
                    └──────────────┘
```

1. **Skill Index**: skillsic indexes 100k+ skills from skills.sh and other sources
2. **AI Analysis**: Skills are analyzed using Claude models running in Phala TEE
3. **Safety Ratings**: Each skill gets ratings for security, malicious patterns, quality, documentation, and more
4. **Decentralized**: Backend runs on Internet Computer — no single point of failure
5. **Secure**: Analysis runs in TEE — your API keys never leave the secure enclave

## Skill ID Format

Skills use the format: `owner/repo/skill-name`

Examples:
- `vercel-labs/agent-skills/vercel-react-best-practices`
- `remotion-dev/skills/remotion-best-practices`
- `anthropics/courses/prompt-engineering`

If you don't know the exact ID, use search:
```bash
skillsic search "vercel react"
```

## Contributing

Contributions welcome! The skillsic platform consists of:

- **npm package** (this repo) - CLI and programmatic API
- **ICP canister** - Backend storing skills and analyses
- **TEE worker** - Secure analysis engine on Phala Network
- **Frontend** - Web UI at skillsic.com

## Links

- **Website**: [skillsic.com](https://skillsic.com)
- **npm**: [npmjs.com/package/skillsic](https://www.npmjs.com/package/skillsic)

## License

MIT
