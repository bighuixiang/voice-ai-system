import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeStageOutput, writeRuntimeStageOutput } from "./runtimeStageOutput.js";

describe("runtime stage outputs", () => {
  it("persists an immutable output and reuses the same fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-output-"));
    const first = await writeRuntimeStageOutput(root, { runId: "run-1", stage: "chapter_plan", value: { summary: "turn" } });
    const second = await writeRuntimeStageOutput(root, { runId: "run-1", stage: "chapter_plan", value: { summary: "turn" } });

    expect(second).toEqual(first);
    expect(await readRuntimeStageOutput(root, "run-1", "chapter_plan")).toEqual(first);
    await expect(writeRuntimeStageOutput(root, { runId: "run-1", stage: "chapter_plan", value: { summary: "changed" } })).rejects.toThrow("RUNTIME_STAGE_OUTPUT_IMMUTABLE");
  });

  it("fails closed when the persisted value is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-output-integrity-"));
    await writeRuntimeStageOutput(root, { runId: "run-1", stage: "chapter_plan", value: { summary: "turn" } });
    const target = path.join(root, "sessions", "runtime-stage-outputs", "run-1", "chapter_plan.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.value = { summary: "tampered" };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");

    await expect(readRuntimeStageOutput(root, "run-1", "chapter_plan")).rejects.toThrow("RUNTIME_STAGE_OUTPUT_INTEGRITY_FAILED");
  });
});
