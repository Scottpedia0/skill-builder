# skill-builder

> Analyze how you work. Build automations that actually run. One skill per day.

Watches how you work and builds custom automations for your AI coding agents — Claude Code, Codex, Cursor, or anything that reads markdown.

**skills.sh gives you a toolbox. skill-builder watches you work and builds the custom jigs for *your* workshop.**

Works out of the box with just your shell history. Add an API key and it generates custom skills from ANY pattern it finds — powered by the LLM of your choice.

## Try It in 60 Seconds

```bash
git clone https://github.com/Scottpedia0/skill-builder.git
cd skill-builder
npm install

# Generate rich demo data (8K sessions, 155 keystroke samples, 11 apps, 27 URLs)
node scripts/generate-demo-db.mjs

# Set up config and point at demo data
node bin/cli.mjs init
# Edit ~/.skill-builder/config.json → set telemetryDb to "./demo/demo.db"

# See what it finds in the demo data
node bin/cli.mjs suggest --days 7

# Preview a real, runnable skill
node bin/cli.mjs implement pr-dashboard --dry-run

# Install it
node bin/cli.mjs implement pr-dashboard
# → Installs to ~/.claude/commands/pr-dashboard.md
```

The demo data simulates a founder running 3 AI coding agents with 8-10 meetings/week across Google Meet, managing GitHub repos, monitoring API costs, and communicating on Slack. The skill suggestions reflect real patterns found in that activity.

<details>
<summary>Example: LLM generates a custom skill from your shell history</summary>

The analyzer found you run `cd ~/Downloads/cowork-cua && python3 web.py --gemini` 17 times. You run `skill-builder implement`, and the LLM generates:

```markdown
---
name: launch-cowork-cua
description: "Use this skill when you want to quickly start the cowork-cua web app,
  launch web.py, or run the UI with Gemini. Also use when you're context-switching
  and don't remember where the repo lives..."
---

# Launch Cowork CUA Web

```bash
command -v python3 >/dev/null || { echo "❌ python3 not found"; exit 1; }

# Find the repo in common locations
candidates=("$HOME/Downloads/cowork-cua" "$HOME/dev/cowork-cua" "$HOME/src/cowork-cua")
for d in "${candidates[@]}"; do
  if [ -d "$d" ]; then repo="$d"; break; fi
done

cd "$repo"
# Auto-create venv if needed, install deps, launch with configurable model
exec "$py" web.py "--${COWORK_MODEL:-gemini}" "${extra[@]}"
```

Real error handling. Real venv management. Real configurability. Not a template — a working script generated from your actual behavior.
```
</details>

<details>
<summary>Example: 15 built-in skills + unlimited via LLM</summary>

```
$ skill-builder suggest --days 7

# Skill Suggestions — 36 total

## High Confidence

- **gmail-templates** ✅ — Email templates for follow-ups, intros, status updates
- **run-cd-cowork-cua** 🤖 — Automate: cd ~/Downloads/cowork-cua && python3 web.py (17x)
- **agent-continue-from** 🤖 — You asked "continue from where you left off" 18 times

## Medium Confidence

- **pr-dashboard** ✅ — Morning PR/CI summary across repos
- **git-cleanup** ✅ — Delete merged branches, prune remote refs
- **port-killer** ✅ — Find and kill processes on dev ports

✅ = hardcoded (instant) | 🤖 = LLM generates (needs API key)
```

The generated skill is a markdown file with runnable `gh` commands, JSON parsing, and CI status checks — installed directly to `~/.claude/commands/pr-dashboard.md`.
</details>

## How It Works

```
┌─────────────────────────────────────────────┐
│ Your activity data (SQLite)                 │
│  • App usage (VS Code 4hrs, Chrome 3hrs)    │
│  • URLs visited (GitHub 245x, Meet 500x)    │
│  • Context switches (VS Code → Chrome 800x) │
│  • Keystrokes ("sorry for delay" typed 5x)  │
└────────────────┬────────────────────────────┘
                 ↓
         ┌───────────────┐
         │   Analyzer    │  Reads patterns from telemetry
         └───────┬───────┘
                 ↓
         ┌───────────────┐
         │   Suggester   │  Ranks by confidence, one per day
         └───────┬───────┘
                 ↓
         ┌───────────────┐
         │   Generator   │  Builds runnable skill files
         └───────┬───────┘
                 ↓
  ~/.claude/commands/pr-dashboard.md  ← Ready to use
```

## Commands

```bash
skill-builder init              # Create config
skill-builder suggest           # Full ranked suggestion list
skill-builder daily             # One new suggestion per day
skill-builder implement <id>    # Build and install a skill
skill-builder list              # Show implementable skills
```

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview skill without installing |
| `--days N` | Analysis window (default: 3) |

## Built-in Skills

15 skills with real, working implementations (plus unlimited via LLM):

| Skill | What it does | Tools used |
|-------|-------------|------------|
| **pr-dashboard** | Morning PR/CI summary across repos | `gh` CLI, JSON parsing |
| **meeting-auto-brief** | Pre-meeting context from calendar + memory | Calendar MCP, curl, `gh` |
| **model-cost-monitor** | Track API spend (OpenRouter, Anthropic) | curl, API endpoints |
| **credential-audit** | Test all API keys, flag expired/unused | curl, SQLite, `gh` |
| **slack-integration-health** | Check bot auth, rate limits, delivery | Slack API |
| **tab-audit** | Find stale Chrome tabs, suggest actions | Chrome DevTools MCP, SQLite |
| **video-cataloger** | Index local recordings by date/meeting | `find`, `ffprobe`, Calendar MCP |
| **gmail-templates** | Email templates for follow-ups, intros, updates | bash templates |
| **git-cleanup** | Delete merged branches, prune remote refs | `git` |
| **dep-update** | Check outdated packages, security audit | `npm`, `pip` |
| **port-killer** | Find/kill processes on dev ports (EADDRINUSE) | `lsof`, `kill` |
| **docker-reset** | Stop containers, prune images, reclaim space | `docker` |
| **env-check** | Compare .env.example vs .env, find gaps | bash |
| **log-search** | Search log files for recent errors | `find`, `grep`, `pm2` |
| **db-snapshot** | Timestamped backups before migrations | `cp`, `pg_dump` |

## Data Sources

**Working now (5 sources):**
- [x] **Shell history** (zsh, bash, fish) — repeated commands, sequences, parameterizable patterns
- [x] **Git history** — commit patterns, co-changed files, branch workflows
- [x] **Browser history** (Chrome, Arc, Brave, Edge) — frequent URLs, repeated Google searches
- [x] **Claude Code threads** — repeated prompts, correction patterns, command-like requests
- [x] **Cowork.ai telemetry** — app usage, URLs, context switches, keystrokes

**Coming:**
- [ ] Codex sessions
- [ ] Gemini CLI history
- [ ] Calendar events
- [ ] Slack/Teams activity

The analyzer reads any SQLite database with `activity_sessions` and `keystroke_chunks` tables in the expected schema. See [`docs/data-sources.md`](docs/data-sources.md) for the full schema, import scripts, and guides for connecting each source.

## Configuration

```bash
skill-builder init  # Creates ~/.skill-builder/config.json
```

```json
{
  "skillDir": "~/.claude/commands",
  "canonicalDir": null,
  "telemetryDb": null,
  "repos": ["your-org/your-repo"],
  "defaultDays": 3,
  "dataSources": ["telemetry"]
}
```

| Key | What it does |
|-----|-------------|
| `skillDir` | Where to install generated skills |
| `canonicalDir` | Optional second copy (shared team repo) |
| `telemetryDb` | Path to SQLite DB (auto-detected if Cowork.ai installed) |
| `repos` | GitHub repos for PR dashboard |
| `defaultDays` | How many days of data to analyze |

## Design Principles

1. **Runnable or nothing** — if we can't produce working commands, we don't generate it
2. **One skill, one job** — compose them, don't merge them
3. **Agent-agnostic** — markdown + YAML frontmatter works everywhere
4. **Data-driven** — suggestions from your actual behavior, not a generic catalog
5. **One per day** — daily drip, not a backlog dump

## Add Your Own Skills

```javascript
// lib/generator.mjs

const IMPLEMENTATIONS = {
  "your-skill": yourSkillFunction,
  // ...
};

function yourSkillFunction(suggestion) {
  return `---
name: your-skill
description: "What it does"
---

# Your Skill

\`\`\`bash
# Real, runnable commands here
echo "This actually works"
\`\`\`
`;
}
```

Then: `skill-builder implement your-skill --dry-run`

## Why This Exists

AI coding agents are powerful but generic. They don't know your workflow — which repos you check, which APIs you monitor, which meetings need prep.

This tool watches how you actually work and builds automations specific to you. Instead of browsing a marketplace for skills that might fit, you get suggestions derived from your real behavior — and they come with working code, not setup instructions.

Built by [Go2](https://go2.io) as part of [Cowork.ai](https://cowork.ai).

## License

MIT
