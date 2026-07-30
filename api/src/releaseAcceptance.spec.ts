import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateReleaseAcceptance } from "./releaseAcceptance.js";
import crypto from "node:crypto";

const roots: string[] = [];
afterEach(async () => { delete process.env.NOVELS_ROOT; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("release acceptance gate", () => {
  it("returns do-not-activate with explicit missing evidence instead of inferring readiness", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision).toMatchObject({ status: "do-not-activate", releaseProfile: "RP5-drafting" });
    expect(decision.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: "migration-cutover", status: "missing" }),
      expect.objectContaining({ checkId: "external-calibration", status: "missing" }),
      expect.objectContaining({ checkId: "governed-e2e", status: "missing" }),
      expect.objectContaining({ checkId: "v2-independent-review", status: "missing" }),
      expect.objectContaining({ checkId: "delivery-proof", status: "missing" })
    ]));
  });

  it("keeps the acceptance fingerprint stable when evidence is unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-fingerprint-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;

    const first = await evaluateReleaseAcceptance();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await evaluateReleaseAcceptance();

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("does not treat deterministic understanding review as provider or human evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-deterministic-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({
      status: "passed",
      canonWritten: false,
      reviewer: { kind: "independent-deterministic", id: "local" }
    }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not accept an attested-looking review without its persisted snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-snapshot-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      snapshotFingerprint: "a".repeat(64), reviewer: { kind: "human", id: "reviewer-1", attestationReference: "attestation://review/1" }
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not treat untraceable calibration labels as external evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-untraceable-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "demo", "sessions", "quality-calibration-evidence.json"), JSON.stringify({
      status: "calibrated", sourceKind: "provider", attestation: { kind: "provider-signed", reference: "provider-1" }, evidenceRefs: ["caller-label"]
    }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "external-calibration")).toMatchObject({ status: "missing" });
  });

  it("does not accept a tampered calibrated artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-tampered-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "demo", "sessions", "quality-calibration-evidence.json"), JSON.stringify({
      status: "calibrated", sourceKind: "provider", attestation: { kind: "provider-signed", reference: "attestation://provider/1" }, evidenceRefs: ["audit://provider/1"], fingerprint: "f".repeat(64)
    }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "external-calibration")).toMatchObject({ status: "missing" });
  });

  it("does not accept a validly hashed but semantically invalid calibration artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-semantic-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-semantic", evaluatorVersion: "human-v1", sourceKind: "human", split: "holdout", caseIds: [], inputFingerprint: "holdout-1", evaluatedCount: 10, correctCount: 5, accuracy: 0.5, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://provider/wrong-kind" }, evidenceRefs: ["audit://calibration/1"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "external-calibration")).toMatchObject({ status: "missing" });
  });

  it("does not accept calibration evidence outside the sealed holdout contract", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-calibration-split-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-training", evaluatorVersion: "human-v1", sourceKind: "human", split: "training", caseIds: [], inputFingerprint: "holdout-1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "human-reviewed", reference: "attestation://human/1" }, evidenceRefs: ["audit://calibration/1"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "external-calibration")).toMatchObject({ status: "missing" });
  });

  it("does not accept an independent review without a traceable attestation reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-reference-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      reviewer: { kind: "human", id: "reviewer-1", attestationReference: "reviewer-note-1" }
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not accept an unrecognized reviewer kind as independent evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-kind-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      reviewer: { kind: "automated-provider", id: "reviewer-1", attestationReference: "attestation://review/1" }
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not accept independent review evidence with an unknown schema", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-schema-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "review.v0", status: "passed", canonWritten: false,
      reviewer: { kind: "human", id: "reviewer-1", attestationReference: "attestation://review/1" }
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not accept an independent review without reviewer identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-id-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      reviewer: { kind: "provider", id: "", attestationReference: "attestation://review/1" }
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not accept a signed review with incomplete independent checks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-review-checks-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const snapshot = { schemaVersion: "understanding-snapshot.v1", canonWritten: false, sourceFingerprint: "a".repeat(64) };
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-snapshot.json"), JSON.stringify(snapshot), "utf8");
    const base = {
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      snapshotFingerprint: snapshot.sourceFingerprint,
      reviewer: { kind: "human", id: "reviewer-1", attestationReference: "attestation://review/1" },
      checks: [], evidenceRefs: ["audit://review/1"]
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "understanding-review.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;

    const decision = await evaluateReleaseAcceptance();

    expect(decision.checks.find((check) => check.checkId === "v2-independent-review")).toMatchObject({ status: "missing" });
  });

  it("does not count calibration evidence stored under an orphan directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-orphan-project-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "orphan", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "orphan-calibration", evaluatorVersion: "provider-v1", sourceKind: "provider", split: "holdout", caseIds: [], inputFingerprint: "holdout-1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://provider/orphan" }, evidenceRefs: ["audit://provider/orphan"], createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "orphan", "sessions", "quality-calibration-evidence.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;

    const decision = await evaluateReleaseAcceptance();

    expect(decision.checks.find((check) => check.checkId === "external-calibration")).toMatchObject({ status: "missing" });
  });

  it("does not accept governed E2E evidence with an unknown schema", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-e2e-schema-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "release-e2e.v0", status: "verified", projectSlug: "demo", chapterId: "c1",
      settlementId: "settlement-1", derivedTransactionId: "derived-1", settlementFingerprint: "a".repeat(64), derivedFingerprint: "b".repeat(64), verifiedAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "release-e2e-acceptance.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "governed-e2e")).toMatchObject({ status: "missing" });
  });

  it("does not accept governed E2E evidence without binding identities and fingerprints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-e2e-binding-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = { schemaVersion: "release-e2e-acceptance.v1", status: "verified" };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "release-e2e-acceptance.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "governed-e2e")).toMatchObject({ status: "missing" });
  });

  it("does not accept governed E2E evidence with an invalid verification timestamp", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-e2e-time-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "release-e2e-acceptance.v1", status: "verified", projectSlug: "demo", chapterId: "c1", settlementId: "settlement-1", derivedTransactionId: "derived-1", settlementFingerprint: "a".repeat(64), derivedFingerprint: "b".repeat(64), verifiedAt: "not-a-timestamp"
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "release-e2e-acceptance.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    expect(decision.checks.find((check) => check.checkId === "governed-e2e")).toMatchObject({ status: "missing" });
  });

  it("does not accept a self-hashed E2E claim when its settlement and publication are absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-e2e-orphan-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    const base = {
      schemaVersion: "release-e2e-acceptance.v1", status: "verified", projectSlug: "demo", chapterId: "c1",
      settlementId: "settlement-missing", derivedTransactionId: "derived-missing",
      settlementFingerprint: "a".repeat(64), derivedFingerprint: "b".repeat(64), verifiedAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(path.join(root, "demo", "sessions", "release-e2e-acceptance.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    process.env.NOVELS_ROOT = root;

    const decision = await evaluateReleaseAcceptance();

    expect(decision.checks.find((check) => check.checkId === "governed-e2e")).toMatchObject({ status: "missing" });
  });
});
