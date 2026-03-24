# Connecting Data Sources

skill-builder works best with rich activity data. The more context it has about how you work, the better the skill suggestions.

## Currently Supported

### Cowork.ai Desktop Telemetry
**Auto-detected.** If Cowork.ai is installed, skill-builder finds the database automatically.

Captures:
- App usage (which apps, how long, window titles)
- Browser URLs (sites visited, time per page)
- Keystrokes (what you type, in which apps)
- Context switches (app-to-app transitions)

This is the richest single source — it sees everything you do on your machine.

### Demo Data
Run `node scripts/generate-demo-db.mjs` to generate synthetic data that simulates a founder running AI coding agents. Good for testing and evaluation.

---

## Additional Sources You Can Connect

The analyzer reads a SQLite database with two tables: `activity_sessions` and `keystroke_chunks`. You can populate these from ANY source — the schema is simple.

### Shell History → Keystroke Chunks

Your terminal history is gold for suggesting automation skills.

```bash
# Import zsh history as keystroke chunks
sqlite3 ~/.skill-builder/custom.db "
  CREATE TABLE IF NOT EXISTS keystroke_chunks (
    id TEXT PRIMARY KEY,
    activity_session_id TEXT,
    app_name TEXT,
    chunk_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
"

# Parse and insert (adjust for your shell)
cat ~/.zsh_history | while read -r line; do
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  id=$(uuidgen)
  text=$(echo "$line" | sed "s/'/''/g")
  len=${#line}
  sqlite3 ~/.skill-builder/custom.db \
    "INSERT INTO keystroke_chunks (id, app_name, chunk_text, char_count, started_at, ended_at, created_at)
     VALUES ('$id', 'Terminal', '$text', $len, '$ts', '$ts', '$ts')"
done
```

**What it finds:** Repeated git commands, deploy scripts, SSH patterns → suggests automation skills.

### Browser History (Chrome)

Chrome stores history in a SQLite database. No extension needed.

```bash
# macOS Chrome history location
CHROME_DB=~/Library/Application\ Support/Google/Chrome/Default/History

# Copy to avoid lock issues
cp "$CHROME_DB" /tmp/chrome-history.db

# Query recent URLs
sqlite3 /tmp/chrome-history.db "
  SELECT url, title, visit_count, datetime(last_visit_time/1000000-11644473600, 'unixepoch') as last_visit
  FROM urls
  WHERE last_visit_time > 0
  ORDER BY visit_count DESC
  LIMIT 50
"
```

You can import these into the `activity_sessions` table as Chrome sessions.

### Google Calendar → Meeting Patterns

Use the Google Calendar API or a CLI tool to export your calendar:

```bash
# Using gcalcli (pip install gcalcli)
gcalcli agenda --details all --tsv 2026-03-01 2026-03-23

# Or use the Google Calendar MCP if you have it configured
```

**What it finds:** Meeting-heavy days → suggests meeting-auto-brief skill. Recurring 1:1s → suggests prep skills for specific people.

### Slack Messages

Export your Slack message history (DMs, channels) to understand communication patterns:

```bash
# If you have Slack MCP configured, search recent messages
# Or use the Slack API directly:
curl -s "https://slack.com/api/conversations.history?channel=C123&limit=100" \
  -H "Authorization: Bearer xoxb-your-token"
```

**What it finds:** Repeated questions → suggests FAQ/template skills. Frequent status updates → suggests standup automation.

### AI Conversation Transcripts

If you use Claude Code, Codex, or other AI agents, their conversation logs contain rich pattern data:

```bash
# Claude Code conversations
ls ~/.claude/projects/*/conversations/

# Codex sessions
ls ~/.codex/sessions/

# superwhisper voice transcripts
ls ~/Library/Application\ Support/superwhisper/transcripts/
```

**What it finds:** Repeated prompts → suggests templated slash commands. Common debugging patterns → suggests debugging skills.

### Git Commit Patterns

```bash
# Find your most common commit message patterns
git log --oneline --since="30 days ago" | \
  sed 's/^[a-f0-9]* //' | \
  sort | uniq -c | sort -rn | head -20

# Find files you change together (co-change analysis)
git log --oneline --name-only --since="30 days ago" | \
  awk '/^$/{next} /^[a-f0-9]/{prefix=$0; next} {print prefix, $0}' | \
  sort | uniq -c | sort -rn | head -20
```

**What it finds:** Files that always change together → suggests coordinated edit skills. Repeated commit patterns → suggests workflow automation.

### macOS Screen Time

macOS tracks app usage natively:

```bash
# Screen Time database (requires Full Disk Access)
ls ~/Library/Application\ Support/com.apple.ScreenTimeAgent/Store/
```

This is a fallback if you don't have Cowork.ai — the schema is different but contains similar app-usage data.

---

## Schema Reference

To connect a custom data source, insert records into these two tables:

### activity_sessions
```sql
CREATE TABLE activity_sessions (
  id TEXT PRIMARY KEY,           -- UUID
  app_name TEXT NOT NULL,        -- "Google Chrome", "VS Code", etc.
  window_title TEXT,             -- Window/tab title
  browser_url TEXT,              -- URL if browser app
  started_at TEXT NOT NULL,      -- ISO 8601 timestamp
  ended_at TEXT,                 -- ISO 8601 timestamp
  duration_ms INTEGER,           -- Duration in milliseconds
  created_at TEXT NOT NULL       -- ISO 8601 timestamp
);
```

### keystroke_chunks
```sql
CREATE TABLE keystroke_chunks (
  id TEXT PRIMARY KEY,           -- UUID
  activity_session_id TEXT,      -- Optional FK to activity_sessions
  app_name TEXT,                 -- Which app the text was typed in
  chunk_text TEXT NOT NULL,      -- The actual text typed
  char_count INTEGER NOT NULL,   -- Character count
  started_at TEXT NOT NULL,      -- ISO 8601 timestamp
  ended_at TEXT NOT NULL,        -- ISO 8601 timestamp
  created_at TEXT NOT NULL       -- ISO 8601 timestamp
);
```

The analyzer only reads from these two tables. As long as your data fits the schema, skill-builder will find patterns in it.
