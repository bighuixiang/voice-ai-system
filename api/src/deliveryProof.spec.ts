import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueDeliveryProof, revokeDeliveryProof, supersedeDeliveryProof, verifyDeliveryProof } from "./deliveryProof.js";
import { renderPublicationArtifacts } from "./publicationArtifacts.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "delivery-proof-"));
  const dir = path.join(root, "sessions", "publication-editions");
  await fs.mkdir(dir, { recursive: true });
  const body = Buffer.from("# Demo\n", "utf8");
  await fs.writeFile(path.join(dir, "edition-1.md"), body);
  const manifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-1", createdAt: "2026-07-30T00:00:00.000Z" };
  await fs.writeFile(path.join(dir, "edition-1.json"), JSON.stringify({ ...manifestBase, fingerprint: hash(manifestBase) }));
  const artifact = { format: "markdown", relativePath: "sessions/publication-editions/edition-1.md", mime: "text/markdown; charset=utf-8", rendererVersion: "publication-renderer.v1", sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.byteLength };
  const artifactBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "artifacts-1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint: hash(manifestBase), treeFingerprint: "tree-1", status: "validated", artifacts: [artifact], createdAt: "2026-07-30T00:00:00.000Z" };
  await fs.writeFile(path.join(dir, "edition-1.artifacts.json"), JSON.stringify({ ...artifactBase, fingerprint: hash(artifactBase) }));
  return root;
}

describe("delivery proof", () => {
  it("issues an author-approved proof and verifies artifact bytes", async () => {
    const root = await fixture();
    const proof = await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: JSON.parse(await fs.readFile(path.join(root, "sessions/publication-editions/edition-1.artifacts.json"), "utf8")).fingerprint });
    expect(proof.status).toBe("issued");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: true, proof: { proofId: proof.proofId } });
  });

  it("fails closed without author approval and detects tampering", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions/publication-editions/edition-1.artifacts.json"), "utf8"));
    await expect(issueDeliveryProof(root, { editionId: "edition-1", approvalId: "system-1", approverKind: "system", expectedArtifactSetFingerprint: artifactSet.fingerprint })).rejects.toThrow("DELIVERY_AUTHOR_APPROVAL_REQUIRED");
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await fs.writeFile(path.join(root, "sessions/publication-editions/edition-1.md"), "tampered");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["artifact-byte-hash-mismatch"] });
  });

  it("records immutable revocation and supersession events without rewriting the proof", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions/publication-editions/edition-1.artifacts.json"), "utf8"));
    const proof = await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await expect(revokeDeliveryProof(root, "edition-1", { actor: "author", reason: "author withdrew release" })).resolves.toMatchObject({ status: "revoked" });
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, currentStatus: "revoked", reasons: ["proof-revoked"], proof: { proofId: proof.proofId, status: "issued" } });
    const root2 = await fixture();
    const artifactSet2 = JSON.parse(await fs.readFile(path.join(root2, "sessions/publication-editions/edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root2, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet2.fingerprint });
    const replacementManifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-2", projectSlug: "demo", canonCommitFingerprint: "canon-2", title: "Demo Replacement", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-2", createdAt: "2026-07-30T00:00:00.000Z", supersedesEditionId: "edition-1" };
    await fs.writeFile(path.join(root2, "sessions/publication-editions/edition-2.json"), JSON.stringify({ ...replacementManifestBase, fingerprint: hash(replacementManifestBase) }));
    await expect(supersedeDeliveryProof(root2, "edition-1", { actor: "author", reason: "new edition approved", replacementEditionId: "edition-2" })).resolves.toMatchObject({ status: "superseded", replacementEditionId: "edition-2" });
    await expect(verifyDeliveryProof(root2, "edition-1")).resolves.toMatchObject({ valid: false, currentStatus: "superseded", reasons: ["proof-superseded"] });
  });

  it("fails closed when an existing delivery proof is tampered", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    const proof = await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.approvalId = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint })).rejects.toThrow("DELIVERY_PROOF_INTEGRITY_FAILED");
    expect(proof.status).toBe("issued");
  });

  it("does not append a revocation event to a tampered proof", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.approvalId = "tampered-before-event";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(revokeDeliveryProof(root, "edition-1", { actor: "author", reason: "revoke" })).rejects.toThrow("DELIVERY_PROOF_INTEGRITY_FAILED");
    await expect(fs.stat(path.join(root, "sessions", "publication-editions", "delivery-proof-events"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not reuse a re-signed proof event with an invalid status", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    const proof = await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await revokeDeliveryProof(root, "edition-1", { actor: "author", reason: "author request" });
    const target = path.join(root, "sessions", "publication-editions", "delivery-proof-events", proof.proofId + ".json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "superseded" };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, JSON.stringify(resigned) + "\n", "utf8");
    await expect(revokeDeliveryProof(root, "edition-1", { actor: "author", reason: "retry" })).rejects.toThrow("DELIVERY_PROOF_EVENT_INTEGRITY_FAILED");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-event-semantics-invalid"] });
  });

  it("rejects a re-signed proof whose identity no longer matches the artifact set", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, projectSlug: "other-project" };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, `${JSON.stringify(resigned)}\n`, "utf8");

    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: expect.arrayContaining(["proof-project-mismatch"]) });
  });

  it("rejects a re-signed proof whose artifact hashes no longer match the persisted set", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, artifactHashes: [] };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, JSON.stringify(resigned) + "\n", "utf8");
    await expect(issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint })).rejects.toThrow("DELIVERY_PROOF_INTEGRITY_FAILED");
  });

  it("invalidates a proof when the persisted edition manifest is replaced", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const manifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Replaced", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-1", createdAt: "2026-07-30T00:00:00.000Z" };
    await fs.writeFile(path.join(root, "sessions", "publication-editions", "edition-1.json"), JSON.stringify({ ...manifestBase, fingerprint: hash(manifestBase) }));
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-manifest-stale"] });
  });

  it("fails closed when the persisted edition manifest is missing", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await fs.rm(path.join(root, "sessions", "publication-editions", "edition-1.json"));
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-manifest-missing"] });
  });

  it("rejects a re-signed proof with an invalid lifecycle status", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "revoked" };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, JSON.stringify(resigned) + "\n", "utf8");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-semantics-invalid"] });
    await expect(issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint })).rejects.toThrow("DELIVERY_PROOF_INTEGRITY_FAILED");
  });

  it("rejects a supersession event that does not point to a linked replacement edition", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await expect(supersedeDeliveryProof(root, "edition-1", { actor: "author", reason: "replacement", replacementEditionId: "edition-missing" })).rejects.toThrow("DELIVERY_REPLACEMENT_EDITION_INVALID");
  });

  it("rejects a re-signed proof with an invalid issued timestamp", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    const target = path.join(root, "sessions", "publication-editions", "edition-1.delivery-proof.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, issuedAt: "not-a-timestamp" };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, `${JSON.stringify(resigned)}\n`, "utf8");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-semantics-invalid"] });
  });

  it("rejects a re-signed proof event with an invalid created timestamp", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    const proof = await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await revokeDeliveryProof(root, "edition-1", { actor: "author", reason: "author request" });
    const target = path.join(root, "sessions", "publication-editions", "delivery-proof-events", `${proof.proofId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, createdAt: "not-a-timestamp" };
    resigned.fingerprint = hash(resigned);
    await fs.writeFile(target, `${JSON.stringify(resigned)}\n`, "utf8");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["proof-event-semantics-invalid"] });
  });

  it("invalidates a frozen edition proof after a memory retcon", async () => {
    const root = await fixture();
    const artifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: artifactSet.fingerprint });
    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "retcon-invalidations.jsonl"), JSON.stringify({ claimId: "claim-edition", createdAt: new Date(Date.now() + 1000).toISOString() }) + "\n", "utf8");
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["memory-retcon-revalidation-required"] });
  });

  it("publishes and verifies a rebuilt edition after the retcon boundary", async () => {
    const root = await fixture();
    const oldArtifactSet = JSON.parse(await fs.readFile(path.join(root, "sessions", "publication-editions", "edition-1.artifacts.json"), "utf8"));
    await issueDeliveryProof(root, { editionId: "edition-1", approvalId: "author-release-1", approverKind: "author", expectedArtifactSetFingerprint: oldArtifactSet.fingerprint });

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "retcon-invalidations.jsonl"), JSON.stringify({ claimId: "claim-edition", createdAt: new Date().toISOString() }) + "\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const rebuiltManifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-2", projectSlug: "demo", canonCommitFingerprint: "canon-rebuilt", title: "Demo Rebuilt", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-rebuilt", createdAt: "2026-07-30T00:00:00.000Z" };
    const rebuiltManifestFingerprint = hash(rebuiltManifestBase);
    await fs.writeFile(path.join(root, "sessions", "publication-editions", "edition-2.json"), JSON.stringify({ ...rebuiltManifestBase, fingerprint: rebuiltManifestFingerprint }));
    const rebuilt = await renderPublicationArtifacts(root, {
      editionId: "edition-2",
      projectSlug: "demo",
      title: "Demo Rebuilt",
      author: "Author",
      language: "zh-CN",
      fingerprint: rebuiltManifestFingerprint,
    }, {
      editionId: "edition-2",
      projectSlug: "demo",
      readerSafe: true,
      fingerprint: "tree-rebuilt",
      chapters: [{ chapterId: "chapter-1", title: "Rebuilt", blocks: [{ kind: "paragraph", text: "Rebuilt canon" }] }],
    }, ["markdown"]);

    const proof = await issueDeliveryProof(root, { editionId: "edition-2", approvalId: "author-release-2", approverKind: "author", expectedArtifactSetFingerprint: rebuilt.fingerprint });
    await expect(verifyDeliveryProof(root, "edition-1")).resolves.toMatchObject({ valid: false, reasons: ["memory-retcon-revalidation-required"] });
    await expect(verifyDeliveryProof(root, "edition-2")).resolves.toMatchObject({ valid: true, proof: { proofId: proof.proofId } });
  });
});
