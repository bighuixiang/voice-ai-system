import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";
import { reviewRevisionChangeSet } from "./revisionReview.js";

describe("revision change-set author review", () => {
  it("records author approval without claiming canon adoption", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-review-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe"], protectedItems: [], mode: "branch_candidate", actor: "author" });
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe" }]);
    const review = await reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "Proceed to governed adoption.", actor: "author" });
    expect(review).toMatchObject({ status: "approved_for_adoption", decision: "accepted", canonWritten: false });
  });

  it("rejects stale or non-author review attempts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-review-guards-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change.", type: "style_edit", maturity: "candidate_generated", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["local"], protectedItems: [], mode: "in_place", actor: "author" });
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-001.paragraph-1", chapterId: "chapter-001", rationale: "local" }]);
    await expect(reviewRevisionChangeSet(root, changeSet.changeSetId, "stale", { decision: "accepted", note: "late", actor: "author" })).rejects.toThrow("REVISION_CHANGESET_STALE");
    await expect(reviewRevisionChangeSet(root, changeSet.changeSetId, changeSet.fingerprint, { decision: "accepted", note: "system", actor: "system" })).rejects.toThrow("REVISION_AUTHOR_AUTHORITY_REQUIRED");
  });
});
