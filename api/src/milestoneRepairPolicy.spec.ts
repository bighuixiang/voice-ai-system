import { describe, expect, it } from "vitest";
import { evaluateMilestoneRepairEvidence } from "./milestoneRepairPolicy.js";

describe("milestone repair policy adapters", () => {
  it("requires kind-specific evidence families while allowing a repair receipt", () => {
    expect(evaluateMilestoneRepairEvidence({ kind: "character", evidenceRefs: ["audit://choice"] })).toMatchObject({ status: "blocked", issues: ["MILESTONE_CHARACTER_EVIDENCE_REQUIRED"] });
    expect(evaluateMilestoneRepairEvidence({ kind: "character", evidenceRefs: ["arc://choice"] })).toMatchObject({ status: "passed", issues: [] });
    expect(evaluateMilestoneRepairEvidence({ kind: "world", evidenceRefs: ["repair://rule"] })).toMatchObject({ status: "passed", issues: [] });
  });

  it("returns deterministic policy fingerprints and rejects empty evidence", () => {
    const first = evaluateMilestoneRepairEvidence({ kind: "obligation", evidenceRefs: ["obligation://coverage"] });
    const second = evaluateMilestoneRepairEvidence({ kind: "obligation", evidenceRefs: ["obligation://coverage"] });
    expect(first).toEqual(second);
    expect(evaluateMilestoneRepairEvidence({ kind: "projection", evidenceRefs: [] }).issues).toContain("MILESTONE_PROJECTION_EVIDENCE_REQUIRED");
  });
});
