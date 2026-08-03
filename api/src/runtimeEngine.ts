import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterQualityReport,
  CodexTaskType,
  KnowledgeIndexProjection,
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
import { buildStoryGraphProjection, readStoryGraphProjection, writeStoryGraphProjection } from "./storyGraph.js";
import {
  appendWritingRecapIfMissing,
  buildSeriesQualityMetrics,
  readChapterDashboard,
  readChapterQualityReport,
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
  getRuntimeCheckpoint,
  getRuntimeRun,
  getLatestRuntimeSnapshot,
  insertRuntimeKnowledgeRefs,
  insertRuntimeQualityScore,
  insertRuntimeSnapshot,
  runtimeNow,
  updateRuntimeBranch,
  updateRuntimeRun
} from "./runtimeStore.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, RuntimeWriteConflictError } from "./runtimeFiles.js";
import { advanceSteeringEvent, readSteeringEvent } from "./steeringEvent.js";
import { recordRuntimeControlBoundary } from "./runtimeControlBoundary.js";
import { recordRuntimeMutationDrain } from "./runtimeMutationDrain.js";
import { cancelExecutionWorkItem, claimExecutionWorkItem, executionWorkItemId, finishExecutionWorkItem, heartbeatExecutionWorkItem } from "./executionQueue.js";
import { createProseCandidate, validateProseCandidate } from "./proseCandidate.js";
import { readContextManifest } from "./contextManifest.js";
import { readExecutionReadyProof } from "./outlineCommit.js";
import { assertMemoryProjectionCanGenerate, evaluateMemoryProjectionFreshness, type MemoryProjectionFreshness } from "./memoryProjectionGate.js";
import { isRuntimeStageOutputAvailable, isRuntimeStageOutputReusable, listRuntimeStageReceipts, recordRuntimeStageReceipt, selectFirstUnsettledRuntimeStage, stageInputFingerprint } from "./runtimeStageReceipt.js";
import { readRuntimeStageOutput, writeRuntimeStageOutput } from "./runtimeStageOutput.js";
import { attachQualityReportEvidence } from "./qualityReportEvidence.js";
import { recordRuntimeRetryReceipt } from "./runtimeRecovery.js";
import { applyRuntimeCompensation, recordRuntimeCompensation } from "./runtimeCompensation.js";
import { assertModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { createChapterExecutionPlan, verifyChapterExecutionPlan } from "./chapterExecutionPlan.js";
import { createChapterExecutionProof, verifyChapterExecutionProof } from "./chapterExecutionProof.js";

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
const activeRuntimeAbortControllers = new Map<string, { controller: AbortController; runId: string }>();
const activeRuntimeAuthority = new Map<string, { bookRunId?: string; authorityBinding?: unknown }>();
function runtimeTaskKey(projectSlug: string, chapterId: string): string { return `${projectSlug}:${chapterId}`; }
const RUNTIME_MAX_SELF_REPAIR_ATTEMPTS = 1;

function stableKnowledgeFingerprint(value: KnowledgeIndexProjection): string {
  const stable = JSON.parse(JSON.stringify(value, (key, entry) => (key === "updatedAt" ? undefined : entry)));
  return stageInputFingerprint(stable);
}

function governedProject(project: NovelProject): boolean {
  const outlineVersion = (project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion;
  const migration = (project as NovelProject & { migration?: { state?: string } }).migration;
  return Boolean(outlineVersion?.versionId || migration?.state === "activated");
}

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

async function markStage(
  run: RuntimeRun,
  stage: RuntimePipelineStage,
  previousOutputFingerprint?: string,
  previousOutputRef?: string,
  inputFingerprintOverride?: string,
  previousStageInputFingerprintOverride?: string
): Promise<RuntimeRun> {
  const current = getRuntimeRun(run.id);
  if (current?.status === "running" && current.result?.pauseRequested === true) {
    const paused = updateRuntimeRun(run.id, {
      status: "paused",
      result: {
        ...(current.result || {}),
        pauseRequested: false,
        pauseAcknowledgedAt: runtimeNow()
      }
    });
    appendRuntimeEvent({
      projectSlug: run.projectSlug,
      runId: run.id,
      type: "command",
      message: "Runtime pause acknowledged at safe boundary",
      payload: { stage: current.currentStage || stage }
    });
    throw new RuntimeControlStop("paused");
  }
  assertRunnable(current || run);
  const root = projectRoot(run.projectSlug);
  const inputFingerprint = stageInputFingerprint({ input: run.input, chapterId: run.chapterId, stage });
  if (current?.currentStage && current.currentStage !== stage) {
    await recordRuntimeStageReceipt(root, { projectSlug: run.projectSlug, runId: run.id, chapterId: run.chapterId, stage: current.currentStage, status: "completed", inputFingerprint: previousStageInputFingerprintOverride || stageInputFingerprint({ input: run.input, chapterId: run.chapterId, stage: current.currentStage }), ...(previousOutputFingerprint ? { outputFingerprint: previousOutputFingerprint } : {}), ...(previousOutputRef ? { outputRef: previousOutputRef } : {}) });
  }
  await recordRuntimeStageReceipt(root, { projectSlug: run.projectSlug, runId: run.id, chapterId: run.chapterId, stage, status: "started", inputFingerprint: inputFingerprintOverride || inputFingerprint });
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

export function buildSnapshotBlockingReasons(snapshot: Pick<NarrativeSnapshot, "contextBudget" | "summarySignals" | "knowledgeSignals" | "qualityRisks" | "craftRisks">): string[] {
  const reasons: string[] = [];
  if (!snapshot.summarySignals.length) reasons.push("missing_chapter_summary_chain");
  if (!snapshot.knowledgeSignals.factCount && !snapshot.knowledgeSignals.tripleCount) reasons.push("missing_knowledge_index");
  if ((snapshot.knowledgeSignals.legacyFactCount || 0) > 0 && !(snapshot.knowledgeSignals.eligibleMemoryClaimCount || 0)) reasons.push("LEGACY_PROJECTION_ONLY");
  if (snapshot.qualityRisks.length) reasons.push("open_high_risk_ledger_items");
  if (snapshot.craftRisks?.length) reasons.push("open_craft_gate_risks");
  if (snapshot.contextBudget?.truncatedBlocks.length) reasons.push("context_budget_truncated_sources");
  return reasons;
}

export function applyMemoryProjectionGate(snapshot: NarrativeSnapshot, freshness: MemoryProjectionFreshness): NarrativeSnapshot {
  return {
    ...snapshot,
    memoryProjection: freshness,
    blockingReasons: [...new Set([...(snapshot.blockingReasons || []), ...freshness.blockingReasons])]
  };
}

async function buildNarrativeSnapshot(root: string, project: NovelProject, chapter: NovelChapter): Promise<NarrativeSnapshot> {
  const [contextBlocks, storyControl, knowledge, currentSummary, currentScenes] = await Promise.all([
    assembleContext("chapter.draft", root, project, { chapterId: chapter.id, visibilityAudience: "model-task" }),
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
      legacyFactCount: knowledge.facts.filter((fact) => fact.source.type !== "memory-claim").length,
      eligibleMemoryClaimCount: knowledge.facts.filter((fact) => fact.source.type === "memory-claim").length,
      projectionAuthority: knowledge.facts.some((fact) => fact.source.type === "memory-claim")
        ? knowledge.facts.some((fact) => fact.source.type !== "memory-claim") ? "mixed" : "memory-claim-backed"
        : "legacy-only",
      vectorSummary: knowledge.vectorSummary
    },
    qualityRisks,
    craftRisks,
    createdAt: runtimeNow()
  };
  snapshot.blockingReasons = buildSnapshotBlockingReasons(snapshot);
  return applyMemoryProjectionGate(snapshot, await evaluateMemoryProjectionFreshness(root));
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
  const effectivePayload = { ...payload, ...(activeRuntimeAuthority.get(runtimeTaskKey(project.slug, chapter.id)) || {}) };
  if (effectivePayload.bookRunId) {
    if (typeof effectivePayload.bookRunId !== "string" || !effectivePayload.bookRunId.trim() || !effectivePayload.authorityBinding) throw new Error("RUNTIME_MODEL_AUTHORITY_BINDING_REQUIRED");
    assertModelInvocationAuthorityBinding(effectivePayload.authorityBinding);
  }
  const mocked = await maybeMockTask(project, type, chapter, effectivePayload);
  if (mocked) return mocked;
  const active = activeRuntimeAbortControllers.get(runtimeTaskKey(project.slug, chapter.id));
  const task = await runNovelTask(project.slug, type, { ...effectivePayload, runId: active?.runId || payload.runId }, undefined, active ? { signal: active.controller.signal } : undefined);
  if (task.status === "cancelled") {
    const current = active ? getRuntimeRun(active.runId) : payload.runId && typeof payload.runId === "string" ? getRuntimeRun(payload.runId) : null;
    if (current && (current.status === "paused" || current.status === "cancelled")) throw new RuntimeControlStop(current.status);
  }
  return task;
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
  const chapter = selectTargetChapter(project, typeof run.input.chapterId === "string" ? run.input.chapterId : run.chapterId);
  const existingReceipts = await listRuntimeStageReceipts(root, run.id);
  const expectedInputFingerprints = Object.fromEntries(pipelineStages.map((stage) => [stage, stageInputFingerprint({ input: run.input, chapterId: chapter.id, stage })]));
  const resumeDecision = selectFirstUnsettledRuntimeStage(existingReceipts, pipelineStages, expectedInputFingerprints);
  appendRuntimeEvent({ projectSlug: project.slug, runId: run.id, type: "system", message: "Runtime stage recovery decision", payload: { resumeDecision, receiptCount: existingReceipts.length } });
  const findNextCompleted = existingReceipts.some((receipt) => receipt.stage === "find_next_chapter" && receipt.status === "completed" && receipt.inputFingerprint === expectedInputFingerprints.find_next_chapter);
  let currentRun = findNextCompleted
    ? (updateRuntimeRun(run.id, { status: "running", currentStage: "find_next_chapter", startedAt: run.startedAt || runtimeNow() }) || run)
    : await markStage(run, "find_next_chapter");
  currentRun = updateRuntimeRun(currentRun.id, { chapterId: chapter.id }) || currentRun;

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "checkpoint_before_run");
  const checkpointReceipt = existingReceipts.find((receipt) => receipt.stage === "checkpoint_before_run");
  const persistedCheckpoint = checkpointReceipt?.outputRef ? getRuntimeCheckpoint(checkpointReceipt.outputRef) : null;
  const persistedCheckpointFingerprint = persistedCheckpoint
    ? stageInputFingerprint({ checkpointId: persistedCheckpoint.id, manifest: persistedCheckpoint.manifest })
    : "";
  const checkpointReusable = Boolean(
    persistedCheckpoint &&
      isRuntimeStageOutputReusable(checkpointReceipt, expectedInputFingerprints.checkpoint_before_run, persistedCheckpointFingerprint, persistedCheckpoint.id)
  );
  const writeCheckpoint = checkpointReusable
    ? persistedCheckpoint!
    : await createRuntimeCheckpoint({ root, project, run: currentRun, chapterId: chapter.id, label: `Before runtime ${chapter.title}` });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "checkpoint_before_run",
    message: checkpointReusable ? "Runtime checkpoint reused from receipt" : "Runtime checkpoint created",
    payload: { checkpointId: writeCheckpoint.id, outputFingerprint: stageInputFingerprint({ checkpointId: writeCheckpoint.id, manifest: writeCheckpoint.manifest }), reused: checkpointReusable }
  });

  await ensureRunActive(currentRun.id);
  const checkpointOutputFingerprint = stageInputFingerprint({ checkpointId: writeCheckpoint.id, manifest: writeCheckpoint.manifest });
  currentRun = await markStage(currentRun, "prepare_narrative_snapshot", checkpointOutputFingerprint, writeCheckpoint.id);
  const persistedSnapshot = getLatestRuntimeSnapshot(project.slug, currentRun.id);
  const snapshotReceipt = existingReceipts.find((receipt) => receipt.stage === "prepare_narrative_snapshot");
  const persistedSnapshotFingerprint = persistedSnapshot ? stageInputFingerprint(persistedSnapshot.snapshot) : "";
  const snapshotReusable = Boolean(
    persistedSnapshot &&
      isRuntimeStageOutputReusable(snapshotReceipt, expectedInputFingerprints.prepare_narrative_snapshot, persistedSnapshotFingerprint, persistedSnapshot.id)
  );
  let snapshot: NarrativeSnapshot;
  let persistedSnapshotRecord = persistedSnapshot;
  if (snapshotReusable && persistedSnapshot) {
    snapshot = persistedSnapshot.snapshot;
  } else {
    snapshot = await buildNarrativeSnapshot(root, project, chapter);
    persistedSnapshotRecord = insertRuntimeSnapshot({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, snapshot });
  }
  const snapshotRefs = snapshotReusable
    ? []
    : insertRuntimeKnowledgeRefs(snapshotKnowledgeRefs({ projectSlug: project.slug, runId: currentRun.id, chapterId: chapter.id, snapshot }));
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "prepare_narrative_snapshot",
    message: snapshotReusable ? "Narrative snapshot reused from receipt" : "Narrative snapshot prepared",
    payload: {
      contextBlocks: snapshot.contextBlocks.length,
      contextChars: snapshot.contextBudget?.totalFinalChars,
      truncatedBlocks: snapshot.contextBudget?.truncatedBlocks.map((block) => block.title) || [],
      ledgerSignals: snapshot.ledgerSignals.length,
      summarySignals: snapshot.summarySignals.length,
      blockingReasons: snapshot.blockingReasons || [],
      persistedRefs: snapshotRefs.length,
      snapshotId: persistedSnapshotRecord?.id,
      outputFingerprint: stageInputFingerprint(snapshot),
      reused: snapshotReusable
    }
  });

  assertMemoryProjectionCanGenerate(snapshot.memoryProjection || { status: "unknown", blockingReasons: ["MEMORY_PROJECTION_UNKNOWN"], affectedClaimIds: [] });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "chapter_plan", stageInputFingerprint(snapshot), persistedSnapshotRecord?.id);
  const planReceipt = existingReceipts.find((receipt) => receipt.stage === "chapter_plan");
  const persistedPlan = await readRuntimeStageOutput<Awaited<ReturnType<typeof runRuntimeTask>>["result"]>(root, currentRun.id, "chapter_plan");
  const planReusable = Boolean(
    persistedPlan &&
      isRuntimeStageOutputReusable(planReceipt, expectedInputFingerprints.chapter_plan, persistedPlan.fingerprint, persistedPlan.outputId)
  );
  const planTask = planReusable
    ? ({ status: "success", result: persistedPlan!.value } as Awaited<ReturnType<typeof runRuntimeTask>>)
    : await runRuntimeTask(project, "chapter.plan", { chapterId: chapter.id, roughIdea: run.input.direction || "" }, chapter);
  if (planTask.status !== "success") throw new Error(planTask.error || "chapter.plan failed");
  const planOutput = planReusable
    ? persistedPlan!
    : await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "chapter_plan", value: planTask.result });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "chapter_plan",
    message: planReusable ? "Chapter plan reused from receipt" : "Chapter plan persisted for recovery",
    payload: { outputRef: planOutput.outputId, outputFingerprint: planOutput.fingerprint, reused: planReusable }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "context_assemble", planOutput.fingerprint, planOutput.outputId);
  const contextReceipt = existingReceipts.find((receipt) => receipt.stage === "context_assemble");
  const persistedContextOutput = await readRuntimeStageOutput<Array<{ title: string; content: string }>>(root, currentRun.id, "context_assemble");
  const contextReusable = Boolean(
    persistedContextOutput &&
      isRuntimeStageOutputAvailable(contextReceipt, expectedInputFingerprints.context_assemble, persistedContextOutput.fingerprint, persistedContextOutput.outputId)
  );
  const contextBlocks = contextReusable
    ? persistedContextOutput!.value
    : await assembleContext("chapter.draft", root, project, { chapterId: chapter.id, direction: run.input.direction || "", visibilityAudience: "model-task" });
  const contextOutput = contextReusable
    ? { outputId: persistedContextOutput!.outputId, fingerprint: persistedContextOutput!.fingerprint }
    : await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "context_assemble", value: contextBlocks });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "context_assemble",
    message: contextReusable ? "Context assembly reused from receipt" : "Context assembly persisted for recovery",
    payload: { outputRef: contextOutput.outputId, outputFingerprint: contextOutput.fingerprint, blockCount: contextBlocks.length, reused: contextReusable }
  });

  const governedExecutionPlan = governedProject(project)
    ? await (async () => {
      const proof = await readExecutionReadyProof(root);
      if (!proof?.fingerprint || proof.status !== "ready" || !proof.executionReady) throw new Error("EXECUTION_READY_PROOF_REQUIRED_FOR_PLAN_CONSUMPTION");
      const plan = await createChapterExecutionPlan(root, {
        projectSlug: project.slug,
        chapterId: chapter.id,
        executionProofFingerprint: proof.fingerprint,
        contextFingerprint: contextOutput.fingerprint,
        planOutputId: planOutput.outputId,
        planFingerprint: planOutput.fingerprint,
        plan: planTask.result
      });
      if (!verifyChapterExecutionPlan(plan, { projectSlug: project.slug, chapterId: chapter.id, executionProofFingerprint: proof.fingerprint, contextFingerprint: contextOutput.fingerprint, planFingerprint: planOutput.fingerprint })) throw new Error("CHAPTER_EXECUTION_PLAN_STALE");
      return plan;
    })()
    : null;
  const governedChapterExecutionProof = governedExecutionPlan
    ? await (async () => {
      const parentProof = await readExecutionReadyProof(root);
      if (!parentProof?.fingerprint || parentProof.status !== "ready" || !parentProof.executionReady) throw new Error("EXECUTION_READY_PROOF_REQUIRED_FOR_CHAPTER_PROOF");
      const proof = await createChapterExecutionProof(root, { projectSlug: project.slug, chapterId: chapter.id, planId: governedExecutionPlan.planId, planFingerprint: governedExecutionPlan.planFingerprint, parentExecutionReadyProofFingerprint: parentProof.fingerprint, contextFingerprint: governedExecutionPlan.contextFingerprint });
      if (!verifyChapterExecutionProof(proof, { projectSlug: project.slug, chapterId: chapter.id, planId: governedExecutionPlan.planId, planFingerprint: governedExecutionPlan.planFingerprint, parentExecutionReadyProofFingerprint: parentProof.fingerprint, contextFingerprint: governedExecutionPlan.contextFingerprint })) throw new Error("CHAPTER_EXECUTION_PROOF_STALE");
      return proof;
    })()
    : null;
  if (governedExecutionPlan) appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "chapter_plan",
    message: "Governed chapter execution plan bound to proof and context",
    payload: { executionPlanId: governedExecutionPlan.planId, executionPlanFingerprint: governedExecutionPlan.fingerprint, chapterExecutionProofId: governedChapterExecutionProof?.proofId, chapterExecutionProofFingerprint: governedChapterExecutionProof?.fingerprint, executionProofFingerprint: governedExecutionPlan.executionProofFingerprint, contextFingerprint: governedExecutionPlan.contextFingerprint }
  });

  await ensureRunActive(currentRun.id);
  const draftInputFingerprint = stageInputFingerprint({ input: run.input, chapterId: chapter.id, stage: "chapter_draft", contextFingerprint: contextOutput.fingerprint });
  expectedInputFingerprints.chapter_draft = draftInputFingerprint;
  currentRun = await markStage(currentRun, "chapter_draft", contextOutput.fingerprint, contextOutput.outputId, draftInputFingerprint);
  const draftPayload = {
    chapterId: chapter.id,
    roughIdea: run.input.direction || "",
    chapterPlan: planTask.result,
    chapterPlanFingerprint: planOutput.fingerprint,
    ...(governedExecutionPlan ? { chapterExecutionPlan: governedExecutionPlan.plan, chapterExecutionPlanFingerprint: governedExecutionPlan.fingerprint } : {}),
    ...(governedChapterExecutionProof ? { chapterExecutionProofFingerprint: governedChapterExecutionProof.fingerprint } : {}),
    contextFingerprint: contextOutput.fingerprint,
    contextOutputRef: contextOutput.outputId
  };
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "chapter_draft",
    message: "Chapter plan bound to draft input",
    payload: { chapterPlanFingerprint: planOutput.fingerprint, chapterPlanOutputRef: planOutput.outputId }
  });
  const draftReceipt = existingReceipts.find((receipt) => receipt.stage === "chapter_draft");
  const persistedDraft = await readRuntimeStageOutput<Awaited<ReturnType<typeof runRuntimeTask>>["result"]>(root, currentRun.id, "chapter_draft");
  const draftReusable = Boolean(
    persistedDraft &&
      isRuntimeStageOutputAvailable(draftReceipt, expectedInputFingerprints.chapter_draft, persistedDraft.fingerprint, persistedDraft.outputId)
  );
  const draftTask = draftReusable
    ? ({ status: "success", result: persistedDraft!.value } as Awaited<ReturnType<typeof runRuntimeTask>>)
    : await runRuntimeTask(project, "chapter.draft", draftPayload, chapter);
  if (draftTask.status !== "success") throw new Error(draftTask.error || "chapter.draft failed");
  const draftResult = draftTask.result;
  const draftOutput = draftReusable
    ? persistedDraft!
    : await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "chapter_draft", value: draftResult });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "chapter_draft",
    message: draftReusable ? "Draft output reused from receipt" : "Draft output persisted for recovery",
    payload: { outputRef: draftOutput.outputId, outputFingerprint: draftOutput.fingerprint, reused: draftReusable }
  });
  const governedOutline = (project as NovelProject & { outlineVersion?: { versionId?: string; fingerprint?: string } }).outlineVersion;
  if (governedProject(project)) {
    if (typeof run.input.generationManifestId !== "string" || !run.input.generationManifestId.trim()) throw new Error("PROSE_GENERATION_MANIFEST_REQUIRED");
    if (!governedOutline?.versionId) throw new Error("GOVERNED_OUTLINE_POINTER_REQUIRED");
    if (!governedOutline.fingerprint) throw new Error("GOVERNED_OUTLINE_FINGERPRINT_REQUIRED");
    const proof = await readExecutionReadyProof(root);
    const context = await readContextManifest(root, { allowLegacyExecutionMetadata: true });
    const sourceFingerprint = [governedOutline.versionId, governedOutline.fingerprint, proof?.fingerprint || "", context?.sourceFingerprint || "", chapter.id].join(":");
    const candidate = await createProseCandidate({
      root,
      projectSlug: project.slug,
      chapterId: chapter.id,
      content: draftResult?.content?.trim() || draftResult?.summary?.trim() || "",
      outlineVersionId: governedOutline.versionId,
      executionProofFingerprint: proof?.fingerprint || "",
      sourceFingerprint,
      ...(typeof run.input.generationManifestId === "string" ? { generationManifestId: run.input.generationManifestId } : {}),
      policyVersion: "tiered-quality.v1",
      riskTier: run.input.riskTier === "key" || run.input.riskTier === "elevated" ? run.input.riskTier : "ordinary"
    });
    const validation = await validateProseCandidate(root, candidate);
    if (validation.status !== "passed") throw new Error(`PROSE_CANDIDATE_${validation.reasons.join("_")}`);
    const candidateRun = updateRuntimeRun(currentRun.id, {
      status: "review_required",
      result: { chapterId: chapter.id, reason: "prose_candidate_ready", candidateId: candidate.candidateId, candidateFingerprint: candidate.fingerprint },
      finishedAt: runtimeNow()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: currentRun.id,
      type: "review",
      stage: "chapter_draft",
      message: "Prose candidate persisted outside canon; author adoption is required",
      payload: { candidateId: candidate.candidateId, candidateFingerprint: candidate.fingerprint, chapterId: chapter.id }
    });
    return candidateRun || currentRun;
  }
  if (!draftReusable) {
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
  }
  let savedContent = await readText(root, chapter.contentPath);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "content_validate", draftOutput.fingerprint, draftOutput.outputId, undefined, draftInputFingerprint);
  const validationReceipt = existingReceipts.find((receipt) => receipt.stage === "content_validate");
  const persistedValidationOutput = await readRuntimeStageOutput(root, currentRun.id, "content_validate");
  const validationReusable = Boolean(
    persistedValidationOutput &&
      isRuntimeStageOutputAvailable(
        validationReceipt,
        expectedInputFingerprints.content_validate,
        persistedValidationOutput.fingerprint,
        persistedValidationOutput.outputId
      )
  );
  const checkTask = validationReusable
    ? persistedValidationOutput!.value
    : await runRuntimeTask(project, "continuity.check", { chapterId: chapter.id }, chapter);
  const validationOutput = validationReusable
    ? { outputId: persistedValidationOutput!.outputId, fingerprint: persistedValidationOutput!.fingerprint }
    : await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "content_validate", value: checkTask });
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "content_validate",
    message: validationReusable ? "Content validation reused from receipt" : "Content validation persisted for recovery",
    payload: { outputRef: validationOutput.outputId, outputFingerprint: validationOutput.fingerprint, reused: validationReusable }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "quality_review", validationOutput.fingerprint, validationOutput.outputId);
  let repairAttempt = 0;
  const qualityReceipt = existingReceipts.find((receipt) => receipt.stage === "quality_review");
  const persistedQualityOutput = await readRuntimeStageOutput<ChapterQualityReport>(root, currentRun.id, "quality_review");
  const persistedQualityReport = persistedQualityOutput?.value || await readChapterQualityReport(root, chapter.id);
  const qualityReportFingerprint = persistedQualityOutput?.fingerprint || (persistedQualityReport ? stageInputFingerprint(persistedQualityReport) : "");
  const currentContentFingerprint = stageInputFingerprint({ chapterId: chapter.id, content: savedContent });
  const qualityReusable = Boolean(
    persistedQualityOutput &&
    persistedQualityReport &&
      persistedQualityReport.evidence?.sourceFingerprint === currentContentFingerprint &&
      qualityMeetsTarget(persistedQualityReport, RUNTIME_QUALITY_TARGET) &&
      isRuntimeStageOutputAvailable(qualityReceipt, expectedInputFingerprints.quality_review, qualityReportFingerprint, persistedQualityOutput.outputId)
  );
  let qualityReview: RuntimeQualityReviewResult;
  let report: ChapterQualityReport;
  if (qualityReusable && persistedQualityReport) {
    report = persistedQualityReport;
    qualityReview = {
      outcome: {
        report,
        topIssues: report.fixes,
        antiPatternsHit: [],
        openingVerdict: "Reused verified quality report",
        endingVerdict: "Reused verified quality report",
        rulesBasedSignals: []
      },
      taskStatus: "success"
    };
  } else {
    qualityReview = await performQualityReview({
      root,
      project,
      chapter,
      content: savedContent,
      targetScore: RUNTIME_QUALITY_TARGET
    });
    report = await saveChapterQualityReport(root, attachQualityReportEvidence(qualityReview.outcome.report, { content: savedContent, sourceFingerprint: currentContentFingerprint, evaluatorVersion: "quality-review.v1", mode: qualityReview.taskStatus === "success" ? "hybrid" : "rules" }));
  }
  let qualityOutput = qualityReusable
    ? { outputId: persistedQualityOutput!.outputId, fingerprint: qualityReportFingerprint }
    : { outputId: `stage-output-${currentRun.id}-quality_review`, fingerprint: "" };
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
      reviewTaskError: qualityReview.taskError,
      reused: qualityReusable
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
    await assembleContext("quality.rewrite", root, project, { ...rewritePayload, visibilityAudience: "model-task" });
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
    report = await saveChapterQualityReport(root, attachQualityReportEvidence(qualityReview.outcome.report, { content: savedContent, sourceFingerprint: stageInputFingerprint({ chapterId: chapter.id, content: savedContent }), evaluatorVersion: "quality-review.v1", mode: qualityReview.taskStatus === "success" ? "hybrid" : "rules" }));
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

  if (!qualityReusable) {
    const persistedQualityOutput = await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "quality_review", value: report });
    qualityOutput = { outputId: persistedQualityOutput.outputId, fingerprint: persistedQualityOutput.fingerprint };
  }
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "quality_review",
    message: qualityReusable ? "Quality report reused from receipt" : "Quality report persisted for recovery",
    payload: { outputRef: qualityOutput.outputId, outputFingerprint: qualityOutput.fingerprint, reused: qualityReusable }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "recap_and_ledger", qualityOutput.fingerprint, qualityOutput.outputId);
  const recapReceipt = existingReceipts.find((receipt) => receipt.stage === "recap_and_ledger");
  const persistedRecapOutput = await readRuntimeStageOutput<WritingRecapCandidate>(root, currentRun.id, "recap_and_ledger");
  const recapReusable = Boolean(
    persistedRecapOutput &&
      persistedRecapOutput.value &&
      isRuntimeStageOutputAvailable(
        recapReceipt,
        expectedInputFingerprints.recap_and_ledger,
        persistedRecapOutput.fingerprint,
        persistedRecapOutput.outputId
      )
  );
  const generatedRecap = (recapReusable ? persistedRecapOutput!.value : undefined) || await (async () => {
    const recapTask = await runRuntimeTask(project, "writing.recap", { chapterId: chapter.id }, chapter);
    const recapSource =
      (recapTask.result as { content?: unknown; rawOutput?: string } | undefined)?.content ||
      (recapTask.result as { rawOutput?: string } | undefined)?.rawOutput;
    return (
      parseWritingRecapCandidate(chapter, recapSource) ||
      recapFromTask(chapter, savedContent, recapTask.result?.summary || draftResult?.summary || "")
    );
  })();
  const recapOutput = recapReusable
    ? { outputId: persistedRecapOutput!.outputId, fingerprint: persistedRecapOutput!.fingerprint }
    : await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "recap_and_ledger", value: generatedRecap });
  const pendingRecapPatchCount = reviewablePatchCount(generatedRecap);
  const recapAppended = await appendWritingRecapIfMissing(root, generatedRecap);
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "review",
    stage: "recap_and_ledger",
    message: recapReusable ? "Writing recap candidate reused from receipt" : "Writing recap candidate saved for author approval",
    payload: { chapterId: chapter.id, pendingRecapPatchCount, outputRef: recapOutput.outputId, outputFingerprint: recapOutput.fingerprint, reused: recapReusable, appended: recapAppended }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "knowledge_index_update", recapOutput.fingerprint, recapOutput.outputId);
  const knowledgeReceipt = existingReceipts.find((receipt) => receipt.stage === "knowledge_index_update");
  let persistedKnowledge: KnowledgeIndexProjection | null = null;
  try {
    persistedKnowledge = await readKnowledgeIndex(root, project);
  } catch {
    persistedKnowledge = null;
  }
  const persistedKnowledgeFingerprint = persistedKnowledge ? stableKnowledgeFingerprint(persistedKnowledge) : "";
  const knowledgeReusable = Boolean(
    persistedKnowledge &&
      isRuntimeStageOutputReusable(knowledgeReceipt, expectedInputFingerprints.knowledge_index_update, persistedKnowledgeFingerprint, "knowledge-index")
  );
  const knowledge = knowledgeReusable && persistedKnowledge ? persistedKnowledge : await rebuildKnowledgeIndex(root, project);
  const query = await searchKnowledgeIndex(root, project, { query: `${chapter.title} ${generatedRecap.summary}`, chapterId: chapter.id, limit: 10 }).catch(
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
      persistedRefs: retrievedRefs.length,
      outputFingerprint: stableKnowledgeFingerprint(knowledge),
      reused: knowledgeReusable
    }
  });

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "story_graph_update", stableKnowledgeFingerprint(knowledge), "knowledge-index");
  const storyGraphReceipt = existingReceipts.find((receipt) => receipt.stage === "story_graph_update");
  const persistedStoryGraphOutput = await readRuntimeStageOutput(root, currentRun.id, "story_graph_update");
  const persistedStoryGraph = await readStoryGraphProjection(root);
  const storyGraphFingerprint = persistedStoryGraph ? stageInputFingerprint(persistedStoryGraph) : "";
  const storyGraphReusable = Boolean(
    persistedStoryGraph &&
      persistedStoryGraphOutput &&
      storyGraphFingerprint === persistedStoryGraphOutput.fingerprint &&
      isRuntimeStageOutputAvailable(
        storyGraphReceipt,
        expectedInputFingerprints.story_graph_update,
        persistedStoryGraphOutput.fingerprint,
        persistedStoryGraphOutput.outputId
      )
  );
  const graph = storyGraphReusable
    ? persistedStoryGraph!
    : await buildStoryGraphProjection(root, project, { persist: false });
  const graphOutput = storyGraphReusable
    ? { outputId: persistedStoryGraphOutput!.outputId, fingerprint: persistedStoryGraphOutput!.fingerprint }
    : await (async () => {
        await writeStoryGraphProjection(root, graph);
        const output = await writeRuntimeStageOutput(root, { runId: currentRun.id, stage: "story_graph_update", value: graph });
        return { outputId: output.outputId, fingerprint: output.fingerprint };
      })();
  appendRuntimeEvent({
    projectSlug: project.slug,
    runId: currentRun.id,
    type: "system",
    stage: "story_graph_update",
    message: storyGraphReusable ? "Story graph projection reused from receipt" : "Story graph projection persisted for recovery",
    payload: { outputRef: graphOutput.outputId, outputFingerprint: graphOutput.fingerprint, reused: storyGraphReusable, nodeCount: graph.nodes.length, edgeCount: graph.edges.length }
  });
  const [, seriesMetrics] = await Promise.all([Promise.resolve(graph), buildSeriesQualityMetrics(root, project)]);

  await ensureRunActive(currentRun.id);
  currentRun = await markStage(currentRun, "finalize_or_gate", graphOutput.fingerprint, graphOutput.outputId);
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
  const project = await readProject(command.projectSlug);
  const chapterId = run.chapterId || (typeof command.payload.chapterId === "string" ? command.payload.chapterId : "");
  const key = runtimeTaskKey(project.slug, chapterId);
  const controller = new AbortController();
  activeRuntimeAbortControllers.set(key, { controller, runId: run.id });
  const authorityInput = { ...run.input, ...command.payload };
  activeRuntimeAuthority.set(key, { bookRunId: typeof authorityInput.bookRunId === "string" ? authorityInput.bookRunId : undefined, authorityBinding: authorityInput.authorityBinding });
  const monitor = setInterval(() => {
    const current = getRuntimeRun(run.id);
    if (current && (current.status === "paused" || current.status === "cancelled")) controller.abort();
  }, 50);
  try {
    await runSingleChapterPipeline(run);
  } finally {
    clearInterval(monitor);
    activeRuntimeAbortControllers.delete(key);
    activeRuntimeAuthority.delete(key);
  }
}

async function processControl(command: RuntimeCommand): Promise<void> {
  const runId = command.runId || String(command.payload.runId || "");
  const run = runId ? getRuntimeRun(runId) : null;
  if (!run) throw new Error(`Runtime control command has no run: ${command.id}`);
  if (command.type === "pause") {
    if (run.status === "running") {
      updateRuntimeRun(run.id, {
        result: {
          ...(run.result || {}),
          pauseRequested: true,
          pauseRequestedAt: runtimeNow(),
          pauseMode: "safe_boundary"
        }
      });
    } else {
      updateRuntimeRun(run.id, { status: "paused" });
    }
  } else if (command.type === "stop") {
    updateRuntimeRun(run.id, { status: "cancelled", finishedAt: runtimeNow() });
  } else if (command.type === "resume" || command.type === "rewrite") {
    updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
  } else if (command.type === "accept") {
    updateRuntimeRun(run.id, { status: "completed", finishedAt: runtimeNow() });
  } else if (command.type === "direction") {
    const eventId = typeof command.payload.steeringEventId === "string" ? command.payload.steeringEventId : "";
    if (eventId) {
      const steering = await readSteeringEvent(projectRoot(command.projectSlug), eventId);
      if (!steering) throw new Error("STEERING_EVENT_NOT_FOUND");
      if (Date.parse(run.updatedAt) !== steering.parentRunVersion) {
        await advanceSteeringEvent(projectRoot(command.projectSlug), eventId, "rejected_stale", "PARENT_RUN_UPDATED");
        appendRuntimeEvent({ projectSlug: command.projectSlug, runId: run.id, type: "command", message: "Runtime direction rejected as stale", payload: { commandId: command.id, steeringEventId: eventId } });
        return;
      }
      await advanceSteeringEvent(projectRoot(command.projectSlug), eventId, "classified");
      const current = getRuntimeRun(run.id);
      const nextStatus = current?.status === "queued" ? "effective" as const : "queued_for_boundary" as const;
      await advanceSteeringEvent(projectRoot(command.projectSlug), eventId, nextStatus, nextStatus === "effective" ? "APPLIED_AT_SAFE_BOUNDARY" : "WAITING_FOR_SAFE_BOUNDARY");
    }
    const current = getRuntimeRun(run.id) || run;
    const direction = typeof command.payload.direction === "string" ? command.payload.direction : "";
    const targetObjectiveVersion = Number.isInteger(command.payload.targetObjectiveVersion) ? Number(command.payload.targetObjectiveVersion) : undefined;
    const steering = eventId ? await readSteeringEvent(projectRoot(command.projectSlug), eventId) : null;
    const effective = steering?.status === "effective";
    updateRuntimeRun(run.id, {
      ...(effective ? { input: { ...current.input, direction, ...(targetObjectiveVersion ? { targetObjectiveVersion } : {}) } } : {}),
      result: {
        ...(current.result || {}),
        ...(effective ? { direction, ...(targetObjectiveVersion ? { targetObjectiveVersion } : {}) } : { pendingDirection: direction, ...(targetObjectiveVersion ? { pendingDirectionObjectiveVersion: targetObjectiveVersion } : {}) })
      }
    });
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
  assertMemoryProjectionCanGenerate(snapshot.memoryProjection || { status: "unknown", blockingReasons: ["MEMORY_PROJECTION_UNKNOWN"], affectedClaimIds: [] });

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
  let executionWorkItem: { root: string; itemId: string; runId: string; fencingToken: number; claimed: boolean } | undefined;
  let executionHeartbeat: NodeJS.Timeout | undefined;
  try {
    if (command.type === "start") {
      const project = await readProject(command.projectSlug);
      const chapterId = typeof command.payload.chapterId === "string"
        ? command.payload.chapterId
        : (command.runId ? getRuntimeRun(command.runId)?.chapterId : undefined);
      const outlinePointer = (project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion;
      if (governedProject(project) && !(outlinePointer as { fingerprint?: string } | undefined)?.fingerprint) {
        throw new Error("GOVERNED_OUTLINE_FINGERPRINT_REQUIRED");
      }
      if (chapterId && (governedProject(project) || command.payload.requireExecutionReady === true)) {
        const idempotencyKey = typeof command.payload.idempotencyKey === "string"
          ? command.payload.idempotencyKey
          : `runtime-${chapterId}`;
        const root = projectRoot(project.slug);
        const itemId = executionWorkItemId(chapterId, idempotencyKey);
        const item = await claimExecutionWorkItem(root, itemId, command.runId || command.id);
        if (item.status !== "running" || (item.runId && item.runId !== (command.runId || command.id))) {
          throw new Error(`EXECUTION_WORK_ITEM_${item.blockedReason || item.status.toUpperCase()}`);
        }
        if (!Number.isInteger(item.fencingToken)) throw new Error("EXECUTION_WORK_ITEM_LEASE_REQUIRED");
        executionWorkItem = { root, itemId, runId: command.runId || command.id, fencingToken: item.fencingToken as number, claimed: true };
        executionHeartbeat = setInterval(() => {
          heartbeatExecutionWorkItem(root, itemId, executionWorkItem!.runId, executionWorkItem!.fencingToken).catch(() => undefined);
        }, 5_000);
      }
    }
    if (command.type === "start") {
      await processStart(command);
    } else if (command.type === "derivative") {
      await processDerivative(command);
    } else {
      await processControl(command);
    }
    if (executionWorkItem?.claimed) {
      if (executionHeartbeat) clearInterval(executionHeartbeat);
      await finishExecutionWorkItem(executionWorkItem.root, executionWorkItem.itemId, { status: "completed", runId: executionWorkItem.runId, fencingToken: executionWorkItem.fencingToken });
    }
    finishRuntimeCommand(command.id, "succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (executionWorkItem?.claimed) {
      if (executionHeartbeat) clearInterval(executionHeartbeat);
      if (error instanceof RuntimeControlStop) {
        await cancelExecutionWorkItem(executionWorkItem.root, executionWorkItem.itemId, { runId: executionWorkItem.runId, fencingToken: executionWorkItem.fencingToken, error: message }).catch(() => undefined);
      } else {
        await finishExecutionWorkItem(executionWorkItem.root, executionWorkItem.itemId, { status: "failed", error: message, runId: executionWorkItem.runId, fencingToken: executionWorkItem.fencingToken }).catch(() => undefined);
      }
    }
    if (error instanceof RuntimeControlStop) {
      const stoppedRun = command.runId ? getRuntimeRun(command.runId) : null;
      if (stoppedRun) {
        const boundary = await recordRuntimeControlBoundary({ root: projectRoot(command.projectSlug), commandId: command.id, projectSlug: command.projectSlug, runId: stoppedRun.id, status: error.status, stage: stoppedRun.currentStage || command.type });
        await recordRuntimeMutationDrain({ root: projectRoot(command.projectSlug), boundaryId: boundary.boundaryId, projectSlug: command.projectSlug, runId: stoppedRun.id });
      }
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
        const recoveryRoot = projectRoot(command.projectSlug);
        const retryReceipt = await recordRuntimeRetryReceipt(recoveryRoot, {
          runId: run.id,
          commandId: command.id,
          stage: run.currentStage || command.type,
          attempt: failureCount,
          errorCode: message,
          workFingerprints: Array.from({ length: failureCount }, () => run.currentStage || command.type)
        });
        const compensation = await recordRuntimeCompensation(recoveryRoot, {
          runId: run.id,
          commandId: command.id,
          stage: run.currentStage || command.type,
          failureFingerprint: retryReceipt.fingerprint,
          workLeaseClaimed: Boolean(executionWorkItem?.claimed)
        });
        const compensationApplication = await applyRuntimeCompensation(recoveryRoot, compensation);
        const shouldRetry = retryReceipt.decision.retry && retryReceipt.stagnation.status !== "paused";
        const retryCommand = shouldRetry
          ? enqueueRuntimeCommand({
              projectSlug: command.projectSlug,
              runId: run.id,
              type: "start",
              payload: { ...command.payload, retryChainId: retryReceipt.decision.retryChainId, retryAttempt: failureCount + 1 },
              idempotencyKey: `runtime-retry-${run.id}-${failureCount}`
            })
          : undefined;
        updateRuntimeRun(run.id, {
          status: shouldRetry ? "queued" : failureCount >= 3 || retryReceipt.stagnation.status === "paused" ? "review_required" : "failed",
          error: message,
          failureCount,
          result: { ...(run.result || {}), recovery: { receiptFingerprint: retryReceipt.fingerprint, compensationFingerprint: compensation.fingerprint, compensationApplicationFingerprint: compensationApplication.fingerprint, retry: shouldRetry, retryCommandId: retryCommand?.id, stuck: retryReceipt.stagnation.status === "paused" } },
          finishedAt: shouldRetry ? undefined : runtimeNow()
        });
        appendRuntimeEvent({ projectSlug: command.projectSlug, runId: run.id, type: "system", stage: run.currentStage, message: shouldRetry ? "Runtime failure scheduled for bounded retry" : retryReceipt.stagnation.status === "paused" ? "Runtime paused after stagnation detection" : "Runtime failure recorded", payload: { receiptFingerprint: retryReceipt.fingerprint, compensationFingerprint: compensation.fingerprint, compensationApplicationFingerprint: compensationApplication.fingerprint, retry: shouldRetry, retryCommandId: retryCommand?.id, stuck: retryReceipt.stagnation.status === "paused", attempt: failureCount } });
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

