import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlement } from "./chapterSettlement.js";

export interface ChapterSettlementProjectionClosure {
  schemaVersion: "chapter-settlement-projection-closure.v1";
  closureId: string;
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  derivedTransactionId: string;
  derivedFingerprint: string;
  status: "closed";
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function closurePath(root: string, closureId: string): string { return resolveInside(root, `sessions/chapter-settlement-projection-closures/${closureId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function assertChapterSettlementProjectionClosureIntegrity(value: ChapterSettlementProjectionClosure, closureId: string): ChapterSettlementProjectionClosure {
  const { fingerprint: _fingerprint, ...base } = value;
  if (value.schemaVersion !== "chapter-settlement-projection-closure.v1" || value.closureId !== closureId || value.status !== "closed" || !value.projectSlug.trim() || !value.chapterId.trim() || !value.settlementId.trim() || !value.derivedTransactionId.trim() || !/^[a-f0-9]{64}$/i.test(value.derivedFingerprint) || !/^[a-f0-9]{64}$/i.test(value.fingerprint) || hash(base) !== value.fingerprint) throw new Error("SETTLEMENT_PROJECTION_CLOSURE_INTEGRITY_FAILED");
  return value;
}

export async function readChapterSettlementProjectionClosure(root: string, closureId: string): Promise<ChapterSettlementProjectionClosure | null> {
  try { return assertChapterSettlementProjectionClosureIntegrity(JSON.parse(await fs.readFile(closurePath(root, closureId), "utf8")) as ChapterSettlementProjectionClosure, closureId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function recordChapterSettlementProjectionClosure(input: { root: string; projectSlug: string; chapterId: string; settlementId: string; derivedTransactionId: string; derivedFingerprint: string }): Promise<ChapterSettlementProjectionClosure> {
  if (!input.projectSlug.trim() || !input.chapterId.trim() || !input.settlementId.trim() || !input.derivedTransactionId.trim() || !/^[a-f0-9]{64}$/i.test(input.derivedFingerprint)) throw new Error("SETTLEMENT_PROJECTION_CLOSURE_FIELDS_REQUIRED");
  const settlement = await readChapterSettlement(input.root, input.settlementId);
  if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== input.projectSlug || settlement.chapterId !== input.chapterId) throw new Error("SETTLEMENT_PROJECTION_CLOSURE_SETTLEMENT_REQUIRED");
  const closureId = `closure-${input.settlementId}-${input.derivedTransactionId}`;
  const existing = await readChapterSettlementProjectionClosure(input.root, closureId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug || existing.chapterId !== input.chapterId || existing.settlementId !== input.settlementId || existing.derivedTransactionId !== input.derivedTransactionId || existing.derivedFingerprint !== input.derivedFingerprint) throw new Error("SETTLEMENT_PROJECTION_CLOSURE_CONFLICT");
    return existing;
  }
  const base = { schemaVersion: "chapter-settlement-projection-closure.v1" as const, closureId, projectSlug: input.projectSlug, chapterId: input.chapterId, settlementId: input.settlementId, derivedTransactionId: input.derivedTransactionId, derivedFingerprint: input.derivedFingerprint, status: "closed" as const, createdAt: new Date().toISOString() };
  const closure: ChapterSettlementProjectionClosure = { ...base, fingerprint: hash(base) };
  await writeJson(closurePath(input.root, closureId), closure);
  return closure;
}
