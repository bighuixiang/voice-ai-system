import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type RuntimeStageReceiptStatus = "started" | "completed" | "failed";

export interface RuntimeStageReceipt {
  schemaVersion: "runtime-stage-receipt.v1";
  receiptId: string;
  projectSlug: string;
  runId: string;
  chapterId?: string;
  stage: string;
  status: RuntimeStageReceiptStatus;
  inputFingerprint: string;
  outputFingerprint?: string;
  outputRef?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function receiptPath(root: string, runId: string, stage: string): string { return resolveInside(root, `sessions/runtime-stage-receipts/${runId}/${stage}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

function assertReceiptIntegrity(receipt: RuntimeStageReceipt, runId: string, stage?: string): RuntimeStageReceipt {
  const { fingerprint: _fingerprint, ...base } = receipt;
  if (receipt.schemaVersion !== "runtime-stage-receipt.v1" || receipt.runId !== runId || (stage !== undefined && receipt.stage !== stage) || receipt.receiptId !== `stage-receipt-${receipt.runId}-${receipt.stage}` || !receipt.inputFingerprint.trim() || (receipt.outputFingerprint !== undefined && !/^[a-f0-9]{64}$/i.test(receipt.outputFingerprint)) || (receipt.outputRef !== undefined && !receipt.outputRef.trim()) || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint) || hash(base) !== receipt.fingerprint) throw new Error("RUNTIME_STAGE_RECEIPT_INTEGRITY_FAILED");
  return receipt;
}

async function readReceipt(root: string, runId: string, stage: string): Promise<RuntimeStageReceipt | null> {
  try { return assertReceiptIntegrity(JSON.parse(await fs.readFile(receiptPath(root, runId, stage), "utf8")) as RuntimeStageReceipt, runId, stage); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export function stageInputFingerprint(input: unknown): string { return hash(input); }

export type RuntimeStageResumeReason = "missing" | "started" | "failed" | "input_stale" | "all_completed";
export interface RuntimeStageResumeDecision { stage: string | null; reason: RuntimeStageResumeReason; }

export function isRuntimeStageOutputReusable(
  receipt: Pick<RuntimeStageReceipt, "status" | "inputFingerprint" | "outputFingerprint" | "outputRef"> | undefined,
  expectedInputFingerprint: string,
  expectedOutputFingerprint: string,
  expectedOutputRef: string
): boolean {
  return Boolean(
    receipt?.status === "completed" &&
      receipt.inputFingerprint === expectedInputFingerprint &&
      receipt.outputFingerprint === expectedOutputFingerprint &&
      receipt.outputRef === expectedOutputRef
  );
}

export function isRuntimeStageOutputAvailable(
  receipt: Pick<RuntimeStageReceipt, "status" | "inputFingerprint" | "outputFingerprint" | "outputRef"> | undefined,
  expectedInputFingerprint: string,
  expectedOutputFingerprint: string,
  expectedOutputRef: string
): boolean {
  return Boolean(
    (receipt?.status === "started" || receipt?.status === "completed") &&
      receipt.inputFingerprint === expectedInputFingerprint &&
      receipt.outputFingerprint === expectedOutputFingerprint &&
      receipt.outputRef === expectedOutputRef
  );
}

export function selectFirstUnsettledRuntimeStage(
  receipts: Array<Pick<RuntimeStageReceipt, "stage" | "status" | "inputFingerprint">>,
  orderedStages: readonly string[],
  expectedInputFingerprints: Record<string, string> = {}
): RuntimeStageResumeDecision {
  for (const stage of orderedStages) {
    const receipt = receipts.find((candidate) => candidate.stage === stage);
    if (!receipt) return { stage, reason: "missing" };
    if (receipt.status === "started") return { stage, reason: "started" };
    if (receipt.status === "failed") return { stage, reason: "failed" };
    if (expectedInputFingerprints[stage] && receipt.inputFingerprint !== expectedInputFingerprints[stage]) return { stage, reason: "input_stale" };
  }
  return { stage: null, reason: "all_completed" };
}

export async function recordRuntimeStageReceipt(root: string, input: {
  projectSlug: string;
  runId: string;
  chapterId?: string;
  stage: string;
  status: RuntimeStageReceiptStatus;
  inputFingerprint: string;
  outputFingerprint?: string;
  outputRef?: string;
}): Promise<RuntimeStageReceipt> {
  if (!input.projectSlug.trim() || !input.runId.trim() || !input.stage.trim() || !input.inputFingerprint.trim()) throw new Error("RUNTIME_STAGE_RECEIPT_FIELDS_REQUIRED");
  const existing = await readReceipt(root, input.runId, input.stage);
  if (existing) {
    if (existing.inputFingerprint !== input.inputFingerprint) throw new Error("RUNTIME_STAGE_INPUT_STALE");
    if (input.outputFingerprint && existing.outputFingerprint && input.outputFingerprint !== existing.outputFingerprint) throw new Error("RUNTIME_STAGE_OUTPUT_STALE");
    if (input.outputRef && existing.outputRef && input.outputRef !== existing.outputRef) throw new Error("RUNTIME_STAGE_OUTPUT_STALE");
    if (existing.status === "failed" && input.status === "started") throw new Error("RUNTIME_STAGE_FAILED_REQUIRES_REPAIR");
    if (existing.status === "completed" && input.status === "started") return existing;
    if ((existing.status === "completed" || existing.status === "failed") && existing.status !== input.status) throw new Error("RUNTIME_STAGE_TERMINAL");
    if (existing.status === input.status) {
      if ((input.outputFingerprint && !existing.outputFingerprint) || (input.outputRef && !existing.outputRef)) {
        const { fingerprint: _oldFingerprint, ...existingBase } = existing;
        const updatedBase = {
          ...existingBase,
          ...(input.outputFingerprint ? { outputFingerprint: input.outputFingerprint } : {}),
          ...(input.outputRef ? { outputRef: input.outputRef } : {}),
          updatedAt: new Date().toISOString()
        };
        const updated: RuntimeStageReceipt = { ...updatedBase, fingerprint: hash(updatedBase) };
        await writeJson(receiptPath(root, input.runId, input.stage), updated);
        return updated;
      }
      return existing;
    }
    const { fingerprint: _oldFingerprint, ...existingBase } = existing;
    const updatedBase = {
      ...existingBase,
      status: input.status,
      ...(input.outputFingerprint ? { outputFingerprint: input.outputFingerprint } : {}),
      ...(input.outputRef ? { outputRef: input.outputRef } : {}),
      updatedAt: new Date().toISOString()
    };
    const updated: RuntimeStageReceipt = { ...updatedBase, fingerprint: hash(updatedBase) };
    await writeJson(receiptPath(root, input.runId, input.stage), updated);
    return updated;
  }
  const now = new Date().toISOString();
  const base = {
    schemaVersion: "runtime-stage-receipt.v1" as const,
    receiptId: `stage-receipt-${input.runId}-${input.stage}`,
    projectSlug: input.projectSlug,
    runId: input.runId,
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    stage: input.stage,
    status: input.status,
    inputFingerprint: input.inputFingerprint,
    ...(input.outputFingerprint ? { outputFingerprint: input.outputFingerprint } : {}),
    ...(input.outputRef ? { outputRef: input.outputRef } : {}),
    createdAt: now,
    updatedAt: now
  };
  const receipt: RuntimeStageReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(receiptPath(root, input.runId, input.stage), receipt);
  return receipt;
}

export async function listRuntimeStageReceipts(root: string, runId: string): Promise<RuntimeStageReceipt[]> {
  const directory = resolveInside(root, `sessions/runtime-stage-receipts/${runId}`);
  let names: string[];
  try { names = await fs.readdir(directory); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const receipts = (await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readReceipt(root, runId, name.slice(0, -5))))).filter((receipt): receipt is RuntimeStageReceipt => receipt !== null);
  return receipts.sort((left, right) => left.stage.localeCompare(right.stage));
}
