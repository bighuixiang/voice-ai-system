import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";
import { settleRevision } from "./revisionSettlement.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-settlement-"));
  const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
  await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
  const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
  const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
  const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
  await fs.mkdir(path.join(root, "sessions", "prose-adoptions"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "prose-adoptions", "adopt-1.json"), JSON.stringify({ transactionId: "adopt-1", status: "committed", expectedCanonSha256: "canon-before-1", adoptedSha256: "canon-after-1" }));
  const receipt = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
  return { root, receipt };
}

describe("revision settlement", () => {
  it("settles only after all affected chapter settlements are current", async () => {
    const { root, receipt } = await fixture();
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settle-008.json"), JSON.stringify({ settlementId: "settle-008", status: "settled", chapterId: "chapter-008", adoptedContentSha256: "canon-after-1" }));
    const settlement = await settleRevision(root, receipt.receiptId, receipt.fingerprint, ["settle-008"]);
    expect(settlement).toMatchObject({ status: "settled", receiptId: receipt.receiptId, chapterSettlementIds: ["settle-008"] });
  });

  it("fails closed when a chapter settlement is missing", async () => {
    const { root, receipt } = await fixture();
    await expect(settleRevision(root, receipt.receiptId, receipt.fingerprint, ["missing-settlement"])).rejects.toThrow("REVISION_SETTLEMENT_REQUIRED");
  });
});
