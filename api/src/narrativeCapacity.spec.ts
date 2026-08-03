import { describe, expect, it } from "vitest";
import { evaluateNarrativeCapacity } from "./narrativeCapacity.js";

const valid = {
  scopeId: "chapter-1",
  budget: { maxArcProgressions: 2, maxReveals: 2, maxCharacterChanges: 2, maxSettingIntroductions: 1, maxObligationActions: 2 },
  changes: [
    { changeId: "arc-1", kind: "arc-progression" as const, description: "main arc turns", evidenceRefs: ["outline://ch1#arc"] },
    { changeId: "reveal-1", kind: "reveal" as const, description: "one clue becomes explicit", evidenceRefs: ["outline://ch1#reveal"] },
    { changeId: "character-1", kind: "character-change" as const, description: "protagonist chooses", evidenceRefs: ["outline://ch1#choice"] },
    { changeId: "setting-1", kind: "setting-introduction" as const, description: "new location rule", evidenceRefs: ["outline://ch1#setting"] },
    { changeId: "obligation-1", kind: "obligation-action" as const, description: "reminder is scheduled", evidenceRefs: ["outline://ch1#obligation"] }
  ],
  sourceRefs: ["outline://ch1"]
};

describe("narrative capacity budget", () => {
  it("passes a scoped set of evidenced changes within budget", () => {
    const report = evaluateNarrativeCapacity(valid);
    expect(report).toMatchObject({ status: "passed", requiredActions: [] });
    expect(report.counts).toEqual({ arcProgressions: 1, reveals: 1, characterChanges: 1, settingIntroductions: 1, obligationActions: 1 });
  });

  it("blocks over-budget changes and requires a concrete mitigation", () => {
    const report = evaluateNarrativeCapacity({ ...valid, changes: [...valid.changes, { changeId: "reveal-2", kind: "reveal" as const, description: "second reveal", evidenceRefs: ["outline://ch1#reveal-2"] }, { changeId: "reveal-3", kind: "reveal" as const, description: "third reveal", evidenceRefs: ["outline://ch1#reveal-3"] }] });
    expect(report.status).toBe("blocked");
    expect(report.overBudgetKinds).toContain("reveals");
    expect(report.requiredActions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "reveals", action: "split-or-defer" })]));
  });

  it("allows explicit author risk acceptance without silently treating overflow as normal", () => {
    const report = evaluateNarrativeCapacity({ ...valid, changes: [...valid.changes, { changeId: "reveal-2", kind: "reveal" as const, description: "second reveal", evidenceRefs: ["outline://ch1#reveal-2"] }, { changeId: "reveal-3", kind: "reveal" as const, description: "third reveal", evidenceRefs: ["outline://ch1#reveal-3"] }], riskAcceptance: { actorId: "author-1", authorizationId: "auth-1", rationale: "finale deliberately compresses two reveals" } });
    expect(report.status).toBe("accepted-risk");
    expect(report.riskAcceptance?.authorizationId).toBe("auth-1");
  });

  it("requires evidence and non-empty descriptions for each change", () => {
    expect(evaluateNarrativeCapacity({ ...valid, sourceRefs: [] }).status).toBe("blocked");
    expect(evaluateNarrativeCapacity({ ...valid, sourceRefs: [], changes: [{ ...valid.changes[0], description: "", evidenceRefs: [] }] }).issues).toEqual(expect.arrayContaining(["CAPACITY_SOURCE_REQUIRED", "CAPACITY_CHANGE_EVIDENCE_REQUIRED"]));
  });
});
