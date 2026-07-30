import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent, listRevisionIntents } from "./revisionIntent.js";

describe("revision intent authority", () => {
  it("creates an immutable revision intent and forces a branch for settled prose", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-intent-"));
    const intent = await createRevisionIntent(root, {
      projectSlug: "demo",
      authorText: "第八章的师父其实一直是反派，但第十章前不能让读者确定。",
      type: "direction_change",
      maturity: "settled",
      scope: { chapterIds: ["chapter-008", "chapter-009"] },
      requestedChanges: ["reframe mentor motive"],
      protectedItems: ["chapter-008.paragraph-3"],
      mode: "branch_candidate",
      actor: "author"
    });
    expect(intent).toMatchObject({ status: "proposed", maturity: "settled", mode: "branch_candidate", actor: "author" });
    expect((await listRevisionIntents(root))).toHaveLength(1);
    await expect(createRevisionIntent(root, { projectSlug: "demo", authorText: "overwrite", type: "style_edit", maturity: "author_accepted", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["rewrite"], protectedItems: [], mode: "in_place", actor: "system" })).rejects.toThrow("REVISION_IN_PLACE_FORBIDDEN");
  });

  it("rejects an empty or unauthorized revision intent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-intent-guards-"));
    await expect(createRevisionIntent(root, { projectSlug: "demo", authorText: "", type: "style_edit", maturity: "candidate_generated", scope: { chapterIds: ["chapter-001"] }, requestedChanges: [], protectedItems: [], mode: "branch_candidate", actor: "author" })).rejects.toThrow("REVISION_INTENT_CONTENT_REQUIRED");
    await expect(createRevisionIntent(root, { projectSlug: "demo", authorText: "change", type: "style_edit", maturity: "candidate_generated", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["change"], protectedItems: [], mode: "branch_candidate", actor: "system" })).rejects.toThrow("REVISION_AUTHOR_AUTHORITY_REQUIRED");
  });
});
