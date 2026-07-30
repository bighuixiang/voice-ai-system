import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { listExecutionWorkItems } from "./executionQueue.js";

export interface QuiescenceProof {
  schemaVersion: "quiescence-proof.v1";
  status: "quiescent";
  bookRunId: string;
  runVersion: number;
  activeWorkItemIds: string[];
  activeMutationLeases: string[];
  checkedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function proofPath(root: string, bookRunId: string, runVersion: number): string { return resolveInside(root, `sessions/book-runs/${bookRunId}.quiescence.v${runVersion}.json`); }
function verify(value: QuiescenceProof): boolean { const { fingerprint, ...base } = value; return hash(base) === fingerprint; }

async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export async function readQuiescenceProof(root: string, bookRunId: string, runVersion?: number): Promise<QuiescenceProof | null> {
  const directory = resolveInside(root, "sessions/book-runs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const candidates = names.filter((name) => name.startsWith(`${bookRunId}.quiescence.v`) && name.endsWith(".json") && (runVersion === undefined || name === `${bookRunId}.quiescence.v${runVersion}.json`)).sort();
  if (!candidates.length) return null;
  try {
    const proof = JSON.parse(await fs.readFile(path.join(directory, candidates.at(-1)!), "utf8")) as QuiescenceProof;
    return verify(proof) ? proof : null;
  } catch { return null; }
}

export async function issueQuiescenceProof(root: string, input: { bookRunId: string; runVersion: number }): Promise<QuiescenceProof> {
  if (!Number.isInteger(input.runVersion) || input.runVersion < 1) throw new Error("QUIESCENCE_RUN_VERSION_REQUIRED");
  const existing = await readQuiescenceProof(root, input.bookRunId, input.runVersion);
  if (existing) return existing;
  const activeWorkItemIds = (await listExecutionWorkItems(root)).filter((item) => ["queued", "claimed", "running"].includes(item.status)).map((item) => item.workItemId).sort();
  const activeMutationLeases = (await fs.readdir(resolveInside(root, "sessions/mutations")).catch(() => [] as string[])).filter((name) => name.endsWith(".lock")).sort();
  if (activeWorkItemIds.length || activeMutationLeases.length) throw new Error("QUIESCENCE_NOT_REACHED");
  const base = { schemaVersion: "quiescence-proof.v1" as const, status: "quiescent" as const, bookRunId: input.bookRunId, runVersion: input.runVersion, activeWorkItemIds, activeMutationLeases, checkedAt: new Date().toISOString() };
  const proof: QuiescenceProof = { ...base, fingerprint: hash(base) };
  await writeJson(proofPath(root, input.bookRunId, input.runVersion), proof);
  return proof;
}
