import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { verifyDeliveryAccessGrant } from "./deliveryAccessGrant.js";
import { readPublicationArtifactSet } from "./publicationArtifacts.js";

export interface DeliveryAccessReceipt {
  schemaVersion: "delivery-access-receipt.v1";
  receiptId: string;
  grantId: string;
  proofId: string;
  editionId: string;
  projectSlug: string;
  recipientId: string;
  scope: "reader" | "archive";
  artifactSetFingerprint: string;
  artifactHashes: Array<{ format: string; relativePath: string; sha256: string; size: number }>;
  accessedAt: string;
  fingerprint: string;
}

const hash = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const receiptPath = (root: string, id: string) => resolveInside(root, `sessions/publication-editions/delivery-access-grants/receipts/${id}.json`);

export async function readDeliveryAccessReceipt(root: string, receiptId: string): Promise<DeliveryAccessReceipt | null> {
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath(root, receiptId), "utf8")) as DeliveryAccessReceipt;
    const { fingerprint, ...base } = receipt;
    if (receipt.schemaVersion !== "delivery-access-receipt.v1" || receipt.receiptId !== receiptId || !receipt.grantId || !receipt.proofId || !receipt.editionId || !receipt.projectSlug || !receipt.recipientId || !Array.isArray(receipt.artifactHashes) || !Number.isFinite(Date.parse(receipt.accessedAt)) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("ACCESS_RECEIPT_INTEGRITY_FAILED");
    return receipt;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function recordDeliveryAccessReceipt(root: string, grantId: string, input: { receiptId?: string; accessedAt?: string }): Promise<DeliveryAccessReceipt> {
  const verification = await verifyDeliveryAccessGrant(root, grantId);
  if (!verification.valid || !verification.grant) throw new Error("ACCESS_RECEIPT_GRANT_INVALID");
  const grant = verification.grant;
  const set = await readPublicationArtifactSet(root, grant.editionId);
  if (!set) throw new Error("ACCESS_RECEIPT_ARTIFACT_SET_REQUIRED");
  const receiptId = input.receiptId?.trim() || `receipt-${crypto.randomUUID()}`;
  const existing = await readDeliveryAccessReceipt(root, receiptId);
  if (existing) return existing;
  const base = { schemaVersion: "delivery-access-receipt.v1" as const, receiptId, grantId, proofId: grant.proofId, editionId: grant.editionId, projectSlug: grant.projectSlug, recipientId: grant.recipientId, scope: grant.scope, artifactSetFingerprint: set.fingerprint, artifactHashes: set.artifacts.map(({ format, relativePath, sha256, size }) => ({ format, relativePath, sha256, size })), accessedAt: input.accessedAt || new Date().toISOString() };
  if (!Number.isFinite(Date.parse(base.accessedAt))) throw new Error("ACCESS_RECEIPT_TIMESTAMP_INVALID");
  const receipt: DeliveryAccessReceipt = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(receiptPath(root, receiptId)), { recursive: true });
  const temp = `${receiptPath(root, receiptId)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temp, receiptPath(root, receiptId));
  return receipt;
}

export async function readAuthorizedPublicationArtifact(root: string, grantId: string, format: "markdown" | "txt"): Promise<{ bytes: Buffer; format: string; mime: string; relativePath: string; receipt: DeliveryAccessReceipt }> {
  const verification = await verifyDeliveryAccessGrant(root, grantId);
  if (!verification.valid || !verification.grant) throw new Error("ACCESS_DOWNLOAD_GRANT_INVALID");
  const set = await readPublicationArtifactSet(root, verification.grant.editionId);
  const artifact = set?.artifacts.find((entry) => entry.format === format);
  if (!set || !artifact) throw new Error("ACCESS_DOWNLOAD_FORMAT_NOT_FOUND");
  const bytes = await fs.readFile(resolveInside(root, artifact.relativePath));
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== artifact.size || actual !== artifact.sha256) throw new Error("ACCESS_DOWNLOAD_ARTIFACT_STALE");
  const receipt = await recordDeliveryAccessReceipt(root, grantId, {});
  return { bytes, format: artifact.format, mime: artifact.mime, relativePath: artifact.relativePath, receipt };
}
