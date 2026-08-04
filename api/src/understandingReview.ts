import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCreativeSession } from "./creativeSession.js";
import { fingerprintCreativeSession } from "./contextManifest.js";
import { readUnderstandingSnapshot, type UnderstandingSnapshot } from "./understandingExecutor.js";

export interface UnderstandingReviewCheck {
  checkId: "source-fingerprint" | "evidence-spans" | "branch-separation" | "question-gate" | "canon-isolation";
  status: "passed" | "failed";
  detail: string;
}

export interface UnderstandingReview {
  schemaVersion: "understanding-review.v1";
  reviewId: string;
  projectSlug: string;
  snapshotId: string;
  snapshotFingerprint: string;
  calibrationVersion: "understanding-calibration.v1";
  reviewer: { kind: "independent-deterministic"; id: string } | { kind: "human" | "provider"; id: string; attestationReference: string };
  status: "passed" | "blocked";
  checks: UnderstandingReviewCheck[];
  canonWritten: false;
  createdAt: string;
  evidenceRefs?: string[];
  fingerprint: string;
}

export interface ExternalUnderstandingReviewInput {
  reviewerKind: "human" | "provider";
  reviewerId: string;
  attestationReference: string;
  snapshotFingerprint: string;
  checks: Array<{ checkId: UnderstandingReviewCheck["checkId"]; detail: string }>;
  evidenceRefs: string[];
  persist?: boolean;
}

function reviewPath(root: string): string {
  return resolveInside(root, "sessions/understanding-review.json");
}

function isTraceableEvidenceReference(reference: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(reference.trim());
}

function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === value.fingerprint;
}

function hasValidReviewSemantics(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== "understanding-review.v1" || typeof value.reviewId !== "string" || !value.reviewId.trim() || typeof value.projectSlug !== "string" || !value.projectSlug.trim() || typeof value.snapshotId !== "string" || !value.snapshotId.trim() || typeof value.snapshotFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.snapshotFingerprint) || value.calibrationVersion !== "understanding-calibration.v1" || (value.status !== "passed" && value.status !== "blocked") || value.canonWritten !== false || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  const reviewer = value.reviewer as { kind?: unknown; id?: unknown; attestationReference?: unknown } | undefined;
  if (!reviewer || typeof reviewer.id !== "string" || !reviewer.id.trim()) return false;
  if (reviewer.kind === "independent-deterministic") {
    if (reviewer.attestationReference !== undefined) return false;
  } else if ((reviewer.kind !== "human" && reviewer.kind !== "provider") || !isTraceableEvidenceReference(String(reviewer.attestationReference ?? ""))) return false;
  if (reviewer.kind === "human" || reviewer.kind === "provider") {
    if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0 || value.evidenceRefs.some((reference) => typeof reference !== "string" || !isTraceableEvidenceReference(reference))) return false;
  }
  const requiredChecks = ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"];
  if (!Array.isArray(value.checks) || value.checks.length !== requiredChecks.length) return false;
  const checks = value.checks as Array<{ checkId?: unknown; status?: unknown; detail?: unknown }>;
  return requiredChecks.every((checkId) => checks.some((check) => check.checkId === checkId && (check.status === "passed" || check.status === "failed") && typeof check.detail === "string" && check.detail.trim().length > 0)) && new Set(checks.map((check) => check.checkId)).size === requiredChecks.length;
}

async function writeReview(root: string, review: UnderstandingReview): Promise<void> {
  const target = reviewPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readUnderstandingReview(root: string): Promise<UnderstandingReview | null> {
  try {
    const value = JSON.parse(await fs.readFile(reviewPath(root), "utf8")) as UnderstandingReview & Record<string, unknown>;
    if (!hasValidFingerprint(value)) throw new Error("UNDERSTANDING_REVIEW_INTEGRITY_FAILED");
    if (!hasValidReviewSemantics(value)) throw new Error("UNDERSTANDING_REVIEW_SEMANTIC_INVALID");
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function validEvidence(snapshot: UnderstandingSnapshot, messages: Map<string, string>): boolean {
  const claims = [
    ...snapshot.coreExplicit,
    ...snapshot.inferred,
    ...snapshot.unknowns,
    ...(snapshot.interpretationSet?.commonClaims || []),
    ...(snapshot.interpretationSet?.interpretations.flatMap((branch) => [
      ...branch.supportEvidence,
      ...branch.counterEvidence
    ]) || [])
  ];
  return claims.every((claim) => {
    if (claim.status !== "unknown" && claim.evidence.length === 0) return false;
    return claim.evidence.every((evidence) => {
    const source = messages.get(evidence.messageId);
    if (source === undefined) return false;
    return Number.isInteger(evidence.start)
      && Number.isInteger(evidence.end)
      && evidence.start >= 0
      && evidence.end >= evidence.start
      && evidence.end <= source.length;
    });
  });
}

export async function reviewUnderstandingSnapshot(root: string, reviewerId = "independent-deterministic-v1"): Promise<UnderstandingReview | null> {
  const snapshot = await readUnderstandingSnapshot(root);
  if (!snapshot) return null;
  const session = await readCreativeSession(root, snapshot.projectSlug);
  const currentFingerprint = fingerprintCreativeSession(session);
  const checks: UnderstandingReviewCheck[] = [
    {
      checkId: "source-fingerprint",
      status: currentFingerprint === snapshot.sourceFingerprint ? "passed" : "failed",
      detail: currentFingerprint === snapshot.sourceFingerprint ? "Snapshot input is current." : "Snapshot input is stale."
    },
    {
      checkId: "evidence-spans",
      status: validEvidence(snapshot, new Map(session.messages.map((message) => [message.id, message.text]))) ? "passed" : "failed",
      detail: "Every claim evidence span must reference an existing message and remain within its source bounds."
    },
    {
      checkId: "branch-separation",
      status: snapshot.mode === "shadow" || (snapshot.interpretationSet !== undefined && snapshot.interpretationSet.interpretations.length >= 2) ? "passed" : "failed",
      detail: "Competing interpretation output must retain at least two branches."
    },
    {
      checkId: "question-gate",
      status: snapshot.question.impact === "high" && snapshot.question.status === "candidate" ? "passed" : "failed",
      detail: "Exactly one high-impact candidate question gates unresolved direction."
    },
    {
      checkId: "canon-isolation",
      status: snapshot.canonWritten === false ? "passed" : "failed",
      detail: "Understanding review never authorizes canon writes."
    }
  ];
  const base = {
    schemaVersion: "understanding-review.v1" as const,
    reviewId: `understanding-review-${snapshot.snapshotId}`,
    projectSlug: snapshot.projectSlug,
    snapshotId: snapshot.snapshotId,
    snapshotFingerprint: snapshot.sourceFingerprint,
    calibrationVersion: "understanding-calibration.v1" as const,
    reviewer: { kind: "independent-deterministic" as const, id: reviewerId },
    status: checks.every((check) => check.status === "passed") ? "passed" as const : "blocked" as const,
    checks,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const review: UnderstandingReview = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeReview(root, review);
  return review;
}

export async function ingestExternalUnderstandingReview(root: string, input: ExternalUnderstandingReviewInput): Promise<UnderstandingReview> {
  if (!input || typeof input !== "object"
    || (input.reviewerKind !== "human" && input.reviewerKind !== "provider")
    || typeof input.reviewerId !== "string"
    || typeof input.attestationReference !== "string"
    || typeof input.snapshotFingerprint !== "string"
    || !Array.isArray(input.checks)
    || !Array.isArray(input.evidenceRefs)) {
    throw new Error("UNDERSTANDING_REVIEW_INPUT_INVALID");
  }
  if (!input.reviewerId.trim()) throw new Error("UNDERSTANDING_REVIEWER_REQUIRED");
  if (!input.attestationReference.trim()) throw new Error("UNDERSTANDING_REVIEW_ATTESTATION_REQUIRED");
  if (!isTraceableEvidenceReference(input.attestationReference)) throw new Error("UNDERSTANDING_REVIEW_ATTESTATION_INVALID");
  if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((reference) => !reference.trim())) throw new Error("UNDERSTANDING_REVIEW_EVIDENCE_REQUIRED");
  if (input.evidenceRefs.some((reference) => !isTraceableEvidenceReference(reference))) throw new Error("UNDERSTANDING_REVIEW_EVIDENCE_INVALID");
  if (!/^[a-f0-9]{64}$/.test(input.snapshotFingerprint)) throw new Error("UNDERSTANDING_REVIEW_SNAPSHOT_FINGERPRINT_INVALID");
  const snapshot = await readUnderstandingSnapshot(root);
  if (!snapshot) throw new Error("UNDERSTANDING_REVIEW_SNAPSHOT_NOT_FOUND");
  if (snapshot.sourceFingerprint !== input.snapshotFingerprint) throw new Error("UNDERSTANDING_REVIEW_SNAPSHOT_FINGERPRINT_MISMATCH");
  if (snapshot.canonWritten !== false) throw new Error("UNDERSTANDING_REVIEW_CANON_ISOLATION_FAILED");
  const requiredChecks: UnderstandingReviewCheck["checkId"][] = ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"];
  if (input.checks.some((check) => !check || typeof check !== "object" || typeof check.checkId !== "string" || typeof check.detail !== "string" || !check.detail.trim())) {
    throw new Error("UNDERSTANDING_REVIEW_INPUT_INVALID");
  }
  const checks = input.checks.map((check) => ({ checkId: check.checkId, status: "passed" as const, detail: check.detail }));
  if (checks.length !== requiredChecks.length || requiredChecks.some((checkId) => !checks.some((check) => check.checkId === checkId))) {
    throw new Error("UNDERSTANDING_REVIEW_CHECKS_INCOMPLETE");
  }
  const base = {
    schemaVersion: "understanding-review.v1" as const,
    reviewId: `understanding-review-external-${Date.now()}-${crypto.randomUUID()}`,
    projectSlug: path.basename(root),
    snapshotId: "external-attested",
    snapshotFingerprint: input.snapshotFingerprint,
    calibrationVersion: "understanding-calibration.v1" as const,
    reviewer: { kind: input.reviewerKind, id: input.reviewerId, attestationReference: input.attestationReference },
    status: "passed" as const,
    checks,
    canonWritten: false as const,
    createdAt: new Date().toISOString(),
    evidenceRefs: [...input.evidenceRefs]
  };
  const review = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") } as UnderstandingReview & { evidenceRefs: string[] };
  if (input.persist !== false) await writeReview(root, review);
  return review;
}
