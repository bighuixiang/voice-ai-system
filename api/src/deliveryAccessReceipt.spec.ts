import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueDeliveryAccessGrant } from "./deliveryAccessGrant.js";
import { recordDeliveryAccessReceipt, readDeliveryAccessReceipt } from "./deliveryAccessReceipt.js";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-"));
  const dir = path.join(root, "sessions", "publication-editions"); await fs.mkdir(dir, { recursive: true });
  const body = Buffer.from("book\n", "utf8"); await fs.writeFile(path.join(dir, "edition-1.md"), body);
  const manifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-1", projectSlug: "demo", canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "t1", createdAt: "now" };
  const manifestFingerprint = hash(manifestBase); await fs.writeFile(path.join(dir, "edition-1.json"), JSON.stringify({ ...manifestBase, fingerprint: manifestFingerprint }));
  const artifact = { format: "markdown", relativePath: "sessions/publication-editions/edition-1.md", mime: "text/markdown; charset=utf-8", rendererVersion: "publication-renderer.v1", sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length };
  const setBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "a1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint, treeFingerprint: "t1", status: "validated", artifacts: [artifact], createdAt: "now" };
  await fs.writeFile(path.join(dir, "edition-1.artifacts.json"), JSON.stringify({ ...setBase, fingerprint: hash(setBase) }));
  const proofBase = { schemaVersion: "delivery-proof.v1", proofId: "proof-1", editionId: "edition-1", projectSlug: "demo", manifestFingerprint, treeFingerprint: "t1", artifactSetFingerprint: hash(setBase), artifactHashes: [{ format: "markdown", relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size }], approvalId: "author-1", approverKind: "author", status: "issued", issuedAt: "2026-08-04T00:00:00.000Z" };
  await fs.writeFile(path.join(dir, "edition-1.delivery-proof.json"), JSON.stringify({ ...proofBase, fingerprint: hash(proofBase) }));
  return root;
}

describe("delivery access receipt", () => {
  it("records immutable artifact identities and is idempotent", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const first = await recordDeliveryAccessReceipt(root, grant.grantId, { receiptId: "receipt-1", accessedAt: "2026-08-04T01:00:00.000Z" });
    const second = await recordDeliveryAccessReceipt(root, grant.grantId, { receiptId: "receipt-1", accessedAt: "2026-08-04T02:00:00.000Z" });
    expect(second).toEqual(first);
    expect(first.artifactHashes).toEqual([{ format: "markdown", relativePath: "sessions/publication-editions/edition-1.md", sha256: expect.any(String), size: 5 }]);
    await expect(readDeliveryAccessReceipt(root, "receipt-1")).resolves.toEqual(first);
  });

  it("assigns a new receipt to each access when no idempotency key is supplied", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const first = await recordDeliveryAccessReceipt(root, grant.grantId, {});
    const second = await recordDeliveryAccessReceipt(root, grant.grantId, {});
    expect(second.receiptId).not.toBe(first.receiptId);
  });

  it("fails closed after the grant is revoked", async () => {
    const root = await fixture();
    const grant = await issueDeliveryAccessGrant(root, { editionId: "edition-1", recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z", actor: "author" });
    const eventPath = path.join(root, "sessions", "publication-editions", "delivery-access-grants", `${grant.grantId}.event.json`);
    await fs.writeFile(eventPath, JSON.stringify({ schemaVersion: "delivery-access-grant-event.v1", eventId: "e", grantId: grant.grantId, status: "revoked", actor: "author", reason: "closed", createdAt: "2026-08-04T00:00:00.000Z", fingerprint: hash({ schemaVersion: "delivery-access-grant-event.v1", eventId: "e", grantId: grant.grantId, status: "revoked", actor: "author", reason: "closed", createdAt: "2026-08-04T00:00:00.000Z" }) }));
    await expect(recordDeliveryAccessReceipt(root, grant.grantId)).rejects.toThrow("ACCESS_RECEIPT_GRANT_INVALID");
  });
});
