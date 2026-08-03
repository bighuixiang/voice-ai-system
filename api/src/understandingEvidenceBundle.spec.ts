import { describe, expect, it } from "vitest";
import { evaluateUnderstandingEvidenceBundle } from "./understandingEvidenceBundle.js";

const valid = { claimId: "claim-1", status: "inferred" as const, confidenceInterval: [0.55, 0.8] as [number, number], supportingEvidenceRefs: ["utterance://u1#0-5"], opposingEvidenceRefs: ["utterance://u1#10-15"], interpreterVersion: "understanding-v2", promptVersion: "prompt-2026-07", alternatives: ["portal", "wreck"], sourceMessageIds: ["m1"] };

describe("understanding evidence bundle", () => {
  it("requires interval, support/opposition, prompt version and alternatives", () => {
    const result = evaluateUnderstandingEvidenceBundle(valid);
    expect(result).toMatchObject({ schemaVersion: "understanding-evidence-bundle.v1", status: "inferred", gateStatus: "passed", confidenceInterval: [0.55, 0.8], promptVersion: "prompt-2026-07" });
  });

  it("blocks overconfident inference without opposing evidence or bounded interval", () => {
    expect(() => evaluateUnderstandingEvidenceBundle({ ...valid, opposingEvidenceRefs: [] })).toThrow("UNDERSTANDING_OPPOSING_EVIDENCE_REQUIRED");
    expect(() => evaluateUnderstandingEvidenceBundle({ ...valid, confidenceInterval: [0.9, 0.4] })).toThrow("UNDERSTANDING_CONFIDENCE_INTERVAL_INVALID");
    expect(() => evaluateUnderstandingEvidenceBundle({ ...valid, status: "unknown", supportingEvidenceRefs: [], opposingEvidenceRefs: [], alternatives: [] })).toThrow("UNDERSTANDING_EVIDENCE_FIELDS_REQUIRED");
  });
});
