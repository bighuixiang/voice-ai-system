import { describe, expect, it } from "vitest";
import { projectRunProgress } from "./runProgressProjection.js";

describe("run progress projection", () => {
  it("reports versioned denominators and stage counts", () => {
    const projection = projectRunProgress({ graphVersion: 3, items: [
      { workItemId: "w1", chapterId: "c1", stage: "settled", weight: 2 },
      { workItemId: "w2", chapterId: "c2", stage: "planned", weight: 1 },
    ], openObligations: 1, activeLeases: 0, openMutations: 0, estimatedCostCents: 40, costVarianceCents: 5 });
    expect(projection).toMatchObject({ workGraphVersion: 3, denominators: { workItems: 2, weight: 3 }, byWorkItem: { settled: 1, planned: 1 }, byObligation: { open: 1 }, costRange: { lowCents: 35, highCents: 45 } });
    expect(projection.percentComplete).toBeCloseTo(2 / 3);
  });

  it("allows progress to fall when the frozen graph gains new work", () => {
    const before = projectRunProgress({ graphVersion: 1, items: [{ workItemId: "w1", chapterId: "c1", stage: "settled", weight: 1 }], openObligations: 0, activeLeases: 0, openMutations: 0, estimatedCostCents: 1, costVarianceCents: 0 });
    const after = projectRunProgress({ graphVersion: 2, items: [...[{ workItemId: "w1", chapterId: "c1", stage: "settled" as const, weight: 1 }, { workItemId: "w2", chapterId: "c2", stage: "planned" as const, weight: 3 }],], openObligations: 0, activeLeases: 0, openMutations: 0, estimatedCostCents: 4, costVarianceCents: 1 });
    expect(after.percentComplete).toBeLessThan(before.percentComplete);
    expect(after.denominators.weight).toBe(4);
  });
});
