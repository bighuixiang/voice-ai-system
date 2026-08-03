import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { buildRevisionImpactReport } from "./revisionImpact.js";
import { readRevisionChangeSet } from "./revisionChangeSet.js";
import { readRevisionReview } from "./revisionReview.js";

export interface RevisionAdoptionProposal {
  schemaVersion: "revision-adoption-proposal.v1";
  proposalId: string;
  changeSetId: string;
  expectedChangeSetFingerprint: string;
  reviewId: string;
  baseCanonFingerprint: string;
  impactFingerprint: string;
  status: "ready_for_author_adoption";
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function readJson<T>(root: string, relative: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(resolveInside(root, relative), "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export function assertRevisionAdoptionProposalIntegrity(proposal: RevisionAdoptionProposal, expectedId?: string): RevisionAdoptionProposal { const { fingerprint, ...base } = proposal; const valid = proposal?.schemaVersion === "revision-adoption-proposal.v1" && (!expectedId || proposal.proposalId === expectedId) && [proposal.proposalId, proposal.changeSetId, proposal.expectedChangeSetFingerprint, proposal.reviewId, proposal.baseCanonFingerprint, proposal.impactFingerprint, proposal.createdAt].every((value) => typeof value === "string" && value.trim()) && proposal.status === "ready_for_author_adoption" && proposal.canonWritten === false && !Number.isNaN(Date.parse(proposal.createdAt)) && /^[a-f0-9]{64}$/i.test(proposal.fingerprint) && hash(base) === fingerprint; if (!valid) throw new Error("REVISION_ADOPTION_PROPOSAL_INTEGRITY_FAILED"); return proposal; }
export async function readRevisionAdoptionProposal(root: string, proposalId: string): Promise<RevisionAdoptionProposal | null> { const proposal = await readJson<RevisionAdoptionProposal>(root, `sessions/revisions/adoption-proposals/${proposalId}.json`); return proposal ? assertRevisionAdoptionProposalIntegrity(proposal, proposalId) : null; }

export async function createRevisionAdoptionProposal(root: string, changeSetId: string, expectedChangeSetFingerprint: string, reviewId: string, baseCanonFingerprint: string): Promise<RevisionAdoptionProposal> {
  if (!baseCanonFingerprint.trim()) throw new Error("REVISION_BASE_CANON_FINGERPRINT_REQUIRED");
  const changeSet = await readRevisionChangeSet(root, changeSetId);
  if (!changeSet || changeSet.fingerprint !== expectedChangeSetFingerprint) throw new Error("REVISION_CHANGESET_STALE");
  const review = await readRevisionReview(root, reviewId);
  if (!review || review.changeSetId !== changeSetId || review.expectedChangeSetFingerprint !== expectedChangeSetFingerprint || review.status !== "approved_for_adoption") throw new Error("REVISION_ADOPTION_REVIEW_REQUIRED");
  const impact = await buildRevisionImpactReport(root, changeSet.intentId);
  if (impact.status !== "ready_for_candidate") throw new Error("REVISION_ADOPTION_IMPACT_INCOMPLETE");
  const base = {
    schemaVersion: "revision-adoption-proposal.v1" as const,
    proposalId: `revision-adoption-${crypto.randomUUID()}`,
    changeSetId,
    expectedChangeSetFingerprint,
    reviewId,
    baseCanonFingerprint: baseCanonFingerprint.trim(),
    impactFingerprint: impact.fingerprint,
    status: "ready_for_author_adoption" as const,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const proposal: RevisionAdoptionProposal = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, `sessions/revisions/adoption-proposals/${proposal.proposalId}.json`);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return proposal;
}
