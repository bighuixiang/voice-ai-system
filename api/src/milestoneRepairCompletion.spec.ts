import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { recordMilestoneRepairCompletion, readMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";

describe("milestone repair completion", () => {
  it("persists an immutable idempotent completion receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-repair-completion-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 2, sourceFingerprint: "source", scopedChapterIds: ["c1"], issues: [{ kind: "obligation", targetId: "obl", reason: "missing", evidenceRefs: ["audit://obl"] }] });
    const input = { root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 2, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["repair://obl"] };
    const receipt = await recordMilestoneRepairCompletion(input);
    expect(receipt).toMatchObject({ schemaVersion: "milestone-repair-completion.v1", status: "completed", workItemId: input.workItemId, evidenceRefs: ["repair://obl"] });
    await expect(recordMilestoneRepairCompletion(input)).resolves.toEqual(receipt);
    await expect(readMilestoneRepairCompletion(root, receipt.receiptId)).resolves.toEqual(receipt);
    await expect(recordMilestoneRepairCompletion({ ...input, evidenceRefs: ["repair://other"] })).rejects.toThrow("MILESTONE_REPAIR_COMPLETION_IMMUTABLE");
  });

  it("fails closed for missing action, evidence, scope, and tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-repair-completion-invalid-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source", scopedChapterIds: ["c1"], issues: [{ kind: "continuity", targetId: "c1", reason: "drift", evidenceRefs: ["audit://c1"] }] });
    const base = { root, planId: plan.planId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: "book-repair-x", evidenceRefs: ["repair://c1"] };
    await expect(recordMilestoneRepairCompletion({ ...base, actionId: "missing" })).rejects.toThrow("MILESTONE_REPAIR_ACTION_NOT_FOUND");
    await expect(recordMilestoneRepairCompletion({ ...base, actionId: plan.actions[0].actionId, evidenceRefs: [] })).rejects.toThrow("MILESTONE_REPAIR_COMPLETION_EVIDENCE_REQUIRED");
    await expect(recordMilestoneRepairCompletion({ ...base, actionId: plan.actions[0].actionId, runVersion: 2 })).rejects.toThrow("MILESTONE_REPAIR_COMPLETION_SCOPE_MISMATCH");
    const receipt = await recordMilestoneRepairCompletion({ ...base, actionId: plan.actions[0].actionId });
    const target = path.join(root, "sessions", "milestone-repair-completions", `${receipt.receiptId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.status = "planned";
    await fs.writeFile(target, JSON.stringify(value), "utf8");
    await expect(readMilestoneRepairCompletion(root, receipt.receiptId)).rejects.toThrow("MILESTONE_REPAIR_COMPLETION_INTEGRITY_FAILED");
  });
});
