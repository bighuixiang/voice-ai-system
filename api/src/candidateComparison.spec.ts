import { describe, expect, it } from "vitest";
import { compareCandidates } from "./candidateComparison.js";

describe("candidate comparison", () => {
  it("rejects hard-constraint failures before ranking by objective gaps", () => {
    const result = compareCandidates({ objectiveIds: ["voice", "intent"], candidates: [
      { candidateId: "bad", hardConstraintFailures: ["ending-protection"], objectiveEvidence: [], unresolvedRisks: ["kills voice"] },
      { candidateId: "good", hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "voice", gap: 1, evidenceRefs: ["r1"] }, { objectiveId: "intent", gap: 0, evidenceRefs: ["r2"] }], unresolvedRisks: ["needs foreshadowing"] }
    ] });
    expect(result).toMatchObject({ status: "ready", recommendation: "good", rejected: [{ candidateId: "bad" }] });
    expect(result.ranked[0]?.unresolvedRisks).toContain("needs foreshadowing");
  });

  it("blocks incomplete objective evidence instead of hiding it in a total score", () => {
    expect(compareCandidates({ objectiveIds: ["voice"], candidates: [{ candidateId: "c1", hardConstraintFailures: [], objectiveEvidence: [], unresolvedRisks: [] }] })).toMatchObject({ status: "blocked", reasons: ["OBJECTIVE_EVIDENCE_MISSING"] });
  });
});
