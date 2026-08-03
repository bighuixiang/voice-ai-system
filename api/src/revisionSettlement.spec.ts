import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";
import { settleRevision, readRevisionSettlement } from "./revisionSettlement.js";

function sha256(value: string): string { return crypto.createHash("sha256").update(value).digest("hex"); }
async function writeChapterSettlement(root: string, settlementId: string, chapterId: string, adoptedContentSha256: string): Promise<void> {
  const base = { schemaVersion: "chapter-settlement.v1" as const, settlementId, projectSlug: "demo", chapterId, adoptionTransactionId: "adopt-1", adoptedContentSha256, status: "settled" as const, nextAction: "schedule_dependency_ready_work" as const, createdAt: "2026-08-02T00:00:00.000Z" };
  await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${settlementId}.json`), JSON.stringify({ ...base, fingerprint: sha256(JSON.stringify(base)) }));
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-settlement-"));
  const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
  await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
  const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
  const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
  const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
  await fs.mkdir(path.join(root, "sessions", "prose-adoptions"), { recursive: true });
  const adoptionBase = { schemaVersion: "prose-adoption-transaction.v1" as const, transactionId: "adopt-1", candidateId: "candidate-1", targetPath: "chapters/chapter-008.md", expectedCanonSha256: "canon-before-1", adoptedSha256: sha256("canon-after-1"), authorizationId: "author-1", reviewFingerprint: "review-fingerprint", reviewVerdict: "supports-adoption" as const, status: "committed" as const, createdAt: "2026-08-02T00:00:00.000Z", committedAt: "2026-08-02T00:00:01.000Z" };
  await fs.writeFile(path.join(root, "sessions", "prose-adoptions", "adopt-1.json"), JSON.stringify({ ...adoptionBase, fingerprint: sha256(JSON.stringify(adoptionBase)) }));
  const receipt = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
  return { root, receipt };
}

describe("revision settlement", () => {
  it("settles only after all affected chapter settlements are current", async () => {
    const { root, receipt } = await fixture();
    await writeChapterSettlement(root, "settle-008", "chapter-008", sha256("canon-after-1"));
    const settlement = await settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"]);
    expect(settlement).toMatchObject({ status: "settled", receiptId: receipt.receiptId, chapterSettlementIds: ["settle-008"] });
  });

  it("fails closed when a chapter settlement is missing", async () => {
    const { root, receipt } = await fixture();
    await expect(settleRevision(root, receipt.receiptId, receipt.fingerprint, ["missing-settlement"])).rejects.toThrow("REVISION_SETTLEMENT_REQUIRED");
  });
  it("rejects an unverified chapter settlement record", async () => {
    const { root, receipt } = await fixture();
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settle-008.json"), JSON.stringify({ settlementId: "settle-008", status: "settled", chapterId: "chapter-008", adoptedContentSha256: sha256("canon-after-1") }));
    await expect(settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"])).rejects.toThrow("CHAPTER_SETTLEMENT_INTEGRITY_FAILED");
  });
  it("fails closed when a chapter settlement does not match the adopted canon fingerprint", async () => {
    const { root, receipt } = await fixture();
    await writeChapterSettlement(root, "settle-008", "chapter-008", sha256("different-canon"));
    await expect(settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"])).rejects.toThrow("REVISION_SETTLEMENT_FINGERPRINT_MISMATCH");
  });
  it("fails closed when supplied chapter settlements are outside the revision scope", async () => {
    const { root, receipt } = await fixture();
    await writeChapterSettlement(root, "settle-009", "chapter-009", sha256("canon-after-1"));
    await expect(settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-009"])).rejects.toThrow("REVISION_SETTLEMENT_SCOPE_MISMATCH");
  });
  it("replays an existing settlement idempotently", async () => {
    const { root, receipt } = await fixture();
    await writeChapterSettlement(root, "settle-008", "chapter-008", sha256("canon-after-1"));
    const first = await settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"]);
    const replay = await settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"]);
    expect(replay).toEqual(first);
  });
  it("fails closed when a persisted revision settlement is tampered", async () => {
    const { root, receipt } = await fixture();
    await writeChapterSettlement(root, "settle-008", "chapter-008", sha256("canon-after-1"));
    const settlement = await settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"]);
    const target = path.join(root, "sessions", "revisions", "settlements", `${settlement.settlementId}.json`);
    await fs.writeFile(target, JSON.stringify({ ...settlement, status: "pending" }), "utf8");
    await expect(readRevisionSettlement(root, settlement.settlementId)).rejects.toThrow("REVISION_SETTLEMENT_INTEGRITY_FAILED");
  });
});
