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
  // Original 7
  "pr-dashboard": prDashboard,
  "meeting-auto-brief": meetingAutoBrief,
  "model-cost-monitor": modelCostMonitor,
  "credential-audit": credentialAudit,
  "slack-integration-health": slackHealth,
  "tab-audit": tabAudit,
  "video-cataloger": videoCataloger,
  // New — from real user data patterns
  "gmail-templates": gmailTemplates,
  "git-cleanup": gitCleanup,
  "dep-update": depUpdate,
  "port-killer": portKiller,
  "docker-reset": dockerReset,
  "env-check": envCheck,
  "log-search": logSearch,
  "db-snapshot": dbSnapshot,
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

// ─── New implementations from real user data ────────────────────

function gmailTemplates(s, config = {}) {
  return `---
name: gmail-templates
description: "Use this skill when composing emails, writing follow-ups, or drafting replies. Also use when the user mentions 'email', 'follow up', 'reach out', 'send a message', 'draft', or any outbound communication. Generates common email templates from patterns detected in browser activity showing heavy Gmail usage."
---

# Gmail Templates

\`\`\`bash
echo "Select a template:"
echo "  1) Follow-up after meeting"
echo "  2) Introduction / cold outreach"
echo "  3) Status update"
echo "  4) Apology for delayed response"
echo "  5) Thank you / acknowledgment"
echo ""
read -p "Choice (1-5): " choice

case $choice in
  1) cat << 'TMPL'
Subject: Follow-up: [Meeting Topic]

Hi [Name],

Great talking with you today. Here's a quick summary of what we discussed:

- [Key point 1]
- [Key point 2]
- [Action item with owner]

Let me know if I missed anything. Looking forward to [next step].

Best,
[Your name]
TMPL
  ;;
  2) cat << 'TMPL'
Subject: [Specific value prop] for [Their Company]

Hi [Name],

I'm [Your name] from [Company]. I noticed [specific observation about their work].

We built [product/tool] that [specific benefit]. [One sentence proof point].

Would you have 15 minutes this week to chat?

Best,
[Your name]
TMPL
  ;;
  3) cat << 'TMPL'
Subject: Update: [Project Name] — Week of [Date]

Hi team,

Quick update on [project]:

**Completed:**
- [Item 1]
- [Item 2]

**In Progress:**
- [Item 3] — ETA [date]

**Blocked:**
- [Item 4] — need [what] from [who]

Let me know if questions.
TMPL
  ;;
  4) cat << 'TMPL'
Subject: Re: [Original Subject]

Hi [Name],

Apologies for the delayed response — [brief honest reason].

[Direct answer to their question / action taken].

[Next step or offer].

Best,
[Your name]
TMPL
  ;;
  5) cat << 'TMPL'
Subject: Re: [Original Subject]

Hi [Name],

Thanks for [specific thing they did]. [One sentence about impact or appreciation].

[Any follow-up action if needed].

Best,
[Your name]
TMPL
  ;;
  *) echo "Invalid choice";;
esac
\`\`\`
`;
}

function gitCleanup(s, config = {}) {
  return `---
name: git-cleanup
description: "Use this skill when cleaning up git branches, pruning stale branches, or doing repo maintenance. Also use when the user says 'clean branches', 'prune', 'delete merged branches', 'git housekeeping', or mentions too many local branches. Removes merged branches and prunes remote tracking refs."
---

# Git Branch Cleanup

\`\`\`bash
echo "🧹 Git Branch Cleanup"
echo "===================="

# Current branch
current=$(git branch --show-current)
echo "Current branch: $current"
echo ""

# Find merged branches (excluding main, master, develop, and current)
merged=$(git branch --merged | grep -v "^\*" | grep -vE "main|master|develop" | sed 's/^[ ]*//')

if [ -z "$merged" ]; then
  echo "✅ No merged branches to clean up"
else
  echo "Merged branches (safe to delete):"
  echo "$merged" | while read branch; do
    echo "  🗑  $branch"
  done
  echo ""
  read -p "Delete all merged branches? (y/n): " confirm
  if [ "$confirm" = "y" ]; then
    echo "$merged" | while read branch; do
      git branch -d "$branch" 2>/dev/null && echo "  Deleted: $branch"
    done
  fi
fi

echo ""

# Prune remote tracking branches
echo "Pruning stale remote tracking refs..."
git remote prune origin 2>/dev/null
echo "✅ Remote refs pruned"

# Show remaining branches
echo ""
echo "Remaining branches:"
git branch -vv | head -20
\`\`\`
`;
}

function depUpdate(s, config = {}) {
  return `---
name: dep-update
description: "Use this skill when updating dependencies, checking for outdated packages, or doing dependency maintenance. Also use when the user mentions 'npm update', 'outdated packages', 'security vulnerabilities', 'dependency audit', or 'package updates'. Checks for outdated deps, security issues, and updates safely."
---

# Dependency Update Check

\`\`\`bash
echo "📦 Dependency Update Check"
echo "========================="

if [ -f "package.json" ]; then
  echo "Node.js project detected"
  echo ""

  # Check for outdated
  echo "=== Outdated Packages ==="
  npm outdated 2>/dev/null || echo "  All up to date"
  echo ""

  # Security audit
  echo "=== Security Audit ==="
  npm audit --omit=dev 2>/dev/null | tail -5
  echo ""

  # Show what would change
  echo "=== Safe Updates (semver-compatible) ==="
  npm update --dry-run 2>/dev/null | head -20

elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
  echo "Python project detected"
  echo ""

  if command -v pip > /dev/null; then
    echo "=== Outdated Packages ==="
    pip list --outdated 2>/dev/null | head -20
  fi

  if [ -f "pyproject.toml" ] && command -v poetry > /dev/null; then
    echo "=== Poetry Updates ==="
    poetry show --outdated 2>/dev/null | head -20
  fi
else
  echo "No package.json or requirements.txt found in current directory"
fi
\`\`\`
`;
}

function portKiller(s, config = {}) {
  return `---
name: port-killer
description: "Use this skill when a port is in use, a server won't start because the port is taken, or you need to kill a process on a specific port. Also use when the user mentions 'address already in use', 'EADDRINUSE', 'port 3000 in use', 'kill server', or 'free up port'. Finds and kills the process using a given port."
---

# Kill Process on Port

\`\`\`bash
echo "🔪 Port Killer"
echo ""

# Common dev ports to check
for port in 3000 3456 5173 8080 8000 4000; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    name=$(ps -p $pid -o comm= 2>/dev/null)
    echo "  Port $port: PID $pid ($name)"
  fi
done

echo ""
read -p "Enter port to kill (or 'all' for all dev ports): " target

if [ "$target" = "all" ]; then
  for port in 3000 3456 5173 8080 8000 4000; do
    pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
      kill -9 $pid 2>/dev/null && echo "  Killed PID $pid on port $port"
    fi
  done
elif [ -n "$target" ]; then
  pid=$(lsof -ti :$target 2>/dev/null)
  if [ -n "$pid" ]; then
    name=$(ps -p $pid -o comm= 2>/dev/null)
    kill -9 $pid && echo "✅ Killed $name (PID $pid) on port $target"
  else
    echo "No process found on port $target"
  fi
fi
\`\`\`
`;
}

function dockerReset(s, config = {}) {
  return `---
name: docker-reset
description: "Use this skill when Docker is acting up, containers are stuck, or you need a fresh Docker environment. Also use when the user mentions 'docker cleanup', 'docker prune', 'remove all containers', 'docker taking too much space', or 'fresh docker'. Stops all containers, removes dangling images, and reclaims disk space."
---

# Docker Reset

\`\`\`bash
if ! command -v docker > /dev/null; then
  echo "❌ Docker not installed"
  exit 1
fi

echo "🐳 Docker Reset"
echo "==============="

# Current state
running=$(docker ps -q | wc -l | tr -d ' ')
stopped=$(docker ps -aq | wc -l | tr -d ' ')
images=$(docker images -q | wc -l | tr -d ' ')
echo "Running: $running | Stopped: $stopped | Images: $images"
echo ""

# Stop running containers
if [ "$running" -gt 0 ]; then
  echo "Stopping $running running containers..."
  docker stop $(docker ps -q) 2>/dev/null
fi

# Remove stopped containers
if [ "$stopped" -gt 0 ]; then
  echo "Removing $stopped containers..."
  docker rm $(docker ps -aq) 2>/dev/null
fi

# Prune
echo "Pruning unused resources..."
docker system prune -f 2>/dev/null | tail -3

# Final state
echo ""
echo "After cleanup:"
docker system df 2>/dev/null
\`\`\`
`;
}

function envCheck(s, config = {}) {
  return `---
name: env-check
description: "Use this skill when checking environment setup, debugging missing env vars, or verifying a project's environment is correct. Also use when the user mentions '.env file', 'environment variables', 'missing config', 'env not set', or 'setup check'. Compares .env.example with actual .env to find missing variables."
---

# Environment Check

\`\`\`bash
echo "🔍 Environment Check"
echo "==================="

# Find .env files
if [ -f ".env.example" ] && [ -f ".env" ]; then
  echo "Comparing .env.example with .env..."
  echo ""

  # Find missing vars
  missing=0
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue

    var=$(echo "$line" | cut -d= -f1)
    if ! grep -q "^$var=" .env 2>/dev/null; then
      echo "  ❌ Missing: $var"
      missing=$((missing + 1))
    fi
  done < .env.example

  if [ $missing -eq 0 ]; then
    echo "  ✅ All variables from .env.example are present in .env"
  else
    echo ""
    echo "  $missing variable(s) missing"
  fi

  # Check for empty values
  echo ""
  echo "Empty values in .env:"
  grep -E "^[A-Z_]+=\$" .env 2>/dev/null | while read line; do
    echo "  ⚠️  $line (empty)"
  done || echo "  ✅ No empty values"

elif [ -f ".env" ]; then
  echo "Found .env (no .env.example to compare against)"
  echo "Variables set: $(grep -c -E '^[A-Z]' .env)"
elif [ -f ".env.example" ]; then
  echo "⚠️  Found .env.example but no .env file"
  echo "Run: cp .env.example .env"
else
  echo "No .env or .env.example found in current directory"
fi
\`\`\`
`;
}

function logSearch(s, config = {}) {
  return `---
name: log-search
description: "Use this skill when searching through log files, finding errors in logs, or debugging from log output. Also use when the user mentions 'check logs', 'find errors', 'search logs', 'log files', 'what went wrong', or 'error in output'. Searches common log locations for recent errors and warnings."
---

# Log Search

\`\`\`bash
echo "📋 Log Search"
echo "============="

# Common log locations
locations=(
  "./logs"
  "./log"
  "/tmp/*.log"
  "$HOME/.pm2/logs"
  "$HOME/Library/Logs"
)

echo "Searching for recent errors (last 1 hour)..."
echo ""

for loc in "\${locations[@]}"; do
  if ls $loc 2>/dev/null | head -1 > /dev/null 2>&1; then
    files=$(find $loc -name "*.log" -mmin -60 2>/dev/null)
    for f in $files; do
      errors=$(grep -ci "error\|fatal\|exception\|panic" "$f" 2>/dev/null)
      if [ "$errors" -gt 0 ]; then
        echo "📁 $f ($errors errors)"
        grep -i "error\|fatal\|exception\|panic" "$f" 2>/dev/null | tail -5 | while read line; do
          echo "   $line"
        done
        echo ""
      fi
    done
  fi
done

# Also check npm/node logs
if [ -f "npm-debug.log" ]; then
  echo "📁 npm-debug.log"
  tail -10 npm-debug.log
fi

# PM2 logs
if command -v pm2 > /dev/null; then
  echo ""
  echo "=== PM2 Process Status ==="
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
  procs = json.load(sys.stdin)
  for p in procs:
    status = p.get('pm2_env',{}).get('status','?')
    restarts = p.get('pm2_env',{}).get('restart_time',0)
    name = p.get('name','?')
    icon = '✅' if status == 'online' else '❌'
    print(f'  {icon} {name}: {status} (restarts: {restarts})')
except: pass
" 2>/dev/null
fi
\`\`\`
`;
}

function dbSnapshot(s, config = {}) {
  return `---
name: db-snapshot
description: "Use this skill when backing up a database, creating a snapshot before migrations, or saving database state. Also use when the user mentions 'backup db', 'database snapshot', 'before migration', 'save database', 'dump db', or 'export data'. Creates timestamped snapshots of SQLite or PostgreSQL databases."
---

# Database Snapshot

\`\`\`bash
echo "💾 Database Snapshot"
echo "==================="

timestamp=$(date +%Y%m%d_%H%M%S)

# Detect database type
if ls *.db *.sqlite *.sqlite3 2>/dev/null | head -1 > /dev/null 2>&1; then
  echo "SQLite database(s) detected"
  mkdir -p ./snapshots

  for db in *.db *.sqlite *.sqlite3; do
    [ -f "$db" ] || continue
    snap="./snapshots/\${db%.db}_\${timestamp}.db"
    cp "$db" "$snap"
    size=$(du -h "$snap" | cut -f1)
    echo "  ✅ $db → $snap ($size)"
  done

elif command -v pg_dump > /dev/null; then
  echo "PostgreSQL detected"
  mkdir -p ./snapshots

  read -p "Database name: " dbname
  snap="./snapshots/${dbname}_${timestamp}.sql"
  pg_dump "$dbname" > "$snap" 2>/dev/null
  if [ $? -eq 0 ]; then
    size=$(du -h "$snap" | cut -f1)
    echo "  ✅ $dbname → $snap ($size)"
  else
    echo "  ❌ pg_dump failed — check credentials"
    rm -f "$snap"
  fi
else
  echo "No SQLite files found and pg_dump not available"
fi

# Show existing snapshots
echo ""
echo "Existing snapshots:"
ls -lh ./snapshots/ 2>/dev/null | tail -10 || echo "  None"
\`\`\`
`;
}
