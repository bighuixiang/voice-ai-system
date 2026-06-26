import type { CodexTaskResult } from "./types.js";

const fallbackResult: CodexTaskResult = {
  summary: "",
  content: "",
  changes: [],
  risks: [],
  questions: [],
  patches: []
};

function extractOuterFencedJson(rawOutput: string): string | null {
  const trimmed = rawOutput.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : null;
}

function normalizeTextField(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeParsedResult(parsed: Partial<CodexTaskResult>, rawOutput: string): CodexTaskResult {
  return {
    ...fallbackResult,
    ...parsed,
    summary: normalizeTextField(parsed.summary),
    content: normalizeTextField(parsed.content),
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    rawOutput
  };
}

export function parseCodexResult(rawOutput: string): CodexTaskResult {
  const trimmed = rawOutput.trim();
  const candidates = [trimmed];
  const fenced = extractOuterFencedJson(rawOutput);
  if (fenced && fenced !== trimmed) {
    candidates.push(fenced);
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<CodexTaskResult>;
      return normalizeParsedResult(parsed, rawOutput);
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ...fallbackResult,
    summary: "Codex output parse failed",
    content: rawOutput,
    rawOutput,
    parseError: lastError instanceof Error ? lastError.message : String(lastError)
  };
}
