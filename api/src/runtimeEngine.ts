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
import { qualityMeetsTarget, reviewChapterQuality, targetMetricsBelow, type QualityReviewOutcome } from "./chapterQualityReview.js";
import { upsertProjectRecord } from "./database.js";
import { readProject, projectRoot } from "./novelProject.js";
import { resolveInside, assertSafeNovelPath } from "./pathSafety.js";
import { runNovelTask } from "./taskService.js";
import { rebuildKnowledgeIndex, readKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import {
  appendWritingRecap,
  buildSeriesQualityMetrics,
  readChapterDashboard,
  readChapterSummary,
  readLedgerEntries,
  readSceneCards,
  readStoryControl,
  saveChapterQualityReport
} from "./writingCockpit.js";
import {
  appendRuntimeEvent,
  createRuntimeBranch,
  createRuntimeRun,
  enqueueRuntimeCommand,
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

const RUNTIME_QUALITY_TARGET = 86;
const RUNTIME_MAX_SELF_REPAIR_ATTEMPTS = 1;

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

function buildSnapshotBlockingReasons(snapshot: Pick<NarrativeSnapshot, "contextBudget" | "summarySignals" | "knowledgeSignals" | "qualityRisks" | "craftRisks">): string[] {
  const reasons: string[] = [];
  if (!snapshot.summarySignals.length) reasons.push("missing_chapter_summary_chain");
  if (!snapshot.knowledgeSignals.factCount && !snapshot.knowledgeSignals.tripleCount) reasons.push("missing_knowledge_index");
  if (snapshot.qualityRisks.length) reasons.push("open_high_risk_ledger_items");
  if (snapshot.craftRisks?.length) reasons.push("open_craft_gate_risks");
  if (snapshot.contextBudget?.truncatedBlocks.length) reasons.push("context_budget_truncated_sources");
  return reasons;
}

async function buildNarrativeSnapshot(root: string, project: NovelProject, chapter: NovelChapter): Promise<NarrativeSnapshot> {
  const [contextBlocks, storyControl, knowledge, currentSummary, currentScenes] = await Promise.all([
    assembleContext("chapter.draft", root, project, { chapterId: chapter.id }),
    readStoryControl(root),
    readKnowledgeIndex(root, project),
    readChapterSummary(root, chapter.id),
    readSceneCards(root, chapter.id)
  ]);
  const ledgers = await Promise.all(
    (["foreshadowing", "continuity", "power", "character", "risk"] as const).map((kind) => readLedgerEntries(root, kind))
  );
  const qualityRisks = ledgers
    .flat()
    .filter((entry) => entry.status === "blocked" || entry.severity === "high")
    .slice(0, 12)
    .map((entry) => `${entry.kind}:${entry.title}`);
  const craftRisks = currentScenes.length
    ? currentScenes
        .flatMap((scene) => scene.craftBeats || [])
        .filter((beat) => beat.required && beat.status === "missed")
        .map((beat) => `missed_craft_beat:${beat.id}:${beat.label}`)
    : ["missing_scene_craft_beats"];
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
    craftRisks,
    createdAt: runtimeNow()
  };
  snapshot.blockingReasons = buildSnapshotBlockingReasons(snapshot);
  return snapshot;
}

async function maybeMockTask(project: NovelProject, type: CodexTaskType, chapter: NovelChapter, payload: Record<string, unknown>) {
  if (process.env.RUNTIME_WORKER_MOCK !== "1") return null;
  const now = runtimeNow();
  if (type === "quality.rewrite") {
    const repairedChapter = [
      `# ${chapter.title}`,
      "",
      "咚咚。九莲宝山在夜色里猛然下沉，封印大阵沿着山壁一寸寸亮起血色裂纹。林玄喉间先是一腥，连呼吸都像被铁钩钉住。",
      "",
      "将臣并未急着破封，只在裂隙深处抬了一下眼。那一眼像寒潮漫过骨缝，逼得最前排弟子齐齐后退半步，可镇守千年的九脉主峰同时轰鸣，阵纹沿着祭坛、断崖、云层一层层推进。",
      "",
      "林玄按住胸前玉佩，旧伤当场崩开，血顺着指缝往下滴。他第一次看清，玉佩背面刻着和师父旧印同源的锁纹，而山下负责补阵的师兄已经被震碎半边护甲。",
      "",
      "他没有退，反而借着玉佩反震冲进阵眼，一剑斩断偏移的主链。整座宝山随之一震，坠落的山石在半空尽数爆碎，封印重新咬住将臣半边身躯，可林玄也因此吐血跪地。",
      "",
      "这一战结束时，九莲宝山少了三座副峰，弟子们在废墟里抬人止血，没人欢呼。林玄掌心的玉佩仍在发烫，像是在提醒他，今夜镇住的不是结局，只是旧债重新抬头。",
      "",
      "The rewrite now lands concrete conflict, visible cost, and an aftershock ending.",
      "",
      "quality-repaired"
    ].join("\n");
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
        content: repairedChapter,
        changes: ["quality-repaired"],
        risks: [],
        questions: [],
        patches: [
          {
            target: chapter.contentPath,
            mode: "replace-file" as const,
            content: `${repairedChapter}\n`
          }
        ]
      }
    };
  }
  if (type === "quality.review") {
    const currentContent = await readText(projectRoot(project.slug), chapter.contentPath);
    const improved = currentContent.includes("quality-repaired");
    const reviewPayload = improved
      ? {
          report: {
            chapterId: chapter.id,
            overallScore: 92,
            summary: "The rewrite now lands pressure, visible cost, and a real aftershock.",
            metrics: [
              { key: "rhythm", label: "Rhythm", score: 90, note: "Action and reaction beats are varied enough." },
              { key: "conflict", label: "Conflict", score: 93, note: "Opposition is concrete and escalating." },
              { key: "emotion", label: "Emotion", score: 91, note: "Emotion appears through embodied reaction." },
              { key: "information", label: "Information", score: 90, note: "The chapter reveals concrete new leverage." },
              { key: "prose", label: "Prose", score: 90, note: "Specific imagery replaced hollow elevation." },
              { key: "hook", label: "Hook", score: 94, note: "The ending leaves an aftershock with consequence." },
              { key: "tension", label: "Tension", score: 93, note: "Pressure stays active from opening through aftermath." }
            ],
            strengths: ["Pressure lands on page immediately.", "The ending changes what comes next."],
            fixes: ["Tighten a few explanatory lines if later drafts expand them."],
            updatedAt: now
          },
          topIssues: ["Trim any remaining explanation that does not change leverage."],
          antiPatternsHit: [],
          openingVerdict: "The first screen now lands pressure, hierarchy, and protagonist predicament.",
          endingVerdict: "The ending carries concrete aftershock instead of fake suspense.",
          rulesBasedSignals: ["combat scale includes environmental feedback"]
        }
      : {
          report: {
            chapterId: chapter.id,
            overallScore: 71,
            summary: "The draft is functional but still too explanatory and flat at key beats.",
            metrics: [
              { key: "rhythm", label: "Rhythm", score: 72, note: "Paragraph movement is serviceable but drag remains." },
              { key: "conflict", label: "Conflict", score: 74, note: "Pressure exists but does not escalate enough." },
              { key: "emotion", label: "Emotion", score: 68, note: "Too much summary emotion, not enough embodied reaction." },
              { key: "information", label: "Information", score: 71, note: "Some reveal exists but the chapter still explains instead of landing it." },
              { key: "prose", label: "Prose", score: 69, note: "The prose still leans on hollow grandeur and inert explanation." },
              { key: "hook", label: "Hook", score: 70, note: "The ending signals suspense more than consequence." },
              { key: "tension", label: "Tension", score: 73, note: "The opening has pressure but not enough aftermath and bodily cost." }
            ],
            strengths: ["There is a usable conflict frame."],
            fixes: ["Cut explanation, strengthen bodily cost, and land consequence."],
            updatedAt: now
          },
          topIssues: [
            "Open with harder pressure and less explanation.",
            "Replace summary emotion lines with embodied reaction.",
            "Turn the ending into consequence instead of fake suspense."
          ],
          antiPatternsHit: ["summary_style_emotion", "explanation_overload", "fake_suspense_ending"],
          openingVerdict: "The opening has some pressure, but it still warms up with explanation before fully landing the predicament.",
          endingVerdict: "The ending gestures at suspense but does not cash it out into concrete aftermath.",
          rulesBasedSignals: ["summary-style emotion paragraphs x1", "ending relies on fake suspense phrasing"]
        };
    return {
      id: `mock-${type}-${Date.now()}`,
      type,
      status: "success" as const,
      projectId: project.slug,
      inputSummary: JSON.stringify(payload).slice(0, 500),
      outputSummary: `Mock ${type}`,
      startedAt: now,
      finishedAt: now,
      durationMs: 1,
      result: {
        summary: `Mock ${type}`,
        content: JSON.stringify(reviewPayload, null, 2),
        changes: [],
        risks: [],
        questions: [],
        patches: []
      }
    };
  }
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
          ? `# ${chapter.title}\n\n林玄站在九莲宝山的石阶尽头，先听见封印发出第二声闷响，才看见夜空被血色阵纹撕开。山风卷着腥气往上冲，他知道自己若再退半步，身后的师弟就要先替他去死。\n\n将臣的影子在裂隙里抬眼，整片山壁跟着发震。林玄按住胸前玉佩，旧伤立刻崩开，血顺着指缝往下滴。今晚不是解释来历的时候，他只能带着代价往前走。\n\n而山下那道忽然亮起的旧印，也说明这场镇压远没有表面那么简单。\n`
          : `Mock result for ${chapter.title}`,
      changes: [],
      risks: [],
      questions: [],
      patches: []
    }
  };
}

async function runRuntimeTask(project: NovelProject, type: CodexTaskType, payload: Record<string, unknown>, chapter: NovelChapter) {
  return (await maybeMockTask(project, type, chapter, payload)) || runNovelTask(project.slug, type, payload);
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

interface RuntimeQualityReviewResult {
  outcome: QualityReviewOutcome;
  taskStatus: "success" | "failed";
  taskError?: string;
}

async function performQualityReview(input: {
  root: string;
  project: NovelProject;
  chapter: NovelChapter;
  content: string;
  targetScore: number;
  currentQualityReport?: ChapterQualityReport | null;
}): Promise<RuntimeQualityReviewResult> {
  const [dashboard, scenes] = await Promise.all([readChapterDashboard(input.root, input.chapter.id), readSceneCards(input.root, input.chapter.id)]);
  const payload = {
    chapterId: input.chapter.id,
    filePath: input.chapter.contentPath,
    documentKind: "content",
    chapterContent: input.content,
    dashboard,
    scenes,
    targetScore: input.targetScore,
    targetMetrics: input.currentQualityReport ? targetMetricsBelow(input.currentQualityReport, input.targetScore) : undefined,
    currentQualityReport: input.currentQualityReport || undefined
  };
  const reviewTask = await runRuntimeTask(input.project, "quality.review", payload, input.chapter);
  return {
    outcome: reviewChapterQuality({
      chapterId: input.chapter.id,
      content: input.content,
      dashboard,
      scenes,
      targetScore: input.targetScore,
      currentQualityReport: input.currentQualityReport,
      aiReviewContent: reviewTask.status === "success" ? reviewTask.result?.content : undefined,
      aiReviewSummary: reviewTask.status === "success" ? reviewTask.result?.summary : reviewTask.error
    }),
    taskStatus: reviewTask.status === "success" ? "success" : "failed",
    taskError: reviewTask.status === "success" ? undefined : reviewTask.error || "quality.review failed"
  };
}

function normalizedFullChapterWrite(chapter: NovelChapter, result?: { content?: string; patches?: NovelFilePatch[] }): NovelFilePatch | null {
  const patches = result?.patches || [];
  const targetPatch = patches.find((patch) => patch.mode === "replace-file" && patch.target === chapter.contentPath && Boolean(patch.content.trim()));
  const replacementPatch = patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
  const content = targetPatch?.content || result?.content?.trim() || replacementPatch?.content || "";
  return content.trim()
    ? {
        target: chapter.contentPath,
        mode: "replace-file",
        content: content.endsWith("\n") ? content : `${content}\n`
      }
    : null;
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

function normalizeRecapCandidate(chapter: NovelChapter, candidate: Partial<WritingRecapCandidate>): WritingRecapCandidate {
  const createdAt = candidate.createdAt || runtimeNow();
  return {
    chapterId: candidate.chapterId || chapter.id,
    summary: candidate.summary || "",
    newFacts: Array.isArray(candidate.newFacts) ? candidate.newFacts : [],
    characterStateChanges: Array.isArray(candidate.characterStateChanges) ? candidate.characterStateChanges : [],
    foreshadowingUpdates: Array.isArray(candidate.foreshadowingUpdates) ? candidate.foreshadowingUpdates : [],
    continuityRisks: Array.isArray(candidate.continuityRisks) ? candidate.continuityRisks : [],
    powerProgressionUpdates: Array.isArray(candidate.powerProgressionUpdates) ? candidate.powerProgressionUpdates : [],
    createdAt,
    summaryPatch: candidate.summaryPatch,
    emotionLedgerPatch: candidate.emotionLedgerPatch,
    factPatches: candidate.factPatches,
    ledgerPatches: candidate.ledgerPatches,
    characterStatePatches: candidate.characterStatePatches,
    riskPatches: candidate.riskPatches,
    craftBeatPatches: candidate.craftBeatPatches
  };
}

function parseWritingRecapCandidate(chapter: NovelChapter, raw?: unknown): WritingRecapCandidate | null {
  if (raw && typeof raw === "object") {
    return normalizeRecapCandidate(chapter, raw as Partial<WritingRecapCandidate>);
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const candidates = [raw.trim()];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.unshift(fenced);
  for (const content of candidates) {
    try {
      const parsed = JSON.parse(content) as Partial<WritingRecapCandidate>;
      if (parsed && typeof parsed === "object") {
        return normalizeRecapCandidate(chapter, parsed);
      }
    } catch {
      continue;
    }
  }
  return null;
}

function reviewablePatchCount(recap: WritingRecapCandidate): number {
  return (
    (recap.summaryPatch ? 1 : 0) +
    (recap.emotionLedgerPatch ? 1 : 0) +
    (recap.factPatches?.length || recap.newFacts.length) +
    (recap.characterStatePatches?.length || recap.characterStateChanges.length) +
    recap.foreshadowingUpdates.length +
    recap.continuityRisks.length +
    recap.powerProgressionUpdates.length +
    (recap.ledgerPatches?.length || 0) +
    (recap.riskPatches?.length || 0) +
    (recap.craftBeatPatches?.length || 0)
  );
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
  let savedContent = await readText(root, chapter.contentPath);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "content_validate");
  const checkTask = await runRuntimeTask(project, "continuity.check", { chapterId: chapter.id }, chapter);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "quality_review");
  let repairAttempt = 0;
  let qualityReview = await performQualityReview({
    root,
    project,
    chapter,
    content: savedContent,
    targetScore: RUNTIME_QUALITY_TARGET
  });
  let report = await saveChapterQualityReport(root, qualityReview.outcome.report);
  insertRuntimeQualityScore({
    projectSlug: project.slug,
    runId: currentRun.id,
    chapterId: chapter.id,
    score: report.overallScore,
    payload: {
      report,
      topIssues: qualityReview.outcome.topIssues,
      antiPatternsHit: qualityReview.outcome.antiPatternsHit,
      openingVerdict: qualityReview.outcome.openingVerdict,
      endingVerdict: qualityReview.outcome.endingVerdict,
      rulesBasedSignals: qualityReview.outcome.rulesBasedSignals
    }
  });
  currentRun = updateRuntimeRun(currentRun.id, { qualityScore: report.overallScore }) || currentRun;
  let craftRisks = qualityReview.outcome.antiPatternsHit;
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "quality",
    stage: "quality_review",
    message: "Runtime quality review completed",
    payload: {
      score: report.overallScore,
      targetScore: RUNTIME_QUALITY_TARGET,
      craftRisks,
      topIssues: qualityReview.outcome.topIssues,
      openingVerdict: qualityReview.outcome.openingVerdict,
      endingVerdict: qualityReview.outcome.endingVerdict,
      reviewTaskStatus: qualityReview.taskStatus,
      reviewTaskError: qualityReview.taskError
    }
  });
  while (!qualityMeetsTarget(report, RUNTIME_QUALITY_TARGET) && repairAttempt < RUNTIME_MAX_SELF_REPAIR_ATTEMPTS) {
    repairAttempt += 1;
    await ensureRunActive(currentRun.id);
    const targetMetrics = targetMetricsBelow(report, RUNTIME_QUALITY_TARGET);
    const rewritePayload = {
      chapterId: chapter.id,
      filePath: chapter.contentPath,
      documentKind: "content",
      targetScore: RUNTIME_QUALITY_TARGET,
      maxScore: 100,
      repairAttempt,
      targetMetrics,
      currentQualityReport: report,
      topIssues: qualityReview.outcome.topIssues,
      antiPatternsHit: qualityReview.outcome.antiPatternsHit,
      openingVerdict: qualityReview.outcome.openingVerdict,
      endingVerdict: qualityReview.outcome.endingVerdict,
      feedback: `Runtime self-repair: raise every metric to at least ${RUNTIME_QUALITY_TARGET} before author review.`
    };
    await assembleContext("quality.rewrite", root, project, rewritePayload);
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "quality",
      stage: "quality_review",
      message: "Runtime quality self-repair started",
      payload: { attempt: repairAttempt, score: report.overallScore, targetScore: RUNTIME_QUALITY_TARGET, targetMetrics }
    });
    const rewriteTask = await runRuntimeTask(project, "quality.rewrite", rewritePayload, chapter);
    if (rewriteTask.status !== "success") {
      appendRuntimeEvent({
        projectSlug: project.slug,
        runId: currentRun.id,
        type: "quality",
        stage: "quality_review",
        message: "Runtime quality self-repair failed",
        payload: { attempt: repairAttempt, error: rewriteTask.error || "quality.rewrite failed" }
      });
      break;
    }
    const rewritePatch = normalizedFullChapterWrite(chapter, rewriteTask.result);
    if (!rewritePatch) {
      appendRuntimeEvent({
        projectSlug: project.slug,
        runId: currentRun.id,
        type: "quality",
        stage: "quality_review",
        message: "Runtime quality self-repair produced no applicable chapter replacement",
        payload: { attempt: repairAttempt }
      });
      break;
    }
    const repairCheckpoint = await createRuntimeCheckpoint({ root, project, run: currentRun, chapterId: chapter.id, label: `Before quality repair ${repairAttempt} ${chapter.title}` });
    try {
      await dispatchRuntimeWrites({
        root,
        project,
        run: currentRun,
        writes: [await patchToWrite(root, rewritePatch)],
        reason: "quality_self_repair",
        checkpoint: repairCheckpoint
      });
    } catch (error) {
      if (error instanceof RuntimeWriteConflictError) {
        const reviewRun = updateRuntimeRun(currentRun.id, {
          status: "review_required",
          result: {
            chapterId: chapter.id,
            reason: "runtime_quality_repair_conflict",
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
          stage: "quality_review",
          message: "Runtime paused because the target file changed before quality self-repair",
          payload: { path: error.relativePath, attempt: repairAttempt, action: "review_user_edit_before_quality_repair" }
        });
        return reviewRun || currentRun;
      }
      throw error;
    }
    savedContent = await readText(root, chapter.contentPath);
    qualityReview = await performQualityReview({
      root,
      project,
      chapter,
      content: savedContent,
      targetScore: RUNTIME_QUALITY_TARGET,
      currentQualityReport: report
    });
    report = await saveChapterQualityReport(root, qualityReview.outcome.report);
    insertRuntimeQualityScore({
      projectSlug: project.slug,
      runId: currentRun.id,
      chapterId: chapter.id,
      score: report.overallScore,
      payload: {
        report,
        repairAttempt,
        topIssues: qualityReview.outcome.topIssues,
        antiPatternsHit: qualityReview.outcome.antiPatternsHit,
        openingVerdict: qualityReview.outcome.openingVerdict,
        endingVerdict: qualityReview.outcome.endingVerdict,
        rulesBasedSignals: qualityReview.outcome.rulesBasedSignals
      }
    });
    currentRun = updateRuntimeRun(currentRun.id, { qualityScore: report.overallScore, rewriteCount: repairAttempt }) || currentRun;
    craftRisks = qualityReview.outcome.antiPatternsHit;
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "quality",
      stage: "quality_review",
      message: "Runtime quality self-repair applied",
      payload: {
        attempt: repairAttempt,
        score: report.overallScore,
        targetScore: RUNTIME_QUALITY_TARGET,
        craftRisks,
        topIssues: qualityReview.outcome.topIssues,
        openingVerdict: qualityReview.outcome.openingVerdict,
        endingVerdict: qualityReview.outcome.endingVerdict,
        reviewTaskStatus: qualityReview.taskStatus,
        reviewTaskError: qualityReview.taskError
      }
    });
  }

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "recap_and_ledger");
  const recapTask = await runRuntimeTask(project, "writing.recap", { chapterId: chapter.id }, chapter);
  const recapSource =
    (recapTask.result as { content?: unknown; rawOutput?: string } | undefined)?.content ||
    (recapTask.result as { rawOutput?: string } | undefined)?.rawOutput;
  const recap =
    parseWritingRecapCandidate(chapter, recapSource) ||
    recapFromTask(chapter, savedContent, recapTask.result?.summary || draftResult?.summary || "");
  const pendingRecapPatchCount = reviewablePatchCount(recap);
  await appendWritingRecap(root, recap);
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "review",
    stage: "recap_and_ledger",
    message: "Writing recap candidate saved for author approval",
    payload: { chapterId: chapter.id, pendingRecapPatchCount }
  });

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
      status: qualityMeetsTarget(report, RUNTIME_QUALITY_TARGET) ? "drafted" : "planned"
    };
    project.lastOpenedChapterId = chapter.id;
    project.updatedAt = runtimeNow();
    try {
      await dispatchRuntimeWrites({
        root,
        project,
        run: currentRun,
        reason: "runtime_project_finalize",
        checkpoint: writeCheckpoint,
        allowProjectJson: true,
        writes: [{ relativePath: "project.json", content: `${JSON.stringify(project, null, 2)}\n` }]
      });
      upsertProjectRecord(project, root);
    } catch (error) {
      if (error instanceof RuntimeWriteConflictError) {
        const reviewRun = updateRuntimeRun(currentRun.id, {
          status: "review_required",
          result: {
            chapterId: chapter.id,
            reason: "runtime_project_conflict",
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
          stage: "finalize_or_gate",
          message: "Runtime paused because project metadata changed after checkpoint",
          payload: {
            path: error.relativePath,
            action: "review_project_metadata_before_overwrite"
          }
        });
        return reviewRun || currentRun;
      }
      throw error;
    }
  }

  if (qualityMeetsTarget(report, RUNTIME_QUALITY_TARGET) && pendingRecapPatchCount > 0) {
    const blockingReasons = ["recap_patches_pending", ...(craftRisks.length ? ["quality_review_followup_needed"] : []), ...(snapshot.blockingReasons || [])];
    const review = updateRuntimeRun(currentRun.id, {
      status: "review_required",
      result: {
        chapterId: chapter.id,
        qualityScore: report.overallScore,
        graphNodes: graph.nodes.length,
        averageSeriesScore: seriesMetrics.averageOverallScore,
        reason: "recap_patches_pending",
        targetScore: RUNTIME_QUALITY_TARGET,
        repairAttempts: repairAttempt,
        pendingRecapPatchCount,
        craftRisks,
        topIssues: qualityReview.outcome.topIssues,
        blockingReasons
      },
      finishedAt: runtimeNow()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "review",
      stage: "finalize_or_gate",
      message: "Runtime paused for recap patch approval",
      payload: { chapterId: chapter.id, pendingRecapPatchCount, craftRisks, blockingReasons }
    });
    return review || currentRun;
  }

  if (qualityMeetsTarget(report, RUNTIME_QUALITY_TARGET)) {
    const blockingReasons = ["quality_target_met_author_review", ...(snapshot.blockingReasons || [])];
    const review = updateRuntimeRun(currentRun.id, {
      status: "review_required",
      result: {
        chapterId: chapter.id,
        qualityScore: report.overallScore,
        graphNodes: graph.nodes.length,
        averageSeriesScore: seriesMetrics.averageOverallScore,
        reason: "quality_target_met_author_review",
        targetScore: RUNTIME_QUALITY_TARGET,
        repairAttempts: repairAttempt,
        blockingReasons
      },
      finishedAt: runtimeNow()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "review",
      stage: "finalize_or_gate",
      message: "Runtime paused for author review after quality target was met",
      payload: { chapterId: chapter.id, score: report.overallScore, targetScore: RUNTIME_QUALITY_TARGET, repairAttempts: repairAttempt, blockingReasons }
    });
    return review || currentRun;
  }

  const blockingReasons = ["quality_below_runtime_target", ...(snapshot.blockingReasons || [])];
  const gated = updateRuntimeRun(currentRun.id, {
    status: "review_required",
    result: {
      chapterId: chapter.id,
      qualityScore: report.overallScore,
      reason: "quality_below_runtime_target",
      targetScore: RUNTIME_QUALITY_TARGET,
      repairAttempts: repairAttempt,
      targetMetrics: targetMetricsBelow(report, RUNTIME_QUALITY_TARGET),
      topIssues: qualityReview.outcome.topIssues,
      antiPatternsHit: qualityReview.outcome.antiPatternsHit,
      blockingReasons
    },
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

