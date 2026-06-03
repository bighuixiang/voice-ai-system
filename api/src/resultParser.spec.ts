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

  it("keeps raw output when JSON is invalid", () => {
    const result = parseCodexResult("not json");
    expect(result.parseError).toBeTruthy();
    expect(result.content).toBe("not json");
  });
});
