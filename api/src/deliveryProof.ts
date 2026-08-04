import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readPublicationArtifactSet, type PublicationArtifactSet } from "./publicationArtifacts.js";
import { readEditionManifest } from "./editionManifest.js";

export interface DeliveryProof {
  schemaVersion: "delivery-proof.v1";
  proofId: string;
  editionId: string;
  projectSlug: string;
  manifestFingerprint: string;
  treeFingerprint: string;
  artifactSetFingerprint: string;
  artifactHashes: Array<{ format: string; relativePath: string; sha256: string; size: number }>;
  approvalId: string;
  approverKind: "author";
  status: "issued";
  issuedAt: string;
  fingerprint: string;
}

export interface DeliveryProofEvent {
  schemaVersion: "delivery-proof-event.v1";
  eventId: string;
  proofId: string;
  status: "revoked" | "superseded";
  actor: "author";
  reason: string;
  replacementEditionId?: string;
  createdAt: string;
  fingerprint: string;
}

interface DeliveryInput { editionId: string; approvalId: string; approverKind: "author" | "system"; expectedArtifactSetFingerprint: string; }
interface VerificationResult { valid: boolean; currentStatus: "issued" | "revoked" | "superseded" | "unknown"; reasons: string[]; proof: DeliveryProof | null; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashBytes(value: Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function verifyProofIntegrity(proof: DeliveryProof): boolean {
  const { fingerprint, ...base } = proof;
  return hash(base) === fingerprint;
}
function verifyProofSemantics(proof: DeliveryProof): boolean {
  return proof.schemaVersion === "delivery-proof.v1" && proof.status === "issued" && proof.approverKind === "author" && typeof proof.proofId === "string" && proof.proofId.trim().length > 0 && typeof proof.editionId === "string" && proof.editionId.trim().length > 0 && typeof proof.projectSlug === "string" && proof.projectSlug.trim().length > 0 && typeof proof.approvalId === "string" && proof.approvalId.trim().length > 0 && typeof proof.issuedAt === "string" && Number.isFinite(Date.parse(proof.issuedAt)) && Array.isArray(proof.artifactHashes);
}
function verifyEventSemantics(event: DeliveryProofEvent): boolean {
  return event.schemaVersion === "delivery-proof-event.v1" && typeof event.eventId === "string" && event.eventId.trim().length > 0 && typeof event.proofId === "string" && event.proofId.trim().length > 0 && (event.status === "revoked" || event.status === "superseded") && event.actor === "author" && typeof event.reason === "string" && event.reason.trim().length > 0 && typeof event.createdAt === "string" && Number.isFinite(Date.parse(event.createdAt)) && (event.status !== "superseded" || typeof event.replacementEditionId === "string" && event.replacementEditionId.trim().length > 0) && (event.status !== "revoked" || event.replacementEditionId === undefined);
}
function proofPath(root: string, editionId: string): string { return resolveInside(root, `sessions/publication-editions/${editionId}.delivery-proof.json`); }
function eventPath(root: string, proofId: string): string { return resolveInside(root, `sessions/publication-editions/delivery-proof-events/${proofId}.json`); }

async function readProof(root: string, editionId: string): Promise<DeliveryProof | null> {
  try { return JSON.parse(await fs.readFile(proofPath(root, editionId), "utf8")) as DeliveryProof; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

async function readEvent(root: string, proofId: string): Promise<DeliveryProofEvent | null> {
  try { return JSON.parse(await fs.readFile(eventPath(root, proofId), "utf8")) as DeliveryProofEvent; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function artifactSetBase(set: PublicationArtifactSet): Record<string, unknown> { const base = { ...set } as Record<string, unknown>; delete base.fingerprint; return base; }

async function verifyArtifactSetBytes(root: string, set: PublicationArtifactSet): Promise<string[]> {
  const reasons: string[] = [];
  if (hash(artifactSetBase(set)) !== set.fingerprint) reasons.push("artifact-set-integrity-mismatch");
  for (const artifact of set.artifacts) {
    try {
      const bytes = await fs.readFile(resolveInside(root, artifact.relativePath));
      if (bytes.byteLength !== artifact.size || hashBytes(bytes) !== artifact.sha256) reasons.push("artifact-byte-hash-mismatch");
    } catch { reasons.push("artifact-missing"); }
  }
  return reasons;
}
async function latestMemoryRetconAt(root: string): Promise<string | null> {
  try {
    const content = await fs.readFile(resolveInside(root, "memory/retcon-invalidations.jsonl"), "utf8");
    const dates = content.split(/\r?\n/).filter(Boolean).map((line) => (JSON.parse(line) as { createdAt?: string }).createdAt || "").filter(Boolean).sort();
    return dates.at(-1) || null;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function issueDeliveryProof(root: string, input: DeliveryInput): Promise<DeliveryProof> {
  if (input.approverKind !== "author" || !input.approvalId.trim()) throw new Error("DELIVERY_AUTHOR_APPROVAL_REQUIRED");
  if (!input.expectedArtifactSetFingerprint.trim()) throw new Error("DELIVERY_ARTIFACT_SET_FINGERPRINT_REQUIRED");
  const set = await readPublicationArtifactSet(root, input.editionId);
  if (!set || set.status !== "validated") throw new Error("DELIVERY_ARTIFACT_SET_REQUIRED");
  const latestRetcon = await latestMemoryRetconAt(root);
  if (latestRetcon && latestRetcon > set.createdAt) throw new Error("DELIVERY_MEMORY_REVALIDATION_REQUIRED");
  if (set.fingerprint !== input.expectedArtifactSetFingerprint) throw new Error("DELIVERY_ARTIFACT_SET_STALE");
  const manifest = await readEditionManifest(root, input.editionId);
  if (!manifest || manifest.editionId !== set.editionId || manifest.projectSlug !== set.projectSlug || manifest.fingerprint !== set.manifestFingerprint) throw new Error("DELIVERY_MANIFEST_STALE");
  const byteReasons = await verifyArtifactSetBytes(root, set);
  if (byteReasons.length) throw new Error(`DELIVERY_ARTIFACT_INVALID:${byteReasons.join(",")}`);
  const identity = { editionId: set.editionId, artifactSetFingerprint: set.fingerprint, approvalId: input.approvalId };
  const proofId = `delivery-proof-${hash(identity).slice(0, 24)}`;
  const existing = await readProof(root, input.editionId);
  if (existing) {
    if (!verifyProofIntegrity(existing) || !verifyProofSemantics(existing)) throw new Error("DELIVERY_PROOF_INTEGRITY_FAILED");
    const expectedArtifactHashes = set.artifacts.map((artifact) => ({ format: artifact.format, relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size }));
    if (existing.editionId !== set.editionId || existing.projectSlug !== set.projectSlug || existing.artifactSetFingerprint !== set.fingerprint || JSON.stringify(existing.artifactHashes) !== JSON.stringify(expectedArtifactHashes)) throw new Error("DELIVERY_PROOF_INTEGRITY_FAILED");
    if (existing.proofId === proofId) return existing;
    throw new Error("DELIVERY_PROOF_IMMUTABLE");
  }
  const base = {
    schemaVersion: "delivery-proof.v1" as const,
    proofId,
    editionId: set.editionId,
    projectSlug: set.projectSlug,
    manifestFingerprint: set.manifestFingerprint,
    treeFingerprint: set.treeFingerprint,
    artifactSetFingerprint: set.fingerprint,
    artifactHashes: set.artifacts.map((artifact) => ({ format: artifact.format, relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size })),
    approvalId: input.approvalId,
    approverKind: "author" as const,
    status: "issued" as const,
    issuedAt: new Date().toISOString()
  };
  const proof: DeliveryProof = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(proofPath(root, input.editionId)), { recursive: true });
  const temp = `${proofPath(root, input.editionId)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temp, proofPath(root, input.editionId));
  return proof;
}

export async function verifyDeliveryProof(root: string, editionId: string): Promise<VerificationResult> {
  const proof = await readProof(root, editionId);
  if (!proof) return { valid: false, currentStatus: "unknown", reasons: ["proof-missing"], proof: null };
  const proofBase = { ...proof } as Record<string, unknown>;
  delete proofBase.fingerprint;
  const reasons: string[] = [];
  if (hash(proofBase) !== proof.fingerprint) reasons.push("proof-integrity-mismatch");
  if (!verifyProofSemantics(proof)) reasons.push("proof-semantics-invalid");
  const latestRetcon = await latestMemoryRetconAt(root);
  if (latestRetcon && latestRetcon > proof.issuedAt) reasons.push("memory-retcon-revalidation-required");
  const set = await readPublicationArtifactSet(root, editionId);
  if (!set || set.fingerprint !== proof.artifactSetFingerprint) reasons.push("artifact-set-stale");
  else {
    if (proof.editionId !== set.editionId) reasons.push("proof-edition-mismatch");
    if (proof.projectSlug !== set.projectSlug) reasons.push("proof-project-mismatch");
    if (proof.manifestFingerprint !== set.manifestFingerprint) reasons.push("proof-manifest-mismatch");
    if (proof.treeFingerprint !== set.treeFingerprint) reasons.push("proof-tree-mismatch");
    const expectedArtifactHashes = set.artifacts.map((artifact) => ({ format: artifact.format, relativePath: artifact.relativePath, sha256: artifact.sha256, size: artifact.size }));
    if (JSON.stringify(proof.artifactHashes) !== JSON.stringify(expectedArtifactHashes)) reasons.push("proof-artifact-hashes-mismatch");
    reasons.push(...await verifyArtifactSetBytes(root, set));
  }
  const manifest = await readEditionManifest(root, editionId);
  if (!manifest) reasons.push("proof-manifest-missing");
  else if (manifest.editionId !== proof.editionId || manifest.projectSlug !== proof.projectSlug || manifest.fingerprint !== proof.manifestFingerprint) reasons.push("proof-manifest-stale");
  const event = await readEvent(root, proof.proofId);
  let currentStatus: VerificationResult["currentStatus"] = "issued";
  if (event) {
    const eventBase = { ...event } as Record<string, unknown>;
    delete eventBase.fingerprint;
    if (hash(eventBase) !== event.fingerprint) reasons.push("proof-event-integrity-mismatch");
    if (!verifyEventSemantics(event)) reasons.push("proof-event-semantics-invalid");
    else { currentStatus = event.status; reasons.push(event.status === "revoked" ? "proof-revoked" : "proof-superseded"); }
  }
  return { valid: reasons.length === 0, currentStatus, reasons: [...new Set(reasons)], proof };
}

async function recordProofEvent(root: string, editionId: string, input: { actor: "author"; reason: string; status: "revoked" | "superseded"; replacementEditionId?: string }): Promise<DeliveryProofEvent> {
  if (input.actor !== "author" || !input.reason.trim()) throw new Error("DELIVERY_EVENT_AUTHOR_REASON_REQUIRED");
  if (input.status === "superseded" && !input.replacementEditionId?.trim()) throw new Error("DELIVERY_REPLACEMENT_EDITION_REQUIRED");
  const proof = await readProof(root, editionId);
  if (!proof) throw new Error("DELIVERY_PROOF_REQUIRED");
  if (!verifyProofIntegrity(proof)) throw new Error("DELIVERY_PROOF_INTEGRITY_FAILED");
  if (input.status === "superseded") {
    const replacement = await readEditionManifest(root, input.replacementEditionId!);
    if (!replacement || replacement.projectSlug !== proof.projectSlug || replacement.supersedesEditionId !== editionId) throw new Error("DELIVERY_REPLACEMENT_EDITION_INVALID");
  }
  const existing = await readEvent(root, proof.proofId);
  const identity = { proofId: proof.proofId, status: input.status, replacementEditionId: input.replacementEditionId ?? "" };
  const eventId = `delivery-event-${hash(identity).slice(0, 24)}`;
  if (existing) {
    if (!verifyEventSemantics(existing)) throw new Error("DELIVERY_PROOF_EVENT_INTEGRITY_FAILED");
    const existingBase = { ...existing } as Record<string, unknown>; delete existingBase.fingerprint;
    if (hash(existingBase) !== existing.fingerprint) throw new Error("DELIVERY_PROOF_EVENT_INTEGRITY_FAILED");
    if (existing.eventId === eventId) return existing;
    throw new Error("DELIVERY_PROOF_EVENT_IMMUTABLE");
  }
  const base = { schemaVersion: "delivery-proof-event.v1" as const, eventId, proofId: proof.proofId, status: input.status, actor: "author" as const, reason: input.reason, ...(input.replacementEditionId ? { replacementEditionId: input.replacementEditionId } : {}), createdAt: new Date().toISOString() };
  const event: DeliveryProofEvent = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(eventPath(root, proof.proofId)), { recursive: true });
  const temp = `${eventPath(root, proof.proofId)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await fs.rename(temp, eventPath(root, proof.proofId));
  return event;
}

export async function revokeDeliveryProof(root: string, editionId: string, input: { actor: "author"; reason: string }): Promise<DeliveryProofEvent> {
  return recordProofEvent(root, editionId, { ...input, status: "revoked" });
}

export async function supersedeDeliveryProof(root: string, editionId: string, input: { actor: "author"; reason: string; replacementEditionId: string }): Promise<DeliveryProofEvent> {
  return recordProofEvent(root, editionId, { ...input, status: "superseded" });
}
