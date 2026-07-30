import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { createRevisionChangeSet } from "./revisionChangeSet.js";

describe("semantic revision change set", () => {
  it("creates a typed immutable candidate only against the current intent fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-changeset-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change the reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["reframe reveal"], protectedItems: ["chapter-008.paragraph-3"], mode: "branch_candidate", actor: "author" });
    const changeSet = await createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "reframe reveal locally" }]);
    expect(changeSet).toMatchObject({ status: "candidate", intentId: intent.intentId, operations: [{ kind: "update", targetId: "chapter-008.paragraph-5" }] });
    await expect(createRevisionChangeSet(root, intent.intentId, "stale-fingerprint", [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-5", chapterId: "chapter-008", rationale: "stale" }])).rejects.toThrow("REVISION_INTENT_STALE");
  });

  it("blocks operations that target protected author items", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-changeset-protected-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Keep paragraph three.", type: "style_edit", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["local repair"], protectedItems: ["chapter-008.paragraph-3"], mode: "branch_candidate", actor: "author" });
    await expect(createRevisionChangeSet(root, intent.intentId, intent.fingerprint, [{ kind: "update", targetKind: "text-span", targetId: "chapter-008.paragraph-3", chapterId: "chapter-008", rationale: "replace protected text" }])).rejects.toThrow("REVISION_PROTECTED_ITEM_CONFLICT");
  });
});
