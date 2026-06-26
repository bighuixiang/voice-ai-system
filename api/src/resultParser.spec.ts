import { describe, expect, it } from "vitest";
import { parseCodexResult } from "./resultParser.js";

describe("parseCodexResult", () => {
  it("parses plain JSON", () => {
    const result = parseCodexResult('{"summary":"ok","content":"text","changes":["a"],"risks":[],"questions":[],"patches":[]}');
    expect(result.summary).toBe("ok");
    expect(result.changes).toEqual(["a"]);
  });

  it("parses JSON wrapped in markdown fences", () => {
    const result = parseCodexResult('```json\n{"summary":"fenced","content":"","changes":[],"risks":[],"questions":[],"patches":[]}\n```');
    expect(result.summary).toBe("fenced");
  });

  it("does not mistake markdown inside content for an outer JSON fence", () => {
    const result = parseCodexResult(
      JSON.stringify({
        summary: "ok",
        content: 'body\n```json\n{"nested":true}\n```',
        changes: [],
        risks: [],
        questions: [],
        patches: []
      })
    );
    expect(result.summary).toBe("ok");
    expect(result.parseError).toBeUndefined();
    expect(result.content).toContain('{"nested":true}');
  });

  it("keeps raw output when JSON is invalid", () => {
    const result = parseCodexResult("not json");
    expect(result.parseError).toBeTruthy();
    expect(result.content).toBe("not json");
  });

  it("stringifies structured content payloads so downstream runtime parsers can consume them safely", () => {
    const result = parseCodexResult(
      JSON.stringify({
        summary: "structured",
        content: {
          chapterId: "chapter-001",
          summary: "A recap candidate payload"
        },
        changes: [],
        risks: [],
        questions: [],
        patches: []
      })
    );

    expect(result.summary).toBe("structured");
    expect(typeof result.content).toBe("string");
    expect(result.content).toContain("\"chapterId\":\"chapter-001\"");
  });
});
