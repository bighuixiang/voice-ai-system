import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createSemanticNode, projectSemanticNodeOrder, readSemanticNode, listSemanticNodes } from "./semanticNodes.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "semantic-nodes-")); }
describe("stable semantic nodes", () => {
  it("keeps semantic identity while recomputing display chapter projection", async () => {
    const r = await root(); await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "arc-main", kind: "arc", label: "主线", displayChapter: "第1章", sourceRefs: ["source://arc"] }); await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "chapter-opening", kind: "chapter", label: "开端", displayChapter: "第1章", parentId: "arc-main", sourceRefs: ["source://chapter"] });
    const projected = await projectSemanticNodeOrder(r, "demo", ["chapter-opening", "arc-main"]); expect(projected.map((n) => [n.semanticId, n.displayOrder])).toEqual([["chapter-opening", 1], ["arc-main", 2]]); expect((await readSemanticNode(r, "chapter-opening"))?.semanticId).toBe("chapter-opening");
  });
  it("is idempotent and project isolated", async () => { const r = await root(); const one = await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "场景", displayChapter: "第1章", sourceRefs: ["source://scene"] }); const two = await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "changed", displayChapter: "第9章", sourceRefs: ["source://other"] }); expect(two.fingerprint).toBe(one.fingerprint); expect((await listSemanticNodes(r, "other")).length).toBe(0); });
  it("rejects missing evidence and unknown projection IDs", async () => { const r = await root(); await expect(createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "场景", displayChapter: "第1章", sourceRefs: [] })).rejects.toThrow("SEMANTIC_NODE_SOURCE_REQUIRED"); await expect(projectSemanticNodeOrder(r, "demo", ["missing"])).rejects.toThrow("SEMANTIC_NODE_NOT_FOUND"); });
});
