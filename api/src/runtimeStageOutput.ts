import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface RuntimeStageOutput<T = unknown> {
  schemaVersion: "runtime-stage-output.v1";
  outputId: string;
  runId: string;
  stage: string;
  value: T;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function outputPath(root: string, runId: string, stage: string): string {
  return resolveInside(root, `sessions/runtime-stage-outputs/${runId}/${stage}.json`);
}

function assertIntegrity<T>(output: RuntimeStageOutput<T>, runId: string, stage: string): RuntimeStageOutput<T> {
  if (
    output.schemaVersion !== "runtime-stage-output.v1" ||
    output.outputId !== `stage-output-${output.runId}-${output.stage}` ||
    output.runId !== runId ||
    output.stage !== stage ||
    !/^[a-f0-9]{64}$/i.test(output.fingerprint) ||
    hash(output.value) !== output.fingerprint
  ) {
    throw new Error("RUNTIME_STAGE_OUTPUT_INTEGRITY_FAILED");
  }
  return output;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readRuntimeStageOutput<T = unknown>(root: string, runId: string, stage: string): Promise<RuntimeStageOutput<T> | null> {
  try {
    return assertIntegrity(JSON.parse(await fs.readFile(outputPath(root, runId, stage), "utf8")) as RuntimeStageOutput<T>, runId, stage);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRuntimeStageOutput<T>(root: string, input: { runId: string; stage: string; value: T }): Promise<RuntimeStageOutput<T>> {
  const target = outputPath(root, input.runId, input.stage);
  const existing = await readRuntimeStageOutput<T>(root, input.runId, input.stage);
  const fingerprint = hash(input.value);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error("RUNTIME_STAGE_OUTPUT_IMMUTABLE");
    return existing;
  }
  const now = new Date().toISOString();
  const base = {
    schemaVersion: "runtime-stage-output.v1" as const,
    outputId: `stage-output-${input.runId}-${input.stage}`,
    runId: input.runId,
    stage: input.stage,
    value: input.value,
    fingerprint,
    createdAt: now,
    updatedAt: now
  };
  const output = { ...base };
  await writeJson(target, output);
  return output;
}
