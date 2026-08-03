import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";
import { createRevisionAdoptionProposal, readRevisionAdoptionProposal } from "./revisionAdoptionProposal.js";

describe("revision adoption proposal gate", () => {
  it("creates a proposal only after author approval and a known dependency graph", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-adoption-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    expect(proposal).toMatchObject({ status: "ready_for_author_adoption", canonWritten: false, baseCanonFingerprint: "canon-before-1" });
  });

  it("blocks proposals when review is not approved or dependencies are unknown", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-adoption-blocked-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change.", type: "style_edit", maturity: "candidate_generated", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["local"], protectedItems: [], mode: "in_place", actor: "author" });
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-001.paragraph-1", chapterId: "chapter-001", rationale: "local" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "needs_revision", note: "Not yet.", actor: "author" });
    await expect(createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-1")).rejects.toThrow("REVISION_ADOPTION_REVIEW_REQUIRED");
  });
  it("fails closed when a proposal is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-adoption-tampered-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [] }));
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed.", actor: "author" });
    const proposal = await createRevisionAdoptionProposal(root, changeSet.changeSetId, changeSet.fingerprint, review.reviewId, "canon-before-1");
    const target = path.join(root, "sessions", "revisions", "adoption-proposals", `${proposal.proposalId}.json`);
    await fs.writeFile(target, JSON.stringify({ ...proposal, canonWritten: true }), "utf8");
    await expect(readRevisionAdoptionProposal(root, proposal.proposalId)).rejects.toThrow("REVISION_ADOPTION_PROPOSAL_INTEGRITY_FAILED");
  });
});
