import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type RuntimeCompensationAction = "release-work-lease" | "preserve-stage-output" | "quarantine-derived-projection" | "block-dependent-work";

export interface RuntimeCompensationReceipt {
  schemaVersion: "runtime-compensation.v1";
  runId: string;
  commandId: string;
  stage: string;
  failureFingerprint: string;
  actions: Array<{ action: RuntimeCompensationAction; status: "planned" | "applied"; reason: string }>;
  createdAt: string;
  fingerprint: string;
}

export interface RuntimeCompensationApplication {
  schemaVersion: "runtime-compensation-application.v1";
  runId: string;
  commandId: string;
  compensationFingerprint: string;
  actions: Array<{ action: RuntimeCompensationAction; status: "applied" }>;
  appliedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function recordRuntimeCompensation(root: string, input: {
  runId: string;
  commandId: string;
  stage: string;
  failureFingerprint: string;
  workLeaseClaimed?: boolean;
}): Promise<RuntimeCompensationReceipt> {
  const actions: RuntimeCompensationReceipt["actions"] = [
    ...(input.workLeaseClaimed ? [{ action: "release-work-lease" as const, status: "planned" as const, reason: "failure must not retain an execution lease" }] : []),
    { action: "preserve-stage-output", status: "planned", reason: "retain immutable evidence for recovery and audit" },
    ...(input.stage === "knowledge_index_update" || input.stage === "story_graph_update" ? [{ action: "quarantine-derived-projection" as const, status: "planned" as const, reason: "derived projection may be stale after an interrupted stage" }] : []),
    { action: "block-dependent-work", status: "planned", reason: "dependents must wait for a settled or explicitly waived stage" }
  ];
  const base = {
    schemaVersion: "runtime-compensation.v1" as const,
    runId: input.runId,
    commandId: input.commandId,
    stage: input.stage,
    failureFingerprint: input.failureFingerprint,
    actions,
    createdAt: new Date().toISOString()
  };
  const receipt = { ...base, fingerprint: hash(base) } satisfies RuntimeCompensationReceipt;
  const target = resolveInside(root, `sessions/runtime-compensations/${input.runId}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  if (existing) {
    const parsed = JSON.parse(existing) as RuntimeCompensationReceipt;
    if (parsed.failureFingerprint !== receipt.failureFingerprint || parsed.commandId !== receipt.commandId) throw new Error("RUNTIME_COMPENSATION_IMMUTABLE");
    return parsed;
  }
  await fs.writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

export async function applyRuntimeCompensation(root: string, receipt: RuntimeCompensationReceipt): Promise<RuntimeCompensationApplication> {
  const target = resolveInside(root, `sessions/runtime-compensations/${receipt.runId}.application.json`);
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  if (existing) {
    const parsed = JSON.parse(existing) as RuntimeCompensationApplication;
    if (parsed.compensationFingerprint !== receipt.fingerprint) throw new Error("RUNTIME_COMPENSATION_APPLICATION_IMMUTABLE");
    return parsed;
  }
  const actions = receipt.actions.map(({ action }) => ({ action, status: "applied" as const }));
  for (const { action } of actions) {
    const effectPath = resolveInside(root, `sessions/runtime-compensation-effects/${receipt.runId}/${action}.json`);
    await writeJson(effectPath, { schemaVersion: "runtime-compensation-effect.v1", runId: receipt.runId, commandId: receipt.commandId, compensationFingerprint: receipt.fingerprint, action, appliedAt: new Date().toISOString() });
  }
  const base = { schemaVersion: "runtime-compensation-application.v1" as const, runId: receipt.runId, commandId: receipt.commandId, compensationFingerprint: receipt.fingerprint, actions, appliedAt: new Date().toISOString() };
  const application: RuntimeCompensationApplication = { ...base, fingerprint: hash(base) };
  await writeJson(target, application);
  return application;
}
