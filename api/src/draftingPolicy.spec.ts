import { describe, expect, it } from "vitest";
import { assertDraftingExecutionReceipt, createDraftingExecutionReceipt } from "./draftingPolicy.js";

describe("drafting execution policy receipts", () => {
  it("freezes tier policy metrics without accepting prose payloads", () => {
    const receipt = createDraftingExecutionReceipt({
      projectSlug: "demo",
      runId: "run-1",
      chapterId: "chapter-001",
      riskTier: "elevated",
      candidateCount: 2,
      reviewCount: 1,
      repairCount: 2,
      elapsedMs: 1250,
      cost: { status: "unknown" },
      outcome: "accepted"
    });
    expect(receipt).toMatchObject({
      policyVersion: "tiered-quality.v1",
      riskTier: "elevated",
      candidateCount: 2,
      reviewCount: 1,
      repairCount: 2,
      elapsedMs: 1250,
      outcome: "accepted"
    });
    expect(receipt).not.toHaveProperty("content");
    expect(receipt.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects metrics that exceed the selected tier budget", () => {
    expect(() => createDraftingExecutionReceipt({
      projectSlug: "demo",
      runId: "run-1",
      chapterId: "chapter-001",
      riskTier: "ordinary",
      candidateCount: 2,
      reviewCount: 0,
      repairCount: 1,
      elapsedMs: 1,
      cost: { status: "unknown" },
      outcome: "blocked"
    })).toThrow("DRAFTING_POLICY_BUDGET_EXCEEDED");
  });

  it("fails closed when a persisted receipt is re-signed with altered metrics", () => {
    const receipt = createDraftingExecutionReceipt({
      projectSlug: "demo", runId: "run-1", chapterId: "chapter-001", riskTier: "ordinary",
      candidateCount: 1, reviewCount: 1, repairCount: 0, elapsedMs: 10,
      cost: { status: "unknown" }, outcome: "accepted"
    });
    const tampered = { ...receipt, repairCount: 1 };
    expect(() => assertDraftingExecutionReceipt(tampered)).toThrow("DRAFTING_POLICY_INTEGRITY_FAILED");
  });
});
