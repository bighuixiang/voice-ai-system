import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";
import { createRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";
import { recordRevisionAdoptionReceipt } from "./revisionAdoptionReceipt.js";

describe("revision adoption receipt", () => {
  it("links a proposal to the existing committed prose adoption transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    await fs.mkdir(path.join(root, "sessions", "prose-adoptions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "prose-adoptions", "adopt-1.json"), JSON.stringify({ transactionId: "adopt-1", status: "committed", expectedCanonSha256: "canon-before-1", adoptedSha256: "canon-after-1" }));
    const receipt = await recordRevisionAdoptionReceipt(root, proposal.proposalId, proposal.fingerprint, "adopt-1");
    expect(receipt).toMatchObject({ status: "committed", proposalId: proposal.proposalId, proseAdoptionTransactionId: "adopt-1", canonWritten: true });
  });

  it("blocks linking a rolled-back or stale prose transaction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-receipt-blocked-"));
    await expect(recordRevisionAdoptionReceipt(root, "missing-proposal", "stale", "adopt-1")).rejects.toThrow("REVISION_ADOPTION_PROPOSAL_STALE");
  });
});
