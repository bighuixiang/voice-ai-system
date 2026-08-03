import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { evaluateRetryDecision, type RetryDecision } from "./executionResilience.js";
import { detectStagnation, type StagnationIncident } from "./stagnationDetection.js";
import { resolveInside } from "./pathSafety.js";

export interface RuntimeRetryReceipt {
  schemaVersion: "runtime-retry-receipt.v1";
  runId: string;
  commandId: string;
  stage: string;
  attempt: number;
  maxAttempts: number;
  errorCode: string;
  decision: RetryDecision;
  stagnation: StagnationIncident;
  createdAt: string;
  fingerprint: string;
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordRuntimeRetryReceipt(root: string, input: {
  runId: string;
  commandId: string;
  stage: string;
  attempt: number;
  maxAttempts?: number;
  errorCode: string;
  workFingerprints?: string[];
}): Promise<RuntimeRetryReceipt> {
  const maxAttempts = input.maxAttempts ?? 3;
  const decision = evaluateRetryDecision({
    retryChainId: `${input.runId}:${input.stage}`,
    attempt: input.attempt,
    maxAttempts,
    errorCode: input.errorCode
  });
  const fingerprints = input.workFingerprints || [];
  const stagnation = detectStagnation({
    workFingerprints: fingerprints,
    rewriteCount: 0,
    questionFingerprints: [],
    qualityScores: [],
    newAssetCount: decision.retry ? 0 : 1,
    completionSignals: 0,
    openObligations: 0
  });
  const base = {
    schemaVersion: "runtime-retry-receipt.v1" as const,
    runId: input.runId,
    commandId: input.commandId,
    stage: input.stage,
    attempt: input.attempt,
    maxAttempts,
    errorCode: input.errorCode,
    decision,
    stagnation,
    createdAt: new Date().toISOString()
  };
  const receipt: RuntimeRetryReceipt = { ...base, fingerprint: fingerprint(base) };
  const target = resolveInside(root, `sessions/runtime-retry/${input.runId}/attempt-${input.attempt}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  if (existing) {
    const parsed = JSON.parse(existing) as RuntimeRetryReceipt;
    if (parsed.runId !== receipt.runId || parsed.commandId !== receipt.commandId || parsed.stage !== receipt.stage || parsed.attempt !== receipt.attempt || parsed.errorCode !== receipt.errorCode) throw new Error("RUNTIME_RETRY_RECEIPT_IMMUTABLE");
    return parsed;
  }
  await fs.writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
