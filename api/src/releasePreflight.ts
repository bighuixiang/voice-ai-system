import crypto from "node:crypto";
import { readEditionManifest } from "./editionManifest.js";
import { readPublicationTree } from "./publicationTree.js";
import { readPublicationArtifactSet } from "./publicationArtifacts.js";
import { verifyDeliveryProof } from "./deliveryProof.js";
import { assertClosureCertificateCurrent } from "./closureCertificate.js";

export interface ReleasePreflightFinding { code: string; message: string; evidence: string[]; }
export interface ReleasePreflightReport {
  schemaVersion: "release-preflight.v1";
  editionId: string;
  status: "ready" | "blocked";
  findings: ReleasePreflightFinding[];
  evaluatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function withoutFingerprint(value: Record<string, unknown>): Record<string, unknown> { const base = { ...value }; delete base.fingerprint; return base; }
function preflightFingerprint(base: { evaluatedAt: string; [key: string]: unknown }): string {
  const { evaluatedAt: _evaluatedAt, ...stableBase } = base;
  return hash(stableBase);
}

export async function buildReleasePreflight(root: string, editionId: string): Promise<ReleasePreflightReport> {
  const findings: ReleasePreflightFinding[] = [];
  const manifest = await readEditionManifest(root, editionId);
  if (!manifest) findings.push({ code: "edition-manifest-missing", message: "Frozen EditionManifest is missing.", evidence: [] });
  else {
    if (manifest.status !== "frozen" || manifest.readerSafe !== true) findings.push({ code: "edition-manifest-not-frozen", message: "EditionManifest is not frozen and reader-safe.", evidence: [manifest.fingerprint] });
    if (hash(withoutFingerprint(manifest as unknown as Record<string, unknown>)) !== manifest.fingerprint) findings.push({ code: "edition-manifest-integrity-mismatch", message: "EditionManifest fingerprint does not match its content.", evidence: [manifest.fingerprint] });
  }
  const tree = await readPublicationTree(root, editionId);
  if (!tree) findings.push({ code: "publication-tree-missing", message: "PublicationTree is missing.", evidence: [] });
  else if (hash(withoutFingerprint(tree as unknown as Record<string, unknown>)) !== tree.fingerprint || tree.readerSafe !== true) findings.push({ code: "publication-tree-invalid", message: "PublicationTree is not current reader-safe content.", evidence: [tree.fingerprint] });
  const artifacts = await readPublicationArtifactSet(root, editionId);
  if (!artifacts) findings.push({ code: "artifact-set-missing", message: "Validated artifact set is missing.", evidence: [] });
  else {
    if (artifacts.status !== "validated") findings.push({ code: "artifact-set-not-validated", message: "Artifact set has not passed validation.", evidence: [artifacts.fingerprint] });
    if (hash(withoutFingerprint(artifacts as unknown as Record<string, unknown>)) !== artifacts.fingerprint) findings.push({ code: "artifact-set-integrity-mismatch", message: "Artifact set fingerprint does not match its content.", evidence: [artifacts.fingerprint] });
    if (manifest && artifacts.manifestFingerprint !== manifest.fingerprint) findings.push({ code: "artifact-manifest-stale", message: "Artifact set references a different EditionManifest.", evidence: [artifacts.manifestFingerprint, manifest.fingerprint] });
    if (tree && artifacts.treeFingerprint !== tree.fingerprint) findings.push({ code: "artifact-tree-stale", message: "Artifact set references a different PublicationTree.", evidence: [artifacts.treeFingerprint, tree.fingerprint] });
  }
  const proof = await verifyDeliveryProof(root, editionId);
  if (!proof.proof) findings.push({ code: "delivery-proof-missing", message: "Current DeliveryProof is missing.", evidence: [] });
  else if (!proof.valid) findings.push({ code: "delivery-proof-invalid", message: "DeliveryProof is stale, revoked, superseded, or byte-invalid.", evidence: proof.reasons });
  if (manifest && manifest.chapters.length > 0) {
    try {
      const closure = await assertClosureCertificateCurrent(root, manifest.canonCommitFingerprint);
      if (closure.certificate.projectSlug !== manifest.projectSlug || closure.certificate.chapterIds.join("|") !== manifest.chapters.map((chapter) => chapter.chapterId).sort().join("|")) findings.push({ code: "closure-certificate-scope-mismatch", message: "ClosureCertificate does not cover the frozen edition scope.", evidence: [closure.certificate.fingerprint] });
    } catch { findings.push({ code: "closure-certificate-missing", message: "Current ClosureCertificate is missing or stale.", evidence: [] }); }
  }
  const base = { schemaVersion: "release-preflight.v1" as const, editionId, status: findings.length ? "blocked" as const : "ready" as const, findings, evaluatedAt: new Date().toISOString() };
  return { ...base, fingerprint: preflightFingerprint(base) };
}
