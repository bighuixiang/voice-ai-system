import type { CodexTaskResult } from "./types.js";

const fallbackResult: CodexTaskResult = {
  summary: "",
  content: "",
  changes: [],
  risks: [],
  questions: [],
  patches: []
};

function extractJson(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseCodexResult(rawOutput: string): CodexTaskResult {
  const jsonText = extractJson(rawOutput);
  try {
    const parsed = JSON.parse(jsonText) as Partial<CodexTaskResult>;
    return {
      ...fallbackResult,
      ...parsed,
      summary: parsed.summary || "",
      content: parsed.content || "",
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
      rawOutput
    };
  } catch (error) {
    return {
      ...fallbackResult,
      summary: "Codex 输出解析失败",
      content: rawOutput,
      rawOutput,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
