import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isRuntimeStageOutputAvailable, isRuntimeStageOutputReusable, listRuntimeStageReceipts, recordRuntimeStageReceipt, selectFirstUnsettledRuntimeStage, stageInputFingerprint } from "./runtimeStageReceipt.js";

describe("runtime stage receipts", () => {
  it("persists idempotent stage progress and allows completion", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-receipt-"));
    const inputFingerprint = stageInputFingerprint({ chapterId: "chapter-1", context: "ctx-1" });
    const started = await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", chapterId: "chapter-1", stage: "chapter_draft", status: "started", inputFingerprint });
    expect(await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", chapterId: "chapter-1", stage: "chapter_draft", status: "started", inputFingerprint })).toEqual(started);
    const completed = await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", chapterId: "chapter-1", stage: "chapter_draft", status: "completed", inputFingerprint });
    expect(completed).toMatchObject({ status: "completed", receiptId: started.receiptId });
    expect(await listRuntimeStageReceipts(root, "run-1")).toHaveLength(1);
  });

  it("blocks a late stage result whose input fingerprint is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-receipt-stale-"));
    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "context_assemble", status: "started", inputFingerprint: "fresh" });
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "context_assemble", status: "completed", inputFingerprint: "stale" })).rejects.toThrow("RUNTIME_STAGE_INPUT_STALE");
  });

  it("binds a completed stage to one output fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-receipt-output-"));
    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "checkpoint_before_run", status: "started", inputFingerprint: "input" });
    const completed = await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "checkpoint_before_run", status: "completed", inputFingerprint: "input", outputFingerprint: "a".repeat(64), outputRef: "checkpoint-1" });
    expect(completed).toMatchObject({ outputFingerprint: "a".repeat(64), outputRef: "checkpoint-1" });
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "checkpoint_before_run", status: "completed", inputFingerprint: "input", outputFingerprint: "b".repeat(64) })).rejects.toThrow("RUNTIME_STAGE_OUTPUT_STALE");
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "checkpoint_before_run", status: "completed", inputFingerprint: "input", outputFingerprint: "a".repeat(64), outputRef: "checkpoint-2" })).rejects.toThrow("RUNTIME_STAGE_OUTPUT_STALE");
  });

  it("keeps completed and failed receipts terminal until a new repair lineage is created", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-receipt-terminal-"));
    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "chapter_draft", status: "started", inputFingerprint: "same" });
    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "chapter_draft", status: "completed", inputFingerprint: "same" });
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "chapter_draft", status: "failed", inputFingerprint: "same" })).rejects.toThrow("RUNTIME_STAGE_TERMINAL");

    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-2", stage: "context_assemble", status: "started", inputFingerprint: "same" });
    await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-2", stage: "context_assemble", status: "failed", inputFingerprint: "same" });
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-2", stage: "context_assemble", status: "completed", inputFingerprint: "same" })).rejects.toThrow("RUNTIME_STAGE_TERMINAL");
  });

  it("selects the first missing, active, failed, or stale stage in pipeline order", () => {
    const stages = ["capture", "draft", "review"];
    expect(selectFirstUnsettledRuntimeStage([], stages)).toMatchObject({ stage: "capture", reason: "missing" });
    expect(selectFirstUnsettledRuntimeStage([{ stage: "capture", status: "started", inputFingerprint: "a" }], stages)).toMatchObject({ stage: "capture", reason: "started" });
    expect(selectFirstUnsettledRuntimeStage([{ stage: "capture", status: "failed", inputFingerprint: "a" }], stages)).toMatchObject({ stage: "capture", reason: "failed" });
    expect(selectFirstUnsettledRuntimeStage([{ stage: "capture", status: "completed", inputFingerprint: "old" }], stages, { capture: "new" })).toMatchObject({ stage: "capture", reason: "input_stale" });
    expect(selectFirstUnsettledRuntimeStage([{ stage: "capture", status: "completed", inputFingerprint: "a" }, { stage: "draft", status: "completed", inputFingerprint: "b" }, { stage: "review", status: "completed", inputFingerprint: "c" }], stages, { capture: "a", draft: "b", review: "c" })).toMatchObject({ stage: null, reason: "all_completed" });
  });

  it("reuses a completed output only when input, fingerprint, and reference all match", () => {
    const receipt = { status: "completed" as const, inputFingerprint: "input", outputFingerprint: "output", outputRef: "knowledge-index" };
    expect(isRuntimeStageOutputReusable(receipt, "input", "output", "knowledge-index")).toBe(true);
    expect(isRuntimeStageOutputReusable(receipt, "stale-input", "output", "knowledge-index")).toBe(false);
    expect(isRuntimeStageOutputReusable(receipt, "input", "stale-output", "knowledge-index")).toBe(false);
    expect(isRuntimeStageOutputReusable(receipt, "input", "output", "other-output")).toBe(false);
    expect(isRuntimeStageOutputReusable({ ...receipt, status: "started" }, "input", "output", "knowledge-index")).toBe(false);
    expect(isRuntimeStageOutputAvailable({ ...receipt, status: "started" }, "input", "output", "knowledge-index")).toBe(true);
    expect(isRuntimeStageOutputAvailable({ ...receipt, status: "failed" }, "input", "output", "knowledge-index")).toBe(false);
  });

  it("fails closed when a persisted receipt is tampered before reuse or listing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-receipt-integrity-"));
    const receipt = await recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "chapter_draft", status: "started", inputFingerprint: "fresh" });
    const target = path.join(root, "sessions", "runtime-stage-receipts", "run-1", "chapter_draft.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.inputFingerprint = "tampered";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(listRuntimeStageReceipts(root, "run-1")).rejects.toThrow("RUNTIME_STAGE_RECEIPT_INTEGRITY_FAILED");
    await expect(recordRuntimeStageReceipt(root, { projectSlug: "demo", runId: "run-1", stage: "chapter_draft", status: "completed", inputFingerprint: "fresh" })).rejects.toThrow("RUNTIME_STAGE_RECEIPT_INTEGRITY_FAILED");
    expect(receipt.receiptId).toBe("stage-receipt-run-1-chapter_draft");
  });
});
