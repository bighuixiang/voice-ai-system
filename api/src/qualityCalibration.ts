import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type CalibrationLabel = "pass" | "fail";

export interface CalibrationObservation {
  caseId: string;
  predicted: CalibrationLabel;
}

export interface QualityCalibrationEvidence {
  schemaVersion: "quality-calibration-evidence.v1";
  calibrationId: string;
  evaluatorVersion: string;
  sourceKind: "provider" | "human";
  split: "holdout";
  caseIds: string[];
  inputFingerprint: string;
  evaluatedCount: number;
  correctCount: number;
  accuracy: number;
  minimumAccuracy: number;
  status: "calibrated" | "blocked";
  canonGateEligible: false;
  labelAccess: "sealed-separate-from-evaluator-input";
  attestation: { kind: "provider-signed" | "human-reviewed" | "synthetic-fixture"; reference: string };
  evidenceRefs: string[];
  createdAt: string;
  fingerprint: string;
}

interface CalibrationInput {
  evaluatorVersion: string;
  sourceKind: "provider" | "human";
  holdoutInputFingerprint: string;
  observations: CalibrationObservation[];
  sealedLabels: Record<string, CalibrationLabel>;
  minimumAccuracy?: number;
  persist?: boolean;
}

export interface ExternalCalibrationSubmission {
  evaluatorVersion: string;
  sourceKind: "provider" | "human";
  holdoutInputFingerprint: string;
  evaluatedCount: number;
  correctCount: number;
  accuracy: number;
  minimumAccuracy: number;
  attestation: { kind: "provider-signed" | "human-reviewed"; reference: string };
  evidenceRefs: string[];
  persist?: boolean;
}

function evidencePath(root: string): string {
  return resolveInside(root, "sessions/quality-calibration-evidence.json");
}

function historyDirectory(root: string): string {
  return resolveInside(root, "sessions/quality-calibration");
}

function historyPath(root: string, calibrationId: string): string {
  return resolveInside(root, `sessions/quality-calibration/${calibrationId}.json`);
}

function isTraceableEvidenceReference(reference: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(reference.trim());
}

function verifyEvidenceIntegrity(evidence: QualityCalibrationEvidence): boolean {
  const { fingerprint, ...base } = evidence;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === fingerprint;
}

function verifyEvidenceSemantics(evidence: QualityCalibrationEvidence): boolean {
  if (evidence.schemaVersion !== "quality-calibration-evidence.v1" || typeof evidence.calibrationId !== "string" || !evidence.calibrationId.trim() || typeof evidence.evaluatorVersion !== "string" || !evidence.evaluatorVersion.trim() || typeof evidence.inputFingerprint !== "string" || !evidence.inputFingerprint.trim() || typeof evidence.createdAt !== "string" || !evidence.createdAt.trim() || !Number.isFinite(Date.parse(evidence.createdAt)) || !Array.isArray(evidence.caseIds) || evidence.caseIds.some((caseId) => typeof caseId !== "string" || !caseId.trim()) || new Set(evidence.caseIds).size !== evidence.caseIds.length || (evidence.sourceKind !== "provider" && evidence.sourceKind !== "human") || evidence.split !== "holdout" || evidence.labelAccess !== "sealed-separate-from-evaluator-input" || evidence.canonGateEligible !== false) return false;
  if (!Number.isInteger(evidence.evaluatedCount) || evidence.evaluatedCount <= 0 || !Number.isInteger(evidence.correctCount) || evidence.correctCount < 0 || evidence.correctCount > evidence.evaluatedCount) return false;
  if (typeof evidence.accuracy !== "number" || Math.abs(evidence.accuracy - evidence.correctCount / evidence.evaluatedCount) > 1e-9 || typeof evidence.minimumAccuracy !== "number" || evidence.minimumAccuracy < 0 || evidence.minimumAccuracy > 1) return false;
  if (evidence.status !== (evidence.accuracy >= evidence.minimumAccuracy ? "calibrated" : "blocked")) return false;
  if (!evidence.attestation || typeof evidence.attestation !== "object" || typeof evidence.attestation.kind !== "string" || typeof evidence.attestation.reference !== "string") return false;
  const expectedAttestation = evidence.attestation.kind === "synthetic-fixture" ? "synthetic-fixture" : evidence.sourceKind === "provider" ? "provider-signed" : "human-reviewed";
  const refsValid = Array.isArray(evidence.evidenceRefs) && (evidence.attestation.kind === "synthetic-fixture" ? evidence.evidenceRefs.every(isTraceableEvidenceReference) : evidence.evidenceRefs.length > 0 && evidence.evidenceRefs.every(isTraceableEvidenceReference));
  const attestationReferenceValid = evidence.attestation.kind === "synthetic-fixture" ? evidence.attestation.reference === "local-test-fixture" : isTraceableEvidenceReference(evidence.attestation.reference);
  return evidence.attestation.kind === expectedAttestation && attestationReferenceValid && refsValid;
}

export function isQualityCalibrationEvidenceTrusted(evidence: QualityCalibrationEvidence | null | undefined): boolean {
  try { return Boolean(evidence && verifyEvidenceIntegrity(evidence) && verifyEvidenceSemantics(evidence)); }
  catch { return false; }
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readQualityCalibrationEvidence(root: string): Promise<QualityCalibrationEvidence | null> {
  try {
    const evidence = JSON.parse(await fs.readFile(evidencePath(root), "utf8")) as QualityCalibrationEvidence;
    if (!verifyEvidenceIntegrity(evidence)) throw new Error("CALIBRATION_EVIDENCE_INTEGRITY_FAILED");
    if (!verifyEvidenceSemantics(evidence)) throw new Error("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
    return evidence;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function readQualityCalibrationEvidenceHistory(root: string): Promise<QualityCalibrationEvidence[]> {
  const entries = await fs.readdir(historyDirectory(root), { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
  const results: QualityCalibrationEvidence[] = [];
  for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json"))) {
    try {
      const evidence = JSON.parse(await fs.readFile(path.join(historyDirectory(root), entry.name), "utf8")) as QualityCalibrationEvidence;
      if (!verifyEvidenceIntegrity(evidence)) throw new Error("CALIBRATION_EVIDENCE_INTEGRITY_FAILED");
      if (!verifyEvidenceSemantics(evidence)) throw new Error("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
      if (entry.name.slice(0, -".json".length) !== evidence.calibrationId) throw new Error("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
      results.push(evidence);
    } catch (error) {
      if (error instanceof Error && (error.message === "CALIBRATION_EVIDENCE_INTEGRITY_FAILED" || error.message === "CALIBRATION_EVIDENCE_SEMANTIC_INVALID")) throw error;
      throw new Error("CALIBRATION_EVIDENCE_HISTORY_INVALID");
    }
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function evaluateQualityCalibration(root: string, input: CalibrationInput): Promise<QualityCalibrationEvidence> {
  if (!input.evaluatorVersion.trim()) throw new Error("CALIBRATION_EVALUATOR_VERSION_REQUIRED");
  if (!input.holdoutInputFingerprint.trim()) throw new Error("CALIBRATION_HOLDOUT_FINGERPRINT_REQUIRED");
  if (input.observations.length === 0) throw new Error("CALIBRATION_OBSERVATIONS_REQUIRED");
  const minimumAccuracy = input.minimumAccuracy ?? 0.8;
  if (minimumAccuracy < 0 || minimumAccuracy > 1) throw new Error("CALIBRATION_THRESHOLD_INVALID");
  const seen = new Set<string>();
  let correctCount = 0;
  for (const observation of input.observations) {
    if (seen.has(observation.caseId)) throw new Error("CALIBRATION_DUPLICATE_CASE");
    seen.add(observation.caseId);
    if (!(observation.caseId in input.sealedLabels)) throw new Error("CALIBRATION_LABEL_MISSING");
    if (input.sealedLabels[observation.caseId] === observation.predicted) correctCount += 1;
  }
  const accuracy = correctCount / input.observations.length;
  const base = {
    schemaVersion: "quality-calibration-evidence.v1" as const,
    calibrationId: `quality-calibration-${Date.now()}-${crypto.randomUUID()}`,
    evaluatorVersion: input.evaluatorVersion,
    sourceKind: input.sourceKind,
    split: "holdout" as const,
    caseIds: input.observations.map((observation) => observation.caseId),
    inputFingerprint: input.holdoutInputFingerprint,
    evaluatedCount: input.observations.length,
    correctCount,
    accuracy,
    minimumAccuracy,
    status: accuracy >= minimumAccuracy ? "calibrated" as const : "blocked" as const,
    canonGateEligible: false as const,
    labelAccess: "sealed-separate-from-evaluator-input" as const,
    attestation: { kind: "synthetic-fixture" as const, reference: "local-test-fixture" },
    evidenceRefs: [],
    createdAt: new Date().toISOString()
  };
  const evidence: QualityCalibrationEvidence = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  if (input.persist !== false) await writeJson(evidencePath(root), evidence);
  return evidence;
}

export async function ingestExternalCalibrationSubmission(root: string, submission: ExternalCalibrationSubmission): Promise<QualityCalibrationEvidence> {
  if (submission.sourceKind !== "provider" && submission.sourceKind !== "human") throw new Error("CALIBRATION_SOURCE_KIND_INVALID");
  if (!submission.attestation || typeof submission.attestation !== "object") throw new Error("CALIBRATION_ATTESTATION_REQUIRED");
  if (typeof submission.evaluatorVersion !== "string" || !submission.evaluatorVersion.trim()) throw new Error("CALIBRATION_EVALUATOR_VERSION_REQUIRED");
  if (typeof submission.holdoutInputFingerprint !== "string" || !submission.holdoutInputFingerprint.trim()) throw new Error("CALIBRATION_HOLDOUT_FINGERPRINT_REQUIRED");
  if (typeof submission.attestation.reference !== "string" || !submission.attestation.reference.trim()) throw new Error("CALIBRATION_ATTESTATION_REQUIRED");
  if (!isTraceableEvidenceReference(submission.attestation.reference)) throw new Error("CALIBRATION_ATTESTATION_REFERENCE_INVALID");
  const expectedAttestationKind = submission.sourceKind === "provider" ? "provider-signed" : "human-reviewed";
  if (submission.attestation.kind !== expectedAttestationKind) throw new Error("CALIBRATION_ATTESTATION_KIND_MISMATCH");
  if (!Number.isInteger(submission.evaluatedCount) || !Number.isFinite(submission.evaluatedCount) || !Number.isInteger(submission.correctCount) || !Number.isFinite(submission.correctCount) || submission.evaluatedCount <= 0 || submission.correctCount < 0 || submission.correctCount > submission.evaluatedCount) throw new Error("CALIBRATION_COUNTS_INVALID");
  const computedAccuracy = submission.correctCount / submission.evaluatedCount;
  if (typeof submission.accuracy !== "number" || !Number.isFinite(submission.accuracy) || Math.abs(computedAccuracy - submission.accuracy) > 1e-9) throw new Error("CALIBRATION_ACCURACY_MISMATCH");
  if (!Array.isArray(submission.evidenceRefs) || submission.evidenceRefs.length === 0 || submission.evidenceRefs.some((reference) => typeof reference !== "string" || !reference.trim())) throw new Error("CALIBRATION_EVIDENCE_REFERENCE_REQUIRED");
  if (submission.evidenceRefs.some((reference) => !isTraceableEvidenceReference(reference))) throw new Error("CALIBRATION_EVIDENCE_REFERENCE_INVALID");
  if (typeof submission.minimumAccuracy !== "number" || !Number.isFinite(submission.minimumAccuracy) || submission.minimumAccuracy < 0 || submission.minimumAccuracy > 1) throw new Error("CALIBRATION_THRESHOLD_INVALID");
  const submissionIdentity = { evaluatorVersion: submission.evaluatorVersion, sourceKind: submission.sourceKind, holdoutInputFingerprint: submission.holdoutInputFingerprint, evaluatedCount: submission.evaluatedCount, correctCount: submission.correctCount, accuracy: submission.accuracy, minimumAccuracy: submission.minimumAccuracy, attestation: submission.attestation, evidenceRefs: [...submission.evidenceRefs].sort() };
  const calibrationId = `quality-calibration-external-${crypto.createHash("sha256").update(JSON.stringify(submissionIdentity)).digest("hex").slice(0, 32)}`;
  const existing = (await readQualityCalibrationEvidenceHistory(root)).find((candidate) => candidate.calibrationId === calibrationId);
  if (existing) return existing;
  const base = {
    schemaVersion: "quality-calibration-evidence.v1" as const,
    calibrationId,
    evaluatorVersion: submission.evaluatorVersion,
    sourceKind: submission.sourceKind,
    split: "holdout" as const,
    caseIds: [],
    inputFingerprint: submission.holdoutInputFingerprint,
    evaluatedCount: submission.evaluatedCount,
    correctCount: submission.correctCount,
    accuracy: submission.accuracy,
    minimumAccuracy: submission.minimumAccuracy,
    status: submission.accuracy >= submission.minimumAccuracy ? "calibrated" as const : "blocked" as const,
    canonGateEligible: false as const,
    labelAccess: "sealed-separate-from-evaluator-input" as const,
    attestation: submission.attestation,
    evidenceRefs: [...submission.evidenceRefs],
    createdAt: new Date().toISOString()
  };
  const evidence: QualityCalibrationEvidence = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  if (submission.persist !== false) {
    await writeJson(historyPath(root, evidence.calibrationId), evidence);
    await writeJson(evidencePath(root), evidence);
  }
  return evidence;
}

export function isQualityEvaluatorEligible(evidence: QualityCalibrationEvidence | null): boolean {
  return Boolean(evidence && evidence.status === "calibrated" && evidence.canonGateEligible === false && isQualityCalibrationEvidenceTrusted(evidence));
}
