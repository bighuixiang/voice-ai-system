import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueDeliveryAccessGrant, readDeliveryAccessGrant, revokeDeliveryAccessGrant, verifyDeliveryAccessGrant } from "./deliveryAccessGrant.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "grant-"));
  const dir = path.join(root, "sessions", "publication-editions"); await fs.mkdir(dir, { recursive: true });
  const body = Buffer.from("book", "utf8"); await fs.writeFile(path.join(dir, "edition-1.md"), body);
  const artifact = { format: "markdown", relativePath: "sessions/publication-editions/edition-1.md", mime: "text/markdown; charset=utf-8", rendererVersion: "publication-renderer.v1", sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length };
  const setBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "a1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint: "m1", treeFingerprint: "t1", status: "validated", artifacts: [artifact], createdAt: "now" };
  await fs.writeFile(path.join(dir, "edition-1.artifacts.json"), JSON.stringify({ ...setBase, fingerprint: hash(setBase) }));
  const proofBase = { schemaVersion: "delivery-proof.v1", proofId: "proof-1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint: "m1", treeFingerprint: "t1", artifactSetFingerprint: hash(setBase), artifactHashes: [{ format: "markdown", relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size }], approvalId: "author-1", approverKind: "author", status: "issued", issuedAt: "now" };
  await fs.writeFile(path.join(dir, "edition-1.delivery-proof.json"), JSON.stringify({ ...proofBase, fingerprint: hash(proofBase) }));
  return root;
}

describe("delivery access grant", () => {
  it("issues and verifies a scoped grant bound to a current proof", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    expect(grant.scope).toBe("reader");
    await expect(readDeliveryAccessGrant(root, grant.grantId)).resolves.toMatchObject({ fingerprint: grant.fingerprint });
    await expect(verifyDeliveryAccessGrant(root, grant.grantId)).resolves.toMatchObject({ valid: true, grant: { recipientId: "reader-1" } });
  });

  it("fails closed for expired grants and non-author issuance", async () => {
    const root = await fixture();
    await expect(issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "system" })).rejects.toThrow("ACCESS_GRANT_AUTHOR_REQUIRED");
    await expect(issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "archive-1", scope: "archive", expiresAt: "2000-01-01T00:00:00.000Z", actor: "author" })).rejects.toThrow("ACCESS_GRANT_EXPIRY_INVALID");
  });

  it("revokes one grant through an immutable event while preserving the grant record", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    await expect(revokeDeliveryAccessGrant(root, grant.grantId, { actor: "author", reason: "reader request" })).resolves.toMatchObject({ status: "revoked", grantId: grant.grantId });
    await expect(readDeliveryAccessGrant(root, grant.grantId)).resolves.toMatchObject({ status: "active", fingerprint: grant.fingerprint });
    await expect(verifyDeliveryAccessGrant(root, grant.grantId)).resolves.toMatchObject({ valid: false, reasons: ["grant-revoked"] });
  });

  it("fails closed when an existing grant is tampered", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const target = path.join(root, "sessions", "publication-editions", "delivery-access-grants", `${grant.grantId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.recipientId = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" })).rejects.toThrow("ACCESS_GRANT_INTEGRITY_FAILED");
  });

  it("fails closed when a grant has a valid hash but an invalid lifecycle status", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const target = path.join(root, "sessions", "publication-editions", "delivery-access-grants", `${grant.grantId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.status = "revoked";
    delete value.fingerprint;
    await fs.writeFile(target, JSON.stringify({ ...value, fingerprint: hash(value) }));
    await expect(readDeliveryAccessGrant(root, grant.grantId)).rejects.toThrow("ACCESS_GRANT_INTEGRITY_FAILED");
    await expect(revokeDeliveryAccessGrant(root, grant.grantId, { actor: "author", reason: "retry" })).rejects.toThrow("ACCESS_GRANT_INTEGRITY_FAILED");
  });

  it("normalizes malformed grant fields to the integrity failure code", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const target = path.join(root, "sessions", "publication-editions", "delivery-access-grants", `${grant.grantId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    delete value.recipientId;
    await fs.writeFile(target, JSON.stringify(value));
    await expect(readDeliveryAccessGrant(root, grant.grantId)).rejects.toThrow("ACCESS_GRANT_INTEGRITY_FAILED");
  });
});
