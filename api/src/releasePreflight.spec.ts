import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReleasePreflight } from "./releasePreflight.js";

describe("release preflight", () => {
  it("reports actionable fail-closed findings when release inputs are absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-preflight-"));
    const report = await buildReleasePreflight(root, "edition-missing");
    expect(report.status).toBe("blocked");
    expect(report.findings.map((finding) => finding.code)).toEqual(["edition-manifest-missing", "publication-tree-missing", "artifact-set-missing", "delivery-proof-missing"]);
  });

  it("keeps the preflight fingerprint stable when release inputs are unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-preflight-fingerprint-"));
    const first = await buildReleasePreflight(root, "edition-missing");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await buildReleasePreflight(root, "edition-missing");
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("is ready only when all current immutable release inputs verify", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-preflight-"));
    const dir = path.join(root, "sessions", "publication-editions"); await fs.mkdir(dir, { recursive: true });
    const baseManifest = { schemaVersion: "edition-manifest.v1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon", title: "Demo", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree", createdAt: "now" };
    const manifestFingerprint = crypto.createHash("sha256").update(JSON.stringify(baseManifest)).digest("hex");
    await fs.writeFile(path.join(dir, "edition-1.json"), JSON.stringify({ ...baseManifest, fingerprint: manifestFingerprint }));
    const treeBase = { schemaVersion: "publication-tree.v1", editionId: "edition-1", projectSlug: "demo", readerSafe: true, chapters: [] };
    const treeFingerprint = crypto.createHash("sha256").update(JSON.stringify(treeBase)).digest("hex");
    await fs.writeFile(path.join(dir, "edition-1.tree.json"), JSON.stringify({ ...treeBase, fingerprint: treeFingerprint }));
    const artifactBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "a", editionId: "edition-1", projectSlug: "demo", manifestFingerprint, treeFingerprint, status: "validated", artifacts: [], createdAt: "now" };
    const artifact = { ...artifactBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(artifactBase)).digest("hex") };
    await fs.writeFile(path.join(dir, "edition-1.artifacts.json"), JSON.stringify(artifact));
    const proofBase = { schemaVersion: "delivery-proof.v1", proofId: "p", editionId: "edition-1", projectSlug: "demo", manifestFingerprint: artifact.manifestFingerprint, treeFingerprint: artifact.treeFingerprint, artifactSetFingerprint: artifact.fingerprint, artifactHashes: [], approvalId: "author", approverKind: "author", status: "issued", issuedAt: "now" };
    await fs.writeFile(path.join(dir, "edition-1.delivery-proof.json"), JSON.stringify({ ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") }));
    const report = await buildReleasePreflight(root, "edition-1");
    expect(report.status).toBe("ready");
    expect(report.findings).toEqual([]);
  });
});
