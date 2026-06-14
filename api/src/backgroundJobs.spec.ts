import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cancelBackgroundJob,
  clearBackgroundJobsForTests,
  enqueueProjectBackgroundJob,
  listProjectBackgroundJobs,
  readBackgroundJob,
  retryBackgroundJob
} from "./backgroundJobs.js";

async function waitForFinishedJob(root: string, projectId: string, jobId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await readBackgroundJob(root, projectId, jobId);
    if (job?.status === "success" || job?.status === "error" || job?.status === "cancelled") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for background job");
}

async function waitForHistoryLine(root: string, expected: string): Promise<string> {
  const target = path.join(root, "tasks", "background-jobs.jsonl");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const history = await fs.readFile(target, "utf8").catch(() => "");
    if (history.includes(expected)) return history;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fs.readFile(target, "utf8");
}

describe("background job persistence", () => {
  let tempRoot = "";

  afterEach(async () => {
    clearBackgroundJobsForTests();
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  it("persists job updates and can list them after the memory cache is cleared", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "background-jobs-"));

    const started = await enqueueProjectBackgroundJob({ slug: "demo" }, tempRoot, "story.graph.rebuild", "{}", async () => ({
      outputSummary: "3 nodes / 2 relations",
      resultRef: "/api/novel/projects/demo/story-graph"
    }));
    const finished = await waitForFinishedJob(tempRoot, "demo", started.id);
    const history = await fs.readFile(path.join(tempRoot, "tasks", "background-jobs.jsonl"), "utf8");

    clearBackgroundJobsForTests();

    const restored = await readBackgroundJob(tempRoot, "demo", started.id);
    const listed = await listProjectBackgroundJobs(tempRoot, "demo");

    expect(started).toMatchObject({ status: "pending", type: "story.graph.rebuild" });
    expect(finished).toMatchObject({ status: "success", outputSummary: "3 nodes / 2 relations" });
    expect(history).toContain(`"id":"${started.id}"`);
    expect(restored).toMatchObject({ id: started.id, status: "success" });
    expect(listed).toEqual([expect.objectContaining({ id: started.id, status: "success" })]);
  });

  it("cancels a running job and persists the request", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "background-jobs-"));
    let finishHandler!: () => void;

    const started = await enqueueProjectBackgroundJob({ slug: "demo" }, tempRoot, "knowledge.index.rebuild", "{}", async () => {
      await new Promise<void>((resolve) => {
        finishHandler = resolve;
      });
      return {
        outputSummary: "should not be used after cancellation",
        resultRef: "/api/novel/projects/demo/knowledge/index"
      };
    });

    let running = await readBackgroundJob(tempRoot, "demo", started.id);
    for (let attempt = 0; attempt < 20 && running?.status !== "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      running = await readBackgroundJob(tempRoot, "demo", started.id);
    }
    const cancelled = await cancelBackgroundJob(tempRoot, "demo", started.id);
    finishHandler();
    const finished = await waitForFinishedJob(tempRoot, "demo", started.id);
    const history = await waitForHistoryLine(tempRoot, '"status":"cancelled"');

    expect(cancelled).toMatchObject({ id: started.id, status: "running", cancelRequestedAt: expect.any(String) });
    expect(finished).toMatchObject({ id: started.id, status: "cancelled", cancelRequestedAt: expect.any(String) });
    expect(history).toContain('"status":"cancelled"');
  });

  it("retries an error job with the original type and project", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "background-jobs-"));

    const started = await enqueueProjectBackgroundJob({ slug: "demo" }, tempRoot, "story.graph.rebuild", "{\"source\":\"test\"}", async () => {
      throw new Error("boom");
    });
    const failed = await waitForFinishedJob(tempRoot, "demo", started.id);
    const retried = await retryBackgroundJob({ slug: "demo" }, tempRoot, started.id, (job) => async () => ({
      outputSummary: `retried ${job.type}`,
      resultRef: "/api/novel/projects/demo/story-graph"
    }));
    const finished = await waitForFinishedJob(tempRoot, "demo", retried?.id || "");

    expect(failed).toMatchObject({ id: started.id, status: "error", error: "boom" });
    expect(retried).toMatchObject({
      projectId: "demo",
      type: "story.graph.rebuild",
      retryOf: started.id,
      inputSummary: "{\"source\":\"test\"}"
    });
    expect(finished).toMatchObject({ id: retried?.id, status: "success", outputSummary: "retried story.graph.rebuild" });
  });
});
