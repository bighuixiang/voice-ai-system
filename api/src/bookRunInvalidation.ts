import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type BookRunInvalidationReason = "completion-evidence-stale";
export interface BookRunInvalidationReceipt {
  schemaVersion: "book-run-invalidation.v1";
  invalidationId: string;
  bookRunId: string;
  projectSlug: string;
  priorRunVersion: number;
  reason: BookRunInvalidationReason;
  affectedArtifactRefs: string[];
  sourceFingerprint: string;
  invalidatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function receiptPath(root: string, id: string): string { return resolveInside(root, `sessions/book-run-invalidations/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function assertBookRunInvalidationIntegrity(receipt: BookRunInvalidationReceipt, expectedId?: string): BookRunInvalidationReceipt {
    const { fingerprint, ...base } = receipt;
    const valid = receipt.schemaVersion === "book-run-invalidation.v1" && (!expectedId || receipt.invalidationId === expectedId) && [receipt.invalidationId, receipt.bookRunId, receipt.projectSlug, receipt.sourceFingerprint, receipt.invalidatedAt].every((value) => typeof value === "string" && value.trim()) && Number.isInteger(receipt.priorRunVersion) && receipt.priorRunVersion >= 1 && receipt.reason === "completion-evidence-stale" && Array.isArray(receipt.affectedArtifactRefs) && receipt.affectedArtifactRefs.length > 0 && receipt.affectedArtifactRefs.every((ref) => typeof ref === "string" && ref.trim()) && !Number.isNaN(Date.parse(receipt.invalidatedAt)) && /^[a-f0-9]{64}$/i.test(receipt.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("BOOK_RUN_INVALIDATION_INTEGRITY_FAILED");
    return receipt;
}

export async function readBookRunInvalidation(root: string, invalidationId: string): Promise<BookRunInvalidationReceipt | null> {
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath(root, invalidationId), "utf8")) as BookRunInvalidationReceipt;
    return assertBookRunInvalidationIntegrity(receipt, invalidationId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function recordBookRunInvalidation(input: {
  root: string;
  bookRunId: string;
  projectSlug: string;
  priorRunVersion: number;
  reason: BookRunInvalidationReason;
  affectedArtifactRefs: string[];
  sourceFingerprint: string;
}): Promise<BookRunInvalidationReceipt> {
  const identity = { bookRunId: input.bookRunId, projectSlug: input.projectSlug, priorRunVersion: input.priorRunVersion, reason: input.reason, affectedArtifactRefs: [...new Set(input.affectedArtifactRefs.map((ref) => ref.trim()).filter(Boolean))].sort(), sourceFingerprint: input.sourceFingerprint.trim() };
  const invalidationId = `invalidation-${hash(identity).slice(0, 24)}`;
  const existing = await readBookRunInvalidation(input.root, invalidationId);
  if (existing) return existing;
  const base = { schemaVersion: "book-run-invalidation.v1" as const, invalidationId, ...identity, invalidatedAt: new Date().toISOString() };
  const receipt: BookRunInvalidationReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(receiptPath(input.root, invalidationId), receipt);
  return receipt;
}
