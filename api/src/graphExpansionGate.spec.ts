import { describe, expect, it } from "vitest";
import { evaluateGraphExpansion } from "./graphExpansionGate.js";

describe("graph expansion gate", () => {
  const base = { gateId: "gate-1", currentChapterCount: 40, proposedAdditionalChapters: 12, currentBudgetCents: 1000, projectedAdditionalCostCents: 1800 };
  it("blocks over-budget expansion and exposes exactly three red-blue options", () => {
    const result = evaluateGraphExpansion(base);
    expect(result).toMatchObject({ allowed: false, reason: "EXPANSION_SCOPE_EXCEEDED", options: [{ choice: "neutralize" }, { choice: "compress-reclaim" }, { choice: "authorize-expansion" }] });
    expect(result.options).toHaveLength(3);
  });
  it("requires explicit authorization before expansion can be admitted", () => {
    expect(evaluateGraphExpansion({ ...base, choice: "authorize-expansion" })).toMatchObject({ allowed: false, reason: "EXPANSION_AUTHORIZATION_REQUIRED" });
    expect(evaluateGraphExpansion({ ...base, choice: "authorize-expansion", authorizationGranted: true })).toMatchObject({ allowed: true, selectedChoice: "authorize-expansion" });
  });
  it("does not block an in-scope graph", () => {
    expect(evaluateGraphExpansion({ ...base, proposedAdditionalChapters: 0, projectedAdditionalCostCents: 100 })).toMatchObject({ allowed: true });
  });
});
