import { describe, expect, it } from "vitest";
import { createTextProfile, parseTextStructure, createTextDiagnostic, settleTextRoundTrip } from "./textProfile.js";

describe("text profile and settlement", () => {
  it("creates a versioned profile without silent normalization", () => {
    const profile = createTextProfile({ profileId: "p-1", locale: "zh-CN", allowedScripts: ["Han", "Latin"], unicodeNormalization: "none", encoding: "utf8", newline: "LF", paragraphSeparator: "blank-line", quoteStyle: "author-defined", exceptions: ["ellipsis rhythm"] });
    expect(profile.unicodeNormalization).toBe("none");
  });

  it("parses structure while isolating JSON/Markdown/prompt pollution", () => {
    const result = parseTextStructure({ profile: "p-1", version: "v1", text: "# Chapter 1\n\nA scene.\n\n```json\n{\"status\":\"done\"}\n```" });
    expect(result.blocks.some((block) => block.kind === "pollution-candidate")).toBe(true);
    expect(result.canonText).not.toContain('"status":"done"');
  });

  it("requires precise diagnostics and bounded repair authorization", () => {
    const diagnostic = createTextDiagnostic({ diagnosticId: "d-1", profileVersion: "p-1", severity: "mechanical", start: 2, end: 3, rule: "newline", reason: "inconsistent", counterExample: "author exception", repairBoundary: "local-only", authorApproved: false });
    expect(diagnostic.repairAllowed).toBe(false);
  });

  it("settles only a semantically equivalent round-trip with stable anchors", () => {
    const settlement = settleTextRoundTrip({ profileVersion: "p-1", originalHash: "h1", normalizedHash: "h1", structureHashBefore: "s1", structureHashAfter: "s1", sourceMapStable: true, diagnosticsResolved: true, exportRegressionPassed: true, approvedExceptions: [] });
    expect(settlement.status).toBe("settled");
  });
});
