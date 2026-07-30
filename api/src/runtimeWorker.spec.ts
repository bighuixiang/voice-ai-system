import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database.js";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { resolveInside } from "./pathSafety.js";
import { enqueueExecutionWorkItem, readExecutionWorkItem } from "./executionQueue.js";
import { claimNextRuntimeCommand, createRuntimeRun, enqueueRuntimeCommand, getRuntimeRun } from "./runtimeStore.js";
import crypto from "node:crypto";

const roots: string[] = [];
afterEach(async () => {
  delete process.env.NOVELS_ROOT;
  delete process.env.NOVEL_DB_PATH;
  delete process.env.RUNTIME_WORKER_AUTOSTART;
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("runtime worker restart recovery", () => {
  it("reclaims a stale claimed command after worker restart and completes it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-worker-restart-"));
    roots.push(root);
    const novelsRoot = path.join(root, "novels");
    const dataRoot = path.join(root, "data");
    await fs.mkdir(path.join(novelsRoot, "demo"), { recursive: true });
    process.env.NOVELS_ROOT = novelsRoot;
    process.env.NOVEL_DB_PATH = path.join(dataRoot, "runtime.sqlite");
    const run = createRuntimeRun({ projectSlug: "demo", command: "pause" });
    const command = enqueueRuntimeCommand({ projectSlug: "demo", runId: run.id, type: "pause", payload: {} });
    expect(claimNextRuntimeCommand()?.id).toBe(command.id);
    const database = openDatabase();
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    database.prepare("UPDATE runtime_write_commands SET claimed_at = ?, updated_at = ? WHERE id = ?").run(stale, stale, command.id);
    database.close();

    process.env.RUNTIME_WORKER_AUTOSTART = "0";
    const worker = await import("./runtimeWorker.js");
    await worker.runtimeWorkerTick();

    const verification = openDatabase();
    const row = verification.prepare("SELECT status FROM runtime_write_commands WHERE id = ?").get(command.id) as { status: string };
    verification.close();
    expect(row.status).toBe("succeeded");
    expect(getRuntimeRun(run.id)).toMatchObject({ status: "paused" });
  });

  it("fences a late worker before running a governed project command", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-worker-governed-"));
    roots.push(root);
    const novelsRoot = path.join(root, "novels");
    const dataRoot = path.join(root, "data");
    process.env.NOVELS_ROOT = novelsRoot;
    process.env.NOVEL_DB_PATH = path.join(dataRoot, "runtime.sqlite");
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Worker Governed E2E", roughIdea: "Late worker fencing." });
    await createProjectFiles(project);
    const projectRootPath = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-worker", projectSlug: project.slug, version: 1, outlineId: "outline-worker", outlineFingerprint: "outline-worker-fp", selectedChapterIds: [chapter.id], strongFreezeCount: 3, status: "active", canonWritten: true, createdAt: new Date().toISOString() };
    const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
    const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-worker", projectSlug: project.slug, versionId: version.versionId, versionFingerprint: version.fingerprint, status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
    const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
    const governedProject = { ...project, outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } };
    await fs.writeFile(resolveInside(projectRootPath, "project.json"), `${JSON.stringify(governedProject, null, 2)}\n`);
    await fs.mkdir(path.join(projectRootPath, "sessions", "outline-versions"), { recursive: true });
    await fs.writeFile(path.join(projectRootPath, "sessions", "outline-versions", "outline-worker.json"), JSON.stringify(version));
    await fs.writeFile(path.join(projectRootPath, "sessions", "execution-ready-proof.json"), JSON.stringify(proof));
    await fs.writeFile(path.join(projectRootPath, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-worker", sourceFingerprint: "context-worker-fp" }));
    const canonBefore = await fs.readFile(resolveInside(projectRootPath, chapter.contentPath), "utf8");
    const item = await enqueueExecutionWorkItem(projectRootPath, project.slug, chapter.id, "worker-late");
    const oldRun = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id, payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "worker-late" } });
    const oldCommand = enqueueRuntimeCommand({ projectSlug: project.slug, runId: oldRun.id, type: "start", payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "worker-late" } });
    expect(claimNextRuntimeCommand()?.id).toBe(oldCommand.id);
    const database = openDatabase();
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    database.prepare("UPDATE runtime_write_commands SET claimed_at = ?, updated_at = ? WHERE id = ?").run(stale, stale, oldCommand.id);
    database.close();

    process.env.RUNTIME_WORKER_AUTOSTART = "0";
    const worker = await import("./runtimeWorker.js");
    await worker.runtimeWorkerTick();
    await worker.runtimeWorkerTick();

    const verification = openDatabase();
    const oldRow = verification.prepare("SELECT status FROM runtime_write_commands WHERE id = ?").get(oldCommand.id) as { status: string };
    verification.close();
    expect(oldRow.status).toBe("failed");
    expect(getRuntimeRun(oldRun.id)).toMatchObject({ status: "failed" });
    const finalItem = await readExecutionWorkItem(projectRootPath, item.workItemId);
    expect(finalItem).toMatchObject({ status: "completed" });
    expect(await fs.readFile(resolveInside(projectRootPath, chapter.contentPath), "utf8")).toBe(canonBefore);
  });
});
