import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { RuntimePipelineStage } from "./types.js";

export interface RuntimeControlBoundaryReceipt {
  schemaVersion: "runtime-control-boundary.v1";
  boundaryId: string;
  commandId: string;
  projectSlug: string;
  runId: string;
  status: "paused" | "cancelled";
  stage: RuntimePipelineStage | string;
  acknowledgedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function receiptPath(root: string, id: string): string { return resolveInside(root, `sessions/runtime-control-boundaries/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export async function readRuntimeControlBoundary(root: string, boundaryId: string): Promise<RuntimeControlBoundaryReceipt | null> {
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath(root, boundaryId), "utf8")) as RuntimeControlBoundaryReceipt;
    const { fingerprint: _fingerprint, ...base } = receipt;
    if (receipt.schemaVersion !== "runtime-control-boundary.v1" || receipt.boundaryId !== boundaryId || receipt.commandId.trim() === "" || receipt.projectSlug.trim() === "" || receipt.runId.trim() === "" || !["paused", "cancelled"].includes(receipt.status) || receipt.stage.trim() === "" || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint) || hash(base) !== receipt.fingerprint) throw new Error("RUNTIME_CONTROL_BOUNDARY_INTEGRITY_FAILED");
    return receipt;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function recordRuntimeControlBoundary(input: { root: string; commandId: string; projectSlug: string; runId: string; status: "paused" | "cancelled"; stage: RuntimePipelineStage | string }): Promise<RuntimeControlBoundaryReceipt> {
  const identity = { commandId: input.commandId.trim(), projectSlug: input.projectSlug.trim(), runId: input.runId.trim(), status: input.status, stage: input.stage.trim() };
  if (!identity.commandId || !identity.projectSlug || !identity.runId || !identity.stage) throw new Error("RUNTIME_CONTROL_BOUNDARY_INPUT_INVALID");
  const boundaryId = `boundary-${hash(identity).slice(0, 24)}`;
  const existing = await readRuntimeControlBoundary(input.root, boundaryId);
  if (existing) return existing;
  const base = { schemaVersion: "runtime-control-boundary.v1" as const, boundaryId, ...identity, acknowledgedAt: new Date().toISOString() };
  const receipt: RuntimeControlBoundaryReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(receiptPath(input.root, boundaryId), receipt);
  return receipt;
}
