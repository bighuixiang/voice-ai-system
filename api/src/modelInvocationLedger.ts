import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertModelInvocationAuthorityBinding, type ModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";

export interface ModelInvocationRecord {
  schemaVersion: "model-invocation-record.v1";
  invocationId: string;
  /** Optional until the invocation is attached to a governed BookRun. */
  bookRunId?: string;
  budgetReservationId?: string;
  authorityBinding?: ModelInvocationAuthorityBinding;
  modelVersion?: string;
  pricingRef?: string;
  usageSource?: string;
  retryChainId?: string;
  retryAttempt?: number;
  taskId: string;
  taskFingerprint: string;
  attemptId: string;
  routeDecision: string;
  modelCapabilityRef: string;
  contextManifestRef: string;
  promptSchemaVersion: string;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "failed" | "cancelled" | "timed-out" | "unknown";
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; measurement: "actual" | "estimated" };
  cost: { amount: number; currency: string; measurement: "actual" | "estimated"; estimateMethod?: string };
  cache: { hit: boolean; key?: string; savedTokens?: number; invalidationReason?: string };
  failure?: { code: string; retryClass: "transient" | "non-retryable"; message: string };
  adoptionDecision: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ledgerPath = (root: string) => resolveInside(root, "sessions/model-invocations.jsonl");
export function assertModelInvocationRecordIntegrity(record: ModelInvocationRecord): ModelInvocationRecord { const { fingerprint, ...base } = record; const usageValid = record.usage && [record.usage.inputTokens, record.usage.outputTokens, record.usage.cachedTokens].every((value) => Number.isFinite(value) && value >= 0) && ["actual", "estimated"].includes(record.usage.measurement); const cacheValid = record.cache && typeof record.cache.hit === "boolean" && (record.cache.savedTokens === undefined || (Number.isFinite(record.cache.savedTokens) && record.cache.savedTokens >= 0)); const bindingValid = Boolean(record.bookRunId) === Boolean(record.budgetReservationId) && (!record.bookRunId || (Boolean(record.authorityBinding) && record.authorityBinding?.bookRunId === record.bookRunId)); if (record.schemaVersion !== "model-invocation-record.v1" || !record.invocationId.trim() || !record.taskId.trim() || !record.modelCapabilityRef.trim() || !record.contextManifestRef.trim() || !record.promptSchemaVersion.trim() || !record.routeDecision.trim() || !record.adoptionDecision.trim() || !record.cost.currency.trim() || !["actual", "estimated"].includes(record.cost.measurement) || !Number.isFinite(record.cost.amount) || record.cost.amount < 0 || !usageValid || !cacheValid || !bindingValid || Number.isNaN(Date.parse(record.startedAt)) || Number.isNaN(Date.parse(record.finishedAt)) || hash(base) !== fingerprint) throw new Error("MODEL_INVOCATION_LEDGER_INTEGRITY_FAILED"); return record; }

export function createModelInvocationRecord(input: Omit<ModelInvocationRecord, "schemaVersion" | "fingerprint">): ModelInvocationRecord {
  if (![input.invocationId, input.taskId, input.taskFingerprint, input.attemptId, input.routeDecision, input.modelCapabilityRef, input.contextManifestRef, input.promptSchemaVersion, input.startedAt, input.finishedAt, input.adoptionDecision].every((value) => value.trim())) throw new Error("MODEL_INVOCATION_FIELDS_REQUIRED");
  if ((input.bookRunId !== undefined && !input.bookRunId.trim()) || (input.budgetReservationId !== undefined && !input.budgetReservationId.trim()) || (Boolean(input.bookRunId) !== Boolean(input.budgetReservationId))) throw new Error("MODEL_INVOCATION_GOVERNANCE_BINDING_INVALID");
  if (input.bookRunId) {
    if (!input.authorityBinding) throw new Error("MODEL_INVOCATION_AUTHORITY_BINDING_REQUIRED");
    assertModelInvocationAuthorityBinding(input.authorityBinding);
    if (input.authorityBinding.bookRunId !== input.bookRunId) throw new Error("MODEL_INVOCATION_AUTHORITY_RUN_MISMATCH");
  } else if (input.authorityBinding) {
    throw new Error("MODEL_INVOCATION_AUTHORITY_RUN_REQUIRED");
  }
  if (![input.usage.inputTokens, input.usage.outputTokens, input.usage.cachedTokens, input.cost.amount].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("MODEL_INVOCATION_USAGE_INVALID");
  if (input.cache.savedTokens !== undefined && (!Number.isFinite(input.cache.savedTokens) || input.cache.savedTokens < 0)) throw new Error("MODEL_INVOCATION_CACHE_SAVED_TOKENS_INVALID");
  if (input.cost.measurement === "estimated" && !input.cost.estimateMethod?.trim()) throw new Error("MODEL_INVOCATION_ESTIMATE_METHOD_REQUIRED");
  const base = { schemaVersion: "model-invocation-record.v1" as const, ...input };
  return { ...base, fingerprint: hash(base) };
}

export async function appendModelInvocation(root: string, record: ModelInvocationRecord): Promise<void> {
  assertModelInvocationRecordIntegrity(record);
  const target = ledgerPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(record)}\n`, "utf8");
}

export async function readModelInvocations(root: string): Promise<ModelInvocationRecord[]> {
  let content: string;
  try { content = await fs.readFile(ledgerPath(root), "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return content.split(/\r?\n/).filter(Boolean).map((line) => {
    let record: ModelInvocationRecord;
    try { record = JSON.parse(line) as ModelInvocationRecord; } catch { throw new Error("MODEL_INVOCATION_LEDGER_CORRUPT"); }
    return assertModelInvocationRecordIntegrity(record);
  });
}

export function retryClassFor(code: string): "transient" | "non-retryable" {
  return /network|rate[-_ ]?limit|timeout|temporar|429|5\d\d/iu.test(code) ? "transient" : "non-retryable";
}

export function evaluateInvocationBudget(input: { hardLimit: number; committed: number; reserved: number; nextEstimate: number }): { allowed: boolean; reason?: "BUDGET_HARD_STOP" } {
  if (![input.hardLimit, input.committed, input.reserved, input.nextEstimate].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("BUDGET_VALUES_INVALID");
  return input.committed + input.reserved + input.nextEstimate > input.hardLimit ? { allowed: false, reason: "BUDGET_HARD_STOP" } : { allowed: true };
}
