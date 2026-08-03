import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseAdoptionTransaction } from "./proseAdoption.js";
import { readRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { readRevisionChangeSet } from "./revisionChangeSet.js";

export interface RevisionAdoptionReceipt {
  schemaVersion: "revision-adoption-receipt.v1";
  receiptId: string;
  proposalId: string;
  proposalFingerprint: string;
  proseAdoptionTransactionId: string;
  canonWriteFingerprint: string;
  status: "committed";
  canonWritten: true;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function readJson<T>(root: string, relative: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(resolveInside(root, relative), "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export function assertRevisionAdoptionReceiptIntegrity(receipt: RevisionAdoptionReceipt, expectedId?: string): RevisionAdoptionReceipt { const { fingerprint, ...base } = receipt; const valid = receipt?.schemaVersion === "revision-adoption-receipt.v1" && (!expectedId || receipt.receiptId === expectedId) && [receipt.receiptId, receipt.proposalId, receipt.proposalFingerprint, receipt.proseAdoptionTransactionId, receipt.canonWriteFingerprint, receipt.createdAt].every((value) => typeof value === "string" && value.trim()) && receipt.status === "committed" && receipt.canonWritten === true && !Number.isNaN(Date.parse(receipt.createdAt)) && /^[a-f0-9]{64}$/i.test(receipt.fingerprint) && hash(base) === fingerprint; if (!valid) throw new Error("REVISION_ADOPTION_RECEIPT_INTEGRITY_FAILED"); return receipt; }
export async function readRevisionAdoptionReceipt(root: string, receiptId: string): Promise<RevisionAdoptionReceipt | null> { const receipt = await readJson<RevisionAdoptionReceipt>(root, `sessions/revisions/adoption-receipts/${receiptId}.json`); return receipt ? assertRevisionAdoptionReceiptIntegrity(receipt, receiptId) : null; }

export async function recordRevisionAdoptionReceipt(root: string, proposalId: string, expectedProposalFingerprint: string, proseAdoptionTransactionId: string): Promise<RevisionAdoptionReceipt> {
  const proposal = await readRevisionAdoptionProposal(root, proposalId);
  if (!proposal || proposal.fingerprint !== expectedProposalFingerprint || proposal.status !== "ready_for_author_adoption") throw new Error("REVISION_ADOPTION_PROPOSAL_STALE");
  const transaction = await readProseAdoptionTransaction(root, proseAdoptionTransactionId);
  if (!transaction || transaction.status !== "committed") throw new Error("REVISION_PROSE_ADOPTION_REQUIRED");
  if (transaction.expectedCanonSha256 !== proposal.baseCanonFingerprint) throw new Error("REVISION_CANON_BASELINE_MISMATCH");
  const changeSet = await readRevisionChangeSet(root, proposal.changeSetId);
  const targetChapterId = transaction.targetPath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "");
  const affectedChapterIds = new Set(changeSet?.operations.map((operation) => operation.chapterId) || []);
  if (!changeSet || changeSet.fingerprint !== proposal.expectedChangeSetFingerprint || !targetChapterId || !affectedChapterIds.has(targetChapterId)) throw new Error("REVISION_PROSE_ADOPTION_SCOPE_MISMATCH");
  const receiptId = `revision-receipt-${hash({ proposalId, proseAdoptionTransactionId }).slice(0, 32)}`;
  const target = resolveInside(root, `sessions/revisions/adoption-receipts/${receiptId}.json`);
  const existing = await readJson<RevisionAdoptionReceipt>(root, `sessions/revisions/adoption-receipts/${receiptId}.json`);
  if (existing) {
    const verified = assertRevisionAdoptionReceiptIntegrity(existing, receiptId);
    if (verified.proposalId !== proposalId || verified.proposalFingerprint !== expectedProposalFingerprint || verified.proseAdoptionTransactionId !== proseAdoptionTransactionId || verified.canonWriteFingerprint !== transaction.adoptedSha256) throw new Error("REVISION_ADOPTION_RECEIPT_CONFLICT");
    return verified;
  }
  const base = {
    schemaVersion: "revision-adoption-receipt.v1" as const,
    receiptId,
    proposalId,
    proposalFingerprint: expectedProposalFingerprint,
    proseAdoptionTransactionId,
    canonWriteFingerprint: transaction.adoptedSha256,
    status: "committed" as const,
    canonWritten: true as const,
    createdAt: new Date().toISOString()
  };
  const receipt: RevisionAdoptionReceipt = { ...base, fingerprint: hash(base) };
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return receipt;
}
