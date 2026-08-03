import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderPublicationArtifacts, readPublicationArtifactSet } from "./publicationArtifacts.js";
import crypto from "node:crypto";

const tree = {
  schemaVersion: "publication-tree.v1" as const,
  editionId: "edition-1",
  projectSlug: "demo",
  readerSafe: true as const,
  chapters: [{ chapterId: "chapter-001", title: "第一章", order: 1, blocks: [
    { kind: "heading" as const, level: 1, text: "第一章" },
    { kind: "paragraph" as const, text: "她走进房间。" },
    { kind: "scene_break" as const },
    { kind: "paragraph" as const, text: "门在身后合上。" }
  ] }],
  fingerprint: "tree-fingerprint"
};

const manifest = { editionId: "edition-1", projectSlug: "demo", title: "Demo Novel", author: "Author", language: "zh-CN", fingerprint: "manifest-fingerprint" };

describe("publication artifacts", () => {
  it("renders deterministic UTF-8 markdown and text as one validated artifact set", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-artifacts-"));
    const result = await renderPublicationArtifacts(root, manifest, tree, ["markdown", "txt"]);
    expect(result.status).toBe("validated");
    expect(result.artifacts.map((artifact) => artifact.format)).toEqual(["markdown", "txt"]);
    expect(result.artifacts.every((artifact) => artifact.sha256.length === 64 && artifact.size > 0)).toBe(true);
    await expect(readPublicationArtifactSet(root, "edition-1")).resolves.toMatchObject({ fingerprint: result.fingerprint });
    await expect(renderPublicationArtifacts(root, manifest, tree, ["txt", "markdown"])).resolves.toMatchObject({ fingerprint: result.fingerprint });
    expect(await fs.readFile(path.join(root, result.artifacts[0].relativePath), "utf8")).toContain("# 第一章");
    await expect(renderPublicationArtifacts(root, manifest, { ...tree, fingerprint: "changed-tree" }, ["markdown", "txt"])).rejects.toThrow("PUBLICATION_ARTIFACT_SET_IMMUTABLE");
  });

  it("rejects unsupported formats and leaves no artifact set", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-artifacts-"));
    await expect(renderPublicationArtifacts(root, manifest, tree, ["pdf"] as never)).rejects.toThrow("PUBLICATION_FORMAT_UNSUPPORTED");
    await expect(readPublicationArtifactSet(root, "edition-1")).resolves.toBeNull();
  });

  it("fails closed when a persisted artifact set is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-artifacts-"));
    const result = await renderPublicationArtifacts(root, manifest, tree, ["markdown"]);
    const target = path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.projectSlug = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(readPublicationArtifactSet(root, "edition-1")).rejects.toThrow("PUBLICATION_ARTIFACT_SET_INTEGRITY_FAILED");
    await expect(renderPublicationArtifacts(root, manifest, tree, ["markdown"])).rejects.toThrow("PUBLICATION_ARTIFACT_SET_INTEGRITY_FAILED");
    expect(result.status).toBe("validated");
  });

  it("rejects a re-signed artifact set with an invalid lifecycle status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-artifacts-semantic-"));
    await renderPublicationArtifacts(root, manifest, tree, ["markdown"]);
    const target = path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "draft" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readPublicationArtifactSet(root, "edition-1")).rejects.toThrow("PUBLICATION_ARTIFACT_SET_SEMANTIC_INVALID");
  });
});
