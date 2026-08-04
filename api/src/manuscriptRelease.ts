import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readEditionManifest } from "./editionManifest.js";
import { verifyDeliveryProof } from "./deliveryProof.js";

export type ManuscriptReleaseStatus = "draft_release" | "preflight" | "frozen" | "rendering" | "validating" | "ready" | "delivered" | "blocked" | "failed" | "stale" | "revoked" | "superseded";
export interface ManuscriptRelease {
  schemaVersion: "manuscript-release.v1";
  releaseId: string;
  editionId: string;
  projectSlug: string;
  canonCommitFingerprint: string;
  status: ManuscriptReleaseStatus;
  authorApprovalId?: string;
  parentReleaseId?: string;
  supersedesEditionId?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const releasePath = (root: string, releaseId: string) => resolveInside(root, `sessions/publication-editions/releases/${releaseId}.json`);
const releaseStatuses: ManuscriptReleaseStatus[] = ["draft_release", "preflight", "frozen", "rendering", "validating", "ready", "delivered", "blocked", "failed", "stale", "revoked", "superseded"];
const integrity = (release: ManuscriptRelease) => { const { fingerprint, ...base } = release; if (release.schemaVersion !== "manuscript-release.v1" || !release.releaseId.trim() || !release.editionId.trim() || !release.projectSlug.trim() || !release.canonCommitFingerprint.trim() || !releaseStatuses.includes(release.status) || (release.authorApprovalId !== undefined && !release.authorApprovalId.trim()) || (release.parentReleaseId !== undefined && !release.parentReleaseId.trim()) || (release.supersedesEditionId !== undefined && (!release.supersedesEditionId.trim() || release.supersedesEditionId === release.editionId)) || (release.reason !== undefined && !release.reason.trim()) || !Number.isFinite(Date.parse(release.createdAt)) || !Number.isFinite(Date.parse(release.updatedAt)) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("MANUSCRIPT_RELEASE_INTEGRITY_FAILED"); return release; };

export async function readManuscriptRelease(root: string, releaseId: string): Promise<ManuscriptRelease | null> {
  try { return integrity(JSON.parse(await fs.readFile(releasePath(root, releaseId), "utf8")) as ManuscriptRelease); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createManuscriptRelease(root: string, input: { releaseId: string; editionId: string; projectSlug: string; canonCommitFingerprint: string; parentReleaseId?: string; supersedesEditionId?: string }): Promise<ManuscriptRelease> {
  if (!input.releaseId.trim() || !input.editionId.trim() || !input.projectSlug.trim() || !input.canonCommitFingerprint.trim()) throw new Error("MANUSCRIPT_RELEASE_FIELDS_REQUIRED");
  const manifest = await readEditionManifest(root, input.editionId);
  if (!manifest || manifest.projectSlug !== input.projectSlug || manifest.canonCommitFingerprint !== input.canonCommitFingerprint) throw new Error("MANUSCRIPT_RELEASE_EDITION_BINDING_INVALID");
  const existing = await readManuscriptRelease(root, input.releaseId);
  const now = new Date().toISOString();
  const base = { schemaVersion: "manuscript-release.v1" as const, releaseId: input.releaseId, editionId: input.editionId, projectSlug: input.projectSlug, canonCommitFingerprint: input.canonCommitFingerprint, status: "draft_release" as const, ...(input.parentReleaseId ? { parentReleaseId: input.parentReleaseId } : {}), ...(input.supersedesEditionId ? { supersedesEditionId: input.supersedesEditionId } : {}), createdAt: now, updatedAt: now };
  const release: ManuscriptRelease = { ...base, fingerprint: hash(base) };
  if (existing) { if (existing.fingerprint === release.fingerprint) return existing; throw new Error("MANUSCRIPT_RELEASE_IMMUTABLE"); }
  await fs.mkdir(path.dirname(releasePath(root, input.releaseId)), { recursive: true });
  await fs.writeFile(releasePath(root, input.releaseId), `${JSON.stringify(release, null, 2)}\n`, "utf8");
  return release;
}

const linear: ManuscriptReleaseStatus[] = ["draft_release", "preflight", "frozen", "rendering", "validating", "ready", "delivered"];
export async function transitionManuscriptRelease(root: string, releaseId: string, input: { target: ManuscriptReleaseStatus; actor: "author"; authorApprovalId?: string; reason?: string; deliveryProofEditionId?: string }): Promise<ManuscriptRelease> {
  const current = await readManuscriptRelease(root, releaseId); if (!current) throw new Error("MANUSCRIPT_RELEASE_REQUIRED");
  if (input.actor !== "author") throw new Error("MANUSCRIPT_RELEASE_AUTHOR_REQUIRED");
  const target = input.target;
  const currentIndex = linear.indexOf(current.status), targetIndex = linear.indexOf(target);
  const exceptional = ["blocked", "failed", "stale", "revoked", "superseded"].includes(target);
  if (!exceptional && (currentIndex < 0 || targetIndex !== currentIndex + 1)) throw new Error("MANUSCRIPT_RELEASE_TRANSITION_INVALID");
  if (target === "frozen" && !input.authorApprovalId?.trim()) throw new Error("MANUSCRIPT_RELEASE_APPROVAL_REQUIRED");
  if (target === "delivered") {
    if (!input.authorApprovalId?.trim()) throw new Error("MANUSCRIPT_RELEASE_APPROVAL_REQUIRED");
    const proof = await verifyDeliveryProof(root, current.editionId);
    if (!proof.valid || proof.currentStatus !== "issued" || proof.proof?.editionId !== (input.deliveryProofEditionId || current.editionId)) throw new Error("MANUSCRIPT_RELEASE_DELIVERY_PROOF_REQUIRED");
  }
  const base = { ...current, status: target, ...(input.authorApprovalId ? { authorApprovalId: input.authorApprovalId } : {}), ...(input.reason ? { reason: input.reason } : {}), updatedAt: new Date().toISOString() }; delete (base as Partial<ManuscriptRelease>).fingerprint;
  const next: ManuscriptRelease = { ...base, fingerprint: hash(base) };
  await fs.writeFile(releasePath(root, releaseId), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
