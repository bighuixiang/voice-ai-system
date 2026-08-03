import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeControlBoundary, recordRuntimeControlBoundary } from "./runtimeControlBoundary.js";

describe("runtime control boundary receipts", () => {
  it("persists and replays a safe-boundary acknowledgement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-control-boundary-"));
    const input = { root, commandId: "cmd-1", projectSlug: "demo", runId: "run-1", status: "paused" as const, stage: "chapter_draft" };
    const first = await recordRuntimeControlBoundary(input);
    expect(await recordRuntimeControlBoundary(input)).toEqual(first);
    expect(await readRuntimeControlBoundary(root, first.boundaryId)).toEqual(first);
  });

  it("rejects tampered boundary evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-control-boundary-tamper-"));
    const receipt = await recordRuntimeControlBoundary({ root, commandId: "cmd-1", projectSlug: "demo", runId: "run-1", status: "cancelled", stage: "quality_review" });
    const target = path.join(root, "sessions/runtime-control-boundaries", `${receipt.boundaryId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.stage = "chapter_draft";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readRuntimeControlBoundary(root, receipt.boundaryId)).rejects.toThrow("RUNTIME_CONTROL_BOUNDARY_INTEGRITY_FAILED");
  });
});
