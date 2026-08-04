import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertReleaseAcceptanceIntegrity, evaluateReleaseAcceptance, persistReleaseAcceptance, readPersistedReleaseAcceptance } from "./releaseAcceptance.js";
import crypto from "node:crypto";

const roots: string[] = [];
afterEach(async () => { delete process.env.NOVELS_ROOT; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("release acceptance gate", () => {
  it("persists an integrity-checked acceptance decision and is idempotent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-persisted-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    const first = await persistReleaseAcceptance(root, decision);
    const second = await persistReleaseAcceptance(root, { ...decision, evaluatedAt: new Date(Date.now() + 1000).toISOString() });
    expect(second).toEqual(first);
    await expect(readPersistedReleaseAcceptance(root)).resolves.toEqual(first);
  });

  it("fails closed when the persisted acceptance fingerprint is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-tamper-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const decision = await evaluateReleaseAcceptance();
    await persistReleaseAcceptance(root, decision);
    const target = path.join(root, "release-acceptance.json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.fingerprint = "f".repeat(64);
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(readPersistedReleaseAcceptance(root)).rejects.toThrow("RELEASE_ACCEPTANCE_CORRUPT");
  });

  it("rejects a rehashed acceptance decision with malformed checks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-semantic-"));
    roots.push(root);
    const base = {
      schemaVersion: "release-acceptance.v1", releaseProfile: "RP5-drafting", status: "accepted",
      checks: [{ checkId: "not-a-real-check", status: "passed", evidence: [], reason: " forged " }],
      evaluatedAt: new Date().toISOString()
    };
    const { evaluatedAt: _evaluatedAt, ...stableBase } = base;
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(stableBase)).digest("hex");
    await fs.writeFile(path.join(root, "release-acceptance.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readPersistedReleaseAcceptance(root)).rejects.toThrow("RELEASE_ACCEPTANCE_CORRUPT");
  });

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

  it("rejects a rehashed accepted decision with any missing check", () => {
    const base = { schemaVersion: "release-acceptance.v1" as const, releaseProfile: "RP5-drafting" as const, status: "accepted" as const, checks: [
      { checkId: "migration-cutover" as const, status: "missing" as const, evidence: [], reason: "missing" },
      { checkId: "external-calibration" as const, status: "passed" as const, evidence: [], reason: "ok" },
      { checkId: "governed-e2e" as const, status: "passed" as const, evidence: [], reason: "ok" },
      { checkId: "v2-independent-review" as const, status: "passed" as const, evidence: [], reason: "ok" },
      { checkId: "delivery-proof" as const, status: "passed" as const, evidence: [], reason: "ok" }
    ], evaluatedAt: new Date().toISOString() };
    const stable = { ...base, evaluatedAt: undefined };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ ...stable, evaluatedAt: undefined })).digest("hex");
    expect(() => assertReleaseAcceptanceIntegrity({ ...base, fingerprint })).toThrow("RELEASE_ACCEPTANCE_INTEGRITY_FAILED");
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

  it("does not accept a self-hashed calibration artifact with duplicate holdout cases", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-calibration-duplicate-cases-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "demo", "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "demo", "project.json"), JSON.stringify({ slug: "demo", chapters: [] }), "utf8");
    const base = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-duplicate-cases", evaluatorVersion: "provider-v1", sourceKind: "provider", split: "holdout", caseIds: ["case-1", "case-1"], inputFingerprint: "holdout-1", evaluatedCount: 2, correctCount: 2, accuracy: 1, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://provider/duplicate-cases" }, evidenceRefs: ["audit://provider/duplicate-cases"], createdAt: new Date().toISOString()
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

  it("does not accept a byte-valid delivery proof when its edition has no current CanonCommit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-canon-binding-"));
    roots.push(root);
    const projectRoot = path.join(root, "demo");
    const publicationRoot = path.join(projectRoot, "sessions", "publication-editions");
    await fs.mkdir(publicationRoot, { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "demo", chapters: [] }), "utf8");
    const manifestBase = { schemaVersion: "edition-manifest.v1", editionId: "edition-canon-binding", projectSlug: "demo", canonCommitFingerprint: "a".repeat(64), title: "Demo", author: "Author", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [], publicationTreeFingerprint: "tree-fingerprint", createdAt: "2026-08-04T00:00:00.000Z" };
    const manifestFingerprint = crypto.createHash("sha256").update(JSON.stringify(manifestBase)).digest("hex");
    await fs.writeFile(path.join(publicationRoot, "edition-canon-binding.json"), JSON.stringify({ ...manifestBase, fingerprint: manifestFingerprint }));
    const treeBase = { schemaVersion: "publication-tree.v1", editionId: "edition-canon-binding", projectSlug: "demo", readerSafe: true, chapters: [] };
    const treeFingerprint = crypto.createHash("sha256").update(JSON.stringify(treeBase)).digest("hex");
    await fs.writeFile(path.join(publicationRoot, "edition-canon-binding.tree.json"), JSON.stringify({ ...treeBase, fingerprint: treeFingerprint }));
    const artifactBase = { schemaVersion: "publication-artifact-set.v1", artifactSetId: "artifacts-canon-binding", editionId: "edition-canon-binding", projectSlug: "demo", manifestFingerprint, treeFingerprint, status: "validated", artifacts: [], createdAt: "2026-08-04T00:00:00.000Z" };
    const artifactFingerprint = crypto.createHash("sha256").update(JSON.stringify(artifactBase)).digest("hex");
    await fs.writeFile(path.join(publicationRoot, "edition-canon-binding.artifacts.json"), JSON.stringify({ ...artifactBase, fingerprint: artifactFingerprint }));
    const proofBase = { schemaVersion: "delivery-proof.v1", proofId: "proof-canon-binding", editionId: "edition-canon-binding", projectSlug: "demo", manifestFingerprint, treeFingerprint, artifactSetFingerprint: artifactFingerprint, artifactHashes: [], approvalId: "author-release", approverKind: "author", status: "issued", issuedAt: "2026-08-04T00:00:00.000Z" };
    const proofFingerprint = crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex");
    await fs.writeFile(path.join(publicationRoot, "edition-canon-binding.delivery-proof.json"), JSON.stringify({ ...proofBase, fingerprint: proofFingerprint }));
    process.env.NOVELS_ROOT = root;

    const decision = await evaluateReleaseAcceptance();

    expect(decision.checks.find((check) => check.checkId === "delivery-proof")).toMatchObject({ status: "missing" });
  });

  it("fails closed and continues when a candidate edition manifest is malformed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-acceptance-malformed-edition-"));
    roots.push(root);
    const projectRoot = path.join(root, "demo");
    const publicationRoot = path.join(projectRoot, "sessions", "publication-editions");
    await fs.mkdir(publicationRoot, { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "demo", chapters: [] }), "utf8");
    await fs.writeFile(path.join(publicationRoot, "broken.json"), "{\"schemaVersion\":\"edition-manifest.v1\",\"fingerprint\":\"forged\"}", "utf8");
    await fs.writeFile(path.join(publicationRoot, "broken.delivery-proof.json"), JSON.stringify({ schemaVersion: "delivery-proof.v1" }), "utf8");
    process.env.NOVELS_ROOT = root;

    const decision = await evaluateReleaseAcceptance();

    expect(decision.checks.find((check) => check.checkId === "delivery-proof")).toMatchObject({ status: "missing" });
  });
});
