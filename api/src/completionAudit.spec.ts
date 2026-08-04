import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startBookRun, advanceBookRun, readBookRun, refreshBookRunWorkGraphPointer } from "./bookRun.js";
import { issueClosureCertificate } from "./closureCertificate.js";
import { issueQuiescenceProof } from "./quiescenceProof.js";
import { runBookCompletionAudit } from "./completionAudit.js";
import { readBookRunImpactSubgraph } from "./bookRunImpact.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "completion-audit-")); }

async function settledFixture(root: string): Promise<void> {
  const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: "2026-07-30T00:00:00.000Z" };
  await fs.mkdir(path.join(root, "sessions/chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions/chapter-settlements/settlement-c1.json"), JSON.stringify({ ...settlementBase, fingerprint: hash(settlementBase) }));
  const coverageBase = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-1", chapterIds: ["c1"], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-30T00:00:00.000Z" };
  await fs.mkdir(path.join(root, "sessions/obligations"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions/obligations/coverage-certificate.json"), JSON.stringify({ ...coverageBase, fingerprint: hash(coverageBase) }));
  await issueClosureCertificate(root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "canon-1" });
}

describe("completion audit", () => {
  it("blocks before the frozen work graph reaches scope_complete", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).rejects.toThrow("COMPLETION_SCOPE_REQUIRED");
  });

  it("promotes only a scope-complete, closure-backed, quiescent run", async () => {
    const root = await fixture();
    await settledFixture(root);
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const scoped = await advanceBookRun(root, run.bookRunId);
    expect(scoped.run.status).toBe("scope_complete");
    await issueQuiescenceProof(root, { bookRunId: run.bookRunId, runVersion: scoped.run.version });
    const audit = await runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" });
    expect(audit).toMatchObject({ schemaVersion: "completion-audit.v1", status: "audited_complete", bookRunId: run.bookRunId, workGraphFingerprint: scoped.graph.fingerprint });
    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).resolves.toMatchObject({ fingerprint: audit.fingerprint });
    const auditPath = path.join(root, "sessions/completion", `${audit.bookRunId ? (await readBookRun(root, run.bookRunId))!.completionAuditRef!.split("/").at(-1) : ""}`);
    const persistedAudit = JSON.parse(await fs.readFile(auditPath, "utf8")) as Record<string, unknown>;
    persistedAudit.sourceFingerprint = "tampered-source";
    await fs.writeFile(auditPath, JSON.stringify(persistedAudit), "utf8");
    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).rejects.toThrow("COMPLETION_AUDIT_INTEGRITY_FAILED");
    await fs.writeFile(auditPath, JSON.stringify(audit), "utf8");
    const coveragePath = path.join(root, "sessions/obligations/coverage-certificate.json");
    const coverage = JSON.parse(await fs.readFile(coveragePath, "utf8")) as Record<string, unknown>;
    const { fingerprint: _old, ...coverageBase } = coverage;
    await fs.writeFile(coveragePath, JSON.stringify({ ...coverageBase, generatedAt: "2026-07-31T00:00:00.000Z", fingerprint: hash({ ...coverageBase, generatedAt: "2026-07-31T00:00:00.000Z" }) }), "utf8");
    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).rejects.toThrow("COMPLETION_AUDIT_STALE");
    expect((await readBookRun(root, run.bookRunId))?.status).toBe("repair_required");
    const impactFiles = await fs.readdir(path.join(root, "sessions/book-run-impact"));
    expect(impactFiles).toHaveLength(1);
    expect((await readBookRunImpactSubgraph(root, impactFiles[0].replace(/\.json$/, "")))?.affectedWorkItemIds).toHaveLength(1);
  });

  it("does not reuse a completion audit bound to a different BookRun", async () => {
    const root = await fixture();
    await settledFixture(root);
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const scoped = await advanceBookRun(root, run.bookRunId);
    await issueQuiescenceProof(root, { bookRunId: run.bookRunId, runVersion: scoped.run.version });
    const audit = await runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" });
    const current = await readBookRun(root, run.bookRunId);
    const auditPath = path.join(root, current!.completionAuditRef!.replaceAll("/", path.sep));
    const forgedBase = { ...audit, bookRunId: "book-run-forged" };
    const { fingerprint: _oldFingerprint, ...withoutFingerprint } = forgedBase;
    await fs.writeFile(auditPath, JSON.stringify({ ...forgedBase, fingerprint: hash(withoutFingerprint) }), "utf8");

    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).rejects.toThrow("COMPLETION_AUDIT_STALE");
    expect((await readBookRun(root, run.bookRunId))?.status).toBe("repair_required");
  });

  it("requires the BookRun work-graph pointer to match the current graph", async () => {
    const root = await fixture();
    await settledFixture(root);
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const scoped = await advanceBookRun(root, run.bookRunId);
    const runPath = path.join(root, "sessions/book-runs", `${run.bookRunId}.json`);
    const persisted = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<string, unknown>;
    const { fingerprint: _oldFingerprint, ...withoutFingerprint } = persisted;
    const forged = { ...withoutFingerprint, workGraphFingerprint: "a".repeat(64) };
    await fs.writeFile(runPath, JSON.stringify({ ...forged, fingerprint: hash(forged) }), "utf8");
    await issueQuiescenceProof(root, { bookRunId: run.bookRunId, runVersion: scoped.run.version });

    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).rejects.toThrow("COMPLETION_WORK_GRAPH_STALE");
    const refreshed = await refreshBookRunWorkGraphPointer(root, run.bookRunId);
    await issueQuiescenceProof(root, { bookRunId: run.bookRunId, runVersion: refreshed.version });
    await expect(runBookCompletionAudit(root, run.bookRunId, { sourceFingerprint: "canon-1" })).resolves.toMatchObject({ status: "audited_complete" });
  });
});
