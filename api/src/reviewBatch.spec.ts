import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acceptReviewItem, createReviewBatch, persistReviewBatch, readReviewBatch, withdrawReviewItem } from "./reviewBatch.js";

describe("risk-scoped review batches", () => {
  it("keeps high-risk items out of aggregate review", () => {
    expect(() => createReviewBatch({ batchId: "batch-1", projectSlug: "demo", items: [{ itemId: "high-1", risk: "high", summary: "ending change", evidenceRefs: ["review://1"] }] })).toThrow("REVIEW_BATCH_HIGH_RISK_ITEM");
  });
  it("persists a low-risk batch while keeping per-item withdrawal and acceptance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "review-batch-"));
    try {
      const batch = createReviewBatch({ batchId: "batch-2", projectSlug: "demo", items: [{ itemId: "low-1", risk: "low", summary: "tighten wording", evidenceRefs: ["review://1"] }, { itemId: "low-2", risk: "low", summary: "trim repetition", evidenceRefs: ["review://2"] }] });
      await persistReviewBatch(root, batch);
      const withdrawn = await withdrawReviewItem(root, batch.batchId, "low-1");
      expect(withdrawn.status).toBe("partially_withdrawn");
      const accepted = await acceptReviewItem(root, batch.batchId, "low-2");
      expect(accepted.items).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: "low-1", status: "withdrawn" }), expect.objectContaining({ itemId: "low-2", status: "accepted" })]));
      await expect(readReviewBatch(root, batch.batchId)).resolves.toMatchObject({ status: "partially_withdrawn" });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it("fails closed when a persisted batch is re-signed with inconsistent status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "review-batch-"));
    const batch = createReviewBatch({ batchId: "batch-3", projectSlug: "demo", items: [{ itemId: "low-1", risk: "low", summary: "tighten wording", evidenceRefs: ["review://1"] }] });
    await persistReviewBatch(root, batch);
    const target = path.join(root, "sessions", "review-batches", "batch-3.json");
    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    await fs.writeFile(target, JSON.stringify({ ...persisted, status: "accepted" }), "utf8");
    await expect(readReviewBatch(root, "batch-3")).rejects.toThrow("REVIEW_BATCH_INTEGRITY_FAILED");
  });
});
