import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterQualityReport,
  CodexTaskType,
  KnowledgeSearchResult,
  NarrativeSnapshot,
  NovelChapter,
  NovelFilePatch,
  NovelProject,
  RuntimeContextBudget,
  RuntimeCommand,
  RuntimeKnowledgeRef,
  RuntimePipelineStage,
  RuntimeRun,
  WritingRecapCandidate
} from "./types.js";
import { assembleContext } from "./contextAssembler.js";
import { readProject, projectRoot, writeProject } from "./novelProject.js";
import { resolveInside, assertSafeNovelPath } from "./pathSafety.js";
import { runNovelTask } from "./taskService.js";
import { rebuildKnowledgeIndex, readKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import {
  acceptWritingRecapPatches,
  buildSeriesQualityMetrics,
  readChapterQualityReport,
  readChapterSummary,
  readLedgerEntries,
  readStoryControl,
  saveChapterQualityReport
} from "./writingCockpit.js";
import {
  appendRuntimeEvent,
  createRuntimeBranch,
  finishRuntimeCommand,
  getRuntimeBranch,
  getRuntimeRun,
  insertRuntimeKnowledgeRefs,
  insertRuntimeQualityScore,
  insertRuntimeSnapshot,
  runtimeNow,
  updateRuntimeBranch,
  updateRuntimeRun
} from "./runtimeStore.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, RuntimeWriteConflictError } from "./runtimeFiles.js";

const pipelineStages: RuntimePipelineStage[] = [
  "find_next_chapter",
  "checkpoint_before_run",
  "prepare_narrative_snapshot",
  "chapter_plan",
  "context_assemble",
  "chapter_draft",
  "content_validate",
  "quality_review",
  "recap_and_ledger",
  "knowledge_index_update",
  "story_graph_update",
  "finalize_or_gate"
];

function orderedChapters(project: NovelProject): NovelChapter[] {
  return [...project.chapters].sort((left, right) => {
    const volume = (left.volumeOrder ?? 0) - (right.volumeOrder ?? 0);
    return volume || (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
  });
}

function selectTargetChapter(project: NovelProject, requestedChapterId?: string): NovelChapter {
  const requested = requestedChapterId ? project.chapters.find((chapter) => chapter.id === requestedChapterId) : undefined;
  if (requested) return requested;
  const opened = project.chapters.find((chapter) => chapter.id === project.lastOpenedChapterId);
  if (opened && opened.status !== "checked") return opened;
  const next = orderedChapters(project).find((chapter) => chapter.status === "empty" || chapter.status === "planned" || chapter.status === "drafted");
  return next || orderedChapters(project)[0];
}

function stageMessage(stage: RuntimePipelineStage): string {
  const labels: Record<RuntimePipelineStage, string> = {
    find_next_chapter: "Selecting target chapter",
    checkpoint_before_run: "Creating checkpoint",
    prepare_narrative_snapshot: "Preparing narrative snapshot",
    chapter_plan: "Planning chapter",
    context_assemble: "Assembling context budget",
    chapter_draft: "Drafting prose",
    content_validate: "Validating content",
    quality_review: "Scoring quality",
    recap_and_ledger: "Updating recap and ledgers",
    knowledge_index_update: "Updating knowledge index",
    story_graph_update: "Updating story graph",
    finalize_or_gate: "Finalizing or opening review gate"
  };
  return labels[stage];
}

function activeStatus(status: RuntimeRun["status"]): boolean {
  return status === "queued" || status === "running";
}

class RuntimeControlStop extends Error {
  constructor(readonly status: Extract<RuntimeRun["status"], "paused" | "cancelled">) {
    super(`Runtime run ${status}`);
    this.name = "RuntimeControlStop";
  }
}

function assertRunnable(run: RuntimeRun): void {
  if (run.status === "paused" || run.status === "cancelled") {
    throw new RuntimeControlStop(run.status);
  }
  if (!activeStatus(run.status)) {
    throw new Error(`Runtime run is not active: ${run.status}`);
  }
}

async function markStage(run: RuntimeRun, stage: RuntimePipelineStage): Promise<RuntimeRun> {
  const current = getRuntimeRun(run.id);
  assertRunnable(current || run);
  const updated = updateRuntimeRun(run.id, { status: "running", currentStage: stage, startedAt: run.startedAt || runtimeNow() });
  const next = updated || run;
  appendRuntimeEvent({
    projectSlug: run.projectSlug,
    runId: run.id,
    type: "stage",
    stage,
    message: stageMessage(stage),
    payload: { stage }
  });
  return next;
}

function preview(content: string, limit = 220): string {
  return content.replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseContextBudget(blocks: Array<{ title: string; content: string }>): RuntimeContextBudget {
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.content) as {
        version?: string;
        totalOriginalChars?: number;
        totalFinalChars?: number;
        blockCount?: number;
        blockPlan?: Array<{
          title?: string;
          tier?: RuntimeContextBudget["blocks"][number]["tier"];
          limit?: number;
          originalLength?: number;
          finalLength?: number;
          truncated?: boolean;
        }>;
        allocationPolicy?: string;
      };
      if (parsed.version !== "context-budget:v2") continue;
      const budgetBlocks = (parsed.blockPlan || []).map((item) => ({
        title: item.title || "Context block",
        tier: item.tier,
        limit: item.limit,
        originalLength: item.originalLength || 0,
        finalLength: item.finalLength || 0,
        truncated: Boolean(item.truncated),
        reason: item.truncated ? "trimmed_by_context_tier_limit" : "included_within_budget"
      }));
      return {
        totalOriginalChars: parsed.totalOriginalChars || budgetBlocks.reduce((sum, item) => sum + item.originalLength, 0),
        totalFinalChars: parsed.totalFinalChars || budgetBlocks.reduce((sum, item) => sum + item.finalLength, 0),
        blockCount: parsed.blockCount || budgetBlocks.length,
        truncatedBlocks: budgetBlocks.filter((item) => item.truncated),
        blocks: budgetBlocks,
        policy: parsed.allocationPolicy || "tiered_context_budget"
      };
    } catch {
      continue;
    }
  }
  const budgetBlocks = blocks.map((block) => ({
    title: block.title,
    originalLength: block.content.length,
    finalLength: block.content.length,
    truncated: false,
    reason: "included_without_budget_log"
  }));
  return {
    totalOriginalChars: budgetBlocks.reduce((sum, item) => sum + item.originalLength, 0),
    totalFinalChars: budgetBlocks.reduce((sum, item) => sum + item.finalLength, 0),
    blockCount: budgetBlocks.length,
    truncatedBlocks: [],
    blocks: budgetBlocks,
    policy: "fallback_runtime_budget"
  };
}

function snapshotKnowledgeRefs(input: {
  projectSlug: string;
  runId: string;
  chapterId: string;
  snapshot: NarrativeSnapshot;
}): Array<Omit<RuntimeKnowledgeRef, "id" | "createdAt">> {
  const contextRefs = input.snapshot.contextBlocks.slice(0, 20).map((block, index) => ({
    projectSlug: input.projectSlug,
    runId: input.runId,
    chapterId: input.chapterId,
    kind: "context_block" as const,
    refId: `context:${index + 1}:${block.title}`,
    label: block.title,
    score: block.length,
    payload: { preview: block.preview, length: block.length }
  }));
  const ledgerRefs = input.snapshot.ledgerSignals.slice(0, 12).map((entry) => ({
    projectSlug: input.projectSlug,
    runId: input.runId,
    chapterId: input.chapterId,
    kind: "ledger" as const,
    refId: entry.id,
    label: entry.title,
    payload: {
      kind: entry.kind,
      status: entry.status,
      severity: entry.severity,
      chapterIds: entry.chapterIds,
      updatedAt: entry.updatedAt
    }
  }));
  const summaryRefs = input.snapshot.summarySignals.slice(0, 6).map((summary) => ({
    projectSlug: input.projectSlug,
    runId: input.runId,
    chapterId: input.chapterId,
    kind: "summary" as const,
    refId: summary.chapterId,
    label: summary.chapterId,
    payload: {
      summary: summary.summary,
      keyEvents: summary.keyEvents,
      updatedAt: summary.updatedAt
    }
  }));
  return [...contextRefs, ...ledgerRefs, ...summaryRefs];
}

function searchKnowledgeRefs(input: {
  projectSlug: string;
  runId: string;
  chapterId: string;
  result: KnowledgeSearchResult | null;
}): Array<Omit<RuntimeKnowledgeRef, "id" | "createdAt">> {
  if (!input.result) return [];
  const base = {
    projectSlug: input.projectSlug,
    runId: input.runId,
    chapterId: input.chapterId
  };
  const facts = input.result.facts.slice(0, 12).map((fact) => ({
    ...base,
    kind: "fact" as const,
    refId: fact.id,
    label: preview(fact.text, 80) || fact.id,
    score: fact.score,
    payload: {
      text: fact.text,
      chapterIds: fact.chapterIds,
      relatedEntities: fact.relatedEntities,
      keywords: fact.keywords,
      source: fact.source,
      vectorScore: fact.vectorScore
    }
  }));
  const triples = input.result.triples.slice(0, 12).map((triple) => ({
    ...base,
    kind: "triple" as const,
    refId: triple.id,
    label: `${triple.subject} ${triple.predicate} ${triple.object}`,
    score: triple.score,
    payload: {
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      chapterIds: triple.chapterIds,
      sourceFactIds: triple.sourceFactIds,
      vectorScore: triple.vectorScore
    }
  }));
  const chapters = input.result.chapters.slice(0, 6).map((chapter) => ({
    ...base,
    kind: "chapter" as const,
    refId: chapter.chapterId,
    label: chapter.title,
    score: chapter.score,
    payload: {
      order: chapter.order,
      keywords: chapter.keywords,
      factIds: chapter.factIds,
      tripleIds: chapter.tripleIds,
      entityNames: chapter.entityNames,
      vectorScore: chapter.vectorScore
    }
  }));
  return [...facts, ...triples, ...chapters];
}

function buildSnapshotBlockingReasons(snapshot: Pick<NarrativeSnapshot, "contextBudget" | "summarySignals" | "knowledgeSignals" | "qualityRisks">): string[] {
  const reasons: string[] = [];
  if (!snapshot.summarySignals.length) reasons.push("missing_chapter_summary_chain");
  if (!snapshot.knowledgeSignals.factCount && !snapshot.knowledgeSignals.tripleCount) reasons.push("missing_knowledge_index");
  if (snapshot.qualityRisks.length) reasons.push("open_high_risk_ledger_items");
  if (snapshot.contextBudget?.truncatedBlocks.length) reasons.push("context_budget_truncated_sources");
  return reasons;
}

async function buildNarrativeSnapshot(root: string, project: NovelProject, chapter: NovelChapter): Promise<NarrativeSnapshot> {
  const [contextBlocks, storyControl, knowledge, currentSummary] = await Promise.all([
    assembleContext("chapter.draft", root, project, { chapterId: chapter.id }),
    readStoryControl(root),
    readKnowledgeIndex(root, project),
    readChapterSummary(root, chapter.id)
  ]);
  const ledgers = await Promise.all(
    (["foreshadowing", "continuity", "power", "character", "risk"] as const).map((kind) => readLedgerEntries(root, kind))
  );
  const qualityRisks = ledgers
    .flat()
    .filter((entry) => entry.status === "blocked" || entry.severity === "high")
    .slice(0, 12)
    .map((entry) => `${entry.kind}:${entry.title}`);
  const snapshot: NarrativeSnapshot = {
    projectSlug: project.slug,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    contextBlocks: contextBlocks.map((block) => ({
      title: block.title,
      length: block.content.length,
      preview: preview(block.content)
    })),
    contextBudget: parseContextBudget(contextBlocks),
    storyControl: {
      version: storyControl.version,
      premise: storyControl.premise,
      currentArcId: storyControl.currentArcId,
      updatedAt: storyControl.updatedAt,
      arcCount: storyControl.arcs.length,
      characterCount: storyControl.characters.length,
      eventCount: storyControl.events.length
    },
    summarySignals: currentSummary.summary || currentSummary.keyEvents.length ? [currentSummary] : [],
    ledgerSignals: ledgers.flat().slice(0, 40).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      status: entry.status,
      severity: entry.severity,
      chapterIds: entry.chapterIds,
      updatedAt: entry.updatedAt
    })),
    knowledgeSignals: {
      factCount: knowledge.facts.length,
      tripleCount: knowledge.triples.length,
      indexedChapterCount: knowledge.chapterIndex.chapters.length,
      vectorSummary: knowledge.vectorSummary
    },
    qualityRisks,
    createdAt: runtimeNow()
  };
  snapshot.blockingReasons = buildSnapshotBlockingReasons(snapshot);
  return snapshot;
}

async function maybeMockTask(project: NovelProject, type: CodexTaskType, chapter: NovelChapter) {
  if (process.env.RUNTIME_WORKER_MOCK !== "1") return null;
  const now = runtimeNow();
  return {
    id: `mock-${type}-${Date.now()}`,
    type,
    status: "success" as const,
    projectId: project.slug,
    inputSummary: type,
    outputSummary: `Mock ${type}`,
    startedAt: now,
    finishedAt: now,
    durationMs: 1,
    result: {
      summary: `Mock ${type}`,
      content:
        type === "chapter.draft"
          ? `# ${chapter.title}\n\n这一章由自动驾驶运行时生成。主角在既有目标和风险之间作出选择，留下新的代价与钩子。\n`
          : `Mock result for ${chapter.title}`,
      changes: [],
      risks: [],
      questions: [],
      patches: []
    }
  };
}

async function runRuntimeTask(project: NovelProject, type: CodexTaskType, payload: Record<string, unknown>, chapter: NovelChapter) {
  return (await maybeMockTask(project, type, chapter)) || runNovelTask(project.slug, type, payload);
}

async function readText(root: string, relativePath: string): Promise<string> {
  try {
    return await fs.readFile(resolveInside(root, assertSafeNovelPath(relativePath)), "utf8");
  } catch {
    return "";
  }
}

async function patchToWrite(root: string, patch: NovelFilePatch): Promise<{ relativePath: string; content: string }> {
  const safeTarget = assertSafeNovelPath(patch.target);
  if (patch.mode === "replace-file") {
    return { relativePath: safeTarget, content: patch.content };
  }
  if (!patch.selection) {
    throw new Error("replace-selection patch requires selection");
  }
  const original = await readText(root, safeTarget);
  return {
    relativePath: safeTarget,
    content: `${original.slice(0, patch.selection.start)}${patch.content}${original.slice(patch.selection.end)}`
  };
}

function matchingRuntimePatches(project: NovelProject, chapter: NovelChapter, patches: NovelFilePatch[]): NovelFilePatch[] {
  const allowed = new Set([chapter.contentPath, chapter.outlinePath, path.basename(chapter.contentPath), path.basename(chapter.outlinePath)]);
  return patches.filter((patch) => allowed.has(patch.target));
}

function wordCount(content: string): number {
  const compact = content.replace(/\s+/g, "");
  const cjk = compact.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const words = content.match(/[a-zA-Z0-9]+/g)?.length || 0;
  return cjk + words;
}

function scoreDraft(input: { content: string; draftOk: boolean; checkOk: boolean; existingReport?: ChapterQualityReport | null }): number {
  if (input.existingReport) return input.existingReport.overallScore;
  let score = input.draftOk ? 62 : 35;
  if (input.checkOk) score += 10;
  const count = wordCount(input.content);
  if (count >= 1500) score += 12;
  else if (count >= 800) score += 8;
  else if (count >= 300) score += 4;
  if (/TODO|待补|placeholder/i.test(input.content)) score -= 10;
  return Math.max(0, Math.min(95, score));
}

function buildQualityReport(chapter: NovelChapter, score: number, notes: string[]): ChapterQualityReport {
  const updatedAt = runtimeNow();
  return {
    chapterId: chapter.id,
    overallScore: score,
    summary: notes.join("；") || "Runtime deterministic quality review.",
    metrics: [
      { key: "tension", label: "Tension", score, note: "Runtime score based on draft/check signals." },
      { key: "prose", label: "Prose", score: Math.max(0, score - 3), note: "Generated prose baseline." },
      { key: "rhythm", label: "Rhythm", score: Math.max(0, score - 5), note: "Estimated by content length and pipeline result." }
    ],
    strengths: score >= 70 ? ["Draft passed runtime quality gate."] : [],
    fixes: score < 70 ? ["Rewrite with clearer conflict, stronger hook, and fewer continuity risks."] : [],
    updatedAt
  };
}

function recapFromTask(chapter: NovelChapter, content: string, summary: string): WritingRecapCandidate {
  const createdAt = runtimeNow();
  return {
    chapterId: chapter.id,
    summary: summary || preview(content, 500),
    newFacts: [],
    characterStateChanges: [],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    createdAt,
    summaryPatch: {
      chapterId: chapter.id,
      summary: summary || preview(content, 500),
      keyEvents: [preview(content, 160)].filter(Boolean),
      updatedAt: createdAt
    }
  };
}

async function ensureRunActive(runId: string): Promise<RuntimeRun> {
  const run = getRuntimeRun(runId);
  if (!run) throw new Error(`Runtime run not found: ${runId}`);
  assertRunnable(run);
  return run;
}

async function runSingleChapterPipeline(run: RuntimeRun): Promise<RuntimeRun> {
  let project = await readProject(run.projectSlug);
  const root = projectRoot(project.slug);
  let currentRun = await markStage(run, "find_next_chapter");
  const chapter = selectTargetChapter(project, typeof run.input.chapterId === "string" ? run.input.chapterId : currentRun.chapterId);
  currentRun = updateRuntimeRun(currentRun.id, { chapterId: chapter.id }) || currentRun;

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "checkpoint_before_run");
  const writeCheckpoint = await createRuntimeCheckpoint({ root, project, run: currentRun, chapterId: chapter.id, label: `Before runtime ${chapter.title}` });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "prepare_narrative_snapshot");
  const snapshot = await buildNarrativeSnapshot(root, project, chapter);
  insertRuntimeSnapshot({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, snapshot });
  const snapshotRefs = insertRuntimeKnowledgeRefs(snapshotKnowledgeRefs({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, snapshot }));
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "prepare_narrative_snapshot",
    message: "Narrative snapshot prepared",
    payload: {
      contextBlocks: snapshot.contextBlocks.length,
      contextChars: snapshot.contextBudget?.totalFinalChars,
      truncatedBlocks: snapshot.contextBudget?.truncatedBlocks.map((block) => block.title) || [],
      ledgerSignals: snapshot.ledgerSignals.length,
      summarySignals: snapshot.summarySignals.length,
      blockingReasons: snapshot.blockingReasons || [],
      persistedRefs: snapshotRefs.length
    }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "chapter_plan");
  const planTask = await runRuntimeTask(project, "chapter.plan", { chapterId: chapter.id, roughIdea: run.input.direction || "" }, chapter);
  if (planTask.status !== "success") throw new Error(planTask.error || "chapter.plan failed");

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "context_assemble");
  await assembleContext("chapter.draft", root, project, { chapterId: chapter.id, direction: run.input.direction || "" });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "chapter_draft");
  const draftTask = await runRuntimeTask(project, "chapter.draft", { chapterId: chapter.id, roughIdea: run.input.direction || "" }, chapter);
  if (draftTask.status !== "success") throw new Error(draftTask.error || "chapter.draft failed");
  const draftResult = draftTask.result;
  const patchWrites = await Promise.all(matchingRuntimePatches(project, chapter, draftResult?.patches || []).map((patch) => patchToWrite(root, patch)));
  const draftContent = draftResult?.content?.trim() || "";
  const writes = patchWrites.length
    ? patchWrites
    : draftContent
      ? [{ relativePath: chapter.contentPath, content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n` }]
      : [];
  if (!writes.length) throw new Error("chapter.draft produced no runtime-applicable content");
  try {
    await dispatchRuntimeWrites({ root, project, run: currentRun, writes, reason: "chapter_draft", checkpoint: writeCheckpoint });
  } catch (error) {
    if (error instanceof RuntimeWriteConflictError) {
      const reviewRun = updateRuntimeRun(currentRun.id, {
        status: "review_required",
        result: {
          chapterId: chapter.id,
          reason: "runtime_write_conflict",
          path: error.relativePath,
          expectedSha256: error.expectedSha256,
          actualSha256: error.actualSha256
        },
        finishedAt: runtimeNow()
      });
      appendRuntimeEvent({
        projectSlug: project.slug,
        runId: currentRun.id,
        type: "review",
        stage: "chapter_draft",
        message: "Runtime paused because the target file changed after checkpoint",
        payload: {
          path: error.relativePath,
          expectedSha256: error.expectedSha256,
          actualSha256: error.actualSha256,
          action: "review_user_edit_before_overwrite"
        }
      });
      return reviewRun || currentRun;
    }
    throw error;
  }
  const savedContent = await readText(root, chapter.contentPath);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "content_validate");
  const checkTask = await runRuntimeTask(project, "continuity.check", { chapterId: chapter.id }, chapter);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "quality_review");
  const existingReport = await readChapterQualityReport(root, chapter.id);
  const score = scoreDraft({ content: savedContent, draftOk: draftTask.status === "success", checkOk: checkTask.status === "success", existingReport });
  const report = await saveChapterQualityReport(
    root,
    existingReport || buildQualityReport(chapter, score, [draftResult?.summary || "", checkTask.result?.summary || ""].filter(Boolean))
  );
  insertRuntimeQualityScore({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, score: report.overallScore, payload: { report } });
  currentRun = updateRuntimeRun(currentRun.id, { qualityScore: report.overallScore }) || currentRun;
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "quality",
    stage: "quality_review",
    message: `Quality score ${report.overallScore}`,
    payload: { score: report.overallScore }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "recap_and_ledger");
  const recapTask = await runRuntimeTask(project, "writing.recap", { chapterId: chapter.id }, chapter);
  const recap = recapFromTask(chapter, savedContent, recapTask.result?.summary || draftResult?.summary || "");
  await acceptWritingRecapPatches(root, recap);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "knowledge_index_update");
  const knowledge = await rebuildKnowledgeIndex(root, project);
  const query = await searchKnowledgeIndex(root, project, { query: `${chapter.title} ${recap.summary}`, chapterId: chapter.id, limit: 10 }).catch(
    () => null as KnowledgeSearchResult | null
  );
  const retrievedRefs = insertRuntimeKnowledgeRefs(
    searchKnowledgeRefs({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, result: query })
  );
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "knowledge_index_update",
    message: "Knowledge index updated",
    payload: {
      factCount: knowledge.facts.length,
      tripleCount: knowledge.triples.length,
      relatedFacts: query?.facts.length || 0,
      relatedTriples: query?.triples.length || 0,
      relatedChapters: query?.chapters.length || 0,
      persistedRefs: retrievedRefs.length
    }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "story_graph_update");
  const [graph, seriesMetrics] = await Promise.all([buildStoryGraphProjection(root, project), buildSeriesQualityMetrics(root, project)]);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "finalize_or_gate");
  project = await readProject(project.slug);
  const chapterIndex = project.chapters.findIndex((item) => item.id === chapter.id);
  if (chapterIndex >= 0) {
    project.chapters[chapterIndex] = {
      ...project.chapters[chapterIndex],
      status: report.overallScore >= 70 ? "drafted" : "planned"
    };
    project.lastOpenedChapterId = chapter.id;
    project.updatedAt = runtimeNow();
    await writeProject(project);
  }

  if (report.overallScore >= 70) {
    const completed = updateRuntimeRun(currentRun.id, {
      status: "completed",
      result: {
        chapterId: chapter.id,
        qualityScore: report.overallScore,
        graphNodes: graph.nodes.length,
        averageSeriesScore: seriesMetrics.averageOverallScore
      },
      finishedAt: runtimeNow()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "run",
      stage: "finalize_or_gate",
      message: "Runtime run completed",
      payload: { chapterId: chapter.id, score: report.overallScore }
    });
    return completed || currentRun;
  }

  if (currentRun.rewriteCount < 2 && report.overallScore >= 50) {
    const blockingReasons = ["quality_between_50_and_69", ...(snapshot.blockingReasons || [])];
    const rewrite = updateRuntimeRun(currentRun.id, {
      status: "review_required",
      rewriteCount: currentRun.rewriteCount + 1,
      result: { chapterId: chapter.id, qualityScore: report.overallScore, reason: "quality_rewrite_recommended", blockingReasons },
      finishedAt: runtimeNow()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "review",
      stage: "finalize_or_gate",
      message: "Runtime paused for targeted rewrite review",
      payload: { score: report.overallScore, blockingReasons }
    });
    return rewrite || currentRun;
  }

  const blockingReasons = ["quality_below_50", ...(snapshot.blockingReasons || [])];
  const gated = updateRuntimeRun(currentRun.id, {
    status: "review_required",
    result: { chapterId: chapter.id, qualityScore: report.overallScore, reason: "quality_below_gate", blockingReasons },
    finishedAt: runtimeNow()
  });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "review",
    stage: "finalize_or_gate",
    message: "Runtime requires human review",
    payload: { score: report.overallScore, blockingReasons }
  });
  return gated || currentRun;
}

async function processStart(command: RuntimeCommand): Promise<void> {
  const run = command.runId ? getRuntimeRun(command.runId) : null;
  if (!run) throw new Error(`Runtime start command has no run: ${command.id}`);
  appendRuntimeEvent({ projectSlug: command.projectSlug, runId: run.id, type: "command", message: "Runtime start command claimed", payload: { commandId: command.id } });
  await runSingleChapterPipeline(run);
}

async function processControl(command: RuntimeCommand): Promise<void> {
  const runId = command.runId || String(command.payload.runId || "");
  const run = runId ? getRuntimeRun(runId) : null;
  if (!run) throw new Error(`Runtime control command has no run: ${command.id}`);
  if (command.type === "pause") {
    updateRuntimeRun(run.id, { status: "paused" });
  } else if (command.type === "stop") {
    updateRuntimeRun(run.id, { status: "cancelled", finishedAt: runtimeNow() });
  } else if (command.type === "resume" || command.type === "rewrite") {
    updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
  } else if (command.type === "accept") {
    updateRuntimeRun(run.id, { status: "completed", finishedAt: runtimeNow() });
  } else if (command.type === "direction") {
    updateRuntimeRun(run.id, { result: { ...(run.result || {}), direction: command.payload.direction } });
  }
  appendRuntimeEvent({
    projectSlug: command.projectSlug,
    runId: run.id,
    type: "command",
    message: `Runtime ${command.type} command applied`,
    payload: { commandId: command.id }
  });
  if (command.type === "resume" || command.type === "rewrite") {
    await runSingleChapterPipeline({ ...run, status: "queued", input: { ...run.input, ...command.payload } });
  }
}

async function processDerivative(command: RuntimeCommand): Promise<void> {
  const project = await readProject(command.projectSlug);
  const root = projectRoot(project.slug);
  const run = command.runId ? getRuntimeRun(command.runId) : null;
  const branchRecord =
    typeof command.payload.branchId === "string"
      ? getRuntimeBranch(command.payload.branchId)
      : createRuntimeBranch({
          projectSlug: project.slug,
          baseRunId: command.runId,
          sourceChapterId: typeof command.payload.sourceChapterId === "string" ? command.payload.sourceChapterId : undefined,
          type: command.payload.type === "adaptation" || command.payload.type === "branch" ? command.payload.type : "side_story",
          title: String(command.payload.title || "Derivative branch"),
          payload: command.payload
        });
  if (!branchRecord) throw new Error(`Derivative branch not found: ${String(command.payload.branchId || "")}`);
  if (!run) throw new Error(`Derivative command has no runtime run: ${command.id}`);
  const sourceChapter =
    project.chapters.find((chapter) => chapter.id === branchRecord.sourceChapterId) ||
    project.chapters.find((chapter) => chapter.id === project.lastOpenedChapterId) ||
    orderedChapters(project)[0];
  if (!sourceChapter) throw new Error("Derivative branch requires at least one source chapter");
  const activeRun = run;
  updateRuntimeRun(activeRun.id, { status: "running", currentStage: "prepare_narrative_snapshot", startedAt: activeRun.startedAt || runtimeNow() });
  const checkpoint = await createRuntimeCheckpoint({
    root,
    project,
    run: activeRun,
    chapterId: sourceChapter.id,
    label: `Before derivative ${branchRecord.title}`
  });
  const snapshot = await buildNarrativeSnapshot(root, project, sourceChapter);
  insertRuntimeSnapshot({ projectSlug: project.slug, runId: activeRun.id, chapterId: sourceChapter.id, snapshot });

  updateRuntimeRun(activeRun.id, { currentStage: "chapter_draft" });
  const direction = String(command.payload.direction || command.payload.prompt || "");
  const task = await runRuntimeTask(
    project,
    "chapter.draft",
    {
      chapterId: sourceChapter.id,
      roughIdea: [
        `Derivative branch: ${branchRecord.title}`,
        `Type: ${branchRecord.type}`,
        "Canon policy: isolated read-only until user explicitly merges.",
        direction
      ]
        .filter(Boolean)
        .join("\n")
    },
    sourceChapter
  );
  if (task.status !== "success") throw new Error(task.error || "derivative draft failed");
  const draftContent = task.result?.content?.trim() || task.result?.summary || `# ${branchRecord.title}\n\n${direction}\n`;
  const branchRoot = `runtime/branches/${branchRecord.id}`;
  const specPath = `${branchRoot}/branch.json`;
  const draftPath = `${branchRoot}/draft.md`;
  await dispatchRuntimeWrites({
    root,
    project,
    run: activeRun,
    reason: "derivative_branch",
    writes: [
      {
        relativePath: specPath,
        content: `${JSON.stringify(
          {
            id: branchRecord.id,
            title: branchRecord.title,
            type: branchRecord.type,
            sourceChapterId: sourceChapter.id,
            canonPolicy: "isolated",
            checkpointId: checkpoint.id,
            direction,
            createdAt: runtimeNow()
          },
          null,
          2
        )}\n`
      },
      {
        relativePath: draftPath,
        content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n`
      }
    ]
  });
  const updatedBranch = updateRuntimeBranch(branchRecord.id, {
    status: "active",
    payload: {
      ...branchRecord.payload,
      canonPolicy: "isolated",
      checkpointId: checkpoint.id,
      draftPath,
      specPath,
      sourceChapterId: sourceChapter.id
    }
  });
  updateRuntimeRun(activeRun.id, {
    status: "completed",
    result: { branchId: branchRecord.id, draftPath, specPath, checkpointId: checkpoint.id },
    finishedAt: runtimeNow()
  });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: activeRun.id,
    type: "system",
    message: "Derivative branch generated in isolated runtime storage",
    payload: { branch: updatedBranch || branchRecord, draftPath, specPath, checkpointId: checkpoint.id }
  });
}

export async function processRuntimeCommand(command: RuntimeCommand): Promise<void> {
  try {
    if (command.type === "start") {
      await processStart(command);
    } else if (command.type === "derivative") {
      await processDerivative(command);
    } else {
      await processControl(command);
    }
    finishRuntimeCommand(command.id, "succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof RuntimeControlStop) {
      appendRuntimeEvent({
        projectSlug: command.projectSlug,
        runId: command.runId,
        type: "command",
        message,
        payload: { commandId: command.id, type: command.type, status: error.status }
      });
      finishRuntimeCommand(command.id, error.status === "cancelled" ? "cancelled" : "succeeded");
      return;
    }
    if (command.runId) {
      const run = getRuntimeRun(command.runId);
      if (run) {
        const failureCount = run.failureCount + 1;
        updateRuntimeRun(run.id, {
          status: failureCount >= 3 ? "review_required" : "failed",
          error: message,
          failureCount,
          finishedAt: runtimeNow()
        });
      }
    }
    appendRuntimeEvent({
      projectSlug: command.projectSlug,
      runId: command.runId,
      type: "error",
      message,
      payload: { commandId: command.id, type: command.type }
    });
    finishRuntimeCommand(command.id, "failed", message);
  }
}

export function runtimePipelineStages(): RuntimePipelineStage[] {
  return pipelineStages;
}
