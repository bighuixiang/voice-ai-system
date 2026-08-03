import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileAndPersistPublicationTree, compilePublicationTree, readPublicationTree } from "./publicationTree.js";
import crypto from "node:crypto";

describe("publication tree", () => {
  it("compiles deterministic reader-safe blocks from a frozen edition", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-tree-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    const content = "# 第一章\n\n她走进房间。\n\n---\n\n门在身后合上。\n";
    await fs.writeFile(path.join(root, "chapters", "001.md"), content, "utf8");
    const hash = (await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex");
    const manifest = {
      schemaVersion: "edition-manifest.v1" as const, editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen" as const, readerSafe: true as const,
      chapters: [{ chapterId: "chapter-001", title: "第一章", order: 1, contentPath: "chapters/001.md", settlementId: "settlement-1", contentSha256: hash }], publicationTreeFingerprint: "tree-placeholder", createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "manifest-placeholder"
    };
    const tree = await compilePublicationTree(root, manifest);
    expect(tree.schemaVersion).toBe("publication-tree.v1");
    expect(tree.chapters[0].blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "scene_break", "paragraph"]);
    expect(tree.readerSafe).toBe(true);
    await expect(compilePublicationTree(root, manifest)).resolves.toMatchObject({ fingerprint: tree.fingerprint });
    await expect(compileAndPersistPublicationTree(root, manifest)).resolves.toMatchObject({ fingerprint: tree.fingerprint });
    await expect(readPublicationTree(root, manifest.editionId)).resolves.toMatchObject({ fingerprint: tree.fingerprint });
  });

  it("rejects stale content and internal payload leakage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-tree-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    const content = "# Chapter\n\nPROMPT: hidden task\n";
    await fs.writeFile(path.join(root, "chapters", "001.md"), content, "utf8");
    const hash = (await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex");
    const manifest = { schemaVersion: "edition-manifest.v1" as const, editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen" as const, readerSafe: true as const, chapters: [{ chapterId: "chapter-001", title: "Chapter", order: 1, contentPath: "chapters/001.md", settlementId: "settlement-1", contentSha256: hash }], publicationTreeFingerprint: "tree", createdAt: "now", fingerprint: "manifest" };
    await expect(compilePublicationTree(root, manifest)).rejects.toThrow("PUBLICATION_TREE_INTERNAL_CONTENT");
  });

  it("fails closed when a persisted publication tree is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-tree-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    const content = "# Chapter\n\nStable prose.\n";
    await fs.writeFile(path.join(root, "chapters", "001.md"), content, "utf8");
    const contentSha256 = (await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex");
    const manifest = { schemaVersion: "edition-manifest.v1" as const, editionId: "edition-tampered", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen" as const, readerSafe: true as const, chapters: [{ chapterId: "chapter-001", title: "Chapter", order: 1, contentPath: "chapters/001.md", settlementId: "settlement-1", contentSha256 }], publicationTreeFingerprint: "tree", createdAt: "now", fingerprint: "manifest" };
    const tree = await compileAndPersistPublicationTree(root, manifest);
    const target = path.join(root, "sessions", "publication-editions", `${manifest.editionId}.tree.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.projectSlug = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(readPublicationTree(root, manifest.editionId)).rejects.toThrow("PUBLICATION_TREE_INTEGRITY_FAILED");
    await expect(compileAndPersistPublicationTree(root, manifest)).rejects.toThrow("PUBLICATION_TREE_INTEGRITY_FAILED");
    expect(tree.fingerprint).toBe(value.fingerprint);
  });

  it("rejects a re-signed publication tree that is not reader-safe", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-tree-semantic-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    const content = "# Chapter\n\nStable prose.\n";
    await fs.writeFile(path.join(root, "chapters", "001.md"), content, "utf8");
    const contentSha256 = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    const manifest = { schemaVersion: "edition-manifest.v1" as const, editionId: "edition-semantic", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen" as const, readerSafe: true as const, chapters: [{ chapterId: "chapter-001", title: "Chapter", order: 1, contentPath: "chapters/001.md", settlementId: "settlement-1", contentSha256 }], publicationTreeFingerprint: "tree", createdAt: "now", fingerprint: "manifest" };
    await compileAndPersistPublicationTree(root, manifest);
    const target = path.join(root, "sessions", "publication-editions", "edition-semantic.tree.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, readerSafe: false };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readPublicationTree(root, manifest.editionId)).rejects.toThrow("PUBLICATION_TREE_SEMANTIC_INVALID");
  });
});
