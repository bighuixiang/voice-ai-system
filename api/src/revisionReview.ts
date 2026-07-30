import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { RevisionChangeSet } from "./revisionChangeSet.js";

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

async function readChangeSet(root: string, id: string): Promise<RevisionChangeSet | null> {
  try { return JSON.parse(await fs.readFile(resolveInside(root, `sessions/revisions/changesets/${id}.json`), "utf8")) as RevisionChangeSet; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function reviewRevisionChangeSet(root: string, changeSetId: string, expectedChangeSetFingerprint: string, input: RevisionReviewInput): Promise<RevisionReview> {
  const changeSet = await readChangeSet(root, changeSetId);
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
