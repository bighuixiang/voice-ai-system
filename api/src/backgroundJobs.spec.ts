import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearBackgroundJobsForTests,
  enqueueProjectBackgroundJob,
  listProjectBackgroundJobs,
  readBackgroundJob
} from "./backgroundJobs.js";

async function waitForFinishedJob(root: string, projectId: string, jobId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await readBackgroundJob(root, projectId, jobId);
    if (job?.status === "success" || job?.status === "error") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for background job");
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
});
