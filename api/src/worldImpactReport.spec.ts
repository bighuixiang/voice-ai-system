import { describe, expect, it } from "vitest";
import { createWorldImpactReport } from "./worldImpactReport.js";

const valid = { reportId: "impact-1", changeType: "world-rule" as const, changedId: "teleport", changedSummary: "range reduced", affected: { characterChoices: ["choice-7"], causality: ["edge-2"], outline: ["chapter-4"], proseCandidates: ["candidate-9"], knowledge: ["belief-3"], obligations: ["debt-1"], readerExperience: ["reveal-2"], ending: ["ending-constraint"] }, protectedUnrelatedCanon: ["rule-fire", "character-sister"], evidenceRefs: ["change://teleport-v2"] };

describe("world impact report", () => {
  it("propagates a change across required downstream surfaces", () => {
    const report = createWorldImpactReport(valid);
    expect(report.status).toBe("complete");
    expect(report.affected.ending).toContain("ending-constraint");
  });

  it("blocks a report that silently omits a downstream surface", () => {
    expect(() => createWorldImpactReport({ ...valid, affected: { ...valid.affected, obligations: [] } })).toThrow("WORLD_IMPACT_SURFACE_MISSING");
  });

  it("requires explicit protection for unrelated canon", () => {
    expect(() => createWorldImpactReport({ ...valid, protectedUnrelatedCanon: [] })).toThrow("WORLD_IMPACT_PROTECTION_REQUIRED");
  });
});
