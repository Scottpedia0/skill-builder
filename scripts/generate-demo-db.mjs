#!/usr/bin/env node

/**
 * Generate a rich demo SQLite database with realistic activity data.
 *
 * This simulates a founder/developer who:
 * - Runs 3 AI coding agents (Claude Code, Codex, Gemini CLI)
 * - Has 8-10 meetings per week on Google Meet
 * - Uses GitHub heavily across 4 repos
 * - Monitors API costs on OpenRouter
 * - Manages finances on Brex
 * - Communicates on Slack
 * - Records video content
 * - Works 10-12 hour days with breaks
 *
 * The data is synthetic but structurally identical to real Cowork.ai output.
 * Run: node scripts/generate-demo-db.mjs
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "demo", "demo.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

// Remove existing
try { (await import("fs")).unlinkSync(DB_PATH); } catch {}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE activity_sessions (
    id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    bundle_id TEXT,
    window_title TEXT,
    browser_url TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_observed_at TEXT,
    duration_ms INTEGER,
    embedded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    content_hash TEXT,
    last_embedded_content_hash TEXT,
    embedding_profile_id TEXT
  );
  CREATE INDEX idx_activity_sessions_started_at ON activity_sessions (started_at);
  CREATE INDEX idx_activity_sessions_app_name ON activity_sessions (app_name);

  CREATE TABLE keystroke_chunks (
    id TEXT PRIMARY KEY,
    activity_session_id TEXT,
    app_name TEXT,
    bundle_id TEXT,
    chunk_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    embedded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_keystroke_chunks_started_at ON keystroke_chunks (started_at);
  CREATE INDEX idx_keystroke_chunks_app_name ON keystroke_chunks (app_name);
`);

const NOW = Date.now();
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// ─── Rich Activity Patterns ────────────────────────────────────

const CHROME_PAGES = [
  // Meetings (heavy — 30% of Chrome)
  { title: "Google Meet", url: "https://meet.google.com/abc-defg-hij", weight: 25, durRange: [180000, 3600000] },
  { title: "Meet - Weekly Standup", url: "https://meet.google.com/wkl-stnd-001", weight: 8, durRange: [900000, 1800000] },
  { title: "Meet - Product Review", url: "https://meet.google.com/prd-rvew-002", weight: 5, durRange: [1800000, 3600000] },
  { title: "Meet - Investor Call", url: "https://meet.google.com/inv-call-003", weight: 3, durRange: [1200000, 2400000] },
  { title: "Meet - 1:1 with Sarah", url: "https://meet.google.com/sar-1on1-004", weight: 4, durRange: [900000, 1800000] },

  // GitHub (heavy — 20% of Chrome)
  { title: "Pull requests · myorg/api-service", url: "https://github.com/myorg/api-service/pulls", weight: 8, durRange: [30000, 300000] },
  { title: "Issues · myorg/web-app", url: "https://github.com/myorg/web-app/issues", weight: 6, durRange: [30000, 180000] },
  { title: "Actions · myorg/api-service", url: "https://github.com/myorg/api-service/actions", weight: 5, durRange: [15000, 120000] },
  { title: "myorg/infra — terraform configs", url: "https://github.com/myorg/infra", weight: 3, durRange: [30000, 300000] },
  { title: "myorg/docs — team documentation", url: "https://github.com/myorg/docs", weight: 2, durRange: [60000, 600000] },

  // AI/ML tools
  { title: "Claude Code Docs", url: "https://docs.anthropic.com/claude-code", weight: 10, durRange: [30000, 600000] },
  { title: "Activity | OpenRouter", url: "https://openrouter.ai/activity", weight: 6, durRange: [15000, 120000] },
  { title: "Google Gemini", url: "https://gemini.google.com", weight: 4, durRange: [60000, 600000] },
  { title: "NotebookLM", url: "https://notebooklm.google.com", weight: 3, durRange: [120000, 1800000] },
  { title: "Anthropic Console — Usage", url: "https://console.anthropic.com/settings/usage", weight: 3, durRange: [15000, 60000] },

  // Business
  { title: "Brex Dashboard", url: "https://dashboard.brex.com/transactions", weight: 4, durRange: [30000, 300000] },
  { title: "Linear — Sprint Board", url: "https://linear.app/myteam/board", weight: 5, durRange: [30000, 300000] },
  { title: "Notion — Product Roadmap", url: "https://notion.so/Product-Roadmap-2026", weight: 3, durRange: [60000, 600000] },
  { title: "Stripe Dashboard", url: "https://dashboard.stripe.com/payments", weight: 2, durRange: [30000, 180000] },
  { title: "Vercel — Deployments", url: "https://vercel.com/myorg/web-app", weight: 3, durRange: [15000, 120000] },

  // Communication
  { title: "Slack API: Applications", url: "https://api.slack.com/apps", weight: 3, durRange: [30000, 300000] },
  { title: "#engineering - Slack", url: "https://app.slack.com/client/T123/C456", weight: 5, durRange: [30000, 300000] },
  { title: "Gmail — Inbox", url: "https://mail.google.com/mail/u/0/#inbox", weight: 4, durRange: [30000, 300000] },

  // Research / docs (long tail)
  { title: "Stack Overflow — async/await patterns", url: "https://stackoverflow.com/questions/async-await-patterns", weight: 2, durRange: [15000, 180000] },
  { title: "MDN Web Docs — Fetch API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API", weight: 1, durRange: [30000, 300000] },
  { title: "Hacker News", url: "https://news.ycombinator.com", weight: 2, durRange: [60000, 600000] },
  { title: "Recording Management - Zoom", url: "https://zoom.us/recording", weight: 2, durRange: [30000, 300000] },
];

const APPS = [
  // Chrome gets generated from CHROME_PAGES above
  { app: "VS Code", weight: 20, titles: [
    "api-service — routes/auth.ts",
    "web-app — components/Dashboard.tsx",
    "infra — main.tf",
    "api-service — middleware/rateLimit.ts",
    "web-app — hooks/useAuth.ts",
  ], durRange: [60000, 1800000] },

  { app: "Claude", weight: 15, titles: [
    "Claude Code — api-service",
    "Claude Code — web-app",
    "Claude Code — infra",
  ], durRange: [30000, 1200000] },

  { app: "Codex", weight: 10, titles: [
    "Codex — api-service refactor",
    "Codex — migration scripts",
  ], durRange: [30000, 900000] },

  { app: "Terminal", weight: 8, titles: [
    "zsh — ~/code/api-service",
    "zsh — ~/code/web-app",
    "gemini — sentry sweep",
  ], durRange: [15000, 600000] },

  { app: "Slack", weight: 5, titles: [
    "#engineering",
    "#general",
    "DM — Sarah Chen",
    "DM — Marcus (investor)",
  ], durRange: [15000, 300000] },

  { app: "QuickTime Player", weight: 2, titles: [
    "Screen Recording 2026-03-20",
    "Product Demo v3",
    "Investor Deck Walkthrough",
  ], durRange: [120000, 3600000] },

  { app: "Notes", weight: 2, titles: [
    "Meeting Notes — Product Review",
    "Quick Ideas",
    "Follow-up Items",
  ], durRange: [30000, 600000] },

  { app: "Numbers", weight: 1, titles: [
    "Monthly Budget",
    "Runway Calculator",
  ], durRange: [60000, 900000] },

  { app: "OpenWork", weight: 3, titles: [
    "OpenWork — multi-model dispatch",
  ], durRange: [30000, 300000] },

  { app: "ChatGPT", weight: 3, titles: [
    "ChatGPT — research",
  ], durRange: [60000, 600000] },
];

// Realistic keystroke patterns — things real people type repeatedly
const KEYSTROKES = [
  // Repeated phrases (template opportunities)
  { app: "Google Chrome", text: "sorry for the delay, been swamped this week", count: 44, reps: 8 },
  { app: "Google Chrome", text: "let me circle back on this tomorrow", count: 40, reps: 6 },
  { app: "Slack", text: "sounds good, will take a look", count: 33, reps: 7 },
  { app: "Slack", text: "can you send me the link?", count: 26, reps: 5 },
  { app: "Google Chrome", text: "thanks for sending this over", count: 31, reps: 5 },

  // Git commands (automation opportunities)
  { app: "Terminal", text: "git checkout main && git pull && git checkout -b feature/", count: 55, reps: 12 },
  { app: "Terminal", text: "npm run test && npm run build", count: 30, reps: 15 },
  { app: "Terminal", text: "git add . && git commit -m \"", count: 28, reps: 20 },
  { app: "Terminal", text: "docker compose up -d && docker compose logs -f", count: 47, reps: 6 },
  { app: "Terminal", text: "ssh aws-pro 'pm2 status'", count: 24, reps: 8 },

  // Code patterns
  { app: "VS Code", text: "export async function handle", count: 28, reps: 10 },
  { app: "VS Code", text: "try {\n  const result = await ", count: 30, reps: 8 },
  { app: "VS Code", text: "console.log('DEBUG:', JSON.stringify(", count: 36, reps: 12 },
  { app: "VS Code", text: "// TODO: clean this up later", count: 28, reps: 6 },

  // AI agent prompts
  { app: "Claude", text: "Fix the failing test in ", count: 25, reps: 9 },
  { app: "Claude", text: "Refactor this to use the existing pattern from ", count: 47, reps: 5 },
  { app: "Codex", text: "Review the PR and check for edge cases", count: 40, reps: 4 },

  // Search queries
  { app: "Google Chrome", text: "how to fix CORS error nextjs api route", count: 39, reps: 3 },
  { app: "Google Chrome", text: "postgres connection pool timeout", count: 32, reps: 3 },
  { app: "Google Chrome", text: "zod schema validation nested objects", count: 37, reps: 3 },
];

// ─── Time-aware generation ─────────────────────────────────────

// Generate work hours (8am-8pm with gaps for lunch/breaks)
function isWorkHour(date) {
  const hour = date.getHours();
  return hour >= 8 && hour <= 20;
}

function randomWorkTime(daysBack) {
  let attempts = 0;
  while (attempts < 100) {
    const offset = Math.random() * daysBack * 86400000;
    const time = new Date(NOW - offset);
    if (isWorkHour(time) && time.getDay() !== 0) { // Skip Sundays
      return time;
    }
    attempts++;
  }
  return new Date(NOW - Math.random() * daysBack * 86400000);
}

// ─── Insert data ───────────────────────────────────────────────

const insertSession = db.prepare(`
  INSERT INTO activity_sessions (id, app_name, window_title, browser_url, started_at, ended_at, duration_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertKeystroke = db.prepare(`
  INSERT INTO keystroke_chunks (id, activity_session_id, app_name, chunk_text, char_count, started_at, ended_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Build Chrome weight pool
const chromeWeight = CHROME_PAGES.reduce((s, p) => s + p.weight, 0);
function pickChromePage() {
  let r = Math.random() * chromeWeight;
  for (const p of CHROME_PAGES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return CHROME_PAGES[0];
}

// Build app weight pool (Chrome handled separately)
const appWeight = APPS.reduce((s, a) => s + a.weight, 0);
const chromeAppWeight = 35; // Chrome's weight in the overall mix
const totalAppWeight = appWeight + chromeAppWeight;

function pickActivity() {
  const r = Math.random() * totalAppWeight;
  if (r < chromeAppWeight) {
    const page = pickChromePage();
    const dur = page.durRange[0] + Math.random() * (page.durRange[1] - page.durRange[0]);
    return { app: "Google Chrome", title: page.title, url: page.url, duration: Math.floor(dur) };
  }

  let remaining = r - chromeAppWeight;
  for (const a of APPS) {
    remaining -= a.weight;
    if (remaining <= 0) {
      const title = a.titles[Math.floor(Math.random() * a.titles.length)];
      const dur = a.durRange[0] + Math.random() * (a.durRange[1] - a.durRange[0]);
      return { app: a.app, title, url: null, duration: Math.floor(dur) };
    }
  }
  return { app: "VS Code", title: "untitled", url: null, duration: 60000 };
}

const SESSION_COUNT = 8000;
const DAYS_BACK = 7;

console.log(`Generating ${SESSION_COUNT} activity sessions over ${DAYS_BACK} days...`);

const insertMany = db.transaction(() => {
  // Activity sessions
  for (let i = 0; i < SESSION_COUNT; i++) {
    const activity = pickActivity();
    const start = randomWorkTime(DAYS_BACK);
    const end = new Date(start.getTime() + activity.duration);

    insertSession.run(
      crypto.randomUUID(),
      activity.app,
      activity.title,
      activity.url,
      start.toISOString(),
      end.toISOString(),
      activity.duration,
      start.toISOString()
    );
  }

  // Keystroke chunks
  let keystrokeCount = 0;
  for (const ks of KEYSTROKES) {
    for (let j = 0; j < ks.reps; j++) {
      const start = randomWorkTime(DAYS_BACK);
      const end = new Date(start.getTime() + 3000 + Math.random() * 10000);

      insertKeystroke.run(
        crypto.randomUUID(),
        null,
        ks.app,
        ks.text,
        ks.count,
        start.toISOString(),
        end.toISOString(),
        start.toISOString()
      );
      keystrokeCount++;
    }
  }
  console.log(`Generated ${keystrokeCount} keystroke chunks`);
});

insertMany();

// Verify
const sessionCount = db.prepare("SELECT COUNT(*) as c FROM activity_sessions").get().c;
const ksCount = db.prepare("SELECT COUNT(*) as c FROM keystroke_chunks").get().c;
const appCount = db.prepare("SELECT COUNT(DISTINCT app_name) as c FROM activity_sessions").get().c;
const urlCount = db.prepare("SELECT COUNT(DISTINCT browser_url) as c FROM activity_sessions WHERE browser_url IS NOT NULL").get().c;

db.close();

console.log(`\nDemo database: ${DB_PATH}`);
console.log(`  ${sessionCount.toLocaleString()} activity sessions`);
console.log(`  ${ksCount} keystroke chunks`);
console.log(`  ${appCount} unique apps`);
console.log(`  ${urlCount} unique URLs`);
console.log(`\nTest it:`);
console.log(`  node bin/cli.mjs suggest --days 7`);
console.log(`  (set telemetryDb in ~/.skill-builder/config.json to "demo/demo.db")`);
