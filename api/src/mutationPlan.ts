import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type MutationPlanStatus = "prepared" | "committing" | "committed" | "rolling_back" | "rolled_back" | "failed";
export interface MutationChange {
  relativePath: string;
  assetType: string;
  expectedSha256: string;
  nextSha256: string;
  nextContent: string;
  previousContent: string;
  previousExists: boolean;
  authoritative: boolean;
}
export interface MutationPlan {
  schemaVersion: "mutation-plan.v1";
  mutationId: string;
  idempotencyKey: string;
  projectSlug: string;
  commandType: string;
  expectedProjectFingerprint: string;
  status: MutationPlanStatus;
  changes: MutationChange[];
  domainEvents: string[];
  projectionUpdates: string[];
  postCommitJobs: string[];
  journalPath: string;
  checkpointId: string;
  committedAt?: string;
  recoveredAt?: string;
  fingerprint: string;
}
export interface MutationPreflightResult {
  status: "ready" | "conflict";
  committed: false;
  items: Array<{ relativePath: string; status: "accepted" | "rejected" | "conflict" | "skipped"; reason?: string }>;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha256 = (value: string): string => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const planPath = (root: string, mutationId: string): string => resolveInside(root, `sessions/mutation-plans/${mutationId}.json`);
const journalPath = (root: string, mutationId: string): string => resolveInside(root, `sessions/mutation-plans/${mutationId}.journal.jsonl`);
const readText = (target: string): { exists: boolean; content: string } => { try { return { exists: true, content: fs.readFileSync(target, "utf8") }; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return { exists: false, content: "" }; throw error; } };

export function createMutationPlan(root: string, input: {
  mutationId: string; idempotencyKey: string; projectSlug: string; commandType: string; expectedProjectFingerprint: string;
  changes: Array<{ relativePath: string; assetType: string; nextContent: string; authoritative: boolean }>;
  domainEvents: string[]; projectionUpdates: string[]; postCommitJobs: string[];
}): MutationPlan {
  if (![input.mutationId, input.idempotencyKey, input.projectSlug, input.commandType, input.expectedProjectFingerprint].every((value) => value.trim()) || !input.changes.length) throw new Error("MUTATION_PLAN_FIELDS_REQUIRED");
  const seen = new Set<string>();
  const changes = input.changes.map((change) => {
    if (!change.relativePath.trim() || path.isAbsolute(change.relativePath) || seen.has(change.relativePath)) throw new Error("MUTATION_CHANGE_PATH_INVALID");
    seen.add(change.relativePath);
    const target = resolveInside(root, change.relativePath);
    const previous = readText(target);
    return { relativePath: change.relativePath, assetType: change.assetType.trim(), expectedSha256: sha256(previous.content), nextSha256: sha256(change.nextContent), nextContent: change.nextContent, previousContent: previous.content, previousExists: previous.exists, authoritative: change.authoritative };
  });
  const base = { schemaVersion: "mutation-plan.v1" as const, mutationId: input.mutationId.trim(), idempotencyKey: input.idempotencyKey.trim(), projectSlug: input.projectSlug.trim(), commandType: input.commandType.trim(), expectedProjectFingerprint: input.expectedProjectFingerprint.trim(), status: "prepared" as const, changes, domainEvents: [...new Set(input.domainEvents)], projectionUpdates: [...new Set(input.projectionUpdates)], postCommitJobs: [...new Set(input.postCommitJobs)], journalPath: `sessions/mutation-plans/${input.mutationId}.journal.jsonl`, checkpointId: `mutation-checkpoint-${input.mutationId}` };
  return { ...base, fingerprint: hash(base) };
}

async function writeJson(target: string, value: unknown): Promise<void> { await fsp.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fsp.rename(temp, target); }
function planFingerprint(plan: MutationPlan): string { const { fingerprint: _fingerprint, ...base } = plan; return hash(base); }
async function writePlan(root: string, plan: MutationPlan): Promise<void> { if (planFingerprint(plan) !== plan.fingerprint) throw new Error("MUTATION_PLAN_INTEGRITY_FAILED"); await writeJson(planPath(root, plan.mutationId), plan); }

export function assertMutationPlanIntegrity(plan: MutationPlan, expectedId?: string): MutationPlan {
  const { fingerprint, ...base } = plan;
  const validChange = (change: MutationChange) => change.relativePath.trim() && !path.isAbsolute(change.relativePath) && change.assetType.trim() && /^[a-f0-9]{64}$/i.test(change.expectedSha256) && /^[a-f0-9]{64}$/i.test(change.nextSha256) && sha256(change.nextContent) === change.nextSha256 && sha256(change.previousContent) === change.expectedSha256 && typeof change.previousExists === "boolean" && typeof change.authoritative === "boolean";
  const valid = plan.schemaVersion === "mutation-plan.v1" && (!expectedId || plan.mutationId === expectedId) && [plan.mutationId, plan.idempotencyKey, plan.projectSlug, plan.commandType, plan.expectedProjectFingerprint, plan.journalPath, plan.checkpointId].every((value) => typeof value === "string" && value.trim()) && ["prepared", "committing", "committed", "rolling_back", "rolled_back", "failed"].includes(plan.status) && Array.isArray(plan.changes) && plan.changes.length > 0 && plan.changes.every(validChange) && new Set(plan.changes.map((change) => change.relativePath)).size === plan.changes.length && [plan.domainEvents, plan.projectionUpdates, plan.postCommitJobs].every((values) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim())) && (plan.committedAt === undefined || !Number.isNaN(Date.parse(plan.committedAt))) && (plan.recoveredAt === undefined || !Number.isNaN(Date.parse(plan.recoveredAt))) && /^[a-f0-9]{64}$/i.test(plan.fingerprint) && planFingerprint(plan) === fingerprint;
  if (!valid) throw new Error("MUTATION_PLAN_INTEGRITY_FAILED");
  return plan;
}

export async function persistMutationPlan(root: string, plan: MutationPlan): Promise<MutationPlan> {
  const existing = await readMutationPlan(root, plan.mutationId);
  if (existing) { if (existing.fingerprint !== plan.fingerprint) throw new Error("MUTATION_PLAN_IMMUTABLE"); return existing; }
  await writePlan(root, plan); return plan;
}

export async function readMutationPlan(root: string, mutationId: string): Promise<MutationPlan | null> {
  try {
    const plan = JSON.parse(await fsp.readFile(planPath(root, mutationId), "utf8")) as MutationPlan;
    return assertMutationPlanIntegrity(plan, mutationId);
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

async function appendJournal(root: string, mutationId: string, event: string): Promise<void> { const target = journalPath(root, mutationId); await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.appendFile(target, `${JSON.stringify({ event, at: new Date().toISOString() })}\n`, "utf8"); }

export function evaluateMutationPlan(root: string, plan: MutationPlan): MutationPreflightResult {
  const items = plan.changes.map((change) => {
    const current = readText(resolveInside(root, change.relativePath));
    return sha256(current.content) === change.expectedSha256
      ? { relativePath: change.relativePath, status: "accepted" as const }
      : { relativePath: change.relativePath, status: "conflict" as const, reason: "MUTATION_BASELINE_CONFLICT" };
  });
  const status = items.some((item) => item.status === "conflict") ? "conflict" as const : "ready" as const;
  const base = { status, committed: false as const, items };
  return { ...base, fingerprint: hash(base) };
}

export async function commitMutationPlan(root: string, mutationId: string): Promise<MutationPlan> {
  const plan = await readMutationPlan(root, mutationId); if (!plan) throw new Error("MUTATION_PLAN_NOT_FOUND");
  if (plan.status === "committed") return plan;
  if (plan.status !== "prepared") throw new Error("MUTATION_PLAN_STATUS_INVALID");
  for (const change of plan.changes) { const current = readText(resolveInside(root, change.relativePath)); if (sha256(current.content) !== change.expectedSha256) throw new Error("MUTATION_BASELINE_CONFLICT"); }
  const committing = { ...plan, status: "committing" as const, fingerprint: "" }; committing.fingerprint = planFingerprint(committing); await writePlan(root, committing); await appendJournal(root, mutationId, "committing");
  try {
    for (const change of committing.changes) { const target = resolveInside(root, change.relativePath); await fsp.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fsp.writeFile(temp, change.nextContent, "utf8"); await fsp.rename(temp, target); await appendJournal(root, mutationId, `written:${change.relativePath}`); }
    const committed = { ...committing, status: "committed" as const, committedAt: new Date().toISOString(), fingerprint: "" }; committed.fingerprint = planFingerprint(committed); await writePlan(root, committed); await appendJournal(root, mutationId, "committed"); return committed;
  } catch (error) { await rollbackMutationPlan(root, mutationId); throw error; }
}

export async function rollbackMutationPlan(root: string, mutationId: string): Promise<MutationPlan> {
  const plan = await readMutationPlan(root, mutationId); if (!plan) throw new Error("MUTATION_PLAN_NOT_FOUND");
  if (plan.status === "rolled_back") return plan;
  const rolling = { ...plan, status: "rolling_back" as const, fingerprint: "" }; rolling.fingerprint = planFingerprint(rolling); await writePlan(root, rolling);
  for (const change of rolling.changes) { const target = resolveInside(root, change.relativePath); if (change.previousExists) await fsp.writeFile(target, change.previousContent, "utf8"); else await fsp.rm(target, { force: true }); }
  const rolled = { ...rolling, status: "rolled_back" as const, recoveredAt: new Date().toISOString(), fingerprint: "" }; rolled.fingerprint = planFingerprint(rolled); await writePlan(root, rolled); await appendJournal(root, mutationId, "rolled_back"); return rolled;
}

export async function recoverMutationPlan(root: string, mutationId: string): Promise<MutationPlan> {
  const plan = await readMutationPlan(root, mutationId); if (!plan) throw new Error("MUTATION_PLAN_NOT_FOUND");
  if (plan.status === "committing" || plan.status === "rolling_back") return rollbackMutationPlan(root, mutationId);
  return plan;
}
