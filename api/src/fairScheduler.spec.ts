import { describe, expect, it } from "vitest";
import { selectFairWorkItems } from "./fairScheduler.js";

describe("fair project scheduler", () => {
  it("gives a waiting project a slot instead of letting one project monopolize the queue", () => {
    const selected = selectFairWorkItems({ maxSlots: 2, candidates: [
      { workItemId: "a1", projectSlug: "A", priority: 100, waitedMs: 1, dependenciesReady: true, budgetAllowed: true },
      { workItemId: "a2", projectSlug: "A", priority: 99, waitedMs: 1, dependenciesReady: true, budgetAllowed: true },
      { workItemId: "b1", projectSlug: "B", priority: 1, waitedMs: 10000, dependenciesReady: true, budgetAllowed: true },
    ] });
    expect(selected.map((item) => item.workItemId)).toEqual(expect.arrayContaining(["a1", "b1"]));
  });

  it("filters dependency and budget blocked items and remains deterministic", () => {
    const selected = selectFairWorkItems({ maxSlots: 3, candidates: [
      { workItemId: "a", projectSlug: "A", priority: 1, waitedMs: 10, dependenciesReady: false, budgetAllowed: true },
      { workItemId: "b", projectSlug: "B", priority: 2, waitedMs: 10, dependenciesReady: true, budgetAllowed: false },
      { workItemId: "c", projectSlug: "C", priority: 1, waitedMs: 20, dependenciesReady: true, budgetAllowed: true },
    ] });
    expect(selected).toEqual([expect.objectContaining({ workItemId: "c" })]);
  });
});
