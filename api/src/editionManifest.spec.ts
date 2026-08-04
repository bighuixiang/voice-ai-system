import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEditionManifest, readEditionManifest } from "./editionManifest.js";
import crypto from "node:crypto";
import { computeCanonCommitFingerprint } from "./canonCommit.js";

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
  const commitIdentity = { mutationId: "mutation-edition-1", proposalId: "proposal-edition-1", projectSlug: "demo", authorizationId: "author-edition-1", actorId: "author-1", candidateId: "candidate-edition-1" };
  const canonCommitFingerprint = computeCanonCommitFingerprint(commitIdentity);
  const event = { schemaVersion: "canon-commit-event.v1" as const, eventId: "canon-commit-mutation-edition-1", ...commitIdentity, canonCommitFingerprint, createdAt: "2026-07-30T00:00:00.000Z" };
  await fs.writeFile(path.join(root, "sessions", "canon-commit-events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  await fs.mkdir(path.join(root, "sessions", "mutations"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "mutations", `${commitIdentity.mutationId}.json`), JSON.stringify({ schemaVersion: "mutation-plan.v1", ...commitIdentity, fencingToken: "fence-edition-1", status: "committed", targets: [], createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }), "utf8");
  return { root, adoptedSha256, canonCommitFingerprint };
}

describe("edition manifest", () => {
  it("rejects an edition when the requested canon fingerprint has no committed adoption", async () => {
    const { root } = await fixture();
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint: "f".repeat(64), title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_CANON_COMMIT_REQUIRED");
  });

  it("rejects a forged canon event that has no committed mutation plan", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    await fs.rm(path.join(root, "sessions", "mutations", "mutation-edition-1.json"));
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_CANON_COMMIT_REQUIRED");
  });

  it("rejects a committed canon plan whose target bytes have drifted", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    await fs.writeFile(path.join(root, "sessions", "mutations", "mutation-edition-1.json"), JSON.stringify({ schemaVersion: "mutation-plan.v1", mutationId: "mutation-edition-1", proposalId: "proposal-edition-1", projectSlug: "demo", authorizationId: "author-edition-1", actorId: "author-1", fencingToken: "fence-edition-1", status: "committed", targets: [{ relativePath: "chapters/chapter-001.md", afterSha256: "0".repeat(64), existed: true }], createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }), "utf8");
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_CANON_COMMIT_REQUIRED");
  });

  it("freezes an immutable reader-safe manifest from settled chapters", async () => {
    const { root, adoptedSha256, canonCommitFingerprint } = await fixture();
    const input = { root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const manifest = await createEditionManifest(input);
    expect(manifest.status).toBe("frozen");
    expect(manifest.readerSafe).toBe(true);
    expect(manifest.chapters[0].contentSha256).toBe(adoptedSha256);
    await expect(readEditionManifest(root, manifest.editionId)).resolves.toMatchObject({ fingerprint: manifest.fingerprint });
    await expect(createEditionManifest(input)).resolves.toMatchObject({ editionId: manifest.editionId });
  });

  it("fails closed when a settled chapter content has changed", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "tampered", "utf8");
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_CHAPTER_CONTENT_STALE");
  });

  it("records an immutable supersedes link when publishing a replacement edition", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    const baseInput = { root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const first = await createEditionManifest(baseInput);
    const replacement = await createEditionManifest({ ...baseInput, title: "Demo Novel Revised", supersedesEditionId: first.editionId });
    expect(replacement.editionId).not.toBe(first.editionId);
    expect(replacement.supersedesEditionId).toBe(first.editionId);
    await expect(readEditionManifest(root, replacement.editionId)).resolves.toMatchObject({ supersedesEditionId: first.editionId });
  });

  it("rejects a replacement edition whose supersedes target is absent", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    await expect(createEditionManifest({ root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel Revised", author: "Author", language: "zh-CN", supersedesEditionId: "edition-missing", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] })).rejects.toThrow("EDITION_SUPERSEDES_TARGET_REQUIRED");
  });

  it("fails closed when an existing frozen manifest is tampered", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    const input = { root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const manifest = await createEditionManifest(input);
    const target = path.join(root, "sessions", "publication-editions", `${manifest.editionId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.title = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(createEditionManifest(input)).rejects.toThrow("EDITION_MANIFEST_INTEGRITY_FAILED");
  });

  it("rejects a re-signed manifest that is no longer frozen", async () => {
    const { root, canonCommitFingerprint } = await fixture();
    const input = { root, projectSlug: "demo", canonCommitFingerprint, title: "Demo Novel", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "Chapter 1", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settlement-001" }] };
    const manifest = await createEditionManifest(input);
    const target = path.join(root, "sessions", "publication-editions", manifest.editionId + ".json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "draft" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readEditionManifest(root, manifest.editionId)).rejects.toThrow("EDITION_MANIFEST_SEMANTIC_INVALID");
  });
});
