import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { advanceBookRun, readBookRun, startBookRun } from "./bookRun.js";
import { evaluateBookRunClosure } from "./bookRunClosure.js";
import { issueClosureCertificate } from "./closureCertificate.js";
import { issueQuiescenceProof } from "./quiescenceProof.js";
import { runBookCompletionAudit } from "./completionAudit.js";
import { createMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { recordMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";
import { auditMilestoneRepair } from "./milestoneAudit.js";
import { readBookRunImpactSubgraph } from "./bookRunImpact.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function scopeCompleteFixture(): Promise<{ root: string; bookRunId: string; version: number }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-closure-"));
  const settlement = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: "2026-07-31T00:00:00.000Z" };
  await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-c1.json"), JSON.stringify({ ...settlement, fingerprint: hash(settlement) }), "utf8");
  const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
  const advanced = await advanceBookRun(root, run.bookRunId);
  return { root, bookRunId: run.bookRunId, version: advanced.run.version };
}

describe("book run closure readiness", () => {
  it("reports closure blocked until quiescence and closure certificate are current", async () => {
    const fixture = await scopeCompleteFixture();
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_blocked", reasons: expect.arrayContaining(["QUIESCENCE_PROOF_REQUIRED", "CLOSURE_CERTIFICATE_REQUIRED"]) });
    await issueQuiescenceProof(fixture.root, { bookRunId: fixture.bookRunId, runVersion: fixture.version });
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_blocked", reasons: expect.arrayContaining(["CLOSURE_CERTIFICATE_REQUIRED"]) });
  });

  it("reports closure ready only when current closure evidence is present", async () => {
    const fixture = await scopeCompleteFixture();
    await issueQuiescenceProof(fixture.root, { bookRunId: fixture.bookRunId, runVersion: fixture.version });
    const coverage = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-1", chapterIds: ["c1"], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-31T00:00:00.000Z" };
    await fs.mkdir(path.join(fixture.root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(fixture.root, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...coverage, fingerprint: hash(coverage) }), "utf8");
    await issueClosureCertificate(fixture.root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "canon-1" });
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_ready", reasons: [] });
  });

  it("keeps closure blocked until repair completion and milestone audit are both current", async () => {
    const fixture = await scopeCompleteFixture();
    const plan = await createMilestoneRepairPlan({ root: fixture.root, projectSlug: "demo", bookRunId: fixture.bookRunId, runVersion: fixture.version, sourceFingerprint: "canon-1", scopedChapterIds: ["c1"], issues: [{ kind: "obligation", targetId: "obl-1", reason: "repair required", evidenceRefs: ["audit://obl-1"] }] });
    await issueQuiescenceProof(fixture.root, { bookRunId: fixture.bookRunId, runVersion: fixture.version });
    const coverage = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-1", chapterIds: ["c1"], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-31T00:00:00.000Z" };
    await fs.mkdir(path.join(fixture.root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(fixture.root, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...coverage, fingerprint: hash(coverage) }), "utf8");
    await issueClosureCertificate(fixture.root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "canon-1" });
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_blocked", reasons: expect.arrayContaining(["MILESTONE_AUDIT_REQUIRED"]) });
    await recordMilestoneRepairCompletion({ root: fixture.root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: fixture.bookRunId, runVersion: fixture.version, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["repair://obl-1"] });
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_blocked", reasons: expect.arrayContaining(["MILESTONE_AUDIT_REQUIRED"]) });
    await auditMilestoneRepair({ root: fixture.root, planId: plan.planId, sourceFingerprint: "canon-1" });
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).resolves.toMatchObject({ state: "closure_ready", reasons: [] });
  });

  it("revokes audited_complete when the completion source fingerprint changes", async () => {
    const fixture = await scopeCompleteFixture();
    await issueQuiescenceProof(fixture.root, { bookRunId: fixture.bookRunId, runVersion: fixture.version });
    const coverage = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-1", chapterIds: ["c1"], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-31T00:00:00.000Z" };
    await fs.mkdir(path.join(fixture.root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(fixture.root, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...coverage, fingerprint: hash(coverage) }), "utf8");
    await issueClosureCertificate(fixture.root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "canon-1" });
    await runBookCompletionAudit(fixture.root, fixture.bookRunId, { sourceFingerprint: "canon-1" });
    expect((await evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-1")).state).toBe("audited_complete");
    await expect(evaluateBookRunClosure(fixture.root, fixture.bookRunId, "canon-2")).resolves.toMatchObject({ state: "closure_blocked", reasons: ["COMPLETION_AUDIT_STALE"] });
    expect((await readBookRun(fixture.root, fixture.bookRunId))?.status).toBe("repair_required");
    const impactFiles = await fs.readdir(path.join(fixture.root, "sessions/book-run-impact"));
    expect(impactFiles).toHaveLength(1);
    expect((await readBookRunImpactSubgraph(fixture.root, impactFiles[0].replace(/\.json$/, "")))?.affectedChapterIds).toEqual(["c1"]);
  });
});
