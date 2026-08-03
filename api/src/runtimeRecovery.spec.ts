import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordRuntimeRetryReceipt } from "./runtimeRecovery.js";

describe("runtime recovery receipts", () => {
  it("persists a bounded retry decision and detects repeated work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-recovery-"));
    const receipt = await recordRuntimeRetryReceipt(root, {
      runId: "run-1",
      commandId: "cmd-1",
      stage: "chapter_draft",
      attempt: 3,
      errorCode: "HTTP_503",
      workFingerprints: ["chapter_draft", "chapter_draft", "chapter_draft"]
    });

    expect(receipt.decision).toMatchObject({ retry: false, retryClass: "transient", maxAttempts: 3 });
    expect(receipt.stagnation.status).toBe("paused");
    expect(receipt.stagnation.thresholds).toContain("repeated-work-fingerprint");
    await expect(recordRuntimeRetryReceipt(root, { runId: "run-1", commandId: "cmd-1", stage: "chapter_draft", attempt: 3, errorCode: "HTTP_503", workFingerprints: ["chapter_draft", "chapter_draft", "chapter_draft"] })).resolves.toEqual(receipt);
  });
});

