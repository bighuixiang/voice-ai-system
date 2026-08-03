import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { listExecutionWorkItems } from "./executionQueue.js";
import { readBudgetReservation } from "./budgetReservation.js";
import { readModelInvocations } from "./modelInvocationLedger.js";
import { assertModelInvocationSettlementIntegrity } from "./modelInvocationSettlement.js";

export interface QuiescenceProof {
  schemaVersion: "quiescence-proof.v1";
  status: "quiescent";
  bookRunId: string;
  runVersion: number;
  activeWorkItemIds: string[];
  activeMutationLeases: string[];
  activeMutationPlanIds: string[];
  activeBudgetReservationIds: string[];
  unknownInvocationIds: string[];
  checkedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function proofPath(root: string, bookRunId: string, runVersion: number): string { return resolveInside(root, `sessions/book-runs/${bookRunId}.quiescence.v${runVersion}.json`); }
function verify(value: QuiescenceProof): boolean { const { fingerprint, ...base } = value; return value.schemaVersion === "quiescence-proof.v1" && value.status === "quiescent" && typeof value.bookRunId === "string" && value.bookRunId.trim().length > 0 && Number.isInteger(value.runVersion) && value.runVersion > 0 && Array.isArray(value.activeWorkItemIds) && Array.isArray(value.activeMutationLeases) && Array.isArray(value.activeMutationPlanIds) && Array.isArray(value.activeBudgetReservationIds) && Array.isArray(value.unknownInvocationIds) && typeof value.checkedAt === "string" && Number.isFinite(Date.parse(value.checkedAt)) && hash(base) === fingerprint; }
export async function inspectQuiescenceState(root: string, bookRunId?: string): Promise<{ activeWorkItemIds: string[]; activeMutationLeases: string[]; activeMutationPlanIds: string[]; activeBudgetReservationIds: string[]; unknownInvocationIds: string[] }> {
  const activeWorkItemIds = (await listExecutionWorkItems(root))
    .filter((item) => !bookRunId || !item.runId || item.runId === bookRunId)
    .filter((item) => !["completed", "cancelled"].includes(item.status))
    .map((item) => item.workItemId)
    .sort();
  const activeMutationLeases = (await fs.readdir(resolveInside(root, "sessions/mutations")).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".lock"))
    .sort();
  const mutationPlanNames = (await fs.readdir(resolveInside(root, "sessions/mutations")).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5));
  const unresolvedMutationPlanIds: string[] = [];
  for (const mutationId of mutationPlanNames) {
    try {
      const value = JSON.parse(await fs.readFile(resolveInside(root, `sessions/mutations/${mutationId}.json`), "utf8")) as { status?: string };
      if (["prepared", "committing", "rolling_back", "failed"].includes(value.status || "")) unresolvedMutationPlanIds.push(mutationId);
    } catch {
      unresolvedMutationPlanIds.push(mutationId);
    }
  }
  const activeBudgetReservationIds: string[] = [];
  const reservationNames = await fs.readdir(resolveInside(root, "sessions/book-runs")).catch(() => [] as string[]);
  for (const name of reservationNames.filter((candidate) => candidate.endsWith(".budget-reservation.json"))) {
    const reservation = await readBudgetReservation(root, name.slice(0, -".budget-reservation.json".length));
    if (reservation && reservation.status === "reserved" && (!bookRunId || reservation.bookRunId === bookRunId)) activeBudgetReservationIds.push(reservation.reservationId);
  }
  const settlementNames = await fs.readdir(resolveInside(root, "sessions/model-invocation-settlements")).catch(() => [] as string[]);
  const settledInvocations = new Map<string, { invocationFingerprint: string; bookRunId: string }>();
  for (const name of settlementNames.filter((entry) => entry.startsWith("invocation-settlement-") && entry.endsWith(".json"))) {
    try {
      const settlement = assertModelInvocationSettlementIntegrity(JSON.parse(await fs.readFile(resolveInside(root, `sessions/model-invocation-settlements/${name}`), "utf8")), name.slice(0, -5));
      settledInvocations.set(settlement.invocationId, { invocationFingerprint: settlement.invocationFingerprint, bookRunId: settlement.bookRunId });
    } catch { /* malformed settlement must not suppress unknown invocation state */ }
  }
  const unknownInvocationIds = (await readModelInvocations(root)).filter((record) => {
    if (record.status !== "unknown") return false;
    const settlement = settledInvocations.get(record.invocationId);
    return !settlement || settlement.invocationFingerprint !== record.fingerprint || (Boolean(bookRunId) && settlement.bookRunId !== bookRunId);
  }).map((record) => record.invocationId).sort();
  return { activeWorkItemIds, activeMutationLeases, activeMutationPlanIds: unresolvedMutationPlanIds.sort(), activeBudgetReservationIds: activeBudgetReservationIds.sort(), unknownInvocationIds };
}

async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export async function readQuiescenceProof(root: string, bookRunId: string, runVersion?: number): Promise<QuiescenceProof | null> {
  const directory = resolveInside(root, "sessions/book-runs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const candidates = names.filter((name) => name.startsWith(`${bookRunId}.quiescence.v`) && name.endsWith(".json") && (runVersion === undefined || name === `${bookRunId}.quiescence.v${runVersion}.json`)).sort();
  if (!candidates.length) return null;
  try {
    const proof = JSON.parse(await fs.readFile(path.join(directory, candidates.at(-1)!), "utf8")) as QuiescenceProof;
    if (!verify(proof) || proof.bookRunId !== bookRunId || (runVersion !== undefined && proof.runVersion !== runVersion)) return null;
    const current = await inspectQuiescenceState(root, proof.bookRunId);
    return current.activeWorkItemIds.length || current.activeMutationLeases.length || current.activeMutationPlanIds.length || current.activeBudgetReservationIds.length || current.unknownInvocationIds.length ? null : proof;
  } catch { return null; }
}

export async function issueQuiescenceProof(root: string, input: { bookRunId: string; runVersion: number }): Promise<QuiescenceProof> {
  if (!Number.isInteger(input.runVersion) || input.runVersion < 1) throw new Error("QUIESCENCE_RUN_VERSION_REQUIRED");
  const existing = await readQuiescenceProof(root, input.bookRunId, input.runVersion);
  if (existing) return existing;
  const { activeWorkItemIds, activeMutationLeases, activeMutationPlanIds, activeBudgetReservationIds, unknownInvocationIds } = await inspectQuiescenceState(root, input.bookRunId);
  if (activeWorkItemIds.length || activeMutationLeases.length || activeMutationPlanIds.length || activeBudgetReservationIds.length || unknownInvocationIds.length) throw new Error("QUIESCENCE_NOT_REACHED");
  const base = { schemaVersion: "quiescence-proof.v1" as const, status: "quiescent" as const, bookRunId: input.bookRunId, runVersion: input.runVersion, activeWorkItemIds, activeMutationLeases, activeMutationPlanIds, activeBudgetReservationIds, unknownInvocationIds, checkedAt: new Date().toISOString() };
  const proof: QuiescenceProof = { ...base, fingerprint: hash(base) };
  await writeJson(proofPath(root, input.bookRunId, input.runVersion), proof);
  return proof;
}
