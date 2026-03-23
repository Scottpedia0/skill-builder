/**
 * Analyzer — Reads Cowork.ai telemetry and extracts behavioral patterns.
 *
 * Queries the local SQLite DB for app usage, URL patterns, context switches,
 * and keystroke repetition. Returns structured pattern objects.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import Database from "better-sqlite3";

const DEFAULT_DB = join(
  homedir(),
  "Library/Application Support/Cowork.ai Alpha/database/cowork.db"
);

// OS plumbing apps — transitions involving these are noise
const IGNORE_APPS = new Set([
  "Universal Control",
  "UserNotificationCenter",
  "SecurityAgent",
  "AquaAppearanceHelper",
  "Finder",
  "System Settings",
  "loginwindow",
]);

export function openDb(dbPath = DEFAULT_DB) {
  if (!existsSync(dbPath)) {
    throw new Error(`Cowork.ai DB not found: ${dbPath}`);
  }
  return new Database(dbPath, { readonly: true });
}

export function analyzeApps(db, cutoff) {
  return db
    .prepare(
      `SELECT app_name,
              COUNT(*) as sessions,
              SUM(duration_ms) / 1000 / 60 as total_minutes,
              COUNT(DISTINCT date(started_at)) as active_days
       FROM activity_sessions
       WHERE started_at >= ?
       GROUP BY app_name
       ORDER BY total_minutes DESC`
    )
    .all(cutoff);
}

export function analyzeUrls(db, cutoff) {
  return db
    .prepare(
      `SELECT window_title, browser_url,
              COUNT(*) as visits,
              SUM(duration_ms) / 1000 / 60 as total_minutes
       FROM activity_sessions
       WHERE started_at >= ? AND app_name = 'Google Chrome'
         AND browser_url IS NOT NULL AND browser_url != ''
       GROUP BY browser_url
       ORDER BY visits DESC
       LIMIT 100`
    )
    .all(cutoff);
}

export function analyzeContextSwitches(db, cutoff) {
  const sessions = db
    .prepare(
      `SELECT app_name, started_at
       FROM activity_sessions
       WHERE started_at >= ?
       ORDER BY started_at`
    )
    .all(cutoff);

  const transitions = new Map();
  for (let i = 0; i < sessions.length - 1; i++) {
    const from = sessions[i].app_name;
    const to = sessions[i + 1].app_name;
    if (from !== to && !IGNORE_APPS.has(from) && !IGNORE_APPS.has(to)) {
      const key = `${from}→${to}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
  }

  return [...transitions.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

export function analyzeRepeatedText(db, cutoff) {
  return db
    .prepare(
      `SELECT app_name, chunk_text, COUNT(*) as occurrences
       FROM keystroke_chunks
       WHERE started_at >= ? AND char_count > 10
       GROUP BY chunk_text
       HAVING COUNT(*) > 2
       ORDER BY occurrences DESC
       LIMIT 20`
    )
    .all(cutoff);
}

export function analyzeAll(db, cutoff) {
  return {
    apps: analyzeApps(db, cutoff),
    urls: analyzeUrls(db, cutoff),
    transitions: analyzeContextSwitches(db, cutoff),
    repeatedText: analyzeRepeatedText(db, cutoff),
  };
}
