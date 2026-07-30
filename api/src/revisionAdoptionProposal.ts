import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { buildRevisionImpactReport } from "./revisionImpact.js";
import type { RevisionChangeSet } from "./revisionChangeSet.js";
import type { RevisionReview } from "./revisionReview.js";

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

export async function createRevisionAdoptionProposal(root: string, changeSetId: string, expectedChangeSetFingerprint: string, reviewId: string, baseCanonFingerprint: string): Promise<RevisionAdoptionProposal> {
  if (!baseCanonFingerprint.trim()) throw new Error("REVISION_BASE_CANON_FINGERPRINT_REQUIRED");
  const changeSet = await readJson<RevisionChangeSet>(root, `sessions/revisions/changesets/${changeSetId}.json`);
  if (!changeSet || changeSet.fingerprint !== expectedChangeSetFingerprint) throw new Error("REVISION_CHANGESET_STALE");
  const review = await readJson<RevisionReview>(root, `sessions/revisions/reviews/${reviewId}.json`);
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
