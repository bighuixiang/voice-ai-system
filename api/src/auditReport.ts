import type {
  AiInvocationAdoptionDecision,
  AiInvocationContextTier,
  BackgroundJobStatus,
  CodexTaskType,
  CreationRuntimeStepId,
  NovelTaskStatus,
  NovelProject,
  ProjectAuditReport
} from "./types.js";
import { readSeriesQualityMetrics } from "./writingCockpit.js";
import { readInvocationSessions, readTaskHistory } from "./taskService.js";
import { listProjectBackgroundJobs } from "./backgroundJobs.js";
import { readKnowledgeIndex } from "./knowledgeIndex.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";

function emptyStatusCounts(): Record<NovelTaskStatus, number> {
  return {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0
  };
}

function emptyDecisionCounts(): Record<AiInvocationAdoptionDecision, number> {
  return {
    pending: 0,
    accepted: 0,
    rejected: 0,
    "not-required": 0
  };
}

function emptyBackgroundJobStatusCounts(): Record<BackgroundJobStatus, number> {
  return {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0
  };
}

function emptyActiveStepCounts(): Record<CreationRuntimeStepId | "none", number> {
  return {
    structure: 0,
    draft: 0,
    review: 0,
    recap: 0,
    ledger: 0,
    next: 0,
    none: 0
  };
}

function sortedCountRows(counts: Record<string, number>): Array<{ title: string; count: number }> {
  return Object.entries(counts)
    .map(([title, count]) => ({ title, count }))
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title));
}

export async function buildProjectAuditReport(root: string, project: NovelProject): Promise<ProjectAuditReport> {
  const [quality, tasks, aiInvocations, backgroundJobs, knowledgeIndex, runtimeSnapshots] = await Promise.all([
    readSeriesQualityMetrics(root, project),
    readTaskHistory(root),
    readInvocationSessions(root),
    listProjectBackgroundJobs(root, project.slug),
    readKnowledgeIndex(root, project),
    Promise.all(project.chapters.map((chapter) => buildCreationRuntimeSnapshot(root, project, chapter.id)))
  ]);

  const byStatus = emptyStatusCounts();
  const byType: Partial<Record<CodexTaskType, number>> = {};
  for (const task of tasks) {
    byStatus[task.status] += 1;
    byType[task.type] = (byType[task.type] || 0) + 1;
  }

  const byDecision = emptyDecisionCounts();
  const promptVersions: Record<string, number> = {};
  const preCallWarnings: Record<string, number> = {};
  const contextTierTotals: Partial<Record<AiInvocationContextTier, number>> = {};
  const truncatedContextBlockCounts: Record<string, number> = {};
  for (const invocation of aiInvocations) {
    byDecision[invocation.adoptionDecision] += 1;
    const promptVersion = invocation.promptVersion || "unknown";
    promptVersions[promptVersion] = (promptVersions[promptVersion] || 0) + 1;
    for (const warning of invocation.preCallReview?.warnings || []) {
      preCallWarnings[warning] = (preCallWarnings[warning] || 0) + 1;
    }
    const tierCounts = invocation.contextSnapshot.tierCounts || {};
    const hasTierCounts = Object.keys(tierCounts).length > 0;
    for (const [tier, count] of Object.entries(tierCounts)) {
      contextTierTotals[tier as AiInvocationContextTier] = (contextTierTotals[tier as AiInvocationContextTier] || 0) + count;
    }
    if (!hasTierCounts) {
      for (const block of invocation.contextSnapshot.blocks) {
        if (!block.tier) continue;
        contextTierTotals[block.tier] = (contextTierTotals[block.tier] || 0) + 1;
      }
    }
    const truncatedBlocks = invocation.contextSnapshot.truncatedBlocks?.length
      ? invocation.contextSnapshot.truncatedBlocks
      : invocation.contextSnapshot.blocks.filter((block) => block.truncated).map((block) => block.title);
    for (const title of truncatedBlocks) {
      truncatedContextBlockCounts[title] = (truncatedContextBlockCounts[title] || 0) + 1;
    }
  }

  const backgroundJobsByStatus = emptyBackgroundJobStatusCounts();
  for (const job of backgroundJobs) {
    backgroundJobsByStatus[job.status] += 1;
  }

  const byActiveStep = emptyActiveStepCounts();
  for (const snapshot of runtimeSnapshots) {
    byActiveStep[snapshot.activeStepId || "none"] += 1;
  }

  return {
    projectSlug: project.slug,
    projectTitle: project.title,
    generatedAt: new Date().toISOString(),
    chapters: project.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      status: chapter.status,
      contentPath: chapter.contentPath,
      outlinePath: chapter.outlinePath
    })),
    quality,
    taskSummary: {
      total: tasks.length,
      byStatus,
      byType,
      latestTasks: tasks.slice(0, 20).map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        inputSummary: task.inputSummary,
        outputSummary: task.outputSummary,
        error: task.error,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        durationMs: task.durationMs,
        timeoutMs: task.timeoutMs,
        cancelRequestedAt: task.cancelRequestedAt
      }))
    },
    aiInvocationSummary: {
      total: aiInvocations.length,
      byDecision,
      proposedPatchCount: aiInvocations.reduce((sum, invocation) => sum + invocation.proposedPatchTargets.length, 0),
      acceptedPatchCount: aiInvocations.reduce((sum, invocation) => sum + invocation.acceptedPatchTargets.length, 0),
      promptVersions,
      preCallWarnings,
      contextTierTotals,
      truncatedContextBlocks: sortedCountRows(truncatedContextBlockCounts).slice(0, 10)
    },
    knowledgeSummary: {
      factCount: knowledgeIndex.facts.length,
      tripleCount: knowledgeIndex.triples.length,
      indexedChapterCount: knowledgeIndex.chapterIndex.chapters.length,
      keywordCount: Object.keys(knowledgeIndex.chapterIndex.keywords).length,
      vectorSummary: knowledgeIndex.vectorSummary
    },
    runtimeSummary: {
      chapterCount: runtimeSnapshots.length,
      byActiveStep,
      blockedStepCount: runtimeSnapshots.reduce((sum, snapshot) => sum + snapshot.steps.filter((step) => step.status === "blocked").length, 0),
      snapshots: runtimeSnapshots.map((snapshot) => ({
        chapterId: snapshot.chapterId,
        chapterTitle: snapshot.chapterTitle,
        activeStepId: snapshot.activeStepId,
        fingerprint: snapshot.fingerprint,
        signals: snapshot.signals,
        steps: snapshot.steps.map((step) => ({
          id: step.id,
          status: step.status,
          metric: step.metric
        })),
        updatedAt: snapshot.updatedAt
      }))
    },
    backgroundJobSummary: {
      total: backgroundJobs.length,
      byStatus: backgroundJobsByStatus,
      latestJobs: backgroundJobs.slice(0, 20).map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        inputSummary: job.inputSummary,
        outputSummary: job.outputSummary,
        error: job.error,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: job.durationMs,
        updatedAt: job.updatedAt
      }))
    },
    aiInvocations
  };
}
