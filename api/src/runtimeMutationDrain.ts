import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface RuntimeMutationDrainReceipt {
  schemaVersion: "runtime-mutation-drain.v1";
  drainId: string;
  boundaryId: string;
  projectSlug: string;
  runId: string;
  status: "drained" | "blocked";
  activeMutationLeases: string[];
  checkedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function drainPath(root: string, id: string): string { return resolveInside(root, `sessions/runtime-mutation-drains/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }
async function activeLeases(root: string): Promise<string[]> { return (await fs.readdir(resolveInside(root, "sessions/mutations")).catch(() => [] as string[])).filter((name) => name.endsWith(".lock")).sort(); }

export async function readRuntimeMutationDrain(root: string, drainId: string): Promise<RuntimeMutationDrainReceipt | null> {
  try {
    const receipt = JSON.parse(await fs.readFile(drainPath(root, drainId), "utf8")) as RuntimeMutationDrainReceipt;
    const { fingerprint: _fingerprint, ...base } = receipt;
    if (receipt.schemaVersion !== "runtime-mutation-drain.v1" || receipt.drainId !== drainId || receipt.boundaryId.trim() === "" || receipt.projectSlug.trim() === "" || receipt.runId.trim() === "" || !["drained", "blocked"].includes(receipt.status) || !Array.isArray(receipt.activeMutationLeases) || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint) || hash(base) !== receipt.fingerprint) throw new Error("RUNTIME_MUTATION_DRAIN_INTEGRITY_FAILED");
    return receipt;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function recordRuntimeMutationDrain(input: { root: string; boundaryId: string; projectSlug: string; runId: string }): Promise<RuntimeMutationDrainReceipt> {
  const leases = await activeLeases(input.root);
  const identity = { boundaryId: input.boundaryId.trim(), projectSlug: input.projectSlug.trim(), runId: input.runId.trim(), status: leases.length ? "blocked" as const : "drained" as const, activeMutationLeases: leases };
  if (!identity.boundaryId || !identity.projectSlug || !identity.runId) throw new Error("RUNTIME_MUTATION_DRAIN_INPUT_INVALID");
  const drainId = `drain-${hash(identity).slice(0, 24)}`;
  const existing = await readRuntimeMutationDrain(input.root, drainId);
  if (existing) return existing;
  const base = { schemaVersion: "runtime-mutation-drain.v1" as const, drainId, ...identity, checkedAt: new Date().toISOString() };
  const receipt: RuntimeMutationDrainReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(drainPath(input.root, drainId), receipt);
  return receipt;
}
