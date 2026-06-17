import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { resolveInside } from "./pathSafety.js";
import { listWritingFileVersions } from "./fileVersions.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, restoreRuntimeCheckpoint, RuntimeWriteConflictError } from "./runtimeFiles.js";
import { processRuntimeCommand } from "./runtimeEngine.js";
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
  runtimeStatus,
  updateRuntimeRun
} from "./runtimeStore.js";
import { acceptWritingRecapPatches, appendWritingRecap } from "./writingCockpit.js";

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

  it("treats pause/stop during a start command as controlled runtime state, not failure", async () => {
    const project = createProjectSkeleton({ title: "Runtime Pause", roughIdea: "Pause must not fail the run." });
    await createProjectFiles(project);
    const run = createRuntimeRun({ projectSlug: project.slug, chapterId: project.chapters[0].id });
    const command = enqueueRuntimeCommand({ projectSlug: project.slug, runId: run.id, type: "start" });
    updateRuntimeRun(run.id, { status: "paused" });

    await processRuntimeCommand(command);

    expect(getRuntimeRun(run.id)).toEqual(expect.objectContaining({ status: "paused", failureCount: 0 }));
    expect(listRuntimeEvents(project.slug).at(-1)).toEqual(expect.objectContaining({ type: "command", message: "Runtime run paused" }));
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
