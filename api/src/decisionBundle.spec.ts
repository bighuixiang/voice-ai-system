import { describe, expect, it } from "vitest";
import { acceptDecisionBundle, createDecisionBundle } from "./decisionBundle.js";

const item = (decisionId: string, rollbackBoundary = "scene-1") => ({ decisionId, label: `${decisionId} label`, affectedAssets: [rollbackBoundary], risk: "low" as const, reversible: true, rollbackBoundary });

describe("decision bundles", () => {
  it("groups only reversible low-risk decisions with recommendation-first evidence", () => {
    const bundle = createDecisionBundle({ bundleId: "bundle-1", items: [item("name-1"), item("wording-1")], recommendation: "Use the concise names", strongestCounterargument: "The longer names may be more distinctive", nearTermOutcome: "The next scene reads cleanly" });
    expect(bundle).toMatchObject({ status: "reviewable", recommendation: "Use the concise names", items: [{ decisionId: "name-1" }, { decisionId: "wording-1" }] });
  });

  it("rejects irreversible, high-risk, or mixed rollback-boundary batches", () => {
    expect(() => createDecisionBundle({ bundleId: "bundle-2", items: [item("a"), { ...item("b"), reversible: false }], recommendation: "batch", strongestCounterargument: "risk", nearTermOutcome: "result" })).toThrow("DECISION_BUNDLE_NOT_REVERSIBLE");
    expect(() => createDecisionBundle({ bundleId: "bundle-3", items: [item("a"), { ...item("b"), rollbackBoundary: "chapter-2", affectedAssets: ["chapter-2"] }], recommendation: "batch", strongestCounterargument: "risk", nearTermOutcome: "result" })).toThrow("DECISION_BUNDLE_ROLLBACK_BOUNDARY_MISMATCH");
  });

  it("accepts a reviewable bundle atomically", () => {
    const bundle = createDecisionBundle({ bundleId: "bundle-4", items: [item("a")], recommendation: "keep", strongestCounterargument: "change later", nearTermOutcome: "continue" });
    expect(acceptDecisionBundle(bundle)).toMatchObject({ status: "accepted", bundleId: "bundle-4" });
  });
});
