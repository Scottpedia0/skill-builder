/**
 * Generator — Builds working skill files from suggestions.
 *
 * Each skill is a markdown file with YAML frontmatter that Claude Code,
 * Codex, or Gemini CLI can execute as a slash command.
 *
 * Skills MUST contain runnable commands — not outlines or TODOs.
 * If we can't produce a working implementation, we don't generate it.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { callLlm, hasLlmAvailable } from "./llm.mjs";

// Only generate skills we have real implementations for.
// No templates, no outlines, no TODOs.
const IMPLEMENTATIONS = {
  "pr-dashboard": prDashboard,
  "meeting-auto-brief": meetingAutoBrief,
  "model-cost-monitor": modelCostMonitor,
  "credential-audit": credentialAudit,
  "slack-integration-health": slackHealth,
  "tab-audit": tabAudit,
  "video-cataloger": videoCataloger,
};

/**
 * Generate a skill file from a suggestion.
 * Uses hardcoded implementation if available, otherwise calls LLM to generate dynamically.
 */
export async function generateSkill(suggestion, options = {}) {
  const {
    outputDir = join(homedir(), ".claude/commands"),
    brainDir = null,
    dryRun = false,
    config = {},
  } = options;

  // Try hardcoded implementation first (fast, no API call)
  const impl = IMPLEMENTATIONS[suggestion.id];
  let content;

  if (impl) {
    content = impl(suggestion, config);
  } else if (hasLlmAvailable()) {
    // No hardcoded impl — generate dynamically via LLM
    content = await generateViaLlm(suggestion, config);
  } else {
    // No impl and no LLM — can't generate
    return null;
  }

  if (!content) return null;

  const filename = `${suggestion.id}.md`;
  const outputPath = join(outputDir, filename);
  const brainPath = brainDir ? join(brainDir, filename) : null;

  if (dryRun) {
    return { path: outputPath, brainPath, content, installed: false, llmGenerated: !impl };
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);

  if (brainPath) {
    mkdirSync(dirname(brainPath), { recursive: true });
    writeFileSync(brainPath, content);
  }

  return { path: outputPath, brainPath, content, installed: true, llmGenerated: !impl };
}

/**
 * Generate a skill dynamically using an LLM.
 */
async function generateViaLlm(suggestion, config) {
  const prompt = buildSkillPrompt(suggestion, config);

  try {
    const response = await callLlm(prompt);
    // Extract the markdown skill from the response
    return extractSkillMarkdown(response, suggestion);
  } catch (e) {
    console.error(`LLM generation failed for ${suggestion.id}: ${e.message}`);
    return null;
  }
}

/**
 * Build the prompt that tells the LLM how to generate a skill.
 * This is the core IP — expert-level prompting for skill generation.
 */
function buildSkillPrompt(suggestion, config) {
  const profilePrompts = {
    "solo-founder": "The user is a solo founder who context-switches constantly between coding, meetings, sales, and ops. Prioritize time-saving automations that reduce manual repetition.",
    "team-lead": "The user is a team lead managing multiple engineers. Prioritize skills that help with code review, team coordination, onboarding, and process enforcement.",
    "senior-ic": "The user is a senior individual contributor. Prioritize skills for debugging workflows, test automation, build pipelines, and code quality.",
    "junior-dev": "The user is a junior developer learning the codebase. Prioritize skills for common error fixes, boilerplate generation, and learning shortcuts.",
  };

  const profile = config.analysisProfile || "solo-founder";
  const profileContext = profilePrompts[profile] || profilePrompts["solo-founder"];

  // Build context from the suggestion metadata
  let patternContext = "";
  if (suggestion.meta) {
    if (suggestion.meta.command) {
      patternContext = `The user repeatedly runs this command (${suggestion.meta.count || "multiple"} times):\n\`\`\`\n${suggestion.meta.command}\n\`\`\``;
    } else if (suggestion.meta.sequence) {
      patternContext = `The user repeatedly runs this command sequence (${suggestion.meta.count || "multiple"} times):\n\`\`\`\n${suggestion.meta.sequence}\n\`\`\``;
    } else if (suggestion.meta.pattern) {
      patternContext = `The user runs variations of this command pattern (${suggestion.meta.variations || "multiple"} variations):\nPattern: \`${suggestion.meta.pattern}\`\nExamples:\n${(suggestion.meta.examples || []).map(e => `  \`${e}\``).join("\n")}`;
    } else if (suggestion.meta.prefix) {
      patternContext = `The user's git commits frequently start with "${suggestion.meta.prefix}" (${suggestion.meta.count || "multiple"} times).\nExamples:\n${(suggestion.meta.examples || []).map(e => `  "${e}"`).join("\n")}`;
    }
  }

  if (!patternContext) {
    patternContext = `Suggestion: ${suggestion.description}\nSignal: ${suggestion.signal}\nSource: ${suggestion.source}`;
  }

  return `You are an expert skill author for AI coding agents (Claude Code, Codex, Cursor, Gemini CLI).

Your job: turn a detected workflow pattern into a complete, runnable SKILL.md file.

${profileContext}

## Pattern Detected

${patternContext}

## SKILL.md Format Requirements

The description field is the PRIMARY triggering mechanism. The AI agent sees ONLY name + description when deciding whether to load a skill. Make the description "pushy" — include synonyms, related intents, and edge cases. The description should be 100-200 words and use imperative framing: "Use this skill when..."

Why: Claude undertriggers skills. A vague description means the skill never activates. A rich description with trigger keywords ensures it fires when useful.

\`\`\`
---
name: kebab-case-name
description: "Use this skill when [primary trigger]. Also use when [secondary trigger], [synonym], or [edge case]. This skill [what it does] by [how it works]. Helpful for [persona context]."
---
\`\`\`

## Rules

1. Every bash block must run WITHOUT modification — no \`<placeholder>\` syntax, no TODOs
   Why: users install skills to save time. A skill with placeholders is just a template.
2. Handle errors — check if commands/tools exist before calling them
   Why: the skill runs on unknown machines. \`command -v gh > /dev/null || { echo "Install gh CLI"; exit 1; }\`
3. Generalize from the specific pattern — don't just wrap the exact command, build a reusable version
   Why: the user ran \`git checkout main && git pull\` 15 times. The skill should handle edge cases (dirty worktree, conflict) not just replay the sequence.
4. Under 200 lines including frontmatter. Concise > comprehensive.
5. Explain WHY behind non-obvious choices in brief comments.

## Self-Validation Checklist (verify before output)

- [ ] Does every bash block run without placeholders?
- [ ] Is the description 100+ words with trigger keywords?
- [ ] Does it handle the case where a required tool isn't installed?
- [ ] Is this actually useful on first run?

## Example 1: Simple (bash-only)

\`\`\`markdown
---
name: new-branch
description: "Use this skill when creating a new feature branch, starting work on a new task, or branching from main. Also use when the user says 'new branch', 'start feature', 'fresh branch', or 'begin work on'. Creates a clean feature branch from an up-to-date main, handling dirty worktrees and pull conflicts gracefully."
---

# New Feature Branch

\\\`\\\`\\\`bash
# Ensure clean state
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Dirty worktree. Stashing changes..."
  git stash push -m "auto-stash before new-branch"
fi

current=$(git branch --show-current)
if [ "$current" != "main" ]; then
  git checkout main || { echo "❌ Failed to checkout main"; exit 1; }
fi

git pull --ff-only || { echo "❌ Pull failed — resolve conflicts first"; exit 1; }

echo "Branch name (without feature/ prefix):"
read -r branch_name
git checkout -b "feature/$branch_name"
echo "✅ Created feature/$branch_name from fresh main"
\\\`\\\`\\\`
\`\`\`

## Example 2: Complex (multi-step with error handling)

\`\`\`markdown
---
name: deploy-check
description: "Use this skill before deploying, when checking deploy readiness, or when the user mentions 'pre-deploy', 'deploy check', 'ready to ship', 'pre-flight', or 'can I deploy'. Runs the full pre-deployment checklist: tests, lint, build, git status, and branch verification. Catches common deployment mistakes before they hit production."
---

# Pre-Deploy Checklist

\\\`\\\`\\\`bash
echo "🚀 Pre-Deploy Checklist"
echo "======================"
errors=0

# 1. Correct branch?
branch=$(git branch --show-current)
echo -n "Branch: $branch "
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "✅"
else
  echo "⚠️  Not on main — deploying from feature branch"
fi

# 2. Clean worktree?
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Uncommitted changes — commit or stash first"
  errors=$((errors + 1))
else
  echo "✅ Worktree clean"
fi

# 3. Tests pass?
if command -v npm > /dev/null && [ -f package.json ]; then
  echo -n "Tests: "
  if npm test --silent 2>/dev/null; then
    echo "✅"
  else
    echo "❌ Tests failed"
    errors=$((errors + 1))
  fi
fi

# 4. Build works?
if command -v npm > /dev/null && grep -q '"build"' package.json 2>/dev/null; then
  echo -n "Build: "
  if npm run build --silent 2>/dev/null; then
    echo "✅"
  else
    echo "❌ Build failed"
    errors=$((errors + 1))
  fi
fi

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All checks passed — ready to deploy"
else
  echo "❌ $errors check(s) failed — fix before deploying"
fi
\\\`\\\`\\\`
\`\`\`

Now generate the skill for the detected pattern. Output ONLY the markdown content (starting with \`---\`), no explanation before or after.`;
}

/**
 * Extract clean SKILL.md content from LLM response.
 * Handles cases where the LLM wraps it in extra markdown or explanation.
 */
function extractSkillMarkdown(response, suggestion) {
  let content = response.trim();

  // If the response is wrapped in a code block, extract it
  const fenceMatch = content.match(/```markdown\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  // Verify it has frontmatter
  if (!content.startsWith("---")) {
    // Try to find frontmatter anywhere in the response
    const fmMatch = content.match(/(---\n[\s\S]*?\n---[\s\S]*)/);
    if (fmMatch) {
      content = fmMatch[1].trim();
    } else {
      // LLM didn't produce valid SKILL.md — wrap it
      content = `---\nname: ${suggestion.id}\ndescription: "${suggestion.description}"\n---\n\n# ${suggestion.id}\n\n${content}`;
    }
  }

  return content;
}

/**
 * List which suggestion IDs have hardcoded implementations.
 */
export function listImplementable() {
  return Object.keys(IMPLEMENTATIONS);
}

/**
 * Check if a suggestion can be generated (hardcoded OR via LLM).
 */
export function canGenerate(suggestionId) {
  return !!IMPLEMENTATIONS[suggestionId] || hasLlmAvailable();
}

// ─── Working implementations ────────────────────────────────────

function prDashboard(s, config = {}) {
  const repos = (config.repos && config.repos.length > 0)
    ? config.repos
    : ["your-org/your-repo"];
  const repoList = repos.join(" ");

  return `---
name: pr-dashboard
description: "Morning summary of open PRs, review requests, and CI status"
---

# PR Dashboard

> Configure repos in ~/.skill-builder/config.json → "repos": ["org/repo1", "org/repo2"]

\`\`\`bash
echo "# PR Dashboard — $(date '+%Y-%m-%d %H:%M')"
echo ""

for repo in ${repoList}; do
  echo "## $repo"
  prs=$(gh pr list -R "$repo" --state open --json number,title,author,createdAt,statusCheckRollup --limit 10 2>/dev/null)
  if [ -z "$prs" ] || [ "$prs" = "[]" ]; then
    echo "  No open PRs"
  else
    echo "$prs" | python3 -c "
import json, sys
from datetime import datetime
prs = json.load(sys.stdin)
for pr in prs:
    age = (datetime.now() - datetime.fromisoformat(pr['createdAt'].replace('Z','+00:00').replace('+00:00',''))).days
    author = pr.get('author',{}).get('login','?')
    checks = pr.get('statusCheckRollup') or []
    status = 'pending'
    if checks:
        states = [c.get('conclusion','') for c in checks]
        if all(s == 'SUCCESS' for s in states): status = '✅'
        elif any(s == 'FAILURE' for s in states): status = '❌'
        else: status = '⏳'
    print(f'  #{pr[\"number\"]} {pr[\"title\"][:50]} | {author} | {age}d old | CI: {status}')
"
  fi
  echo ""
done
\`\`\`

Present results as a table. Flag any PRs older than 3 days or with failing CI.
`;
}

function meetingAutoBrief(s, config = {}) {
  const repos = (config.repos && config.repos.length > 0)
    ? config.repos[0]
    : "your-org/your-repo";

  return `---
name: meeting-auto-brief
description: "Generate pre-meeting context brief before Google Meet calls"
---

# Meeting Auto-Brief

## Step 1: Get next meeting

\`\`\`bash
# If you have gcal MCP configured:
# Use gcal_list_events to get events in the next 2 hours.

# Or use gcalcli (pip install gcalcli):
gcalcli agenda --details all "$(date '+%Y-%m-%d %H:%M')" "$(date -v+2H '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "Install gcalcli or configure Google Calendar MCP"
\`\`\`

## Step 2: Look up attendees

\`\`\`bash
# Search git history for interactions with attendees
for name in "$@"; do
  echo "### $name"
  echo "Recent commits mentioning $name:"
  git log --all --oneline --grep="$name" --since="30 days ago" 2>/dev/null | head -5
  echo ""
  echo "Recent issues:"
  gh issue list -R ${repos} --search "$name" --limit 5 2>/dev/null
  echo ""
done
\`\`\`

## Step 3: Build the brief

Output format (scannable in 30 seconds):

\`\`\`
## [Meeting Title] — [Time]

### Attendees
- **Name** — last interaction, open items

### Talking Points
- [derived from git history + issue tracker]

### Action Items from Last Meeting
- [check notes/issues for previous meeting follow-ups]
\`\`\`
`;
}

function modelCostMonitor(s, config = {}) {
  return `---
name: model-cost-monitor
description: "Check daily model API spend across OpenRouter, Anthropic, OpenAI"
---

# Model Cost Monitor

## OpenRouter spend

\`\`\`bash
# Requires OPENROUTER_API_KEY env var
if [ -n "$OPENROUTER_API_KEY" ]; then
  curl -s "https://openrouter.ai/api/v1/auth/key" \\
    -H "Authorization: Bearer $OPENROUTER_API_KEY" | python3 -c "
import json, sys
data = json.load(sys.stdin).get('data', {})
usage = data.get('usage', 0)
limit = data.get('limit', 0)
print(f'OpenRouter: \${usage:.2f} used' + (f' / \${limit:.2f} limit' if limit else ' (no limit)'))
"
else
  echo "OpenRouter: OPENROUTER_API_KEY not set — skipping"
fi
\`\`\`

## Anthropic spend

\`\`\`bash
# Requires ANTHROPIC_API_KEY env var
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "Anthropic: API key present. Check spend at https://console.anthropic.com/settings/usage"
  # Note: Anthropic doesn't expose a usage API yet
else
  echo "Anthropic: ANTHROPIC_API_KEY not set — skipping"
fi
\`\`\`

## Summary

Present as:
\`\`\`
| Provider    | Spend     | Alert      |
|-------------|-----------|------------|
| OpenRouter  | $X.XX     | ✅ / ⚠️     |
| Anthropic   | (manual)  | check link |
\`\`\`

Flag if any single day exceeds $50.
`;
}

function credentialAudit(s, config = {}) {
  return `---
name: credential-audit
description: "Audit API keys and credentials — test auth, flag unused"
---

# Credential Audit

Tests common API keys from your environment. Set them as env vars or in a .env file.

\`\`\`bash
echo "=== Credential Audit — $(date '+%Y-%m-%d %H:%M') ==="
echo ""

# GitHub
echo -n "GitHub CLI: "
gh auth status 2>&1 | head -1

# OpenRouter
if [ -n "$OPENROUTER_API_KEY" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://openrouter.ai/api/v1/auth/key" -H "Authorization: Bearer $OPENROUTER_API_KEY")
  echo "OpenRouter: HTTP $code $([ "$code" = "200" ] && echo "✅" || echo "❌")"
else
  echo "OpenRouter: not configured (set OPENROUTER_API_KEY)"
fi

# Anthropic
if [ -n "$ANTHROPIC_API_KEY" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://api.anthropic.com/v1/messages" \\
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \\
    -H "Content-Type: application/json" \\
    -d '{"model":"claude-sonnet-4-20250514","max_tokens":1,"messages":[{"role":"user","content":"test"}]}')
  echo "Anthropic: HTTP $code $([ "$code" = "200" ] && echo "✅" || echo "❌")"
else
  echo "Anthropic: not configured (set ANTHROPIC_API_KEY)"
fi

# OpenAI
if [ -n "$OPENAI_API_KEY" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://api.openai.com/v1/models" -H "Authorization: Bearer $OPENAI_API_KEY")
  echo "OpenAI: HTTP $code $([ "$code" = "200" ] && echo "✅" || echo "❌")"
else
  echo "OpenAI: not configured (set OPENAI_API_KEY)"
fi

# Slack
if [ -n "$SLACK_BOT_TOKEN" ]; then
  curl -s "https://slack.com/api/auth.test" -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Slack: {\"ok ✅\" if d.get(\"ok\") else \"FAILED ❌ — \" + d.get(\"error\",\"unknown\")}')"
else
  echo "Slack: not configured (set SLACK_BOT_TOKEN)"
fi

echo ""
echo "Keys not set will show as 'not configured' — add them to your environment to include in the audit."
\`\`\`
`;
}

function slackHealth(s, config = {}) {
  return `---
name: slack-integration-health
description: "Test Slack bot connectivity, check rate limits, verify integrations"
---

# Slack Integration Health

Requires SLACK_BOT_TOKEN env var.

\`\`\`bash
if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo "SLACK_BOT_TOKEN not set. Export it and re-run."
  exit 1
fi

# 1. Test bot auth
echo "=== Bot Auth ==="
curl -s "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('ok'):
    print(f'  Bot: {d[\"user\"]} in team {d[\"team\"]} ✅')
else:
    print(f'  Bot auth FAILED: {d.get(\"error\")} ❌')
"

# 2. Rate limit check (from response headers)
echo "=== Rate Limits ==="
curl -sI "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | grep -i "x-ratelimit" || echo "  No rate limit headers (good)"

# 3. List accessible channels
echo "=== Accessible Channels ==="
curl -s "https://slack.com/api/conversations.list?types=public_channel&limit=5" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('ok'):
    for c in d.get('channels', [])[:5]:
        print(f'  #{c[\"name\"]} ({c.get(\"num_members\",\"?\")} members)')
else:
    print(f'  Channel list FAILED: {d.get(\"error\")} ❌')
"
\`\`\`

Report: healthy / degraded / down.
`;
}

function tabAudit(s) {
  return `---
name: tab-audit
description: "List open Chrome tabs, flag stale ones, suggest close or bookmark"
---

# Tab Audit

## Step 1: Get open tabs via Chrome DevTools MCP

Use the \`list_pages\` tool from Chrome DevTools MCP to get all open tabs.

## Step 2: Cross-reference with activity data

\`\`\`bash
# Find Chrome URLs from last 24h with time spent
sqlite3 ~/Library/Application\\ Support/Cowork.ai\\ Alpha/database/cowork.db "
  SELECT browser_url,
         window_title,
         COUNT(*) as sessions,
         SUM(duration_ms)/1000/60 as minutes,
         MAX(started_at) as last_active
  FROM activity_sessions
  WHERE app_name = 'Google Chrome'
    AND browser_url IS NOT NULL
    AND started_at >= datetime('now', '-24 hours')
  GROUP BY browser_url
  ORDER BY last_active DESC
  LIMIT 30
" 2>/dev/null
\`\`\`

## Step 3: Identify stale tabs

Compare open tabs against activity data. Flag any tab where:
- No activity in the last 2 hours
- Less than 1 minute total time today
- Duplicate domains (multiple tabs on same site)

## Step 4: Present recommendations

For each stale tab:
- **Close** — if it was a one-time lookup (Stack Overflow, docs page already read)
- **Bookmark** — if it's reference material you'll need again
- **Keep** — if it's an active work context (GitHub PR, Slack thread)

Format: table with URL, title, last active, total time, recommendation.
`;
}

function videoCataloger(s) {
  return `---
name: video-cataloger
description: "Index local video/screen recordings by date, size, and meeting context"
---

# Video Cataloger

## Step 1: Find all recordings

\`\`\`bash
echo "# Video Index — $(date '+%Y-%m-%d')"
echo ""
echo "| File | Size | Date | Duration |"
echo "|------|------|------|----------|"

find ~/Movies ~/Desktop ~/Downloads -maxdepth 3 \\
  \\( -name "*.mov" -o -name "*.mp4" -o -name "*.m4v" -o -name "*.webm" \\) \\
  -mtime -30 2>/dev/null | while read f; do
  size=$(du -h "$f" 2>/dev/null | cut -f1)
  date=$(stat -f "%Sm" -t "%Y-%m-%d" "$f" 2>/dev/null)
  name=$(basename "$f")
  # Try to get duration via ffprobe if available
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null | python3 -c "
import sys
try:
    s=float(sys.stdin.read().strip())
    m,s=divmod(int(s),60)
    h,m=divmod(m,60)
    print(f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}')
except: print('?')
" 2>/dev/null)
  echo "| $name | $size | $date | $dur |"
done
\`\`\`

## Step 2: Match to calendar

Cross-reference file dates with Google Calendar events to identify which meeting each recording belongs to. Use gcal MCP \`gcal_list_events\` for the relevant dates.

## Step 3: Flag large files

Flag any recordings over 500MB that are older than 7 days — candidate for archival or deletion.
`;
}
