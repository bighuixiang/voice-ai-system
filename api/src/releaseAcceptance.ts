import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getNovelsRoot } from "./workspace.js";
import { evaluateMigrationCutover } from "./migrationCutover.js";
import { verifyDeliveryProof } from "./deliveryProof.js";
import { buildReleasePreflight } from "./releasePreflight.js";
import { readChapterSettlement } from "./chapterSettlement.js";
import { readDerivedPublicationTransaction } from "./derivedPublication.js";
import { readEditionManifest } from "./editionManifest.js";
import { readLatestCanonCommit } from "./canonCommit.js";

export interface ReleaseAcceptanceCheck {
  checkId: "migration-cutover" | "external-calibration" | "governed-e2e" | "v2-independent-review" | "delivery-proof";
  status: "passed" | "missing";
  evidence: string[];
  reason: string;
}

export interface ReleaseAcceptanceDecision {
  schemaVersion: "release-acceptance.v1";
  releaseProfile: "RP5-drafting";
  status: "accepted" | "do-not-activate";
  checks: ReleaseAcceptanceCheck[];
  evaluatedAt: string;
  fingerprint: string;
}

function persistedAcceptancePath(root: string): string { return path.join(root, "release-acceptance.json"); }

async function projectDirectories(): Promise<string[]> {
  const root = getNovelsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
  const projects: string[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(root, entry.name, "project.json"), "utf8")) as { slug?: unknown; chapters?: unknown };
      if (manifest.slug === entry.name && Array.isArray(manifest.chapters)) projects.push(path.join(root, entry.name));
    } catch {
      // Evidence under an orphan or invalid directory cannot satisfy a release gate.
    }
  }
  return projects;
}

async function hasJsonFile(root: string, relativePath: string, predicate: (value: Record<string, unknown>) => boolean): Promise<boolean> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8")) as Record<string, unknown>;
    return predicate(value);
  } catch { return false; }
}

async function hasValidIndependentReview(root: string): Promise<boolean> {
  try {
    const review = JSON.parse(await fs.readFile(path.join(root, "sessions/understanding-review.json"), "utf8")) as Record<string, unknown>;
    if (!hasValidFingerprint(review) || review.schemaVersion !== "understanding-review.v1" || review.status !== "passed" || review.canonWritten !== false) return false;
    const reviewer = review.reviewer as { kind?: unknown; id?: unknown; attestationReference?: unknown } | undefined;
    if (!reviewer || !["human", "provider"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id.trim() || !isTraceableEvidenceReference(reviewer.attestationReference)) return false;
    const requiredChecks = ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"];
    const checks = Array.isArray(review.checks) ? review.checks as Array<{ checkId?: unknown; status?: unknown }> : [];
    if (checks.length !== requiredChecks.length || requiredChecks.some((checkId) => !checks.some((check) => check.checkId === checkId && check.status === "passed"))) return false;
    const evidenceRefs = Array.isArray(review.evidenceRefs) ? review.evidenceRefs : [];
    if (evidenceRefs.length === 0 || evidenceRefs.some((reference) => !isTraceableEvidenceReference(reference))) return false;
    if (typeof review.snapshotFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(review.snapshotFingerprint)) return false;
    const snapshot = JSON.parse(await fs.readFile(path.join(root, "sessions/understanding-snapshot.json"), "utf8")) as Record<string, unknown>;
    return snapshot.schemaVersion === "understanding-snapshot.v1" && snapshot.canonWritten === false && snapshot.sourceFingerprint === review.snapshotFingerprint;
  } catch {
    return false;
  }
}

function isTraceableEvidenceReference(reference: unknown): reference is string {
  return typeof reference === "string" && /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(reference.trim());
}

function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === value.fingerprint;
}

function acceptanceFingerprint(base: { evaluatedAt: string; [key: string]: unknown }): string {
  const { evaluatedAt: _evaluatedAt, ...stableBase } = base;
  return crypto.createHash("sha256").update(JSON.stringify(stableBase)).digest("hex");
}

export function assertReleaseAcceptanceIntegrity(value: ReleaseAcceptanceDecision): ReleaseAcceptanceDecision {
  const requiredChecks = ["migration-cutover", "external-calibration", "governed-e2e", "v2-independent-review", "delivery-proof"];
  if (value.schemaVersion !== "release-acceptance.v1" || value.releaseProfile !== "RP5-drafting" || (value.status !== "accepted" && value.status !== "do-not-activate") || !Array.isArray(value.checks) || value.checks.length !== requiredChecks.length || typeof value.evaluatedAt !== "string" || !Number.isFinite(Date.parse(value.evaluatedAt))) throw new Error("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
  const checks = value.checks as Array<{ checkId?: unknown; status?: unknown; evidence?: unknown; reason?: unknown }>;
  if (requiredChecks.some((checkId) => !checks.some((check) => check.checkId === checkId && (check.status === "passed" || check.status === "missing"))) || new Set(checks.map((check) => check.checkId)).size !== requiredChecks.length) throw new Error("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
  if (checks.some((check) => !Array.isArray(check.evidence) || check.evidence.some((item) => typeof item !== "string") || typeof check.reason !== "string" || !check.reason.trim())) throw new Error("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
  if (value.status === "accepted" && checks.some((check) => check.status !== "passed")) throw new Error("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
  const { fingerprint: _fingerprint, ...base } = value;
  if (!(typeof value.fingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.fingerprint) && acceptanceFingerprint(base) === value.fingerprint)) throw new Error("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
  return value;
}

async function writeAcceptanceJson(root: string, value: ReleaseAcceptanceDecision): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  const target = persistedAcceptancePath(root);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readPersistedReleaseAcceptance(root: string): Promise<ReleaseAcceptanceDecision | null> {
  try {
    const value = JSON.parse(await fs.readFile(persistedAcceptancePath(root), "utf8")) as ReleaseAcceptanceDecision;
    return assertReleaseAcceptanceIntegrity(value);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    if (error instanceof Error && error.message === "RELEASE_ACCEPTANCE_INTEGRITY_FAILED") throw new Error("RELEASE_ACCEPTANCE_CORRUPT");
    throw error;
  }
}

export async function persistReleaseAcceptance(root: string, decision: ReleaseAcceptanceDecision): Promise<ReleaseAcceptanceDecision> {
  try { assertReleaseAcceptanceIntegrity(decision); } catch { throw new Error("RELEASE_ACCEPTANCE_INVALID"); }
  const existing = await readPersistedReleaseAcceptance(root);
  if (existing && existing.fingerprint === decision.fingerprint) return existing;
  await writeAcceptanceJson(root, decision);
  return decision;
}

function hasSemanticallyValidCalibration(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== "quality-calibration-evidence.v1" || typeof value.evaluatorVersion !== "string" || !value.evaluatorVersion.trim() || typeof value.inputFingerprint !== "string" || !value.inputFingerprint.trim()) return false;
  if (value.split !== "holdout" || value.labelAccess !== "sealed-separate-from-evaluator-input" || value.canonGateEligible !== false) return false;
  if (!Array.isArray(value.caseIds) || value.caseIds.some((caseId) => typeof caseId !== "string" || !caseId.trim()) || new Set(value.caseIds).size !== value.caseIds.length) return false;
  if (typeof value.evaluatedCount !== "number" || !Number.isInteger(value.evaluatedCount) || value.evaluatedCount <= 0 || typeof value.correctCount !== "number" || !Number.isInteger(value.correctCount) || value.correctCount < 0 || value.correctCount > value.evaluatedCount) return false;
  if (typeof value.accuracy !== "number" || Math.abs(value.accuracy - value.correctCount / value.evaluatedCount) > 1e-9 || typeof value.minimumAccuracy !== "number" || value.minimumAccuracy < 0 || value.minimumAccuracy > 1 || value.accuracy < value.minimumAccuracy) return false;
  if (value.status !== "calibrated" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  const attestation = value.attestation as { kind?: unknown } | undefined;
  const expectedKind = value.sourceKind === "provider" ? "provider-signed" : value.sourceKind === "human" ? "human-reviewed" : "";
  const reference = (value.attestation as { reference?: unknown } | undefined)?.reference;
  return attestation?.kind === expectedKind && isTraceableEvidenceReference(reference);
}

function hasSemanticallyValidReleaseE2E(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== "release-e2e-acceptance.v1" || value.status !== "verified") return false;
  const identityKeys = ["projectSlug", "chapterId", "settlementId", "derivedTransactionId"];
  if (identityKeys.some((key) => typeof value[key] !== "string" || !(value[key] as string).trim())) return false;
  const fingerprintKeys = ["settlementFingerprint", "derivedFingerprint"];
  if (!fingerprintKeys.every((key) => typeof value[key] === "string" && /^[a-f0-9]{64}$/i.test(value[key] as string))) return false;
  return typeof value.verifiedAt === "string" && Number.isFinite(Date.parse(value.verifiedAt));
}

function hasValidDerivedFingerprint(value: Record<string, unknown>): boolean {
  if (hasValidFingerprint(value)) return true;
  if (value.status !== "committed" || typeof value.committedAt !== "string") return false;
  const { fingerprint: _fingerprint, status, committedAt, error: _error, ...rest } = value;
  const preparedBase = { ...rest, status: "prepared" };
  const prepared = { ...preparedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(preparedBase)).digest("hex") };
  const committedBase = { ...prepared, status, committedAt };
  return crypto.createHash("sha256").update(JSON.stringify(committedBase)).digest("hex") === value.fingerprint;
}

async function hasValidReleaseE2E(root: string): Promise<boolean> {
  try {
    const proof = JSON.parse(await fs.readFile(path.join(root, "sessions/release-e2e-acceptance.json"), "utf8")) as Record<string, unknown>;
    if (!hasValidFingerprint(proof) || !hasSemanticallyValidReleaseE2E(proof)) return false;
    const settlement = await readChapterSettlement(root, String(proof.settlementId));
    if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== proof.projectSlug || settlement.chapterId !== proof.chapterId) return false;
    if (!hasValidFingerprint(settlement as unknown as Record<string, unknown>) || settlement.fingerprint !== proof.settlementFingerprint) return false;
    const derived = await readDerivedPublicationTransaction(root, String(proof.derivedTransactionId));
    if (!derived || derived.status !== "committed" || derived.projectSlug !== proof.projectSlug || derived.chapterId !== proof.chapterId || derived.settlementId !== proof.settlementId) return false;
    if (!hasValidDerivedFingerprint(derived as unknown as Record<string, unknown>) || derived.fingerprint !== proof.derivedFingerprint) return false;
    return true;
  } catch {
    return false;
  }
}

export async function evaluateReleaseAcceptance(): Promise<ReleaseAcceptanceDecision> {
  const cutover = await evaluateMigrationCutover();
  const roots = await projectDirectories();
  const migrationReady = cutover.status === "ready";
  const calibrationRoots: string[] = [];
  const e2eRoots: string[] = [];
  const reviewRoots: string[] = [];
  const deliveryProofRoots: string[] = [];
  for (const root of roots) {
    if (await hasJsonFile(root, "sessions/quality-calibration-evidence.json", (value) => hasValidFingerprint(value) && value.status === "calibrated" && (value.sourceKind === "provider" || value.sourceKind === "human") && hasSemanticallyValidCalibration(value) && Array.isArray(value.evidenceRefs) && value.evidenceRefs.length > 0 && value.evidenceRefs.every(isTraceableEvidenceReference))) calibrationRoots.push(root);
    if (await hasValidReleaseE2E(root)) e2eRoots.push(root);
    if (await hasValidIndependentReview(root)) reviewRoots.push(root);
    const proofEntries = await fs.readdir(path.join(root, "sessions", "publication-editions"), { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
    for (const entry of proofEntries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".delivery-proof.json"))) {
      const editionId = entry.name.slice(0, -".delivery-proof.json".length);
      try {
        const verification = await verifyDeliveryProof(root, editionId);
        const preflight = await buildReleasePreflight(root, editionId);
        const manifest = await readEditionManifest(root, editionId);
        const canonCommit = manifest ? await readLatestCanonCommit(root, manifest.projectSlug) : null;
        if (verification.valid && preflight.status === "ready" && manifest && canonCommit?.canonCommitFingerprint === manifest.canonCommitFingerprint) deliveryProofRoots.push(root);
      } catch {
        // A malformed candidate must not abort evaluation or make unrelated evidence authoritative.
      }
    }
  }
  const checks: ReleaseAcceptanceCheck[] = [
    {
      checkId: "migration-cutover",
      status: migrationReady ? "passed" : "missing",
      evidence: cutover.blockers,
      reason: migrationReady ? "All inventoried projects have governed write authority." : "Legacy, preview, validated, unmanaged, invalid, or no projects remain in the inventory."
    },
    {
      checkId: "external-calibration",
      status: calibrationRoots.length ? "passed" : "missing",
      evidence: calibrationRoots,
      reason: calibrationRoots.length ? "An externally attested provider or human holdout artifact is present." : "No externally attested provider/human holdout artifact is attached."
    },
    {
      checkId: "governed-e2e",
      status: e2eRoots.length ? "passed" : "missing",
      evidence: e2eRoots,
      reason: e2eRoots.length ? "A durable real-project release E2E artifact is present." : "No durable real-project release E2E artifact is attached."
    },
    {
      checkId: "v2-independent-review",
      status: reviewRoots.length ? "passed" : "missing",
      evidence: reviewRoots,
      reason: reviewRoots.length ? "A passing independent V2 review with canon isolation is present." : "No passing independent V2 review artifact is attached."
    },
    {
      checkId: "delivery-proof",
      status: deliveryProofRoots.length ? "passed" : "missing",
      evidence: deliveryProofRoots,
      reason: deliveryProofRoots.length ? "A current byte-verifiable DeliveryProof is present." : "No current byte-verifiable DeliveryProof is attached."
    }
  ];
  const base = {
    schemaVersion: "release-acceptance.v1" as const,
    releaseProfile: "RP5-drafting" as const,
    status: checks.every((check) => check.status === "passed") ? "accepted" as const : "do-not-activate" as const,
    checks,
    evaluatedAt: new Date().toISOString()
  };
  return { ...base, fingerprint: acceptanceFingerprint(base) };
}
