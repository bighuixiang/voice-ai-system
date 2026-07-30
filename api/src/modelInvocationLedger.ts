import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface ModelInvocationRecord {
  schemaVersion: "model-invocation-record.v1";
  invocationId: string;
  taskId: string;
  taskFingerprint: string;
  attemptId: string;
  routeDecision: string;
  modelCapabilityRef: string;
  contextManifestRef: string;
  promptSchemaVersion: string;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "failed" | "cancelled" | "timed-out";
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; measurement: "actual" | "estimated" };
  cost: { amount: number; currency: string; measurement: "actual" | "estimated"; estimateMethod?: string };
  cache: { hit: boolean; key?: string };
  failure?: { code: string; retryClass: "transient" | "non-retryable"; message: string };
  adoptionDecision: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ledgerPath = (root: string) => resolveInside(root, "sessions/model-invocations.jsonl");

export function createModelInvocationRecord(input: Omit<ModelInvocationRecord, "schemaVersion" | "fingerprint">): ModelInvocationRecord {
  if (![input.invocationId, input.taskId, input.taskFingerprint, input.attemptId, input.routeDecision, input.modelCapabilityRef, input.contextManifestRef, input.promptSchemaVersion, input.startedAt, input.finishedAt, input.adoptionDecision].every((value) => value.trim())) throw new Error("MODEL_INVOCATION_FIELDS_REQUIRED");
  if (![input.usage.inputTokens, input.usage.outputTokens, input.usage.cachedTokens, input.cost.amount].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("MODEL_INVOCATION_USAGE_INVALID");
  if (input.cost.measurement === "estimated" && !input.cost.estimateMethod?.trim()) throw new Error("MODEL_INVOCATION_ESTIMATE_METHOD_REQUIRED");
  const base = { schemaVersion: "model-invocation-record.v1" as const, ...input };
  return { ...base, fingerprint: hash(base) };
}

export async function appendModelInvocation(root: string, record: ModelInvocationRecord): Promise<void> {
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
    const { fingerprint: _fingerprint, ...base } = record;
    if (!record.fingerprint || record.fingerprint !== hash(base)) throw new Error("MODEL_INVOCATION_LEDGER_INTEGRITY_FAILED");
    return record;
  });
}

export function retryClassFor(code: string): "transient" | "non-retryable" {
  return /network|rate[-_ ]?limit|timeout|temporar|5\d\d/iu.test(code) ? "transient" : "non-retryable";
}

export function evaluateInvocationBudget(input: { hardLimit: number; committed: number; reserved: number; nextEstimate: number }): { allowed: boolean; reason?: "BUDGET_HARD_STOP" } {
  if (![input.hardLimit, input.committed, input.reserved, input.nextEstimate].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("BUDGET_VALUES_INVALID");
  return input.committed + input.reserved + input.nextEstimate > input.hardLimit ? { allowed: false, reason: "BUDGET_HARD_STOP" } : { allowed: true };
}
