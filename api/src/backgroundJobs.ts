import fs from "node:fs/promises";
import path from "node:path";
import type { BackgroundJob, BackgroundJobType, NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";

type BackgroundJobHandler = () => Promise<Pick<BackgroundJob, "outputSummary" | "resultRef">>;
type BackgroundJobHandlerFactory = (job: BackgroundJob) => BackgroundJobHandler;

const jobs = new Map<string, BackgroundJob>();
const maxJobs = 200;
const jobHistoryPath = "tasks/background-jobs.jsonl";

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

async function appendJobHistory(root: string, job: BackgroundJob): Promise<void> {
  const target = resolveInside(root, jobHistoryPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(job)}\n`, "utf8");
}

async function readPersistedJobs(root: string): Promise<BackgroundJob[]> {
  let content = "";
  try {
    content = await fs.readFile(resolveInside(root, jobHistoryPath), "utf8");
  } catch {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as BackgroundJob;
      } catch {
        return null;
      }
    })
    .filter((job): job is BackgroundJob => Boolean(job?.id && job.projectId && job.type && job.status));
}

function latestJobs(jobsToMerge: BackgroundJob[]): BackgroundJob[] {
  const byId = new Map<string, BackgroundJob>();
  for (const job of jobsToMerge) {
    const current = byId.get(job.id);
    if (!current || Date.parse(job.updatedAt || job.startedAt) >= Date.parse(current.updatedAt || current.startedAt)) {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

export async function enqueueProjectBackgroundJob(
  project: Pick<NovelProject, "slug">,
  root: string,
  type: BackgroundJobType,
  inputSummary: string,
  handler: BackgroundJobHandler,
  options: { retryOf?: string } = {}
): Promise<BackgroundJob> {
  const startedAt = nowIso();
  const job: BackgroundJob = {
    id: jobId(),
    projectId: project.slug,
    type,
    status: "pending",
    inputSummary,
    retryOf: options.retryOf,
    startedAt,
    updatedAt: startedAt
  };
  jobs.set(job.id, job);
  trimJobs();
  await appendJobHistory(root, job);
  const queuedJob = publicJob(job);

  setTimeout(() => {
    void runJob(root, job.id, handler);
  }, 0);

  return queuedJob;
}

async function runJob(root: string, id: string, handler: BackgroundJobHandler): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  if (job.status === "cancelled") return;

  const started = Date.now();
  job.status = "running";
  job.updatedAt = nowIso();
  await appendJobHistory(root, job);

  try {
    const result = await handler();
    if (job.cancelRequestedAt) {
      job.status = "cancelled";
      job.outputSummary = "Cancellation requested; job stopped after the current handler completed.";
    } else {
      job.status = "success";
      job.outputSummary = result.outputSummary;
      job.resultRef = result.resultRef;
    }
  } catch (error) {
    if (job.cancelRequestedAt) {
      job.status = "cancelled";
      job.error = error instanceof Error ? error.message : String(error);
      job.outputSummary = "Cancellation requested; job stopped after handler error.";
    } else {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    job.finishedAt = nowIso();
    job.durationMs = Date.now() - started;
    job.updatedAt = job.finishedAt;
    await appendJobHistory(root, job);
  }
}

export async function cancelBackgroundJob(root: string, projectId: string, id: string): Promise<BackgroundJob | null> {
  const job = jobs.get(id) || (await readBackgroundJob(root, projectId, id));
  if (!job || job.projectId !== projectId) return null;
  if (job.status === "success" || job.status === "error" || job.status === "cancelled") {
    return publicJob(job);
  }

  const timestamp = nowIso();
  job.cancelRequestedAt = job.cancelRequestedAt || timestamp;
  job.updatedAt = timestamp;
  if (job.status === "pending") {
    job.status = "cancelled";
    job.finishedAt = timestamp;
    job.durationMs = 0;
    job.outputSummary = "Cancelled before the background handler started.";
  } else {
    job.outputSummary = "Cancellation requested; short rebuild jobs may finish before the request is observed.";
  }
  jobs.set(job.id, job);
  await appendJobHistory(root, job);
  return publicJob(job);
}

export async function retryBackgroundJob(
  project: Pick<NovelProject, "slug">,
  root: string,
  id: string,
  handlerFactory: BackgroundJobHandlerFactory
): Promise<BackgroundJob | null> {
  const job = await readBackgroundJob(root, project.slug, id);
  if (!job) return null;
  if (job.status !== "error" && job.status !== "cancelled") {
    throw new Error(`Only failed or cancelled background jobs can be retried: ${id}`);
  }
  return enqueueProjectBackgroundJob(project, root, job.type, job.inputSummary, handlerFactory(job), { retryOf: job.id });
}

export async function readBackgroundJob(root: string, projectId: string, id: string): Promise<BackgroundJob | null> {
  const job = jobs.get(id);
  if (job?.projectId === projectId) return publicJob(job);
  const persisted = latestJobs(await readPersistedJobs(root)).find((item) => item.id === id && item.projectId === projectId);
  return persisted ? publicJob(persisted) : null;
}

export async function listProjectBackgroundJobs(root: string, projectId: string): Promise<BackgroundJob[]> {
  return latestJobs([...(await readPersistedJobs(root)), ...jobs.values()])
    .filter((job) => job.projectId === projectId)
    .slice(0, maxJobs)
    .map(publicJob);
}

export function clearBackgroundJobsForTests(): void {
  jobs.clear();
}
