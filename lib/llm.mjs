/**
 * LLM — Calls AI models to generate skills dynamically.
 *
 * Supports: Gemini (via Google AI), Anthropic, OpenAI, OpenRouter.
 * Reads API keys and model selection from config.
 * Falls back gracefully if no key is available.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".skill-builder/config.json");

function readConfig() {
  if (existsSync(CONFIG_PATH)) {
    try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); }
    catch { return {}; }
  }
  return {};
}

/**
 * Model routing — maps config model names to API calls.
 */
const MODEL_ROUTES = {
  "claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "gemini-pro": { provider: "google", model: "gemini-2.5-pro-preview-06-05" },
  "gemini-flash": { provider: "google", model: "gemini-2.0-flash" },
  "openrouter-auto": { provider: "openrouter", model: "openrouter/auto" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },
};

/**
 * Call an LLM with a prompt. Returns the text response.
 * Automatically routes to the right provider based on config.
 */
export async function callLlm(prompt, options = {}) {
  const config = readConfig();
  const modelName = options.model || config.analysisModel || "gemini-flash";
  const route = MODEL_ROUTES[modelName];

  if (!route) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(MODEL_ROUTES).join(", ")}`);
  }

  const keys = config.keys || {};

  switch (route.provider) {
    case "google":
      return callGoogle(prompt, route.model, keys.google);
    case "anthropic":
      return callAnthropic(prompt, route.model, keys.anthropic);
    case "openai":
      return callOpenai(prompt, route.model, keys.openai);
    case "openrouter":
      return callOpenrouter(prompt, route.model, keys.openrouter);
    default:
      throw new Error(`No provider for ${route.provider}`);
  }
}

/**
 * Check if any LLM is available (has a key configured).
 */
export function hasLlmAvailable() {
  const config = readConfig();
  const keys = config.keys || {};
  const modelName = config.analysisModel || "gemini-flash";
  const route = MODEL_ROUTES[modelName];
  if (!route) return false;

  switch (route.provider) {
    case "google": return !!keys.google;
    case "anthropic": return !!keys.anthropic;
    case "openai": return !!keys.openai;
    case "openrouter": return !!keys.openrouter;
    default: return false;
  }
}

// ─── Provider implementations ───────────────────────────────────

async function callGoogle(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Google API key not configured. Set it in Connections.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Anthropic API key not configured. Set it in Connections.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenai(prompt, model, apiKey) {
  if (!apiKey) throw new Error("OpenAI API key not configured. Set it in Connections.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callOpenrouter(prompt, model, apiKey) {
  if (!apiKey) throw new Error("OpenRouter API key not configured. Set it in Connections.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.replace("openrouter/", ""),
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
