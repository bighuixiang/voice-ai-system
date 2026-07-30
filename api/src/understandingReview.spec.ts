import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintCreativeSession } from "./contextManifest.js";
import { executeModelUnderstanding } from "./understandingWorker.js";
import { ingestExternalUnderstandingReview, readUnderstandingReview, reviewUnderstandingSnapshot } from "./understandingReview.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("understanding independent review", () => {
  it("rejects an external review that is not bound to a persisted understanding snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-external-"));
    roots.push(root);
    await expect(ingestExternalUnderstandingReview(root, {
      reviewerKind: "provider",
      reviewerId: "provider-1",
      attestationReference: "attestation://provider-1/review-1",
      snapshotFingerprint: "a".repeat(64),
      checks: [
        { checkId: "source-fingerprint", detail: "verified" },
        { checkId: "evidence-spans", detail: "verified" },
        { checkId: "branch-separation", detail: "verified" },
        { checkId: "question-gate", detail: "verified" },
        { checkId: "canon-isolation", detail: "verified" }
      ],
      evidenceRefs: ["holdout://review-1"]
    })).rejects.toThrow("UNDERSTANDING_REVIEW_SNAPSHOT_NOT_FOUND");
  });

  it("fails closed when a persisted review fingerprint is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-integrity-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "understanding-review.json"), JSON.stringify({
      schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false,
      reviewer: { kind: "human", id: "reviewer-1", attestationReference: "attestation://review/1" }, fingerprint: "f".repeat(64)
    }), "utf8");
    await expect(readUnderstandingReview(root)).rejects.toThrow("UNDERSTANDING_REVIEW_INTEGRITY_FAILED");
  });

  it("persists an attested provider or human V2 review without authorizing canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-external-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "understanding-snapshot.json"), JSON.stringify({
      schemaVersion: "understanding-snapshot.v1",
      snapshotId: "snapshot-1",
      projectSlug: path.basename(root),
      mode: "shadow",
      sourceFingerprint: "b".repeat(64),
      sourceMessageIds: [],
      coreExplicit: [],
      inferred: [],
      unknowns: [],
      question: { id: "question-primary-desire", text: "Question", status: "candidate", impact: "high", source: "deterministic-gap" },
      modelCallIssued: false,
      canonWritten: false,
      createdAt: new Date().toISOString()
    }), "utf8");
    const review = await ingestExternalUnderstandingReview(root, {
      reviewerKind: "human",
      reviewerId: "reader-panel-01",
      attestationReference: "attestation://panel-01/review-001",
      snapshotFingerprint: "b".repeat(64),
      checks: [
        { checkId: "source-fingerprint", detail: "verified" },
        { checkId: "evidence-spans", detail: "verified" },
        { checkId: "branch-separation", detail: "verified" },
        { checkId: "question-gate", detail: "verified" },
        { checkId: "canon-isolation", detail: "verified" }
      ],
      evidenceRefs: ["holdout://review-001"],
      persist: true
    });
    expect(review).toMatchObject({
      status: "passed",
      canonWritten: false,
      reviewer: { kind: "human", id: "reader-panel-01", attestationReference: "attestation://panel-01/review-001" }
    });
    expect(await readUnderstandingReview(root)).toEqual(review);
  });

  it("rejects external review evidence without an evidence reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-external-"));
    roots.push(root);
    await expect(ingestExternalUnderstandingReview(root, {
      reviewerKind: "human",
      reviewerId: "reader-panel-01",
      attestationReference: "attestation://panel-01/review-001",
      snapshotFingerprint: "b".repeat(64),
      checks: [
        { checkId: "source-fingerprint", detail: "verified" },
        { checkId: "evidence-spans", detail: "verified" },
        { checkId: "branch-separation", detail: "verified" },
        { checkId: "question-gate", detail: "verified" },
        { checkId: "canon-isolation", detail: "verified" }
      ],
      evidenceRefs: []
    })).rejects.toThrow("UNDERSTANDING_REVIEW_EVIDENCE_REQUIRED");
  });

  it("rejects external review references that are only caller labels", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-external-"));
    roots.push(root);
    await expect(ingestExternalUnderstandingReview(root, {
      reviewerKind: "provider", reviewerId: "provider-1", attestationReference: "attestation://provider-1/review-1",
      snapshotFingerprint: "a".repeat(64), evidenceRefs: ["provider-proof-1"], checks: [
        { checkId: "source-fingerprint", detail: "ok" }, { checkId: "evidence-spans", detail: "ok" },
        { checkId: "branch-separation", detail: "ok" }, { checkId: "question-gate", detail: "ok" }, { checkId: "canon-isolation", detail: "ok" }
      ]
    })).rejects.toThrow("UNDERSTANDING_REVIEW_EVIDENCE_INVALID");
  });

  it("rejects an external review without a traceable attestation reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-external-"));
    roots.push(root);
    await expect(ingestExternalUnderstandingReview(root, {
      reviewerKind: "provider", reviewerId: "provider-1", attestationReference: "provider-review-1",
      snapshotFingerprint: "a".repeat(64), evidenceRefs: ["audit://provider/review-1"], checks: [
        { checkId: "source-fingerprint", detail: "ok" }, { checkId: "evidence-spans", detail: "ok" },
        { checkId: "branch-separation", detail: "ok" }, { checkId: "question-gate", detail: "ok" }, { checkId: "canon-isolation", detail: "ok" }
      ]
    })).rejects.toThrow("UNDERSTANDING_REVIEW_ATTESTATION_INVALID");
  });

  it("passes calibrated evidence and keeps the review non-canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-"));
    roots.push(root);
    const session = {
      schemaVersion: "creative-session.v1" as const,
      sessionId: "session-review-demo",
      projectSlug: "review-demo",
      status: "capturing" as const,
      messages: [{ id: "message-001", clientMessageId: "m1", role: "author" as const, text: "A witness hides the truth.", source: { kind: "author" as const }, createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "creative-session.json"), JSON.stringify(session), "utf8");
    const sourceFingerprint = fingerprintCreativeSession(session);
    await executeModelUnderstanding({
      root,
      projectSlug: "review-demo",
      sourceFingerprint,
      sourceMessageIds: ["message-001"],
      prompt: "Return a structured understanding.",
      agent: { command: "mock", label: "Mock", provider: "codex" }
    }, {
      run: async () => ({ stdout: "", stderr: "", exitCode: 0, finalMessage: JSON.stringify({
        coreExplicit: [{ id: "claim-1", text: "A witness hides the truth.", status: "explicit", evidence: [{ messageId: "message-001", start: 0, end: 24 }] }],
        inferred: [],
        unknowns: [],
        question: { id: "question-primary-desire", text: "What does the witness want?", status: "candidate", impact: "high", source: "model-gap" },
        interpretationSet: { schemaVersion: "seed-interpretation-set.v1", commonClaims: [], activeQuestionId: "question-primary-desire", interpretations: [
          { id: "a", label: "A", summary: "A", status: "candidate", differences: [], supportEvidence: [], counterEvidence: [], downstreamImpacts: [] },
          { id: "b", label: "B", summary: "B", status: "candidate", differences: [], supportEvidence: [], counterEvidence: [], downstreamImpacts: [] }
        ] }
      }), durationMs: 1 })
    });
    const review = await reviewUnderstandingSnapshot(root);
    expect(review).toMatchObject({ status: "passed", reviewer: { kind: "independent-deterministic" }, canonWritten: false, calibrationVersion: "understanding-calibration.v1" });
    expect(review?.checks.every((check) => check.status === "passed")).toBe(true);
    expect(await readUnderstandingReview(root)).toEqual(review);
  });

  it("blocks stale or unsupported evidence instead of certifying it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-review-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "creative-session.json"), JSON.stringify({ schemaVersion: "creative-session.v1", sessionId: "session-review-demo", projectSlug: "review-demo", status: "capturing", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), "utf8");
    await fs.writeFile(path.join(root, "sessions", "understanding-snapshot.json"), JSON.stringify({ schemaVersion: "understanding-snapshot.v1", snapshotId: "snapshot-1", projectSlug: "review-demo", mode: "model", sourceFingerprint: "a".repeat(64), sourceMessageIds: ["missing"], coreExplicit: [{ id: "claim", text: "unsupported", status: "explicit", evidence: [{ messageId: "missing", start: -1, end: 2 }] }], inferred: [], unknowns: [], question: { id: "question-primary-desire", text: "?", status: "candidate", impact: "high", source: "model-gap" }, modelCallIssued: true, canonWritten: false, createdAt: new Date().toISOString() }), "utf8");
    const review = await reviewUnderstandingSnapshot(root);
    expect(review).toMatchObject({ status: "blocked" });
    expect(review?.checks.filter((check) => check.status === "failed").map((check) => check.checkId)).toEqual(expect.arrayContaining(["source-fingerprint", "evidence-spans", "branch-separation"]));
  });
});
