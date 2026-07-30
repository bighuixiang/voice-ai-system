import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { RevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";

interface ChapterSettlementRef { settlementId: string; status: string; chapterId?: string; adoptedContentSha256?: string; }
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

export async function settleRevision(root: string, receiptId: string, expectedReceiptFingerprint: string, chapterSettlementIds: string[]): Promise<RevisionSettlement> {
  const receipt = await readJson<RevisionAdoptionReceipt>(root, `sessions/revisions/adoption-receipts/${receiptId}.json`);
  if (!receipt || receipt.fingerprint !== expectedReceiptFingerprint || receipt.status !== "committed") throw new Error("REVISION_ADOPTION_RECEIPT_REQUIRED");
  if (!chapterSettlementIds.length) throw new Error("REVISION_SETTLEMENT_REQUIRED");
  const settlements = await Promise.all(chapterSettlementIds.map((id) => readJson<ChapterSettlementRef>(root, `sessions/chapter-settlements/${id}.json`)));
  if (settlements.some((item) => !item || item.status !== "settled")) throw new Error("REVISION_SETTLEMENT_REQUIRED");
  const ids = [...new Set(chapterSettlementIds)].sort();
  const base = {
    schemaVersion: "revision-settlement.v1" as const,
    settlementId: `revision-settlement-${receiptId}`,
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
