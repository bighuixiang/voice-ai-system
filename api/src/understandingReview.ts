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
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function validEvidence(snapshot: UnderstandingSnapshot, messageIds: Set<string>): boolean {
  return snapshot.coreExplicit.every((claim) => claim.evidence.every((evidence) => {
    if (!messageIds.has(evidence.messageId)) return false;
    return Number.isInteger(evidence.start) && Number.isInteger(evidence.end) && evidence.start >= 0 && evidence.end >= evidence.start;
  }));
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
      status: validEvidence(snapshot, new Set(session.messages.map((message) => message.id))) ? "passed" : "failed",
      detail: "Explicit claims must reference existing message IDs and non-negative spans."
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
