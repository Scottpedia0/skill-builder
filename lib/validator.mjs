/**
 * Validator — Checks generated skills before installation.
 *
 * Catches: missing frontmatter, placeholder text, dangerous commands,
 * malformed bash, and other quality issues.
 *
 * Returns { valid, warnings, errors } so the UI/CLI can decide whether to install.
 */

/**
 * Validate a skill's markdown content before installation.
 */
export function validateSkill(content) {
  const errors = [];
  const warnings = [];

  if (!content || typeof content !== "string") {
    return { valid: false, errors: ["Empty or invalid content"], warnings: [] };
  }

  // 1. Frontmatter check
  if (!content.startsWith("---")) {
    errors.push("Missing YAML frontmatter (must start with ---)");
  } else {
    const fmEnd = content.indexOf("---", 3);
    if (fmEnd < 0) {
      errors.push("Unclosed YAML frontmatter");
    } else {
      const fm = content.slice(3, fmEnd);
      if (!fm.includes("name:")) errors.push("Frontmatter missing 'name' field");
      if (!fm.includes("description:")) errors.push("Frontmatter missing 'description' field");

      // Check description length
      const descMatch = fm.match(/description:\s*"([^"]+)"/);
      if (descMatch && descMatch[1].length < 30) {
        warnings.push(`Description is short (${descMatch[1].length} chars) — recommend 100+ words for better triggering`);
      }
    }
  }

  // 2. Placeholder check
  const placeholders = content.match(/<[A-Z_-]+>/g);
  if (placeholders) {
    errors.push(`Contains placeholders that won't run: ${placeholders.slice(0, 3).join(", ")}`);
  }

  // 3. TODO/FIXME check
  if (/\bTODO\b/i.test(content) || /\bFIXME\b/i.test(content)) {
    warnings.push("Contains TODO/FIXME — may be incomplete");
  }

  // 4. Dangerous command check
  const dangerous = [
    { pattern: /rm\s+-rf\s+[\/~]/, msg: "Contains 'rm -rf' targeting home or root directory" },
    { pattern: /rm\s+-rf\s+\$/, msg: "Contains 'rm -rf' with variable expansion — verify target" },
    { pattern: /mkfs/, msg: "Contains filesystem format command" },
    { pattern: /dd\s+if=/, msg: "Contains 'dd' disk write command" },
    { pattern: /chmod\s+777/, msg: "Contains 'chmod 777' — overly permissive" },
    { pattern: /curl.*\|\s*sh/, msg: "Contains 'curl | sh' — pipes remote content to shell" },
    { pattern: /curl.*\|\s*bash/, msg: "Contains 'curl | bash' — pipes remote content to shell" },
    { pattern: /eval\s+\$/, msg: "Contains 'eval' with variable — potential injection" },
  ];

  for (const { pattern, msg } of dangerous) {
    if (pattern.test(content)) {
      warnings.push(`⚠️  ${msg}`);
    }
  }

  // 5. Has actual code check
  const hasCodeBlock = /```(?:bash|sh|zsh)?\n[\s\S]+?\n```/.test(content);
  if (!hasCodeBlock) {
    warnings.push("No bash code block found — skill may be instructions-only");
  }

  // 6. Length check
  const lines = content.split("\n").length;
  if (lines > 500) {
    warnings.push(`Skill is ${lines} lines — recommend under 500 for progressive disclosure`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick safety check — returns true if content has no dangerous patterns.
 */
export function isSafe(content) {
  const { warnings } = validateSkill(content);
  return !warnings.some((w) => w.startsWith("⚠️"));
}
