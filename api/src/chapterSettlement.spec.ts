import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { adoptProseCandidate } from "./proseAdoption.js";
import { createProseCandidate } from "./proseCandidate.js";
import { assertChapterSettlementIntegrity, hasSettledChapterSettlement, readChapterSettlement, settleChapter } from "./chapterSettlement.js";
import { createBookWorkGraph, readBookWorkGraph, refreshBookWorkGraph } from "./bookWorkGraph.js";
import { recordChapterSettlementProjectionClosure } from "./chapterSettlementProjectionClosure.js";
import { attachQualityReportEvidence } from "./qualityReportEvidence.js";
import { evaluateQualityGate, persistQualityGateDecision } from "./qualityGateDecision.js";
import type { ChapterQualityReport } from "./types.js";
import { createChapterExecutionProof } from "./chapterExecutionProof.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-settlement-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.writeFile(path.join(root, "chapters", "c1.md"), "old canon\n", "utf8");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new candidate", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const expected = crypto.createHash("sha256").update("old canon\n").digest("hex");
  const transaction = await adoptProseCandidate({ root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: expected, authorizationId: "author-1" });
  return { root, transaction };
}

describe("chapter settlement", () => {
  it("exposes only an integrity-checked settled chapter as canon evidence", async () => {
    const { root, transaction } = await fixture();
    expect(await hasSettledChapterSettlement(root, "demo", "c1")).toBe(false);
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" });
    expect(await hasSettledChapterSettlement(root, "demo", "c1")).toBe(true);
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${settlement.settlementId}.json`), JSON.stringify({ ...settlement, fingerprint: "f".repeat(64) }), "utf8");
    await expect(hasSettledChapterSettlement(root, "demo", "c1")).resolves.toBe(false);
  });

  it("settles only the committed adopted content and is idempotent", async () => {
    const { root, transaction } = await fixture();
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    const input = { root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" };
    const settlement = await settleChapter(input);
    expect(settlement.status).toBe("settled");
    expect(settlement.nextAction).toBe("schedule_dependency_ready_work");
    expect((await settleChapter(input)).fingerprint).toBe(settlement.fingerprint);
    expect(await readChapterSettlement(root, settlement.settlementId)).toEqual(settlement);
    expect((await readBookWorkGraph(root))?.workItems.map((item) => item.status)).toEqual(["ready", "blocked"]);
    await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, derivedTransactionId: "derived-c1", derivedFingerprint: "b".repeat(64) });
    expect((await refreshBookWorkGraph(root)).workItems.map((item) => item.status)).toEqual(["completed", "ready"]);
  });
  it("rejects an existing settlement when the replay project scope conflicts", async () => {
    const { root, transaction } = await fixture();
    const input = { root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" };
    await settleChapter(input);
    await expect(settleChapter({ ...input, projectSlug: "other" })).rejects.toThrow("CHAPTER_SETTLEMENT_CONFLICT");
  });
  it("does not hide canon drift on a settlement replay", async () => {
    const { root, transaction } = await fixture();
    const input = { root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" };
    await settleChapter(input);
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "drifted canon\n", "utf8");
    await expect(settleChapter(input)).rejects.toThrow("CHAPTER_SETTLEMENT_CONTENT_STALE");
  });

  it("persists the complete settlement evidence bundle and fails closed in strict mode", async () => {
    const missing = await fixture();
    await expect(settleChapter({ root: missing.root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: missing.transaction.transactionId, targetPath: "chapters/c1.md", strictEvidence: true })).rejects.toThrow("CHAPTER_SETTLEMENT_EVIDENCE_REQUIRED");
    const { root, transaction } = await fixture();
    const evidence = {
      summaryRef: "recap://c1",
      obligationDeltaRef: "obligation-delta://c1",
      projectionRef: "projection://c1",
      feedbackRef: "feedback://c1",
      costRef: "cost://c1"
    };
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", strictEvidence: true, evidence });
    expect(settlement.evidence).toMatchObject({ adoptionReceiptRef: expect.stringContaining("sessions/prose-adoption"), ...evidence });
    expect(settlement.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds a settlement to the chapter execution proof when supplied", async () => {
    const { root, transaction } = await fixture();
    const proof = await createChapterExecutionProof(root, { projectSlug: "demo", chapterId: "c1", planId: "plan-1", planFingerprint: "a".repeat(64), parentExecutionReadyProofFingerprint: "b".repeat(64), contextFingerprint: "c".repeat(64) });
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", chapterExecutionProofId: proof.proofId, chapterExecutionProofFingerprint: proof.fingerprint });
    expect(settlement).toMatchObject({ chapterExecutionProofId: proof.proofId, chapterExecutionProofFingerprint: proof.fingerprint });
    await fs.rm(path.join(root, "sessions", "chapter-settlements", `${settlement.settlementId}.json`));
    await expect(settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", chapterExecutionProofId: proof.proofId, chapterExecutionProofFingerprint: "d".repeat(64) })).rejects.toThrow("CHAPTER_SETTLEMENT_EXECUTION_PROOF_STALE");
  });

  it("discovers durable summary and author-feedback evidence when available", async () => {
    const { root, transaction } = await fixture();
    await fs.mkdir(path.join(root, "memory", "chapter-summaries"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "chapter-summaries", "c1.json"), JSON.stringify({ chapterId: "c1", summary: "settled" }), "utf8");
    await fs.mkdir(path.join(root, "sessions", "author-feedback"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "author-feedback", "feedback.json"), JSON.stringify({ adoptionTransactionId: transaction.transactionId, fingerprint: "evidence" }), "utf8");
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" });
    expect(settlement.evidence).toMatchObject({ summaryRef: "memory/chapter-summaries/c1.json", feedbackRef: "sessions/author-feedback/feedback.json" });
  });

  it("can satisfy strict settlement from durable obligation, projection, and cost ledgers", async () => {
    const { root, transaction } = await fixture();
    await fs.mkdir(path.join(root, "memory", "chapter-summaries"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "chapter-summaries", "c1.json"), "{}", "utf8");
    await fs.mkdir(path.join(root, "sessions", "author-feedback"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "author-feedback", "feedback.json"), JSON.stringify({ adoptionTransactionId: transaction.transactionId, fingerprint: "feedback" }), "utf8");
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "obligations", "coverage-certificate.json"), "{}", "utf8");
    await fs.mkdir(path.join(root, "sessions", "derived-publications"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "derived-publications", "projection.json"), JSON.stringify({ chapterId: "c1", settlementId: `settlement-c1-${transaction.transactionId}`, status: "committed" }), "utf8");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "model-invocations.jsonl"), "{}\n", "utf8");
    await expect(settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", strictEvidence: true })).resolves.toMatchObject({ evidence: { obligationDeltaRef: "sessions/obligations/coverage-certificate.json", projectionRef: "sessions/derived-publications/projection.json", costRef: "sessions/model-invocations.jsonl" } });
  });

  it("blocks settlement when adopted content is changed after commit", async () => {
    const { root, transaction } = await fixture();
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "tampered\n", "utf8");
    await expect(settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" })).rejects.toThrow("CHAPTER_SETTLEMENT_CONTENT_STALE");
  });

  it("requires a persisted current passed quality gate when settlement declares one", async () => {
    const { root, transaction } = await fixture();
    const report: ChapterQualityReport = { chapterId: "c1", overallScore: 95, summary: "ok", metrics: [], strengths: ["voice"], fixes: [], updatedAt: new Date().toISOString() };
    const evidenced = attachQualityReportEvidence(report, { content: "new candidate", sourceFingerprint: "source-1", evaluatorVersion: "quality-review.v1", mode: "hybrid" });
    const decision = evaluateQualityGate({ projectSlug: "demo", report: evidenced, content: "new candidate", sourceFingerprint: "source-1", riskTier: "ordinary", hardGuards: { canon: true }, authorObjectiveSupported: true, protectedStrengthsPreserved: true, independentEvidenceRequired: false, authorizationRef: "author-1", evidenceRefs: ["review://1"] });
    await persistQualityGateDecision(root, decision);
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", qualityGateDecisionId: decision.decisionId, qualityGateSourceFingerprint: "source-1" });
    expect(settlement.status).toBe("settled");
  });

  it("blocks blocked or stale quality gates before settlement", async () => {
    const { root, transaction } = await fixture();
    const report = attachQualityReportEvidence({ chapterId: "c1", overallScore: 95, summary: "ok", metrics: [], strengths: [], fixes: [], updatedAt: new Date().toISOString() }, { content: "new candidate", sourceFingerprint: "source-1", evaluatorVersion: "quality-review.v1", mode: "hybrid" });
    const decision = evaluateQualityGate({ projectSlug: "demo", report, content: "new candidate", sourceFingerprint: "source-1", riskTier: "ordinary", hardGuards: { canon: false }, authorObjectiveSupported: true, protectedStrengthsPreserved: true, independentEvidenceRequired: false, authorizationRef: "author-1", evidenceRefs: ["review://1"] });
    await persistQualityGateDecision(root, decision);
    await expect(settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md", qualityGateDecisionId: decision.decisionId, qualityGateSourceFingerprint: "source-1" })).rejects.toThrow("QUALITY_GATE_NOT_SETTLED");
  });

  it("fails closed when the durable settlement is tampered", async () => {
    const { root, transaction } = await fixture();
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" });
    const target = path.join(root, "sessions", "chapter-settlements", `${settlement.settlementId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.nextAction = "manual_review";
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    await expect(readChapterSettlement(root, settlement.settlementId)).rejects.toThrow("CHAPTER_SETTLEMENT_INTEGRITY_FAILED");
  });

  it("rejects a re-signed settlement with inconsistent status and next action", async () => {
    const { root, transaction } = await fixture();
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" });
    const target = path.join(root, "sessions", "chapter-settlements", settlement.settlementId + ".json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "settled", nextAction: "manual_review" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readChapterSettlement(root, settlement.settlementId)).rejects.toThrow("CHAPTER_SETTLEMENT_SEMANTIC_INVALID");
  });
  it("rejects a re-signed settlement with an invalid createdAt timestamp", async () => {
    const { root, transaction } = await fixture();
    const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" });
    const target = path.join(root, "sessions", "chapter-settlements", settlement.settlementId + ".json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, createdAt: "not-a-timestamp" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readChapterSettlement(root, settlement.settlementId)).rejects.toThrow("CHAPTER_SETTLEMENT_SEMANTIC_INVALID");
  });
  it("exposes the same integrity boundary for direct settlement audits", async () => { const { root, transaction } = await fixture(); const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" }); expect(assertChapterSettlementIntegrity(settlement, settlement.settlementId)).toEqual(settlement); });
});
