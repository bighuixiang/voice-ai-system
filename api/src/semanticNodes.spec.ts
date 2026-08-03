import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSemanticNode, projectSemanticNodeOrder, readSemanticNode, listSemanticNodes } from "./semanticNodes.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "semantic-nodes-")); }
describe("stable semantic nodes", () => {
  it("keeps semantic identity while recomputing display chapter projection", async () => {
    const r = await root(); await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "arc-main", kind: "arc", label: "主线", displayChapter: "第1章", sourceRefs: ["source://arc"] }); await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "chapter-opening", kind: "chapter", label: "开端", displayChapter: "第1章", parentId: "arc-main", sourceRefs: ["source://chapter"] });
    const before = await readSemanticNode(r, "chapter-opening");
    const projected = await projectSemanticNodeOrder(r, "demo", ["chapter-opening", "arc-main"]); expect(projected.map((n) => [n.semanticId, n.displayOrder])).toEqual([["chapter-opening", 1], ["arc-main", 2]]); const after = await readSemanticNode(r, "chapter-opening"); expect(after?.semanticId).toBe("chapter-opening"); expect(after?.fingerprint).not.toBe(before?.fingerprint); const { fingerprint, ...base } = after!; expect(fingerprint).toBe(crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex"));
  });
  it("is idempotent and project isolated", async () => { const r = await root(); const one = await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "场景", displayChapter: "第1章", sourceRefs: ["source://scene"] }); const two = await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "changed", displayChapter: "第9章", sourceRefs: ["source://other"] }); expect(two.fingerprint).toBe(one.fingerprint); expect((await listSemanticNodes(r, "other")).length).toBe(0); });
  it("rejects missing evidence and unknown projection IDs", async () => { const r = await root(); await expect(createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "scene", label: "场景", displayChapter: "第1章", sourceRefs: [] })).rejects.toThrow("SEMANTIC_NODE_SOURCE_REQUIRED"); await expect(projectSemanticNodeOrder(r, "demo", ["missing"])).rejects.toThrow("SEMANTIC_NODE_NOT_FOUND"); });

  it("clears removed display projections while preserving semantic references", async () => {
    const r = await root();
    await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "chapter", label: "one", displayChapter: "1", sourceRefs: ["source://1"] });
    await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n2", kind: "chapter", label: "two", displayChapter: "2", sourceRefs: ["source://2"], parentId: "arc-main" });
    await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n3", kind: "chapter", label: "three", displayChapter: "3", sourceRefs: ["source://3"], parentId: "arc-main" });
    await projectSemanticNodeOrder(r, "demo", ["n1", "n2", "n3"]);
    await projectSemanticNodeOrder(r, "demo", ["n3", "n1"]);
    const removed = await readSemanticNode(r, "n2");
    expect(removed?.displayOrder).toBeNull();
    expect(removed?.parentId).toBe("arc-main");
    expect((await readSemanticNode(r, "n3"))?.semanticId).toBe("n3");
  });

  it("rejects duplicate projection IDs instead of assigning ambiguous chapter numbers", async () => {
    const r = await root();
    await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n1", kind: "chapter", label: "one", displayChapter: "1", sourceRefs: ["source://1"] });
    await expect(projectSemanticNodeOrder(r, "demo", ["n1", "n1"])).rejects.toThrow("SEMANTIC_NODE_ORDER_DUPLICATE");
  });

  it("fails closed when a semantic node is tampered", async () => {
    const r = await root();
    const node = await createSemanticNode({ root: r, projectSlug: "demo", semanticId: "n-integrity", kind: "scene", label: "scene", displayChapter: "1", sourceRefs: ["source://scene"] });
    const target = path.join(r, "sessions", "semantic-nodes", `${node.semanticId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    await fs.writeFile(target, JSON.stringify({ ...persisted, label: "tampered" }), "utf8");
    await expect(readSemanticNode(r, node.semanticId)).rejects.toThrow("SEMANTIC_NODE_INTEGRITY_FAILED");
    await expect(listSemanticNodes(r, "demo")).rejects.toThrow("SEMANTIC_NODE_INTEGRITY_FAILED");
  });
});
