import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { verifyDeliveryProof } from "./deliveryProof.js";

export interface DeliveryAccessGrant {
  schemaVersion: "delivery-access-grant.v1";
  grantId: string;
  proofId: string;
  editionId: string;
  projectSlug: string;
  recipientId: string;
  scope: "reader" | "archive";
  expiresAt: string;
  status: "active";
  issuedAt: string;
  fingerprint: string;
}

export interface DeliveryAccessGrantEvent {
  schemaVersion: "delivery-access-grant-event.v1";
  eventId: string;
  grantId: string;
  status: "revoked";
  actor: "author";
  reason: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function assertGrantIntegrity(grant: DeliveryAccessGrant, grantId: string): DeliveryAccessGrant {
  const { fingerprint, ...base } = grant;
  if (grant.schemaVersion !== "delivery-access-grant.v1" || grant.grantId !== grantId || typeof grant.proofId !== "string" || !grant.proofId.trim() || typeof grant.editionId !== "string" || !grant.editionId.trim() || typeof grant.projectSlug !== "string" || !grant.projectSlug.trim() || typeof grant.recipientId !== "string" || !grant.recipientId.trim() || !["reader", "archive"].includes(grant.scope) || grant.status !== "active" || typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("ACCESS_GRANT_INTEGRITY_FAILED");
  return grant;
}
function grantPath(root: string, grantId: string): string { return resolveInside(root, `sessions/publication-editions/delivery-access-grants/${grantId}.json`); }
function eventPath(root: string, grantId: string): string { return resolveInside(root, `sessions/publication-editions/delivery-access-grants/${grantId}.event.json`); }

export async function readDeliveryAccessGrant(root: string, grantId: string): Promise<DeliveryAccessGrant | null> {
  try { return assertGrantIntegrity(JSON.parse(await fs.readFile(grantPath(root, grantId), "utf8")) as DeliveryAccessGrant, grantId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function issueDeliveryAccessGrant(root: string, input: { editionId: string; recipientId: string; scope: "reader" | "archive"; expiresAt: string; actor: "author" | "system" }): Promise<DeliveryAccessGrant> {
  if (input.actor !== "author") throw new Error("ACCESS_GRANT_AUTHOR_REQUIRED");
  if (!input.recipientId.trim()) throw new Error("ACCESS_GRANT_RECIPIENT_REQUIRED");
  const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("ACCESS_GRANT_EXPIRY_INVALID");
  const verification = await verifyDeliveryProof(root, input.editionId);
  if (!verification.valid || !verification.proof || verification.currentStatus !== "issued") throw new Error("ACCESS_GRANT_CURRENT_PROOF_REQUIRED");
  const identity = { proofId: verification.proof.proofId, recipientId: input.recipientId, scope: input.scope, expiresAt: input.expiresAt };
  const grantId = `access-grant-${hash(identity).slice(0, 24)}`;
  const existing = await readDeliveryAccessGrant(root, grantId);
  if (existing) {
    return existing;
  }
  const base = { schemaVersion: "delivery-access-grant.v1" as const, grantId, proofId: verification.proof.proofId, editionId: verification.proof.editionId, projectSlug: verification.proof.projectSlug, recipientId: input.recipientId, scope: input.scope, expiresAt: input.expiresAt, status: "active" as const, issuedAt: new Date().toISOString() };
  const grant: DeliveryAccessGrant = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(grantPath(root, grantId)), { recursive: true });
  const temp = `${grantPath(root, grantId)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(grant, null, 2)}\n`, "utf8");
  await fs.rename(temp, grantPath(root, grantId));
  return grant;
}

export async function verifyDeliveryAccessGrant(root: string, grantId: string): Promise<{ valid: boolean; reasons: string[]; grant: DeliveryAccessGrant | null }> {
  const grant = await readDeliveryAccessGrant(root, grantId);
  if (!grant) return { valid: false, reasons: ["grant-missing"], grant: null };
  const reasons: string[] = [];
  if (Date.parse(grant.expiresAt) <= Date.now()) reasons.push("grant-expired");
  const event = await readGrantEvent(root, grantId);
  if (event) {
    reasons.push("grant-revoked");
  }
  const proof = await verifyDeliveryProof(root, grant.editionId);
  if (!proof.valid || proof.currentStatus !== "issued" || proof.proof?.proofId !== grant.proofId) reasons.push("grant-proof-not-current");
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], grant };
}

async function readGrantEvent(root: string, grantId: string): Promise<DeliveryAccessGrantEvent | null> {
  try {
    const event = JSON.parse(await fs.readFile(eventPath(root, grantId), "utf8")) as DeliveryAccessGrantEvent;
    const { fingerprint, ...base } = event;
    if (event.schemaVersion !== "delivery-access-grant-event.v1" || event.grantId !== grantId || typeof event.eventId !== "string" || !event.eventId.trim() || event.status !== "revoked" || event.actor !== "author" || typeof event.reason !== "string" || !event.reason.trim() || typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("ACCESS_GRANT_EVENT_INTEGRITY_FAILED");
    return event;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function revokeDeliveryAccessGrant(root: string, grantId: string, input: { actor: "author"; reason: string }): Promise<DeliveryAccessGrantEvent> {
  if (input.actor !== "author" || !input.reason.trim()) throw new Error("ACCESS_GRANT_REVOKE_AUTHOR_REASON_REQUIRED");
  const grant = await readDeliveryAccessGrant(root, grantId);
  if (!grant) throw new Error("ACCESS_GRANT_REQUIRED");
  const existing = await readGrantEvent(root, grantId);
  const eventId = `grant-event-${hash({ grantId, status: "revoked" }).slice(0, 24)}`;
  if (existing) {
    if (existing.eventId === eventId) return existing;
    throw new Error("ACCESS_GRANT_EVENT_IMMUTABLE");
  }
  const base = { schemaVersion: "delivery-access-grant-event.v1" as const, eventId, grantId, status: "revoked" as const, actor: "author" as const, reason: input.reason, createdAt: new Date().toISOString() };
  const event: DeliveryAccessGrantEvent = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(eventPath(root, grantId)), { recursive: true });
  const temp = `${eventPath(root, grantId)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await fs.rename(temp, eventPath(root, grantId));
  return event;
}
