import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { RevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import type { ProseAdoptionTransaction } from "./proseAdoption.js";

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

export async function recordRevisionAdoptionReceipt(root: string, proposalId: string, expectedProposalFingerprint: string, proseAdoptionTransactionId: string): Promise<RevisionAdoptionReceipt> {
  const proposal = await readJson<RevisionAdoptionProposal>(root, `sessions/revisions/adoption-proposals/${proposalId}.json`);
  if (!proposal || proposal.fingerprint !== expectedProposalFingerprint || proposal.status !== "ready_for_author_adoption") throw new Error("REVISION_ADOPTION_PROPOSAL_STALE");
  const transaction = await readJson<ProseAdoptionTransaction>(root, `sessions/prose-adoptions/${proseAdoptionTransactionId}.json`);
  if (!transaction || transaction.status !== "committed") throw new Error("REVISION_PROSE_ADOPTION_REQUIRED");
  if (transaction.expectedCanonSha256 !== proposal.baseCanonFingerprint) throw new Error("REVISION_CANON_BASELINE_MISMATCH");
  const base = {
    schemaVersion: "revision-adoption-receipt.v1" as const,
    receiptId: `revision-receipt-${crypto.randomUUID()}`,
    proposalId,
    proposalFingerprint: expectedProposalFingerprint,
    proseAdoptionTransactionId,
    canonWriteFingerprint: transaction.adoptedSha256,
    status: "committed" as const,
    canonWritten: true as const,
    createdAt: new Date().toISOString()
  };
  const receipt: RevisionAdoptionReceipt = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, `sessions/revisions/adoption-receipts/${receipt.receiptId}.json`);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return receipt;
}
