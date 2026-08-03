import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateQualityCalibration, ingestExternalCalibrationSubmission, isQualityEvaluatorEligible, readQualityCalibrationEvidence, readQualityCalibrationEvidenceHistory } from "./qualityCalibration.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("quality evaluator calibration", () => {
  it("blocks an evaluator below the holdout threshold and persists no canon authority", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    const evidence = await evaluateQualityCalibration(root, {
      evaluatorVersion: "provider-v2",
      sourceKind: "provider",
      holdoutInputFingerprint: "holdout-fingerprint-1",
      observations: [{ caseId: "h1", predicted: "pass" }, { caseId: "h2", predicted: "pass" }],
      sealedLabels: { h1: "pass", h2: "fail" },
      minimumAccuracy: 1
    });
    expect(evidence).toMatchObject({ split: "holdout", status: "blocked", accuracy: 0.5, canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input" });
    expect(isQualityEvaluatorEligible(evidence)).toBe(false);
    expect(await readQualityCalibrationEvidence(root)).toEqual(evidence);
  });

  it("accepts calibrated human evidence only as an experimental evaluator capability", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    const evidence = await evaluateQualityCalibration(root, {
      evaluatorVersion: "human-rubric-v1",
      sourceKind: "human",
      holdoutInputFingerprint: "holdout-fingerprint-2",
      observations: [{ caseId: "h1", predicted: "fail" }, { caseId: "h2", predicted: "pass" }],
      sealedLabels: { h1: "fail", h2: "pass" }
    });
    expect(evidence.status).toBe("calibrated");
    expect(evidence.canonGateEligible).toBe(false);
    expect(isQualityEvaluatorEligible(evidence)).toBe(true);
  });

  it("ingests externally attested provider evidence without accepting caller-supplied labels", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    const evidence = await ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "provider-v3",
      sourceKind: "provider",
      holdoutInputFingerprint: "sealed-suite-v3",
      evaluatedCount: 10,
      correctCount: 9,
      accuracy: 0.9,
      minimumAccuracy: 0.8,
      attestation: { kind: "provider-signed", reference: "attestation://provider/42" },
      evidenceRefs: ["audit://provider-attestation-42"]
    });
    expect(evidence).toMatchObject({ status: "calibrated", attestation: { kind: "provider-signed" }, evidenceRefs: ["audit://provider-attestation-42"], caseIds: [] });
    expect(isQualityEvaluatorEligible(evidence)).toBe(true);
  });

  it("rejects an external submission whose aggregate accuracy cannot be reproduced", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "human-v2", sourceKind: "human", holdoutInputFingerprint: "sealed-suite-v2",
      evaluatedCount: 3, correctCount: 2, accuracy: 1, minimumAccuracy: 0.8,
      attestation: { kind: "human-reviewed", reference: "attestation://human/1" }, evidenceRefs: []
    })).rejects.toThrow("CALIBRATION_ACCURACY_MISMATCH");
  });

  it("rejects non-integral or non-finite external aggregate counts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-counts-")); roots.push(root);
    const base = {
      evaluatorVersion: "provider-counts-v1", sourceKind: "provider" as const, holdoutInputFingerprint: "sealed-counts",
      evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8,
      attestation: { kind: "provider-signed" as const, reference: "attestation://provider/counts" }, evidenceRefs: ["audit://provider/counts"]
    };
    await expect(ingestExternalCalibrationSubmission(root, { ...base, evaluatedCount: 10.5 as never, correctCount: 9.45 as never })).rejects.toThrow("CALIBRATION_COUNTS_INVALID");
    await expect(ingestExternalCalibrationSubmission(root, { ...base, evaluatedCount: Number.NaN, correctCount: 9, accuracy: Number.NaN })).rejects.toThrow("CALIBRATION_COUNTS_INVALID");
  });

  it("rejects calibrated evidence without traceable attestation and evidence references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "human-v3", sourceKind: "human", holdoutInputFingerprint: "sealed-suite-v3",
      evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8,
      attestation: { kind: "human-reviewed", reference: "attestation://human/3" }, evidenceRefs: []
    })).rejects.toThrow("CALIBRATION_EVIDENCE_REFERENCE_REQUIRED");
  });

  it("rejects evidence references that are only caller labels", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "provider-v4", sourceKind: "provider", holdoutInputFingerprint: "sealed-suite-v4",
      evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8,
      attestation: { kind: "provider-signed", reference: "attestation://provider/4" }, evidenceRefs: ["provider-proof-4"]
    })).rejects.toThrow("CALIBRATION_EVIDENCE_REFERENCE_INVALID");
  });

  it("rejects caller labels or mismatched/non-traceable attestation references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-")); roots.push(root);
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "provider-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      attestation: { kind: "human-reviewed", reference: "attestation://human/1" }, evidenceRefs: ["audit://human/1"]
    })).rejects.toThrow("CALIBRATION_ATTESTATION_KIND_MISMATCH");
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "provider-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      attestation: { kind: "provider-signed", reference: "provider-unsigned-1" }, evidenceRefs: ["audit://provider/1"]
    })).rejects.toThrow("CALIBRATION_ATTESTATION_REFERENCE_INVALID");
  });

  it("rejects malformed external submission kinds before dereferencing attestation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-malformed-")); roots.push(root);
    await expect(ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "bad-kind", sourceKind: "synthetic" as never, holdoutInputFingerprint: "holdout", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      attestation: undefined as never, evidenceRefs: ["audit://malformed/1"]
    })).rejects.toThrow("CALIBRATION_SOURCE_KIND_INVALID");
  });

  it("keeps external calibration submissions append-only and idempotent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-history-")); roots.push(root);
    const submission = { evaluatorVersion: "provider-history-v1", sourceKind: "provider" as const, holdoutInputFingerprint: "sealed-history", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed" as const, reference: "attestation://provider/history" }, evidenceRefs: ["audit://provider/history"] };
    const first = await ingestExternalCalibrationSubmission(root, submission);
    const second = await ingestExternalCalibrationSubmission(root, submission);
    expect(second).toEqual(first);
    await expect(readQualityCalibrationEvidenceHistory(root)).resolves.toHaveLength(1);
    const changed = await ingestExternalCalibrationSubmission(root, { ...submission, correctCount: 8, accuracy: 0.8, evidenceRefs: ["audit://provider/history-2"] });
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    await expect(readQualityCalibrationEvidenceHistory(root)).resolves.toHaveLength(2);
    await expect(readQualityCalibrationEvidence(root)).resolves.toMatchObject({ fingerprint: changed.fingerprint });
  });

  it("fails closed when persisted external calibration evidence is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-tampered-")); roots.push(root);
    const evidence = await ingestExternalCalibrationSubmission(root, {
      evaluatorVersion: "provider-tamper-v1", sourceKind: "provider", holdoutInputFingerprint: "sealed-tamper", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8,
      attestation: { kind: "provider-signed", reference: "attestation://provider/tamper" }, evidenceRefs: ["audit://provider/tamper"]
    });
    const target = path.join(root, "sessions", "quality-calibration-evidence.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.accuracy = 1;
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(readQualityCalibrationEvidence(root)).rejects.toThrow("CALIBRATION_EVIDENCE_INTEGRITY_FAILED");
    expect(evidence.status).toBe("calibrated");
  });

  it("fails closed when calibration history contains a validly hashed but semantically invalid record", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-history-semantic-")); roots.push(root);
    const directory = path.join(root, "sessions", "quality-calibration");
    await fs.mkdir(directory, { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "history-invalid", evaluatorVersion: "provider-history", sourceKind: "rogue",
      split: "holdout", caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://history-invalid" }, evidenceRefs: ["audit://history-invalid"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(directory, "history-invalid.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readQualityCalibrationEvidenceHistory(root)).rejects.toThrow("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });

  it("fails closed when a validly hashed calibration artifact has invalid semantics", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-semantic-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-invalid", evaluatorVersion: "provider-v1", sourceKind: "rogue",
      split: "holdout", caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://provider/invalid" }, evidenceRefs: ["audit://provider/invalid"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readQualityCalibrationEvidence(root)).rejects.toThrow("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });

  it("rejects a rehashed calibration artifact with an invalid creation timestamp", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-timestamp-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-timestamp", evaluatorVersion: "provider-v1", sourceKind: "provider",
      split: "holdout", caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://provider/timestamp" }, evidenceRefs: ["audit://provider/timestamp"], createdAt: "not-a-timestamp"
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readQualityCalibrationEvidence(root)).rejects.toThrow("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });

  it("fails closed when calibration history filename does not match calibration identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-history-filename-")); roots.push(root);
    const directory = path.join(root, "sessions", "quality-calibration");
    await fs.mkdir(directory, { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-real", evaluatorVersion: "provider-v1", sourceKind: "provider",
      split: "holdout", caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://provider/history-filename" }, evidenceRefs: ["audit://provider/history-filename"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(directory, "calibration-other.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readQualityCalibrationEvidenceHistory(root)).rejects.toThrow("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });

  it("does not grant evaluator eligibility from a forged in-memory calibrated object", () => {
    const forged = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "forged", evaluatorVersion: "provider-forged", sourceKind: "provider", split: "holdout",
      caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8, status: "calibrated",
      canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://forged" },
      evidenceRefs: ["audit://forged"], createdAt: new Date().toISOString(), fingerprint: "f".repeat(64)
    } as never;
    expect(isQualityEvaluatorEligible(forged)).toBe(false);
  });

  it("rejects a rehashed artifact with missing calibration identity fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-calibration-identity-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "", evaluatorVersion: "", sourceKind: "provider",
      split: "holdout", caseIds: [], inputFingerprint: "", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://provider/identity" }, evidenceRefs: ["audit://provider/identity"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readQualityCalibrationEvidence(root)).rejects.toThrow("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });
});
