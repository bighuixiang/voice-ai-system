import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readRevisionChangeSet } from "./revisionChangeSet.js";

export interface RevisionReviewInput { decision: "accepted" | "needs_revision" | "rejected"; note: string; actor: "author" | "system"; }
export interface RevisionReview {
  schemaVersion: "revision-review.v1";
  reviewId: string;
  changeSetId: string;
  expectedChangeSetFingerprint: string;
  decision: RevisionReviewInput["decision"];
  status: "approved_for_adoption" | "needs_revision" | "rejected";
  note: string;
  actor: "author";
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function assertRevisionReviewIntegrity(review: RevisionReview, expectedId?: string): RevisionReview { const { fingerprint, ...base } = review; const statusConsistent = (review.decision === "accepted" && review.status === "approved_for_adoption") || (review.decision === "needs_revision" && review.status === "needs_revision") || (review.decision === "rejected" && review.status === "rejected"); const valid = review?.schemaVersion === "revision-review.v1" && (!expectedId || review.reviewId === expectedId) && [review.reviewId, review.changeSetId, review.expectedChangeSetFingerprint, review.note, review.createdAt].every((value) => typeof value === "string" && value.trim()) && ["accepted", "needs_revision", "rejected"].includes(review.decision) && statusConsistent && review.actor === "author" && review.canonWritten === false && !Number.isNaN(Date.parse(review.createdAt)) && /^[a-f0-9]{64}$/i.test(review.fingerprint) && hash(base) === fingerprint; if (!valid) throw new Error("REVISION_REVIEW_INTEGRITY_FAILED"); return review; }
export async function readRevisionReview(root: string, reviewId: string): Promise<RevisionReview | null> { try { const review = JSON.parse(await fs.readFile(resolveInside(root, `sessions/revisions/reviews/${reviewId}.json`), "utf8")) as RevisionReview; return assertRevisionReviewIntegrity(review, reviewId); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function reviewRevisionChangeSet(root: string, changeSetId: string, expectedChangeSetFingerprint: string, input: RevisionReviewInput): Promise<RevisionReview> {
  const changeSet = await readRevisionChangeSet(root, changeSetId);
  if (!changeSet || changeSet.fingerprint !== expectedChangeSetFingerprint) throw new Error("REVISION_CHANGESET_STALE");
  if (input.actor !== "author") throw new Error("REVISION_AUTHOR_AUTHORITY_REQUIRED");
  if (!input.note.trim()) throw new Error("REVISION_REVIEW_NOTE_REQUIRED");
  const base = {
    schemaVersion: "revision-review.v1" as const,
    reviewId: `revision-review-${crypto.randomUUID()}`,
    changeSetId,
    expectedChangeSetFingerprint,
    decision: input.decision,
    status: (input.decision === "accepted" ? "approved_for_adoption" : input.decision) as RevisionReview["status"],
    note: input.note.trim(),
    actor: "author" as const,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const review: RevisionReview = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, `sessions/revisions/reviews/${review.reviewId}.json`);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return review;
}
