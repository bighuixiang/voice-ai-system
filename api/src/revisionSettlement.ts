import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";
import { readRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { readRevisionChangeSet } from "./revisionChangeSet.js";
import { readChapterSettlement } from "./chapterSettlement.js";

export interface RevisionSettlement {
  schemaVersion: "revision-settlement.v1";
  settlementId: string;
  receiptId: string;
  receiptFingerprint: string;
  chapterSettlementIds: string[];
  status: "settled";
  canonWriteFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function readJson<T>(root: string, relative: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(resolveInside(root, relative), "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export function assertRevisionSettlementIntegrity(settlement: RevisionSettlement, expectedId?: string): RevisionSettlement { const { fingerprint, ...base } = settlement; const valid = settlement?.schemaVersion === "revision-settlement.v1" && (!expectedId || settlement.settlementId === expectedId) && [settlement.settlementId, settlement.receiptId, settlement.receiptFingerprint, settlement.canonWriteFingerprint, settlement.createdAt].every((value) => typeof value === "string" && value.trim()) && Array.isArray(settlement.chapterSettlementIds) && settlement.chapterSettlementIds.length > 0 && new Set(settlement.chapterSettlementIds).size === settlement.chapterSettlementIds.length && settlement.chapterSettlementIds.every((value) => typeof value === "string" && value.trim()) && settlement.status === "settled" && !Number.isNaN(Date.parse(settlement.createdAt)) && /^[a-f0-9]{64}$/i.test(settlement.fingerprint) && hash(base) === fingerprint; if (!valid) throw new Error("REVISION_SETTLEMENT_INTEGRITY_FAILED"); return settlement; }
export async function readRevisionSettlement(root: string, settlementId: string): Promise<RevisionSettlement | null> { const settlement = await readJson<RevisionSettlement>(root, `sessions/revisions/settlements/${settlementId}.json`); return settlement ? assertRevisionSettlementIntegrity(settlement, settlementId) : null; }

export async function settleRevision(root: string, receiptId: string, expectedReceiptFingerprint: string, chapterSettlementIds: string[]): Promise<RevisionSettlement> {
  const receipt = await readRevisionAdoptionReceipt(root, receiptId);
  if (!receipt || receipt.fingerprint !== expectedReceiptFingerprint || receipt.status !== "committed") throw new Error("REVISION_ADOPTION_RECEIPT_REQUIRED");
  const proposal = await readRevisionAdoptionProposal(root, receipt.proposalId);
  const changeSet = proposal ? await readRevisionChangeSet(root, proposal.changeSetId) : null;
  if (!proposal || proposal.fingerprint !== receipt.proposalFingerprint || !changeSet || changeSet.fingerprint !== proposal.expectedChangeSetFingerprint) throw new Error("REVISION_ADOPTION_RECEIPT_REQUIRED");
  if (!chapterSettlementIds.length) throw new Error("REVISION_SETTLEMENT_REQUIRED");
  const settlements = await Promise.all(chapterSettlementIds.map((id) => readChapterSettlement(root, id)));
  if (settlements.some((item) => !item || item.status !== "settled")) throw new Error("REVISION_SETTLEMENT_REQUIRED");
  if (settlements.some((item) => item?.adoptedContentSha256 !== receipt.canonWriteFingerprint)) throw new Error("REVISION_SETTLEMENT_FINGERPRINT_MISMATCH");
  const affectedChapterIds = [...new Set(changeSet.operations.map((operation) => operation.chapterId))].sort();
  const settledChapterIds = [...new Set(settlements.map((item) => item?.chapterId).filter((value): value is string => typeof value === "string" && Boolean(value.trim())))].sort();
  if (settledChapterIds.length !== settlements.length || JSON.stringify(settledChapterIds) !== JSON.stringify(affectedChapterIds)) throw new Error("REVISION_SETTLEMENT_SCOPE_MISMATCH");
  const ids = [...new Set(chapterSettlementIds)].sort();
  const settlementId = `revision-settlement-${receiptId}`;
  const existing = await readRevisionSettlement(root, settlementId);
  if (existing) {
    if (existing.receiptFingerprint !== expectedReceiptFingerprint || existing.canonWriteFingerprint !== receipt.canonWriteFingerprint || JSON.stringify(existing.chapterSettlementIds) !== JSON.stringify(ids)) throw new Error("REVISION_SETTLEMENT_CONFLICT");
    return existing;
  }
  const base = {
    schemaVersion: "revision-settlement.v1" as const,
    settlementId,
    receiptId,
    receiptFingerprint: expectedReceiptFingerprint,
    chapterSettlementIds: ids,
    status: "settled" as const,
    canonWriteFingerprint: receipt.canonWriteFingerprint,
    createdAt: new Date().toISOString()
  };
  const settlement: RevisionSettlement = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, `sessions/revisions/settlements/${settlement.settlementId}.json`);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return settlement;
}
