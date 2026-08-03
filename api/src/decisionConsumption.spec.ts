import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDecisionConsumptionReceipt, persistDecisionConsumptionReceipt, readDecisionConsumptionReceipt } from "./decisionConsumption.js";

describe("decision consumption receipts", () => {
  it("records the exact decision version and consumer scope immutably", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "decision-consumption-"));
    try {
      const receipt = createDecisionConsumptionReceipt({ receiptId: "consume-1", projectSlug: "demo", decisionId: "decision-primary", decisionVersion: 2, consumer: "story-contract", consumerRef: "contract-v2", sourceFingerprint: "snapshot-v2" });
      await expect(persistDecisionConsumptionReceipt(root, receipt)).resolves.toMatchObject({ created: true });
      await expect(persistDecisionConsumptionReceipt(root, receipt)).resolves.toMatchObject({ created: false });
      await expect(readDecisionConsumptionReceipt(root, receipt.receiptId)).resolves.toEqual(receipt);
      const changed = createDecisionConsumptionReceipt({ receiptId: "consume-1", projectSlug: "demo", decisionId: "decision-primary", decisionVersion: 3, consumer: "story-contract", consumerRef: "contract-v3", sourceFingerprint: "snapshot-v3" });
      await expect(persistDecisionConsumptionReceipt(root, changed)).rejects.toThrow("DECISION_CONSUMPTION_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it("fails closed when a receipt is re-signed with an invalid timestamp", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "decision-consumption-"));
    const receipt = createDecisionConsumptionReceipt({ receiptId: "consume-2", projectSlug: "demo", decisionId: "decision-primary", decisionVersion: 1, consumer: "outline", consumerRef: "outline-v1", sourceFingerprint: "snapshot-v1" });
    await persistDecisionConsumptionReceipt(root, receipt);
    const target = path.join(root, "sessions", "decision-consumption", "consume-2.json");
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8"));
    const resigned = { ...base, consumedAt: "not-a-timestamp" };
    resigned.fingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readDecisionConsumptionReceipt(root, receipt.receiptId)).rejects.toThrow("DECISION_CONSUMPTION_INTEGRITY_FAILED");
  });

  it("rejects an invalid consumer at receipt creation time", () => {
    expect(() => createDecisionConsumptionReceipt({ receiptId: "consume-invalid-consumer", projectSlug: "demo", decisionId: "decision-primary", decisionVersion: 1, consumer: "unknown" as never, consumerRef: "ref-1", sourceFingerprint: "snapshot-v1" }))
      .toThrow("DECISION_CONSUMPTION_FIELDS_INVALID");
  });
});
