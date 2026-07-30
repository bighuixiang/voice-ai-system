import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEditionManifest, readEditionManifest } from "./editionManifest.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edition-manifest-"));
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
  const content = "# Chapter 1\nSettled prose.\n";
  await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), content, "utf8");
  const adoptedSha256 = (await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex");
  const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-001", projectSlug: "demo", chapterId: "chapter-001", adoptionTransactionId: "adopt-001", adoptedContentSha256: adoptedSha256, status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: "2026-07-30T00:00:00.000Z" };
  const fingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(settlementBase)).digest("hex");
  await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-001.json"), JSON.stringify({ ...settlementBase, fingerprint }), "utf8");
  return { root, adoptedSha256 };
}

describe("edition manifest", () => {
  it("freezes an immutable reader-safe manifest from settled chapters", async () => {
    const { root, adoptedSha256 } = await fixture();
    const input = { root, projectSlug: "demo", canonCommitFingerprint: "canon-001", title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const manifest = await createEditionManifest(input);
    expect(manifest.status).toBe("frozen");
    expect(manifest.readerSafe).toBe(true);
    expect(manifest.chapters[0].contentSha256).toBe(adoptedSha256);
    await expect(readEditionManifest(root, manifest.editionId)).resolves.toMatchObject({ fingerprint: manifest.fingerprint });
    await expect(createEditionManifest(input)).resolves.toMatchObject({ editionId: manifest.editionId });
  });

  it("fails closed when a settled chapter content has changed", async () => {
    const { root } = await fixture();
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "tampered", "utf8");
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint: "canon-001", title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_CHAPTER_CONTENT_STALE");
  });

  it("fails closed when an existing frozen manifest is tampered", async () => {
    const { root } = await fixture();
    const input = { root, projectSlug: "demo", canonCommitFingerprint: "canon-001", title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const manifest = await createEditionManifest(input);
    const target = path.join(root, "sessions", "publication-editions", `${manifest.editionId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.title = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(createEditionManifest(input)).rejects.toThrow("EDITION_MANIFEST_INTEGRITY_FAILED");
  });
});
