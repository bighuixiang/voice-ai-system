import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt, readRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function writeCommittedAdoption(root: string, adoptedSha256 = "canon-after-1", targetPath = "chapters/chapter-008.md"): Promise<void> {
  const base = { schemaVersion: "prose-adoption-transaction.v1" as const, transactionId: "adopt-1", candidateId: "candidate-1", targetPath, expectedCanonSha256: "canon-before-1", adoptedSha256, authorizationId: "author-1", reviewFingerprint: "review-fingerprint", reviewVerdict: "supports-adoption" as const, status: "committed" as const, createdAt: "2026-08-02T00:00:00.000Z", committedAt: "2026-08-02T00:00:01.000Z" };
  await fs.mkdir(path.join(root, "sessions", "prose-adoptions"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "prose-adoptions", "adopt-1.json"), JSON.stringify({ ...base, fingerprint: hash(base) }));
}

describe("revision adoption receipt", () => {
  it("links a proposal to the existing committed prose adoption transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await writeCommittedAdoption(root);
    const receipt = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    expect(receipt).toMatchObject({ status: "committed", proposalId: proposal.proposalId, proseAdoptionTransactionId: "adopt-1", canonWritten: true });
  });
  it("replays the same adoption receipt idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-replay-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await writeCommittedAdoption(root);
    const first = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    const replay = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    expect(replay).toEqual(first);
  });
  it("rejects a re-signed receipt that conflicts with the current adoption transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-conflict-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await writeCommittedAdoption(root);
    const first = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    const target = path.join(root, "sessions", "revisions", "adoption-receipts", `${first.receiptId}.json`);
    const { fingerprint: _old, ...base } = first;
    await fs.writeFile(target, JSON.stringify({ ...base, canonWriteFingerprint: "different-canon", fingerprint: hash({ ...base, canonWriteFingerprint: "different-canon" }) }));
    await expect(recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1")).rejects.toThrow("REVISION_ADOPTION_RECEIPT_CONFLICT");
  });

  it("blocks linking a rolled-back or stale prose transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-blocked-"));
    await expect(recordRevisionAdoptionReceipt(root, "missing-proposal", "stale", "adopt-1")).rejects.toThrow("REVISION_ADOPTION_PROPOSAL_STALE");
  });
  it("rejects an unverified prose adoption transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-unverified-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await fs.mkdir(path.join(root, "sessions", "prose-adoptions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "prose-adoptions", "adopt-1.json"), JSON.stringify({ transactionId: "adopt-1", status: "committed", expectedCanonSha256: "canon-before-1", adoptedSha256: "canon-after-1" }));
    await expect(recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1")).rejects.toThrow("PROSE_ADOPTION_INTEGRITY_FAILED");
  });
  it("rejects a valid prose adoption transaction outside the revision chapter scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-scope-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await writeCommittedAdoption(root, "canon-after-1", "chapters/chapter-009.md");
    await expect(recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1")).rejects.toThrow("REVISION_PROSE_ADOPTION_SCOPE_MISMATCH");
  });
  it("fails closed when the persisted receipt is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-tampered-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await writeCommittedAdoption(root);
    const receipt = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    const target = path.join(root, "sessions", "revisions", "adoption-receipts", `${receipt.receiptId}.json`);
    await fs.writeFile(target, JSON.stringify({ ...receipt, canonWritten: false }), "utf8");
    await expect(readRevisionAdoptionReceipt(root, receipt.receiptId)).rejects.toThrow("REVISION_ADOPTION_RECEIPT_INTEGRITY_FAILED");
  });
});
