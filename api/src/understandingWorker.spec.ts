import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cancelUnderstandingTask, executeModelUnderstanding, recoverUnderstandingTasksAtStartup, startModelUnderstandingTask } from "./understandingWorker.js";
import { fingerprintCreativeSession } from "./contextManifest.js";

const roots: string[] = [];

function input(root: string, overrides: Record<string, unknown> = {}) {
  return {
    root,
    projectSlug: "worker-demo",
    sourceFingerprint: "a".repeat(64),
    sourceMessageIds: ["message-001"],
    prompt: "Return a structured understanding.",
    agent: { command: "mock", label: "Mock", provider: "codex" as const },
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("understanding worker", () => {
  it("persists a model-backed understanding snapshot without writing canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(root);
    const result = await executeModelUnderstanding(
      input(root),
      {
        run: async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          finalMessage: JSON.stringify({
            coreExplicit: [{ id: "claim-1", text: "A witness hides the truth.", status: "explicit", evidence: [{ messageId: "message-001", start: 0, end: 24 }] }],
            inferred: [],
            unknowns: [{ id: "unknown-1", text: "The witness's desired outcome is unknown.", status: "unknown", evidence: [] }],
            question: { id: "question-primary-desire", text: "What does the witness want?", status: "candidate", impact: "high", source: "model-gap" },
            interpretationSet: {
              schemaVersion: "seed-interpretation-set.v1",
              commonClaims: [],
              activeQuestionId: "question-primary-desire",
              interpretations: [
                { id: "interpretation-protective", label: "Protective silence", summary: "The witness hides truth to protect someone.", status: "candidate", differences: ["The witness acts from care."], supportEvidence: [], counterEvidence: [], downstreamImpacts: ["relationship pressure"] },
                { id: "interpretation-coercive", label: "Coerced silence", summary: "The witness hides truth under threat.", status: "candidate", differences: ["An external threat drives the silence."], supportEvidence: [], counterEvidence: [], downstreamImpacts: ["investigation escalation"] }
              ]
            }
          }),
          durationMs: 3
        })
      }
    );

    expect(result.task).toMatchObject({ status: "completed", modelCallIssued: true, canonWritten: false });
    expect(result.snapshot).toMatchObject({
      schemaVersion: "understanding-snapshot.v1",
      mode: "model",
      sourceFingerprint: "a".repeat(64),
      modelCallIssued: true,
      canonWritten: false,
      question: { id: "question-primary-desire" },
      interpretationSet: {
        schemaVersion: "seed-interpretation-set.v1",
        activeQuestionId: "question-primary-desire",
        interpretations: expect.arrayContaining([
          expect.objectContaining({ id: "interpretation-protective", status: "candidate" }),
          expect.objectContaining({ id: "interpretation-coercive", status: "candidate" })
        ])
      }
    });
    await expect(fs.stat(path.join(root, "sessions", "understanding-snapshot.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "project.json"))).rejects.toThrow();
  });

  it("does not persist a snapshot when the process is cancelled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(root);
    const controller = new AbortController();
    controller.abort();
    const result = await executeModelUnderstanding(input(root, { signal: controller.signal }), {
      run: async () => ({ stdout: "", stderr: "cancelled", exitCode: null, finalMessage: "", durationMs: 1, cancelled: true })
    });

    expect(result.task).toMatchObject({ status: "cancelled", modelCallIssued: false, canonWritten: false });
    expect(result.snapshot).toBeUndefined();
    await expect(fs.stat(path.join(root, "sessions", "understanding-snapshot.json"))).rejects.toThrow();
  });

  it("fails closed after a model process crash or invalid structured output", async () => {
    const crashedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(crashedRoot);
    const crashed = await executeModelUnderstanding(input(crashedRoot), {
      run: async () => {
        throw new Error("MODEL_PROCESS_CRASHED");
      }
    });
    expect(crashed.task).toMatchObject({ status: "failed", modelCallIssued: true, canonWritten: false });
    expect(crashed.task.error).toContain("MODEL_PROCESS_CRASHED");
    await expect(fs.stat(path.join(crashedRoot, "sessions", "understanding-snapshot.json"))).rejects.toThrow();

    const invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(invalidRoot);
    const invalid = await executeModelUnderstanding(input(invalidRoot), {
      run: async () => ({ stdout: "", stderr: "", exitCode: 0, finalMessage: "not-json", durationMs: 1 })
    });
    expect(invalid.task).toMatchObject({ status: "failed", modelCallIssued: true, canonWritten: false });
    expect(invalid.task.error).toContain("Unexpected token");
    await expect(fs.stat(path.join(invalidRoot, "sessions", "understanding-snapshot.json"))).rejects.toThrow();
  });

  it("quarantines a late model result when the frozen input is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(root);
    const result = await executeModelUnderstanding(input(root, { currentSourceFingerprint: "b".repeat(64) }), {
      run: async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        finalMessage: JSON.stringify({ coreExplicit: [], inferred: [], unknowns: [], question: { id: "question-primary-desire", text: "?", status: "candidate", impact: "high", source: "model-gap" } }),
        durationMs: 2
      })
    });

    expect(result.task).toMatchObject({ status: "stale", modelCallIssued: true, canonWritten: false });
    expect(result.task.error).toContain("UNDERSTANDING_INPUT_STALE");
    expect(result.snapshot).toBeUndefined();
  });

  it("resumes a persisted running task after the worker process is recreated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-worker-"));
    roots.push(root);
    const taskId = "understanding-task-recover-001";
    const taskDir = path.join(root, "sessions", "understanding-tasks");
    await fs.mkdir(taskDir, { recursive: true });
    await fs.writeFile(
      path.join(taskDir, `${taskId}.json`),
      JSON.stringify({
        schemaVersion: "understanding-task.v1",
        taskId,
        projectSlug: "worker-demo",
        status: "running",
        sourceFingerprint: "a".repeat(64),
        sourceMessageIds: ["message-001"],
        promptFingerprint: "b".repeat(64),
        prompt: "Return a structured understanding.",
        agent: { command: "mock", label: "Mock", provider: "codex" },
        modelCallIssued: true,
        canonWritten: false,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      "utf8"
    );

    const resumed = await (await import("./understandingWorker.js")).resumeUnderstandingTask(
      root,
      taskId,
      "a".repeat(64),
      {
        run: async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          finalMessage: JSON.stringify({ coreExplicit: [], inferred: [], unknowns: [], question: { id: "question-primary-desire", text: "What matters most?", status: "candidate", impact: "high", source: "model-gap" } }),
          durationMs: 1
        })
      }
    );
    expect(resumed).toMatchObject({ taskId, status: "queued" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const recovered = JSON.parse(await fs.readFile(path.join(taskDir, `${taskId}.json`), "utf8")) as { status: string; snapshotId?: string };
    expect(recovered).toMatchObject({ status: "completed", snapshotId: expect.stringContaining("understanding-model-") });
  });

  it("automatically recovers persisted running tasks across all projects at startup", async () => {
    const novelsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-startup-"));
    roots.push(novelsRoot);
    const projectRoot = path.join(novelsRoot, "startup-demo");
    const tasksRoot = path.join(projectRoot, "sessions", "understanding-tasks");
    await fs.mkdir(tasksRoot, { recursive: true });
    const session = {
      schemaVersion: "creative-session.v1",
      sessionId: "session-startup-demo",
      projectSlug: "startup-demo",
      status: "capturing",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as const;
    await fs.writeFile(path.join(projectRoot, "sessions", "creative-session.json"), JSON.stringify(session), "utf8");
    const sourceFingerprint = fingerprintCreativeSession(session);
    const taskId = "understanding-task-startup-001";
    await fs.writeFile(path.join(tasksRoot, `${taskId}.json`), JSON.stringify({
      schemaVersion: "understanding-task.v1",
      taskId,
      projectSlug: "startup-demo",
      status: "running",
      sourceFingerprint,
      sourceMessageIds: [],
      promptFingerprint: "b".repeat(64),
      prompt: "Return a structured understanding.",
      agent: { command: "mock", label: "Mock", provider: "codex" },
      modelCallIssued: true,
      canonWritten: false,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }), "utf8");

    const results = await recoverUnderstandingTasksAtStartup(novelsRoot, {
      run: async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        finalMessage: JSON.stringify({ coreExplicit: [], inferred: [], unknowns: [], question: { id: "question-primary-desire", text: "What matters?", status: "candidate", impact: "high", source: "model-gap" } }),
        durationMs: 1
      })
    });
    expect(results).toEqual([{ projectSlug: "startup-demo", recoveredTaskIds: [taskId] }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(JSON.parse(await fs.readFile(path.join(tasksRoot, `${taskId}.json`), "utf8"))).toMatchObject({ status: "completed" });
    expect(await fs.readFile(path.join(projectRoot, "sessions", "understanding-recovery-events.jsonl"), "utf8")).toContain(taskId);
  });

  it("propagates an active-process cancellation through the provider runner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-active-cancel-"));
    roots.push(root);
    let providerStarted = false;
    const task = await startModelUnderstandingTask(input(root), {
      run: async (_prompt, _projectRoot, _config, options) => {
        providerStarted = true;
        await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
        return { stdout: "", stderr: "provider interrupted", exitCode: null, finalMessage: "", durationMs: 1, cancelled: true };
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(providerStarted).toBe(true);
    await cancelUnderstandingTask(root, task.taskId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await (await import("./understandingWorker.js")).readUnderstandingTask(root, task.taskId)).toMatchObject({ status: "cancelled", modelCallIssued: true, canonWritten: false });
    await expect(fs.stat(path.join(root, "sessions", "understanding-snapshot.json"))).rejects.toThrow();
  });
});
