import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { resolveInside } from "./pathSafety.js";
import { listWritingFileVersions } from "./fileVersions.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, restoreRuntimeCheckpoint, RuntimeWriteConflictError } from "./runtimeFiles.js";
import { buildSnapshotBlockingReasons, processRuntimeCommand } from "./runtimeEngine.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";
import {
  appendRuntimeEvent,
  claimNextRuntimeCommand,
  createRuntimeBranch,
  createRuntimeRun,
  enqueueRuntimeCommand,
  finishRuntimeCommand,
  getRuntimeBranch,
  getRuntimeRun,
  insertRuntimeKnowledgeRefs,
  insertRuntimeSnapshot,
  insertRuntimeQualityScore,
  listRuntimeEvents,
  listRuntimeKnowledgeRefs,
  recoverStaleRuntimeCommands,
  recoverStaleRuntimeRuns,
  touchRuntimeWorkerHeartbeat,
  runtimeStatus,
  updateRuntimeRun
} from "./runtimeStore.js";
import { acceptWritingRecapPatches, appendWritingRecap, readChapterQualityReport } from "./writingCockpit.js";
import { enqueueExecutionWorkItem, readExecutionWorkItem } from "./executionQueue.js";
import { readChapterExecutionPlan } from "./chapterExecutionPlan.js";
import { readChapterExecutionProof } from "./chapterExecutionProof.js";
import { listRuntimeStageReceipts } from "./runtimeStageReceipt.js";
import { createSteeringEvent, readSteeringEvent } from "./steeringEvent.js";
import { readRuntimeControlBoundary } from "./runtimeControlBoundary.js";
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

let tempRoot = "";

describe("runtime autopilot infrastructure", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-runtime-"));
    process.env.NOVELS_ROOT = path.join(tempRoot, "novels");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
    delete process.env.RUNTIME_WORKER_MOCK;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("rejects direct governed canon writes at the runtime write fence", async () => {
    const project = createProjectSkeleton({ title: "Runtime Write Fence", roughIdea: "Governed canon writes need adoption." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const governedProject = { ...project, outlineVersion: { versionId: "outline-governed", fingerprint: "outline-fingerprint" } };
    await fs.writeFile(resolveInside(root, "project.json"), `${JSON.stringify(governedProject, null, 2)}\n`, "utf8");
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const before = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8");

    await expect(dispatchRuntimeWrites({
      root,
      project: governedProject,
      run,
      reason: "test-governed-write",
      writes: [{ relativePath: chapter.contentPath, content: "must not land\n" }]
    })).rejects.toThrow("GOVERNED_RUNTIME_CANON_WRITE_REQUIRES_ADOPTION");
    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe(before);
  });

  it("rejects governed chapter-index projection writes at the runtime write fence", async () => {
    const project = createProjectSkeleton({ title: "Runtime Index Fence", roughIdea: "Derived indexes cannot bypass adoption." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const governedProject = { ...project, outlineVersion: { versionId: "outline-governed", fingerprint: "outline-fingerprint" } };
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });

    await expect(dispatchRuntimeWrites({
      root,
      project: governedProject,
      run,
      reason: "test-governed-index-write",
      writes: [{ relativePath: "memory/chapter-index.json", content: "{}\n" }]
    })).rejects.toThrow("GOVERNED_RUNTIME_CANON_WRITE_REQUIRES_ADOPTION");
  });

  it("isolates a late runtime result after cancellation instead of writing the target", async () => {
    const project = createProjectSkeleton({ title: "Late Result Fence", roughIdea: "Cancelled provider output must not land." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    await updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    const target = resolveInside(root, chapter.contentPath);
    const before = await fs.readFile(target, "utf8");
    await expect(dispatchRuntimeWrites({ root, project, run, reason: "late_provider_result", writes: [{ relativePath: chapter.contentPath, content: "late output\n" }] })).rejects.toThrow("RUNTIME_WRITE_FENCED_LATE_RESULT");
    await expect(fs.readFile(target, "utf8")).resolves.toBe(before);
    const isolated = await fs.readdir(resolveInside(root, "sessions/runtime-late-results"));
    expect(isolated).toHaveLength(1);
    expect(await fs.readFile(path.join(resolveInside(root, "sessions/runtime-late-results"), isolated[0]), "utf8")).toContain("late output");
  });

  it("persists runtime commands, events, quality scores, and branches", () => {
    const run = createRuntimeRun({
      projectSlug: "demo",
      chapterId: "chapter-001",
      payload: { direction: "write with a strong hook" }
    });
    const command = enqueueRuntimeCommand({
      projectSlug: "demo",
      runId: run.id,
      type: "start",
      payload: { chapterId: "chapter-001" },
      idempotencyKey: "demo:start:chapter-001"
    });
    const duplicate = enqueueRuntimeCommand({
      projectSlug: "demo",
      runId: run.id,
      type: "start",
      payload: { chapterId: "chapter-001" },
      idempotencyKey: "demo:start:chapter-001"
    });

    expect(duplicate.id).toBe(command.id);
    expect(claimNextRuntimeCommand()).toEqual(expect.objectContaining({ id: command.id, status: "claimed" }));
    finishRuntimeCommand(command.id, "succeeded");
    updateRuntimeRun(run.id, { status: "running", currentStage: "chapter_draft", qualityScore: 81 });
    insertRuntimeQualityScore({ projectSlug: "demo", runId: run.id, chapterId: "chapter-001", score: 81 });
    appendRuntimeEvent({ projectSlug: "demo", runId: run.id, type: "stage", stage: "chapter_draft", message: "Drafting prose" });
    createRuntimeBranch({ projectSlug: "demo", baseRunId: run.id, type: "side_story", title: "Side Story" });

    const status = runtimeStatus("demo");
    expect(status.activeRun).toEqual(expect.objectContaining({ id: run.id, currentStage: "chapter_draft", qualityScore: 81 }));
    expect(status.events).toHaveLength(1);
    expect(status.branches).toEqual([expect.objectContaining({ title: "Side Story", status: "draft" })]);
  });

  it("scopes runtime command idempotency to the project", () => {
    const firstRun = createRuntimeRun({ projectSlug: "project-a", chapterId: "chapter-001" });
    const secondRun = createRuntimeRun({ projectSlug: "project-b", chapterId: "chapter-001" });
    const first = enqueueRuntimeCommand({ projectSlug: "project-a", runId: firstRun.id, type: "start", idempotencyKey: "shared-client-key" });
    const second = enqueueRuntimeCommand({ projectSlug: "project-b", runId: secondRun.id, type: "start", idempotencyKey: "shared-client-key" });

    expect(second.id).not.toBe(first.id);
    expect(second.projectSlug).toBe("project-b");
    expect(enqueueRuntimeCommand({ projectSlug: "project-b", runId: secondRun.id, type: "start", idempotencyKey: "shared-client-key" }).id).toBe(second.id);
  });

  it("exposes narrative snapshots and knowledge references through runtime status", () => {
    const run = createRuntimeRun({ projectSlug: "demo", chapterId: "chapter-001" });
    const snapshot = insertRuntimeSnapshot({
      projectSlug: "demo",
      runId: run.id,
      chapterId: "chapter-001",
      snapshot: {
        projectSlug: "demo",
        chapterId: "chapter-001",
        chapterTitle: "Chapter One",
        contextBlocks: [{ title: "Story Bible", length: 120, preview: "premise and rules" }],
        summarySignals: [],
        ledgerSignals: [],
        knowledgeSignals: { factCount: 2, tripleCount: 1, indexedChapterCount: 1 },
        qualityRisks: [],
        createdAt: new Date().toISOString()
      }
    });
    insertRuntimeKnowledgeRefs([
      {
        projectSlug: "demo",
        runId: run.id,
        chapterId: "chapter-001",
        kind: "context_block",
        refId: "context:1",
        label: "Story Bible",
        score: 120,
        payload: { preview: "premise and rules" }
      },
      {
        projectSlug: "demo",
        runId: run.id,
        chapterId: "chapter-001",
        kind: "fact",
        refId: "fact-1",
        label: "The protagonist owes a debt",
        score: 0.84,
        payload: { chapterIds: ["chapter-001"] }
      }
    ]);

    const status = runtimeStatus("demo");
    expect(status.latestSnapshot).toEqual(expect.objectContaining({ id: snapshot.id, chapterId: "chapter-001" }));
    expect(status.knowledgeRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "context_block", label: "Story Bible" }),
        expect.objectContaining({ kind: "fact", refId: "fact-1", score: 0.84 })
      ])
    );
    expect(listRuntimeKnowledgeRefs("demo", run.id)).toHaveLength(2);
  });

  it("reports runtime worker heartbeat health in the runtime status snapshot", () => {
    expect(runtimeStatus("demo").worker).toEqual(
      expect.objectContaining({
        status: "offline",
        pollIntervalMs: 1500
      })
    );

    const heartbeatAt = new Date().toISOString();
    touchRuntimeWorkerHeartbeat({
      heartbeatAt,
      lastCommandClaimedAt: heartbeatAt,
      pollIntervalMs: 2200,
      staleAfterMs: 20000
    });

    expect(runtimeStatus("demo").worker).toEqual(
      expect.objectContaining({
        status: "online",
        lastHeartbeatAt: heartbeatAt,
        lastCommandClaimedAt: heartbeatAt,
        pollIntervalMs: 2200,
        staleAfterMs: 20000
      })
    );
  });

  it("creates checkpoints before runtime writes and restores protected files", async () => {
    const project = createProjectSkeleton({ title: "Runtime Files", roughIdea: "A checkpoint test." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    await fs.writeFile(resolveInside(root, chapter.contentPath), "original chapter\n", "utf8");

    const checkpoint = await createRuntimeCheckpoint({ root, project, run, chapterId: chapter.id, label: "before draft" });
    await dispatchRuntimeWrites({
      root,
      project,
      run,
      reason: "test_write",
      checkpoint,
      writes: [{ relativePath: chapter.contentPath, content: "runtime draft\n" }]
    });

    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe("runtime draft\n");
    const versions = await listWritingFileVersions(root, chapter.contentPath);
    expect(versions[0]).toEqual(expect.objectContaining({ source: "runtime", reason: "test_write", runId: run.id }));
    await restoreRuntimeCheckpoint(root, checkpoint);
    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe("original chapter\n");
    expect(listRuntimeEvents(project.slug).map((event) => event.type)).toEqual(expect.arrayContaining(["checkpoint", "write"]));
  });

  it("blocks runtime writes when a user changed the target after the checkpoint", async () => {
    const project = createProjectSkeleton({ title: "Runtime Conflict", roughIdea: "Manual edits win." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const chapterPath = resolveInside(root, chapter.contentPath);
    await fs.writeFile(chapterPath, "checkpoint baseline\n", "utf8");

    const checkpoint = await createRuntimeCheckpoint({ root, project, run, chapterId: chapter.id, label: "before guarded write" });
    await fs.writeFile(chapterPath, "manual user edit\n", "utf8");

    await expect(
      dispatchRuntimeWrites({
        root,
        project,
        run,
        reason: "guarded_write",
        checkpoint,
        writes: [{ relativePath: chapter.contentPath, content: "runtime overwrite\n" }]
      })
    ).rejects.toBeInstanceOf(RuntimeWriteConflictError);
    await expect(fs.readFile(chapterPath, "utf8")).resolves.toBe("manual user edit\n");
  });

  it("blocks runtime creation writes when the target file already exists", async () => {
    const project = createProjectSkeleton({ title: "Runtime Existing File", roughIdea: "New files must not be overwritten." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const run = createRuntimeRun({ projectSlug: project.slug });
    const targetPath = "chapters/derivative-existing.md";
    await fs.writeFile(resolveInside(root, targetPath), "existing draft\n", "utf8");

    await expect(
      dispatchRuntimeWrites({
        root,
        project,
        run,
        reason: "new_derivative_chapter",
        writes: [{ relativePath: targetPath, content: "new draft\n", failIfExists: true }]
      })
    ).rejects.toBeInstanceOf(RuntimeWriteConflictError);
    await expect(fs.readFile(resolveInside(root, targetPath), "utf8")).resolves.toBe("existing draft\n");
  });

  it("rolls back earlier writes when a later asset fails", async () => {
    const project = createProjectSkeleton({ title: "Runtime Atomic Writes", roughIdea: "Multi-asset writes commit together." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const run = createRuntimeRun({ projectSlug: project.slug });
    const first = "runtime/atomic-first.json";
    const second = "runtime/atomic-existing.json";
    await fs.mkdir(path.dirname(resolveInside(root, second)), { recursive: true });
    await fs.writeFile(resolveInside(root, second), "original\n", "utf8");
    await expect(dispatchRuntimeWrites({
      root, project, run, reason: "atomic-failure",
      writes: [
        { relativePath: first, content: "first\n" },
        { relativePath: second, content: "must fail\n", failIfExists: true }
      ]
    })).rejects.toBeInstanceOf(RuntimeWriteConflictError);
    await expect(fs.access(resolveInside(root, first))).rejects.toThrow();
    await expect(fs.readFile(resolveInside(root, second), "utf8")).resolves.toBe("original\n");
  });

  it("treats pause/stop during a start command as controlled runtime state, not failure", async () => {
    const project = createProjectSkeleton({ title: "Runtime Pause", roughIdea: "Pause must not fail the run." });
    await createProjectFiles(project);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start" });
    updateRuntimeRun(run.id, { status: "paused" });

    await processRuntimeCommand(command);

    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "paused", failureCount: 0 }));
    expect(listRuntimeEvents(project.slug).at(-1)).toEqual(expect.objectContaining({ type: "command", message: "Runtime run paused" }));
    const boundaryFiles = await fs.readdir(path.join(projectRoot(project.slug), "sessions/runtime-control-boundaries"));
    expect(boundaryFiles).toHaveLength(1);
    expect((await readRuntimeControlBoundary(projectRoot(project.slug), boundaryFiles[0].replace(/\.json$/, "")))?.status).toBe("paused");
  });

  it("defers an ordinary pause requested during an active run until the next safe boundary", async () => {
    const project = createProjectSkeleton({ title: "Runtime Safe Pause", roughIdea: "Ordinary pause must not abort an active model call." });
    await createProjectFiles(project);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    updateRuntimeRun(run.id, { status: "running", currentStage: "chapter_draft" });
    const pause = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "pause" });

    await processRuntimeCommand(pause);

    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({
      status: "running",
      result: expect.objectContaining({ pauseRequested: true, pauseMode: "safe_boundary" })
    }));

    const resumeBoundary = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start" });
    await processRuntimeCommand(resumeBoundary);

    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({
      status: "paused",
      result: expect.objectContaining({ pauseRequested: false, pauseAcknowledgedAt: expect.any(String) }),
      failureCount: 0
    }));
  });

  it("applies direction through a durable steering event at a safe boundary", async () => {
    const project = createProjectSkeleton({ title: "Runtime Steering", roughIdea: "Direction changes need causality." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    const steering = await createSteeringEvent({ root, projectSlug: project.slug, runId: run.id, direction: "keep the reveal delayed", parentRunVersion: Date.parse(run.updatedAt) });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "direction", payload: { direction: steering.direction, steeringEventId: steering.eventId, targetObjectiveVersion: 1 } });
    await processRuntimeCommand(command);
    expect(await readSteeringEvent(root, steering.eventId)).toMatchObject({ status: "effective", reason: "APPLIED_AT_SAFE_BOUNDARY" });
    expect(getRuntimeRun(run.id)?.result).toMatchObject({ direction: "keep the reveal delayed" });
    expect(getRuntimeRun(run.id)?.input).toMatchObject({ direction: "keep the reveal delayed", targetObjectiveVersion: 1 });
  });

  it("keeps a direction pending while an active run is still in flight", async () => {
    const project = createProjectSkeleton({ title: "Runtime Pending Steering", roughIdea: "Active calls must not receive a mid-call mutation." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    updateRuntimeRun(run.id, { status: "running" });
    const steering = await createSteeringEvent({ root, projectSlug: project.slug, runId: run.id, direction: "change the next choice", parentRunVersion: Date.parse(getRuntimeRun(run.id)!.updatedAt) });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "direction", payload: { direction: steering.direction, steeringEventId: steering.eventId, targetObjectiveVersion: 2 } });
    await processRuntimeCommand(command);
    expect(await readSteeringEvent(root, steering.eventId)).toMatchObject({ status: "queued_for_boundary" });
    expect(getRuntimeRun(run.id)?.input.direction).toBeUndefined();
    expect(getRuntimeRun(run.id)?.result).toMatchObject({ pendingDirection: "change the next choice", pendingDirectionObjectiveVersion: 2 });
  });

  it("rejects a direction whose parent run timestamp is stale", async () => {
    const project = createProjectSkeleton({ title: "Runtime Stale Steering", roughIdea: "Old direction must not cross a control boundary." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    const steering = await createSteeringEvent({ root, projectSlug: project.slug, runId: run.id, direction: "obsolete direction", parentRunVersion: Date.parse(run.updatedAt) });
    updateRuntimeRun(run.id, { status: "paused" });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "direction", payload: { direction: steering.direction, steeringEventId: steering.eventId } });
    await processRuntimeCommand(command);
    expect(await readSteeringEvent(root, steering.eventId)).toMatchObject({ status: "rejected_stale", reason: "PARENT_RUN_UPDATED" });
    expect(getRuntimeRun(run.id)?.result?.direction).toBeUndefined();
  });

  it("finalizes project metadata through runtime write dispatch", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Finalize", roughIdea: "Project metadata writes must be guarded." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id } });

    await processRuntimeCommand(command);

    expect(getRuntimeRun(run.id)).toEqual(
      expect.objectContaining({
        status: "review_required",
        qualityScore: expect.any(Number),
        result: expect.objectContaining({ reason: "recap_patches_pending", pendingRecapPatchCount: expect.any(Number) })
      })
    );
    const projectVersions = await listWritingFileVersions(root, "project.json");
    expect(projectVersions[0]).toEqual(expect.objectContaining({ source: "runtime", reason: "runtime_project_finalize", runId: run.id }));
    expect(listRuntimeEvents(project.slug)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "write",
          payload: expect.objectContaining({ path: "project.json", reason: "runtime_project_finalize", source: "runtime" })
        }),
        expect.objectContaining({
          type: "review",
          stage: "finalize_or_gate",
          message: "Runtime paused for recap patch approval"
        })
      ])
    );
    const recapLines = (await fs.readFile(resolveInside(root, "tasks/recaps.jsonl"), "utf8")).trim().split(/\r?\n/);
    expect(JSON.parse(recapLines[0])).toEqual(expect.objectContaining({ chapterId: chapter.id }));
  });

  it("fails closed before a worker model call when a governed runtime payload omits authority binding", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Authority Fence", roughIdea: "Worker calls must carry frozen authority." });
    await createProjectFiles(project);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id, bookRunId: "book-run-governed" } });
    await processRuntimeCommand(command);
    expect(command.id).toBeTruthy();
    expect(getRuntimeRun(run.id)).toMatchObject({ status: "failed", error: "RUNTIME_MODEL_AUTHORITY_BINDING_REQUIRED" });
  });

  it("governed-runtime-chapter-execution-plan keeps governed runtime prose outside canon until adoption", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Governed Candidate", roughIdea: "Candidate isolation." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-governed", projectSlug: project.slug, version: 1, outlineId: "outline-governed", outlineFingerprint: "outline-fp", selectedChapterIds: [chapter.id], strongFreezeCount: 3, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
    const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
    const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-governed", projectSlug: project.slug, versionId: version.versionId, versionFingerprint: version.fingerprint, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
    const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
    const governedProject = { ...project, outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } };
    await fs.writeFile(resolveInside(root, "project.json"), `${JSON.stringify(governedProject, null, 2)}\n`, "utf8");
    await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "outline-candidates"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "governed.json"), JSON.stringify(version), "utf8");
    await fs.writeFile(path.join(root, "sessions", "outline-candidates", "outline-governed.json"), JSON.stringify({ fingerprint: "outline-fp" }), "utf8");
    await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify(proof), "utf8");
    await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-governed", sourceFingerprint: "context-fp" }), "utf8");
    const generationManifest = createProseGenerationManifest({ manifestId: "generation-governed", decisionConsumptionReceiptRef: "receipt:prose-governed", storyContractRef: "contract:governed", outlineVersion: version.versionId, chapterIntentRef: `intent:${chapter.id}`, sceneCardRefs: [`scene:${chapter.id}`], characterStateRefs: [`state:${chapter.id}`], povStateRef: `pov:${chapter.id}`, obligationRefs: ["obligation:governed"], authorLockRefs: ["lock:governed"], craftPatternRefs: ["craft:governed"], latestAuthorDirection: "preserve the central promise", proseBaselineRef: `prose:${chapter.id}:v0`, planningHorizonRef: "horizon:governed", contextManifestRef: "context-governed", sourceRefs: ["runtime://governed"] });
    await persistProseGenerationManifest(root, generationManifest);
    const canonBefore = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8");
    const workItem = await enqueueExecutionWorkItem(root, project.slug, chapter.id, "governed-runtime", { generationManifestId: generationManifest.manifestId });
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id, payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "governed-runtime", generationManifestId: generationManifest.manifestId } });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "governed-runtime", generationManifestId: generationManifest.manifestId } });
    await processRuntimeCommand(command);
    const candidateFiles = await fs.readdir(path.join(root, "sessions", "prose-candidates"));
    expect(candidateFiles.length).toBe(1);
    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe(canonBefore);
    expect(await readExecutionWorkItem(root, workItem.workItemId)).toEqual(expect.objectContaining({ status: "completed", runId: run.id }));
    const executionPlans = await fs.readdir(path.join(root, "sessions", "chapter-execution-plans"));
    expect(executionPlans).toHaveLength(1);
    expect(await readChapterExecutionPlan(root, executionPlans[0].replace(/\.json$/, ""))).toEqual(expect.objectContaining({ chapterId: chapter.id, executionProofFingerprint: proof.fingerprint, contextFingerprint: expect.any(String), planFingerprint: expect.any(String) }));
    const executionProofs = await fs.readdir(path.join(root, "sessions", "chapter-execution-proofs"));
    expect(executionProofs).toHaveLength(1);
    expect(await readChapterExecutionProof(root, executionProofs[0].replace(/\.json$/, ""))).toEqual(expect.objectContaining({ chapterId: chapter.id, executionReady: true, parentExecutionReadyProofFingerprint: proof.fingerprint }));
    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "review_required", result: expect.objectContaining({ reason: "prose_candidate_ready" }) }));
  });

  it("fails closed when a governed outline pointer has no integrity fingerprint", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Incomplete Governed Pointer", roughIdea: "Missing outline integrity must not reopen canon writes." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const governedProject = { ...project, outlineVersion: { versionId: "outline-without-fingerprint" } };
    await fs.writeFile(resolveInside(root, "project.json"), `${JSON.stringify(governedProject, null, 2)}\n`, "utf8");
    const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-missing-outline-fingerprint", projectSlug: project.slug, versionId: "outline-without-fingerprint", versionFingerprint: "placeholder-outline-fingerprint", structureVersionFingerprint: "placeholder-outline-fingerprint", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify({ ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") }), "utf8");
    await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-missing-outline-fingerprint", sourceFingerprint: "context-fp" }), "utf8");
    const canonBefore = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8");
    const workItem = await enqueueExecutionWorkItem(root, project.slug, chapter.id, "missing-outline-fingerprint");
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id, payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "missing-outline-fingerprint" } });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id, requireExecutionReady: true, idempotencyKey: "missing-outline-fingerprint" } });

    await processRuntimeCommand(command);
    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe(canonBefore);
    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "failed", error: "GOVERNED_OUTLINE_FINGERPRINT_REQUIRED" }));
    await expect(readExecutionWorkItem(root, workItem.workItemId)).resolves.toEqual(expect.objectContaining({ status: "blocked", blockedReason: "VERSION_POINTER_STALE" }));
    await expect(fs.readFile(resolveInside(root, `sessions/runtime-compensations/${run.id}.json`), "utf8")).resolves.toContain("runtime-compensation.v1");
  });

  it("self-repairs autopilot drafts until the runtime quality target is met before review", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Quality Repair", roughIdea: "Weak drafts must be repaired before author review." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id } });

    await processRuntimeCommand(command);

    const completed = getRuntimeRun(run.id);
    const stageReceipts = await listRuntimeStageReceipts(root, run.id);
    expect(stageReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "chapter_draft", status: "completed", inputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "chapter_draft", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "content_validate", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "chapter_plan", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "context_assemble", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "quality_review", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "recap_and_ledger", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "knowledge_index_update", status: "completed", outputRef: "knowledge-index", outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "story_graph_update", status: "completed", outputRef: expect.stringContaining("stage-output-"), outputFingerprint: expect.any(String) }),
      expect.objectContaining({ stage: "finalize_or_gate", status: "started" })
    ]));
    const report = await readChapterQualityReport(root, chapter.id);
    const content = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8");
    expect(completed).toEqual(
      expect.objectContaining({
        status: "review_required",
        qualityScore: expect.any(Number),
        result: expect.objectContaining({ qualityScore: expect.any(Number) })
      })
    );
    expect(completed?.qualityScore).toBeGreaterThanOrEqual(86);
    expect(report?.overallScore).toBeGreaterThanOrEqual(86);
    expect(report?.evidence).toMatchObject({ evaluatorVersion: "quality-review.v1", mode: expect.any(String), contentSha256: expect.any(String), sourceFingerprint: expect.any(String) });
    expect(report?.metrics.every((metric) => metric.score >= 86)).toBe(true);
    expect(content).toContain("quality-repaired");
    expect(listRuntimeEvents(project.slug)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "quality", message: "Runtime quality review completed" }),
        expect.objectContaining({ type: "quality", message: "Runtime quality self-repair applied" }),
        expect.objectContaining({ type: "system", stage: "chapter_draft", message: "Chapter plan bound to draft input", payload: expect.objectContaining({ chapterPlanFingerprint: expect.any(String), chapterPlanOutputRef: expect.stringContaining("stage-output-") }) }),
        expect.objectContaining({ type: "system", stage: "chapter_draft", message: "Draft output persisted for recovery", payload: expect.objectContaining({ outputFingerprint: expect.any(String), outputRef: expect.stringContaining("stage-output-") }) }),
        expect.objectContaining({ type: "system", stage: "story_graph_update", message: "Story graph projection persisted for recovery", payload: expect.objectContaining({ outputFingerprint: expect.any(String), outputRef: expect.stringContaining("stage-output-") }) })
      ])
    );
  });

  it("reuses durable stage outputs on a same-run recovery without duplicating recap", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Recovery Replay", roughIdea: "Restart must reuse durable outputs." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id });
    const firstCommand = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id } });
    await processRuntimeCommand(firstCommand);
    const recapPath = resolveInside(root, "tasks/recaps.jsonl");
    const firstRecap = await fs.readFile(recapPath, "utf8");
    const firstKnowledgeRefs = listRuntimeKnowledgeRefs(project.slug).length;

    updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
    const recoveryCommand = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start", payload: { chapterId: chapter.id }, idempotencyKey: `recovery-${run.id}` });
    await processRuntimeCommand(recoveryCommand);

    expect(await fs.readFile(recapPath, "utf8")).toBe(firstRecap);
    expect(listRuntimeKnowledgeRefs(project.slug)).toHaveLength(firstKnowledgeRefs);
    expect(listRuntimeEvents(project.slug)).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "context_assemble", message: "Context assembly reused from receipt" }),
      expect.objectContaining({ stage: "chapter_draft", message: "Draft output reused from receipt" }),
      expect.objectContaining({ stage: "quality_review", message: "Quality report reused from receipt" }),
      expect.objectContaining({ stage: "recap_and_ledger", message: "Writing recap candidate reused from receipt" }),
      expect.objectContaining({ stage: "story_graph_update", message: "Story graph projection reused from receipt" })
    ]));
  });

  it("does not keep legacy deterministic runtime quality helper functions", async () => {
    const source = await fs.readFile(new URL("./runtimeEngine.ts", import.meta.url), "utf8");

    expect(source).not.toContain("function runtimeQualityScore(");
    expect(source).not.toContain("function runtimeQualityReport(");
    expect(source).not.toContain("function qualityMeetsRuntimeTarget(");
    expect(source).not.toContain("function rewriteTargetMetrics(");
    expect(source).not.toContain("function craftGateRisks(");
  });

  it("holds auto continue while recap patches are pending", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Auto Continue", roughIdea: "Autopilot should keep moving." });
    await createProjectFiles(project);
    const chapter = project.chapters[0];
    const nextChapter = project.chapters[1];
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: chapter.id, payload: { chapterId: chapter.id, autoContinue: true } });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "start",
      payload: { chapterId: chapter.id, autoContinue: true }
    });

    await processRuntimeCommand(command);

    const completed = getRuntimeRun(run.id);
    expect(completed).toEqual(
      expect.objectContaining({
        status: "review_required",
        result: expect.objectContaining({ reason: "recap_patches_pending", pendingRecapPatchCount: expect.any(Number) })
      })
    );
    expect(claimNextRuntimeCommand()).toBeNull();
    expect(completed?.result?.nextChapterId).not.toBe(nextChapter.id);
    expect(listRuntimeEvents(project.slug)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "review", message: "Runtime paused for recap patch approval" })])
    );
  });

  it("clears pending recap patch count after the recap is accepted", async () => {
    const project = createProjectSkeleton({ title: "Runtime Recap Acceptance", roughIdea: "Accepted recaps should unblock runtime." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    const recap = {
      chapterId: chapter.id,
      summary: "The protagonist accepts a cost.",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-11T00:00:00.000Z",
      summaryPatch: {
        summary: "The protagonist accepts a cost.",
        keyEvents: ["The seal answers."]
      }
    };

    await appendWritingRecap(root, recap);
    const before = await buildCreationRuntimeSnapshot(root, project, chapter.id);
    expect(before.signals.pendingRecapPatchCount).toBeGreaterThan(0);

    await acceptWritingRecapPatches(root, recap);
    const after = await buildCreationRuntimeSnapshot(root, project, chapter.id);
    expect(after.signals.pendingRecapPatchCount).toBe(0);
  });

  it("blocks a runtime narrative snapshot that relies only on legacy projection facts", async () => {
    const project = createProjectSkeleton({ title: "Legacy Snapshot Boundary", roughIdea: "Legacy facts cannot authorize canon generation." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.mkdir(path.join(root, "knowledge"), { recursive: true });
    await fs.writeFile(path.join(root, "knowledge", "facts.jsonl"), `${JSON.stringify({ id: "fact:legacy", text: "Legacy summary fact", chapterIds: ["chapter-001"], relatedEntities: [], keywords: ["legacy"], source: { type: "chapter-summary", id: "legacy" }, updatedAt: "2026-07-31T00:00:00.000Z" })}\n`, "utf8");
    await fs.writeFile(path.join(root, "knowledge", "triples.jsonl"), "", "utf8");
    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "chapter-index.json"), JSON.stringify({ projectSlug: project.slug, chapters: [], keywords: {}, updatedAt: "2026-07-31T00:00:00.000Z" }), "utf8");
    const snapshot = await buildCreationRuntimeSnapshot(root, project, project.chapters[0].id);
    expect(snapshot.signals.projectionAuthority).toBe("legacy-only");
    expect(snapshot.signals.legacyFactCount).toBe(1);
    expect(snapshot.signals.eligibleMemoryClaimCount).toBe(0);
    expect(buildSnapshotBlockingReasons({ contextBudget: undefined, summarySignals: [], knowledgeSignals: { factCount: 1, tripleCount: 0, indexedChapterCount: 0, legacyFactCount: 1, eligibleMemoryClaimCount: 0, projectionAuthority: "legacy-only" }, qualityRisks: [], craftRisks: [] })).toContain("LEGACY_PROJECTION_ONLY");
  });

  it("requeues stale claimed commands so a restarted worker can continue", () => {
    const run = createRuntimeRun({ projectSlug: "demo", chapterId: "chapter-001" });
    const command = enqueueRuntimeCommand({ projectSlug: "demo", runId: run.id, type: "start" });

    expect(claimNextRuntimeCommand()).toEqual(expect.objectContaining({ id: command.id, status: "claimed" }));
    updateRuntimeRun(run.id, { status: "running" });

    expect(recoverStaleRuntimeCommands(0)).toBe(1);
    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "queued" }));
    expect(claimNextRuntimeCommand()).toEqual(expect.objectContaining({ id: command.id, status: "claimed" }));
  });

  it("moves stale running runs without active commands into review instead of leaving them orphaned", () => {
    const run = createRuntimeRun({ projectSlug: "demo", chapterId: "chapter-001" });
    updateRuntimeRun(run.id, { status: "running", currentStage: "chapter_draft" });

    expect(recoverStaleRuntimeRuns(0)).toBe(1);
    expect(getRuntimeRun(run.id)).toEqual(
      expect.objectContaining({
        status: "review_required",
        error: "Runtime worker stopped while this run was active; review before resuming.",
        result: expect.objectContaining({ reason: "stale_runtime_recovery", previousStage: "chapter_draft" })
      })
    );
    expect(listRuntimeEvents("demo").at(-1)).toEqual(
      expect.objectContaining({
        type: "review",
        stage: "chapter_draft",
        message: "Runtime run recovered after worker restart"
      })
    );
  });

  it("generates derivative branches in isolated runtime storage", async () => {
    process.env.RUNTIME_WORKER_MOCK = "1";
    const project = createProjectSkeleton({ title: "Runtime Branch", roughIdea: "Branch stories must not pollute canon." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const chapter = project.chapters[0];
    await fs.writeFile(resolveInside(root, chapter.contentPath), "canon chapter\n", "utf8");
    const branch = createRuntimeBranch({
      projectSlug: project.slug,
      sourceChapterId: chapter.id,
      type: "side_story",
      title: "Hidden Side Story",
      payload: { direction: "Write a non-canon aftermath." }
    });
    const run = createRuntimeRun({
      projectSlug: project.slug,
      chapterId: chapter.id,
      branchId: branch.id,
      command: "derivative",
      payload: { branchId: branch.id, direction: "Write a non-canon aftermath." }
    });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "derivative",
      payload: { branchId: branch.id, direction: "Write a non-canon aftermath." }
    });

    await processRuntimeCommand(command);

    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "completed" }));
    expect(getRuntimeBranch(branch.id)).toEqual(
      expect.objectContaining({
        status: "active",
        payload: expect.objectContaining({
          canonPolicy: "isolated",
          sourceChapterId: chapter.id,
          draftPath: `runtime/branches/${branch.id}/draft.md`
        })
      })
    );
    await expect(fs.readFile(resolveInside(root, `runtime/branches/${branch.id}/draft.md`), "utf8")).resolves.toContain(chapter.title);
    await expect(fs.readFile(resolveInside(root, chapter.contentPath), "utf8")).resolves.toBe("canon chapter\n");
  });
});
