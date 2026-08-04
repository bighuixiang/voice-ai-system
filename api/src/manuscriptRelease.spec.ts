import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createManuscriptRelease, transitionManuscriptRelease } from "./manuscriptRelease.js";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture(withProof = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "manuscript-release-")); const dir = path.join(root, "sessions", "publication-editions"); await fs.mkdir(dir, { recursive: true });
  const manifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-1", createdAt: "now" };
  const manifestFingerprint = hash(manifestBase); await fs.writeFile(path.join(dir, "edition-1.json"), JSON.stringify({ ...manifestBase, fingerprint: manifestFingerprint }));
  if (withProof) {
    const body = Buffer.from("# Demo\n", "utf8"); await fs.writeFile(path.join(dir, "edition-1.md"), body);
    const artifact = { format: "markdown", relativePath: "sessions/publication-editions/edition-1.md", mime: "text/markdown; charset=utf-8", rendererVersion: "publication-renderer.v1", sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length };
    const setBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "a", editionId: "edition-1", projectSlug: "demo", manifestFingerprint, treeFingerprint: "tree-1", status: "validated", artifacts: [artifact], createdAt: "now" };
    const set = { ...setBase, fingerprint: hash(setBase) }; await fs.writeFile(path.join(dir, "edition-1.artifacts.json"), JSON.stringify(set));
    const proofBase = { schemaVersion: "delivery-proof.v1", proofId: "proof-1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint, treeFingerprint: "tree-1", artifactSetFingerprint: set.fingerprint, artifactHashes: [{ format: artifact.format, relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size }], approvalId: "author", approverKind: "author", status: "issued", issuedAt: "2026-08-04T00:00:00.000Z" };
    await fs.writeFile(path.join(dir, "edition-1.delivery-proof.json"), JSON.stringify({ ...proofBase, fingerprint: hash(proofBase) }));
  }
  return root;
}

describe("ManuscriptRelease", () => {
  it("creates an edition-bound immutable draft and rejects wrong canon binding", async () => {
    const root = await fixture();
    const release = await createManuscriptRelease(root, { releaseId: "release-1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1" });
    expect(release.status).toBe("draft_release");
    await expect(createManuscriptRelease(root, { releaseId: "release-1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "other" })).rejects.toThrow("MANUSCRIPT_RELEASE_EDITION_BINDING_INVALID");
  });

  it("requires explicit approval and current proof before delivered", async () => {
    const root = await fixture(true);
    await createManuscriptRelease(root, { releaseId: "release-1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1" });
    await expect(transitionManuscriptRelease(root, "release-1", { target: "frozen", actor: "author" })).rejects.toThrow("MANUSCRIPT_RELEASE_TRANSITION_INVALID");
    let release = await transitionManuscriptRelease(root, "release-1", { target: "preflight", actor: "author" });
    release = await transitionManuscriptRelease(root, release.releaseId, { target: "frozen", actor: "author", authorApprovalId: "approve-1" });
    for (const target of ["rendering", "validating", "ready"] as const) release = await transitionManuscriptRelease(root, release.releaseId, { target, actor: "author" });
    release = await transitionManuscriptRelease(root, release.releaseId, { target: "delivered", actor: "author", authorApprovalId: "approve-1" });
    expect(release.status).toBe("delivered");
  });

  it("does not let a download or arbitrary status skip the lifecycle", async () => {
    const root = await fixture(); await createManuscriptRelease(root, { releaseId: "release-1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1" });
    await expect(transitionManuscriptRelease(root, "release-1", { target: "delivered", actor: "author", authorApprovalId: "approve-1" })).rejects.toThrow("MANUSCRIPT_RELEASE_TRANSITION_INVALID");
  });

  it("fails closed for a re-signed release with an unknown status", async () => {
    const root = await fixture();
    const release = await createManuscriptRelease(root, { releaseId: "release-1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1" });
    const target = path.join(root, "sessions", "publication-editions", "releases", "release-1.json");
    const { fingerprint: _old, ...base } = release;
    const forged = { ...base, status: "published" };
    await fs.writeFile(target, JSON.stringify({ ...forged, fingerprint: hash(forged) }));
    const { readManuscriptRelease } = await import("./manuscriptRelease.js");
    await expect(readManuscriptRelease(root, "release-1")).rejects.toThrow("MANUSCRIPT_RELEASE_INTEGRITY_FAILED");
  });
});
