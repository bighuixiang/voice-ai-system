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
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

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

  it("claims urgent control commands before an older queued writing command", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-worker-control-priority-"));
    roots.push(root);
    process.env.NOVELS_ROOT = path.join(root, "novels");
    process.env.NOVEL_DB_PATH = path.join(root, "data", "runtime.sqlite");
    await fs.mkdir(path.join(root, "novels", "demo"), { recursive: true });
    const run = createRuntimeRun({ projectSlug: "demo", command: "start" });
    const writing = enqueueRuntimeCommand({ projectSlug: "demo", runId: run.id, type: "start", payload: {} });
    const pause = enqueueRuntimeCommand({ projectSlug: "demo", runId: run.id, type: "pause", payload: {} });
    expect(claimNextRuntimeCommand()?.id).toBe(pause.id);
    expect(claimNextRuntimeCommand()?.id).toBe(writing.id);
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
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "craft-worker", projectSlug: project.slug, name: "Worker pacing", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights:worker"], evidenceRefs: ["evidence://worker"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-worker", actor: "author", reason: "worker fixture", validatedAt: new Date().toISOString() } };
    await fs.mkdir(path.join(projectRootPath, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(projectRootPath, "sessions", "craft-patterns", "craft-worker.json"), JSON.stringify({ ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") }));
    const releaseBase = { schemaVersion: "learning-release.v1", releaseId: "release-worker", projectSlug: project.slug, candidatePolicyRef: "policy:worker", candidatePatternId: patternBase.patternId, baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:worker"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", rollbackRef: "policy:stable", status: "canary", reasons: [], approvedBy: "author", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await fs.mkdir(path.join(projectRootPath, "sessions", "learning-releases"), { recursive: true });
    await fs.writeFile(path.join(projectRootPath, "sessions", "learning-releases", "release-worker.json"), JSON.stringify({ ...releaseBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(releaseBase)).digest("hex") }));
  const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-worker", projectSlug: project.slug, version: 1, outlineId: "outline-worker", outlineFingerprint: "outline-worker-fp", selectedChapterIds: [chapter.id], strongFreezeCount: 3, structureVersionFingerprint: "outline-worker-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
    const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
  const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-worker", projectSlug: project.slug, versionId: version.versionId, versionFingerprint: version.fingerprint, structureVersionFingerprint: "outline-worker-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
    const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
    const governedProject = { ...project, outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } };
    await fs.writeFile(resolveInside(projectRootPath, "project.json"), `${JSON.stringify(governedProject, null, 2)}\n`);
    await fs.mkdir(path.join(projectRootPath, "sessions", "outline-versions"), { recursive: true });
    await fs.mkdir(path.join(projectRootPath, "sessions", "outline-candidates"), { recursive: true });
    await fs.writeFile(path.join(projectRootPath, "sessions", "outline-versions", "outline-worker.json"), JSON.stringify(version));
    await fs.writeFile(path.join(projectRootPath, "sessions", "outline-candidates", "outline-worker.json"), JSON.stringify({ fingerprint: "outline-worker-fp" }));
    await fs.writeFile(path.join(projectRootPath, "sessions", "execution-ready-proof.json"), JSON.stringify(proof));
    await fs.writeFile(path.join(projectRootPath, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-worker", sourceFingerprint: "context-worker-fp" }));
    const generationManifest = createProseGenerationManifest({ manifestId: "generation-worker", decisionConsumptionReceiptRef: "receipt:prose-worker", storyContractRef: "contract:worker", outlineVersion: version.versionId, chapterIntentRef: `intent:${chapter.id}`, sceneCardRefs: [`scene:${chapter.id}`], characterStateRefs: [`state:${chapter.id}`], povStateRef: `pov:${chapter.id}`, obligationRefs: ["obligation:worker"], authorLockRefs: ["lock:worker"], craftPatternRefs: ["craft-worker"], latestAuthorDirection: "preserve the promise", proseBaselineRef: `prose:${chapter.id}:v0`, planningHorizonRef: "horizon:worker", contextManifestRef: "context-worker", sourceRefs: ["runtime://worker"] });
    await persistProseGenerationManifest(projectRootPath, generationManifest);
    const canonBefore = await fs.readFile(resolveInside(projectRootPath, chapter.contentPath), "utf8");
    const item = await enqueueExecutionWorkItem(projectRootPath, project.slug, chapter.id, "worker-late", { generationManifestId: generationManifest.manifestId });
    const oldRun = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id, payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "worker-late", generationManifestId: generationManifest.manifestId } });
    const oldCommand = enqueueRuntimeCommand({ projectSlug: project.slug, runId: oldRun.id, type: "start", payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "worker-late", generationManifestId: generationManifest.manifestId } });
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
