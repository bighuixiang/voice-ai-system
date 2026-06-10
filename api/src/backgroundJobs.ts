import type { BackgroundJob, BackgroundJobType, NovelProject } from "./types.js";

type BackgroundJobHandler = () => Promise<Pick<BackgroundJob, "outputSummary" | "resultRef">>;

const jobs = new Map<string, BackgroundJob>();
const maxJobs = 200;

function nowIso(): string {
  return new Date().toISOString();
}

function jobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimJobs(): void {
  if (jobs.size <= maxJobs) return;
  const ordered = [...jobs.values()].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
  for (const job of ordered.slice(0, jobs.size - maxJobs)) {
    jobs.delete(job.id);
  }
}

function publicJob(job: BackgroundJob): BackgroundJob {
  return { ...job };
}

export function enqueueProjectBackgroundJob(
  project: Pick<NovelProject, "slug">,
  type: BackgroundJobType,
  inputSummary: string,
  handler: BackgroundJobHandler
): BackgroundJob {
  const startedAt = nowIso();
  const job: BackgroundJob = {
    id: jobId(),
    projectId: project.slug,
    type,
    status: "pending",
    inputSummary,
    startedAt,
    updatedAt: startedAt
  };
  jobs.set(job.id, job);
  trimJobs();

  void runJob(job.id, handler);

  return publicJob(job);
}

async function runJob(id: string, handler: BackgroundJobHandler): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;

  const started = Date.now();
  job.status = "running";
  job.updatedAt = nowIso();

  try {
    const result = await handler();
    job.status = "success";
    job.outputSummary = result.outputSummary;
    job.resultRef = result.resultRef;
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.finishedAt = nowIso();
    job.durationMs = Date.now() - started;
    job.updatedAt = job.finishedAt;
  }
}

export function readBackgroundJob(projectId: string, id: string): BackgroundJob | null {
  const job = jobs.get(id);
  if (!job || job.projectId !== projectId) return null;
  return publicJob(job);
}

export function listProjectBackgroundJobs(projectId: string): BackgroundJob[] {
  return [...jobs.values()]
    .filter((job) => job.projectId === projectId)
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .map(publicJob);
}
