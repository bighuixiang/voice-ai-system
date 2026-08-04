import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { startBookRun, readBookRun, listBookRuns, controlBookRun, evaluateBookRunQuiescence, advanceBookRun, retryBookRun, refreshBookRunDependencyGraph } from "./bookRun.js";
import { createRunReadinessProof, persistRunReadinessProof } from "./runReadiness.js";
import { createBudgetReservation, persistBudgetReservation, readBudgetReservation } from "./budgetReservation.js";
import { enqueueExecutionWorkItem, readExecutionWorkItem } from "./executionQueue.js";
import { evaluateRunPreflight, persistRunPreflight } from "./runPreflight.js";
import { readAutonomyGrant, revokeAutonomyGrant } from "./autonomyGrant.js";

async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "book-run-")); }

async function writeSyntheticExecutionItem(root: string, workItemId: string, status: "failed" | "completed", createdAt: string): Promise<void> {
  const base = { schemaVersion: "execution-work-item.v1" as const, workItemId, projectSlug: "demo", chapterId: workItemId, versionId: "", proofFingerprint: "", contextManifestId: "", contextFingerprint: "", status, idempotencyKey: workItemId, createdAt };
  const item = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await fs.writeFile(path.join(root, "sessions", "execution-work-items", `${workItemId}.json`), JSON.stringify(item));
}

describe("book run orchestration", () => {
  it("refreshes a repaired dependency graph without changing run version", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const refreshed = await refreshBookRunDependencyGraph(root, run.bookRunId, "repaired-graph-fingerprint");
    expect(refreshed.version).toBe(run.version);
    expect(refreshed.publicationDependencyGraphFingerprint).toBe("repaired-graph-fingerprint");
  });
  it("records the immutable startup preflight consumed by a run", async () => {
    const root = await fixture();
    const preflight = evaluateRunPreflight({ runId: "startup-proof", objective: "draft", estimatedWorkItems: 1, estimatedWallClockMs: 1000, estimatedCostCents: 1, missingAssets: [], pausePoints: ["chapter-boundary"], authorizationScope: "chapter-1", worstCaseRecoveryBoundary: "chapter-boundary", storyContractConfirmed: true, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false, limits: { maxWorkItems: 1 } });
    await persistRunPreflight(root, preflight);
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 }, preflightId: preflight.runId });
    expect(run).toMatchObject({ startupPreflightRef: `sessions/book-runs/${preflight.runId}.preflight.json`, startupPreflightFingerprint: preflight.fingerprint });
  });
  it("fails closed without a finite autonomy limit", async () => {
    const root = await fixture();
    await expect(startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: {} })).rejects.toThrow("BOOK_RUN_LIMIT_REQUIRED");
  });

  it("rejects malformed limits and refuses to advance after a hard deadline", async () => {
    const root = await fixture();
    await expect(startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { deadlineAt: "not-a-date" } })).rejects.toThrow("BOOK_RUN_DEADLINE_INVALID");
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { deadlineAt: "2020-01-01T00:00:00.000Z" } });
    await expect(advanceBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_DEADLINE_EXCEEDED");
  });

  it("persists the autonomy grant and pauses safely when it expires", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", autonomyExpiresAt: "2020-01-01T00:00:00.000Z", limits: { maxWorkItems: 1 } });
    const grant = await readAutonomyGrant(root, "grant-" + run.bookRunId);
    expect(grant).toMatchObject({ projectSlug: "demo", bookRunId: run.bookRunId, status: "active" });
    const advanced = await advanceBookRun(root, run.bookRunId);
    expect(advanced.run).toMatchObject({ status: "paused", pauseReason: "AUTONOMY_GRANT_EXPIRED" });
    expect(advanced.scheduled).toHaveLength(0);
  });

  it("pauses a run after an author revokes its autonomy grant", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    await revokeAutonomyGrant(root, "grant-" + run.bookRunId, "author-request");
    const advanced = await advanceBookRun(root, run.bookRunId);
    expect(advanced.run).toMatchObject({ status: "paused", pauseReason: "AUTONOMY_GRANT_REVOKED" });
    await expect(controlBookRun(root, run.bookRunId, { action: "resume", expectedVersion: advanced.run.version })).rejects.toThrow("BOOK_RUN_AUTONOMY_GRANT_INVALID");
  });

  it("counts only the trailing consecutive failure run", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1, maxConsecutiveFailures: 2 } });
    const directory = path.join(root, "sessions", "execution-work-items");
    await fs.mkdir(directory, { recursive: true });
    await writeSyntheticExecutionItem(root, "old-failure", "failed", "2030-01-01T00:00:00.000Z");
    await writeSyntheticExecutionItem(root, "latest-completed", "completed", "2030-01-02T00:00:00.000Z");
    await expect(advanceBookRun(root, run.bookRunId)).resolves.toBeDefined();
    const current = await readBookRun(root, run.bookRunId);
    await writeSyntheticExecutionItem(root, "latest-failure", "failed", "2030-01-03T00:00:00.000Z");
    await writeSyntheticExecutionItem(root, "latest-failure-2", "failed", "2030-01-04T00:00:00.000Z");
    await expect(advanceBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_FAILURE_LIMIT_EXCEEDED");
    expect(current).toBeTruthy();
  });

  it("creates an idempotent durable run with a dependency work graph", async () => {
    const root = await fixture();
    const input = { projectSlug: "demo", chapterIds: ["c1", "c2"], autonomyLevel: "L1" as const, limits: { maxWorkItems: 2, maxModelCalls: 4, maxBudgetCents: 1000 } };
    const run = await startBookRun(root, input);
    expect(run).toMatchObject({ schemaVersion: "book-run.v1", status: "ready", projectSlug: "demo", scope: { chapterIds: ["c1", "c2"] }, limits: input.limits });
    expect(run.workGraphRef).toBe("sessions/book-work-graph.json");
    expect((await startBookRun(root, input)).bookRunId).toBe(run.bookRunId);
  });


  it("requires a current ready proof before governed advancement", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], storyContractRef: "contract-v1", autonomyLevel: "L1", limits: { maxWorkItems: 1, maxBudgetCents: 1000 } });
    await expect(advanceBookRun(root, run.bookRunId, { requireReadiness: true })).rejects.toThrow("BOOK_RUN_READINESS_REQUIRED");
    const proof = createRunReadinessProof({
      bookRunId: run.bookRunId,
      projectSlug: run.projectSlug,
      runVersion: run.version,
      scopeFingerprint: run.scope.scopeFingerprint,
      frozenPublicationScope: true,
      storyContract: true,
      workGraph: true,
      contextManifest: true,
      budgetReservation: true
    });
    await persistRunReadinessProof(root, proof);
    await expect(advanceBookRun(root, run.bookRunId, { requireReadiness: true })).resolves.toMatchObject({ run: { status: "gate_required" } });
  });

  it("rejects governed advancement when the dependency graph proof is blocked", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const proof = createRunReadinessProof({ bookRunId: run.bookRunId, projectSlug: run.projectSlug, runVersion: run.version, scopeFingerprint: run.scope.scopeFingerprint, frozenPublicationScope: true, storyContract: true, workGraph: true, contextManifest: true, budgetReservation: true, dependencyGraphStatus: "blocked" });
    await persistRunReadinessProof(root, proof);
    await expect(advanceBookRun(root, run.bookRunId, { requireReadiness: true })).rejects.toThrow("BOOK_RUN_READINESS_BLOCKED:dependency-graph-blocked");
  });

  it("fails closed when a persisted book run is tampered before a state transition", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const target = path.join(root, "sessions/book-runs", `${run.bookRunId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "audited_complete";
    await fs.writeFile(target, JSON.stringify(tampered));
    await expect(readBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_INTEGRITY_FAILED");
    await expect(listBookRuns(root)).rejects.toThrow("BOOK_RUN_INTEGRITY_FAILED");
    await expect(controlBookRun(root, run.bookRunId, { action: "pause", expectedVersion: run.version })).rejects.toThrow("BOOK_RUN_INTEGRITY_FAILED");
  });

  it("rejects a re-signed book run with an impossible gate state", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const target = path.join(root, "sessions/book-runs", `${run.bookRunId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _old, ...base } = value;
    const resigned = { ...base, status: "stopped", currentGate: "author_required" };
    await fs.writeFile(target, JSON.stringify({ ...resigned, fingerprint: crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex") }));
    await expect(readBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_INTEGRITY_FAILED");
  });

  it("rejects a re-signed run with invalid lifecycle timestamps", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const target = path.join(root, "sessions/book-runs", `${run.bookRunId}.json`);
    const { fingerprint: _old, ...base } = run;
    const invalidBase = { ...base, startedAt: "not-a-timestamp" };
    await fs.writeFile(target, JSON.stringify({ ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }), "utf8");
    await expect(readBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_INTEGRITY_FAILED");
  });

  it("does not claim paused until queued/running work is quiescent", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const paused = await controlBookRun(root, run.bookRunId, { action: "pause", expectedVersion: run.version });
    expect(paused.status).toBe("paused");
    await expect(fs.access(path.join(root, "sessions/book-runs", `${run.bookRunId}.quiescence.v${paused.version}.json`))).resolves.toBeUndefined();
    expect((await evaluateBookRunQuiescence(root)).quiescent).toBe(true);
    const resumed = await controlBookRun(root, run.bookRunId, { action: "resume", expectedVersion: paused.version });
    expect(resumed.status).toBe("ready");
  });

  it("releases an active budget reservation only after a run reaches stopped", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1, maxBudgetCents: 100 } });
    const reservation = createBudgetReservation({ bookRunId: run.bookRunId, projectSlug: run.projectSlug, runVersion: run.version, limitCents: 100, reservedCents: 80 });
    await persistBudgetReservation(root, reservation);

    const stopped = await controlBookRun(root, run.bookRunId, { action: "stop", expectedVersion: run.version });

    expect(stopped.status).toBe("stopped");
    await expect(readBudgetReservation(root, reservation.reservationId)).resolves.toMatchObject({ status: "released", consumedCents: 0 });
    const repeated = await controlBookRun(root, run.bookRunId, { action: "stop", expectedVersion: stopped.version });
    expect(repeated.status).toBe("stopped");
    await expect(readBudgetReservation(root, reservation.reservationId)).resolves.toMatchObject({ status: "released" });
  });

  it("enforces work-item, model-call and cost hard limits before advancing", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1, maxModelCalls: 1, maxBudgetCents: 1 } });
    await enqueueExecutionWorkItem(root, "demo", "c1", "limit-item-1");
    await enqueueExecutionWorkItem(root, "demo", "c1", "limit-item-2");
    await expect(advanceBookRun(root, run.bookRunId)).rejects.toThrow("BOOK_RUN_WORK_ITEM_LIMIT_EXCEEDED");
  });

  it("cancels queued scoped work before issuing a stopped quiescence state", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "stop-queued-item");

    const stopped = await controlBookRun(root, run.bookRunId, { action: "stop", expectedVersion: run.version });

    expect(stopped.status).toBe("stopped");
    await expect(readExecutionWorkItem(root, item.workItemId)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("advances the work graph into a durable gate and never calls scope complete for one unfinished chapter", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1", "c2"], autonomyLevel: "L1", limits: { maxWorkItems: 2 } });
    const advanced = await advanceBookRun(root, run.bookRunId);
    expect(advanced.run.status).toBe("gate_required");
    expect(advanced.run.currentGate).toBe("author_required");
    expect(advanced.scheduled).toHaveLength(1);
    expect(advanced.run.progress.totalWorkItems).toBe(2);
    expect((await readBookRun(root, run.bookRunId))?.status).toBe("gate_required");
  });

  it("replays a chapter settlement to complete chapter one and unlock chapter two", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1", "c2"], autonomyLevel: "L1", limits: { maxWorkItems: 2 } });
    await advanceBookRun(root, run.bookRunId);
    const base = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/chapter-settlements/settlement-c1.json"), JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }));
    const advanced = await advanceBookRun(root, run.bookRunId);
    expect(advanced.graph.workItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapterId: "c1", status: "completed", settlementId: "settlement-c1" }),
      expect.objectContaining({ chapterId: "c2", status: "ready" })
    ]));
    expect(advanced.scheduled.some((item) => item.chapterId === "c2")).toBe(true);
    expect(advanced.run.status).toBe("gate_required");
  });

  it("pauses at the chapter boundary when continuous continuation is disabled", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1", "c2"], autoContinue: false, autonomyLevel: "L1", limits: { maxWorkItems: 2 } });
    const first = await advanceBookRun(root, run.bookRunId);
    expect(first.scheduled).toHaveLength(1);
    const base = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1-single", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1-single", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/chapter-settlements/settlement-c1-single.json"), JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }));
    const paused = await advanceBookRun(root, run.bookRunId);
    expect(paused.scheduled).toHaveLength(0);
    expect(paused.run).toMatchObject({ status: "paused", currentGate: "none", autoContinue: false });
  });

  it("isolates a failed execution item for recovery instead of re-queuing it", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const first = await advanceBookRun(root, run.bookRunId);
    const itemPath = path.join(root, "sessions/execution-work-items", `${first.scheduled[0].workItemId}.json`);
    const item = JSON.parse(await fs.readFile(itemPath, "utf8")) as Record<string, unknown>;
    const failedBase = { ...item, status: "failed", error: "provider-timeout", finishedAt: new Date().toISOString() };
    delete failedBase.fingerprint;
    await fs.writeFile(itemPath, JSON.stringify({ ...failedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(failedBase)).digest("hex") }));
    const retried = await advanceBookRun(root, run.bookRunId);
    expect(retried.run.status).toBe("failed_recoverable");
    expect(retried.run.currentGate).toBe("author_required");
  });

  it("retries a failed item as a new lineage while preserving the failed evidence", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 2 } });
    const first = await advanceBookRun(root, run.bookRunId);
    const itemPath = path.join(root, "sessions/execution-work-items", `${first.scheduled[0].workItemId}.json`);
    const item = JSON.parse(await fs.readFile(itemPath, "utf8")) as Record<string, unknown>;
    const failedBase = { ...item, status: "failed", error: "provider-timeout", finishedAt: new Date().toISOString() };
    delete failedBase.fingerprint;
    await fs.writeFile(itemPath, JSON.stringify({ ...failedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(failedBase)).digest("hex") }));
    const failedRun = await advanceBookRun(root, run.bookRunId);
    expect(failedRun.run.status).toBe("failed_recoverable");
    const retried = await retryBookRun(root, run.bookRunId, { expectedVersion: failedRun.run.version });
    expect(retried.run.status).toBe("gate_required");
    expect(retried.replacementWorkItemId).not.toBe(first.scheduled[0].workItemId);
    expect(await fs.readFile(itemPath, "utf8")).toContain("provider-timeout");
  });
});
