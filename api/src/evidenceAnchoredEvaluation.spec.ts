import { describe, expect, it } from "vitest";
import { assertEvidenceAnchoredEvaluationCurrent, createEvidenceAnchoredEvaluation } from "./evidenceAnchoredEvaluation.js";

describe("evidence anchored evaluation", () => {
  it("supports a judgment only with text anchors, versions and a reason", () => {
    const evaluation = createEvidenceAnchoredEvaluation({ evaluationId: "eval-1", content: "The door opened. Rain entered.", anchors: [{ start: 0, end: 15 }], contractFingerprint: "contract-1", chapterIntentFingerprint: "intent-1", reason: "The opening fulfills the chapter hook." });
    expect(evaluation.status).toBe("supported");
    expect(() => assertEvidenceAnchoredEvaluationCurrent(evaluation, { content: "The door opened. Rain entered.", contractFingerprint: "contract-1", chapterIntentFingerprint: "intent-1" })).not.toThrow();
  });

  it("fails closed when the anchored text or governing version changes", () => {
    const evaluation = createEvidenceAnchoredEvaluation({ evaluationId: "eval-1", content: "The door opened.", anchors: [{ start: 0, end: 15 }], contractFingerprint: "contract-1", chapterIntentFingerprint: "intent-1", reason: "hook" });
    expect(() => assertEvidenceAnchoredEvaluationCurrent(evaluation, { content: "The window opened.", contractFingerprint: "contract-1", chapterIntentFingerprint: "intent-1" })).toThrow("EVALUATION_EVIDENCE_STALE");
    expect(() => assertEvidenceAnchoredEvaluationCurrent(evaluation, { content: "The door opened.", contractFingerprint: "contract-2", chapterIntentFingerprint: "intent-1" })).toThrow("EVALUATION_EVIDENCE_STALE");
    expect(() => createEvidenceAnchoredEvaluation({ evaluationId: "eval-2", content: "short", anchors: [{ start: 0, end: 99 }], contractFingerprint: "c", chapterIntentFingerprint: "i", reason: "reason" })).toThrow("EVALUATION_ANCHOR_INVALID");
  });
});
