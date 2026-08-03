import { describe, expect, it } from "vitest";
import { evaluateWorkItemFreshness } from "./runFreshness.js";

describe("run version freshness", () => {
  it("refreshes not-started work when an upstream version changes", () => {
    expect(evaluateWorkItemFreshness({ status: "ready", inputVersions: { contract: 1, policy: 2 }, currentVersions: { contract: 2, policy: 2 } })).toMatchObject({ status: "stale-not-started", action: "replace-input-version" });
  });

  it("pauses running work rather than mixing old and new contract inputs", () => {
    expect(evaluateWorkItemFreshness({ status: "running", inputVersions: { contract: 1 }, currentVersions: { contract: 2 } })).toMatchObject({ status: "stale-running", action: "pause-for-impact-analysis" });
  });

  it("marks completed work for audit without rolling it back", () => {
    expect(evaluateWorkItemFreshness({ status: "completed", inputVersions: { contract: 1 }, currentVersions: { contract: 2 } })).toMatchObject({ status: "audit-required", action: "mark-audit-required" });
  });
});
