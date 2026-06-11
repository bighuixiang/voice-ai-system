import type { AiInvocationAdoptionDecision, BackgroundJobStatus, CodexTaskType, NovelTaskStatus, NovelProject, ProjectAuditReport } from "./types.js";
import { readSeriesQualityMetrics } from "./writingCockpit.js";
import { readInvocationSessions, readTaskHistory } from "./taskService.js";
import { listProjectBackgroundJobs } from "./backgroundJobs.js";
import { readKnowledgeIndex } from "./knowledgeIndex.js";

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
    error: 0
  };
}

export async function buildProjectAuditReport(root: string, project: NovelProject): Promise<ProjectAuditReport> {
  const [quality, tasks, aiInvocations, backgroundJobs, knowledgeIndex] = await Promise.all([
    readSeriesQualityMetrics(root, project),
    readTaskHistory(root),
    readInvocationSessions(root),
    listProjectBackgroundJobs(root, project.slug),
    readKnowledgeIndex(root, project)
  ]);

  const byStatus = emptyStatusCounts();
  const byType: Partial<Record<CodexTaskType, number>> = {};
  for (const task of tasks) {
    byStatus[task.status] += 1;
    byType[task.type] = (byType[task.type] || 0) + 1;
  }

  const byDecision = emptyDecisionCounts();
  for (const invocation of aiInvocations) {
    byDecision[invocation.adoptionDecision] += 1;
  }

  const backgroundJobsByStatus = emptyBackgroundJobStatusCounts();
  for (const job of backgroundJobs) {
    backgroundJobsByStatus[job.status] += 1;
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
        durationMs: task.durationMs
      }))
    },
    aiInvocationSummary: {
      total: aiInvocations.length,
      byDecision,
      proposedPatchCount: aiInvocations.reduce((sum, invocation) => sum + invocation.proposedPatchTargets.length, 0),
      acceptedPatchCount: aiInvocations.reduce((sum, invocation) => sum + invocation.acceptedPatchTargets.length, 0)
    },
    knowledgeSummary: {
      factCount: knowledgeIndex.facts.length,
      tripleCount: knowledgeIndex.triples.length,
      indexedChapterCount: knowledgeIndex.chapterIndex.chapters.filter((chapter) => chapter.factIds.length || chapter.tripleIds.length).length,
      keywordCount: Object.keys(knowledgeIndex.chapterIndex.keywords).length,
      vectorSummary: knowledgeIndex.vectorSummary
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
