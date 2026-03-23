#!/usr/bin/env node

/**
 * skill-engine CLI
 *
 * Commands:
 *   suggest          — Full analysis, output ranked suggestion queue
 *   daily            — Single pick for today (used by EOD skill)
 *   implement <id>   — Auto-generate and install a skill by suggestion ID
 *   implement --last — Auto-generate the most recent daily pick
 */

import { openDb, analyzeAll } from "../lib/analyzer.mjs";
import { generateSuggestions, dailyPick } from "../lib/suggester.mjs";
import { generateSkill } from "../lib/generator.mjs";

const args = process.argv.slice(2);
const command = args[0] || "daily";
const days = parseInt(getFlag("--days") || "3", 10);
const dryRun = args.includes("--dry-run");

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function main() {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let db;
  try {
    db = openDb();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const patterns = analyzeAll(db, cutoff);
  const suggestions = generateSuggestions(patterns);
  db.close();

  switch (command) {
    case "suggest": {
      // Full queue output
      console.log(`# Skill Suggestion Queue`);
      console.log(`\nAnalyzed ${days} days | ${suggestions.length} suggestions\n`);

      let current = "";
      for (const s of suggestions) {
        if (s.confidence !== current) {
          current = s.confidence;
          console.log(`## ${current.charAt(0).toUpperCase() + current.slice(1)} Confidence\n`);
        }
        console.log(`- [ ] **${s.id}** — ${s.description}`);
        console.log(`  Signal: ${s.signal} | Source: ${s.source}\n`);
      }
      break;
    }

    case "daily": {
      const pick = dailyPick(suggestions);
      if (!pick) {
        console.log("All suggestions have been reviewed. Run with --reset to start over.");
        break;
      }
      console.log(`## Today's Skill Suggestion\n`);
      console.log(`**${pick.id}** — ${pick.description}\n`);
      console.log(`- Signal: ${pick.signal}`);
      console.log(`- Confidence: ${pick.confidence}`);
      console.log(`- Source: ${pick.source}\n`);
      console.log(`Approve? Run: skill-engine implement ${pick.id}`);
      break;
    }

    case "implement": {
      const targetId = args[1];
      if (!targetId) {
        console.error("Usage: skill-engine implement <skill-id>");
        process.exit(1);
      }

      const target = suggestions.find((s) => s.id === targetId);
      if (!target) {
        console.error(`Suggestion '${targetId}' not found in current analysis.`);
        process.exit(1);
      }

      const result = generateSkill(target, { dryRun });
      if (!result) {
        console.error(`No generator available for source: ${target.source}`);
        process.exit(1);
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would write to:`);
        console.log(`  Installed: ${result.path}`);
        console.log(`  Canonical: ${result.brainPath}\n`);
        console.log(result.content);
      } else {
        console.log(`Skill installed:`);
        console.log(`  → ${result.path}`);
        console.log(`  → ${result.brainPath}`);
        console.log(`\nContent:\n`);
        console.log(result.content);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error(`Commands: suggest, daily, implement <id>`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
