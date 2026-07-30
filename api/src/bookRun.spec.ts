import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { startBookRun, readBookRun, controlBookRun, evaluateBookRunQuiescence, advanceBookRun, retryBookRun } from "./bookRun.js";

async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "book-run-")); }

describe("book run orchestration", () => {
  it("fails closed without a finite autonomy limit", async () => {
    const root = await fixture();
    await expect(startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: {} })).rejects.toThrow("BOOK_RUN_LIMIT_REQUIRED");
  });

  it("creates an idempotent durable run with a dependency work graph", async () => {
    const root = await fixture();
    const input = { projectSlug: "demo", chapterIds: ["c1", "c2"], autonomyLevel: "L1" as const, limits: { maxWorkItems: 2, maxModelCalls: 4, maxBudgetCents: 1000 } };
    const run = await startBookRun(root, input);
    expect(run).toMatchObject({ schemaVersion: "book-run.v1", status: "ready", projectSlug: "demo", scope: { chapterIds: ["c1", "c2"] }, limits: input.limits });
    expect(run.workGraphRef).toBe("sessions/book-work-graph.json");
    expect((await startBookRun(root, input)).bookRunId).toBe(run.bookRunId);
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
