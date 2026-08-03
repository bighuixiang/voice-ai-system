import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton } from "./novelProject.js";
import { defaultPlatformAiConfig, writePlatformAiConfig } from "./platformAiConfig.js";
import { applyPatch, cancelNovelTask, markInvocationPatchesAccepted, readNovelTask, readTaskHistory, runNovelTask, startNovelTaskAsync } from "./taskService.js";
import type { ProcessRunner } from "./codexRunner.js";
import type { AiInvocationSession } from "./types.js";
import { createModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { readModelInvocations } from "./modelInvocationLedger.js";
import { createBudgetReservation, persistBudgetReservation, readBudgetReservation } from "./budgetReservation.js";
import { readTaskContextManifest } from "./taskContextManifest.js";
import { createMemoryClaim, retconMemoryClaim, settleMemoryClaim, persistMemoryClaim } from "./memoryClaim.js";

let tempRoot = "";

const mockRunner: ProcessRunner = {
  async run() {
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
      finalMessage: JSON.stringify({
        summary: "任务完成",
        content: "正文",
        changes: ["生成内容"],
        risks: [],
        questions: [],
        patches: []
      })
    };
  }
};

async function readInvocations(projectSlug = "demo"): Promise<AiInvocationSession[]> {
  const content = await fs.readFile(path.join(tempRoot, projectSlug, "tasks", "invocations.jsonl"), "utf8");
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AiInvocationSession;
      } catch {
        return null;
      }
    })
    .filter((session): session is AiInvocationSession => Boolean(session));
}

describe("taskService", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({ title: "Demo", roughIdea: "少年修行。" });
    await createProjectFiles(project);
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("runs a task with a mock Codex runner and records history", async () => {
    const task = await runNovelTask("demo", "outline.generate", {}, mockRunner);
    expect(task.status).toBe("success");
    expect(task.result?.summary).toBe("任务完成");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("outline.generate");

    const [invocation] = await readInvocations();
    expect(invocation.taskId).toBe(task.id);
    expect(invocation.taskType).toBe("outline.generate");
    expect(invocation.stageKey).toBe("pipeline.outline.generate");
    expect(invocation.status).toBe("success");
    expect(invocation.agentProfileId).toBe("codex-cli");
    expect(invocation.agentProvider).toBe("codex");
    expect(invocation.promptSnapshot.length).toBeGreaterThan(0);
    expect(invocation.promptSnapshot.contextTitles.length).toBeGreaterThan(0);
    expect(invocation.contextSnapshot.blockCount).toBeGreaterThan(0);
    expect(invocation.promptVersion).toBe("task-template:outline.generate:v2");
    expect(invocation.variablePlan?.payloadKeys).toEqual([]);
    expect(invocation.variablePlan?.contextTierCounts?.T0).toBeGreaterThanOrEqual(1);
    expect(invocation.preCallReview?.status).toBe("pass");
    expect(invocation.contextSnapshot.blocks.some((block) => block.tier === "T0")).toBe(true);
    expect(invocation.adoptionDecision).toBe("not-required");
    expect(invocation.commitResult).toEqual({ historyAppended: true, invocationAppended: true });
  });

  it("opens the provider circuit after bounded transient failures and skips the next call", async () => {
    let calls = 0;
    const failingRunner: ProcessRunner = {
      async run() {
        calls += 1;
        return { stdout: "", stderr: "HTTP_503 provider overloaded", exitCode: 1, durationMs: 5, finalMessage: "" };
      }
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failed = await runNovelTask("demo", "outline.generate", {}, failingRunner);
      expect(failed.status).toBe("error");
    }
    const blocked = await runNovelTask("demo", "outline.generate", {}, failingRunner);
    expect(blocked).toMatchObject({ status: "error", error: "PROVIDER_CIRCUIT_OPEN" });
    expect(calls).toBe(4);
  });

  it("fails over once to a compatible profile after a transient provider failure", async () => {
    const previousProfiles = process.env.AI_AGENT_PROFILES_JSON;
    process.env.AI_AGENT_PROFILES_JSON = JSON.stringify([{ id: "fallback-agent", provider: "claude-code", command: "claude", enabled: true, failoverCapability: { verifiedTaskTypes: ["outline.generate"], structuredOutput: true, contextLimit: 100000, privacyClasses: ["private"], dataResidencies: ["local"] } }]);
    const calls: string[] = [];
    const runner: ProcessRunner = {
      async run(_prompt, _root, config) {
        calls.push(config.label);
        if (config.id === "codex-cli") return { stdout: "", stderr: "HTTP_503 primary overloaded", exitCode: 1, durationMs: 5, finalMessage: "" };
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 5, finalMessage: JSON.stringify({ summary: "fallback ok", content: "ok", changes: [], risks: [], questions: [], patches: [] }) };
      }
    };

    try {
      const task = await runNovelTask("demo", "outline.generate", {
        failoverCandidates: [{ candidateId: "fallback-agent", provider: "claude-code", modelId: "default", status: "active", verifiedTaskTypes: ["outline.generate"], structuredOutput: true, contextLimit: 100_000, privacyClasses: ["private"], dataResidencies: ["local"] }],
        failoverPrivacyClass: "private",
        failoverDataResidency: "local"
      }, runner);
      expect(task).toMatchObject({ status: "success", outputSummary: "fallback ok" });
      expect(calls).toEqual(["Codex CLI", "fallback-agent"]);
      expect((await readInvocations())[0].agentProfileId).toBe("fallback-agent");
      const ledger = await readModelInvocations(path.join(tempRoot, "demo"));
      expect(ledger).toHaveLength(2);
      expect(ledger.map((record) => record.retryAttempt)).toEqual([1, 2]);
      expect(ledger.map((record) => record.status)).toEqual(["failed", "completed"]);
      expect(ledger[0].retryChainId).toBe(ledger[1].retryChainId);
      expect(ledger[0].failure?.retryClass).toBe("transient");
    } finally {
      if (previousProfiles === undefined) delete process.env.AI_AGENT_PROFILES_JSON;
      else process.env.AI_AGENT_PROFILES_JSON = previousProfiles;
    }
  });

  it("does not trust an unregistered candidate capability claim for failover", async () => {
    const calls: string[] = [];
    const runner: ProcessRunner = {
      async run(_prompt, _root, config) {
        calls.push(config.id);
        return { stdout: "", stderr: "HTTP_503 primary overloaded", exitCode: 1, durationMs: 5, finalMessage: "" };
      }
    };
    const task = await runNovelTask("demo", "outline.generate", {
      failoverCandidates: [{ candidateId: "not-registered", provider: "external", status: "active", verifiedTaskTypes: ["outline.generate"], structuredOutput: true, contextLimit: 100000, privacyClasses: ["private"], dataResidencies: ["local"] }]
    }, runner);
    expect(task.status).toBe("error");
    expect(calls).toEqual(["codex-cli"]);
  });

  it("retries one transient 429 with a bounded delay and keeps one retry chain", async () => {
    let calls = 0;
    const runner: ProcessRunner = {
      async run() {
        calls += 1;
        if (calls === 1) return { stdout: "", stderr: "HTTP_429 retry-after-ms=1", exitCode: 1, durationMs: 5, finalMessage: "" };
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 5, finalMessage: JSON.stringify({ summary: "retry ok", content: "ok", changes: [], risks: [], questions: [], patches: [] }) };
      }
    };
    const task = await runNovelTask("demo", "outline.generate", {}, runner);
    expect(task).toMatchObject({ status: "success", outputSummary: "retry ok" });
    expect(calls).toBe(2);
    const ledger = await readModelInvocations(path.join(tempRoot, "demo"));
    expect(ledger).toHaveLength(2);
    expect(ledger.map((record) => record.retryAttempt)).toEqual([1, 2]);
    expect(ledger[0].failure?.retryClass).toBe("transient");
  });

  it("does not retry after the task context manifest becomes blocked", async () => {
    let calls = 0;
    const runner: ProcessRunner = {
      async run(_prompt, root) {
        calls += 1;
        const directory = path.join(root, "tasks", "context-manifests");
        const [name] = await fs.readdir(directory);
        const manifestPath = path.join(directory, name);
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
        const { fingerprint: _fingerprint, ...manifestBase } = manifest;
        const blockedBase = { ...manifestBase, status: "block" };
        await fs.writeFile(manifestPath, JSON.stringify({ ...blockedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(blockedBase)).digest("hex") }), "utf8");
        return { stdout: "", stderr: "HTTP_503 provider overloaded", exitCode: 1, durationMs: 5, finalMessage: "" };
      }
    };

    const task = await runNovelTask("demo", "outline.generate", {}, runner);
    expect(task).toMatchObject({ status: "error", error: "TASK_CONTEXT_MANIFEST_BLOCKED" });
    expect(calls).toBe(1);
  });

  it("does not retry after a manifest source becomes stale", async () => {
    let calls = 0;
    const runner: ProcessRunner = {
      async run(_prompt, root) {
        calls += 1;
        await fs.rm(path.join(root, "project.json"));
        return { stdout: "", stderr: "HTTP_503 provider overloaded", exitCode: 1, durationMs: 5, finalMessage: "" };
      }
    };

    const task = await runNovelTask("demo", "outline.generate", {}, runner);
    expect(task).toMatchObject({ status: "error", error: "TASK_CONTEXT_MANIFEST_STALE" });
    expect(calls).toBe(1);
  });

  it("blocks provider execution when the memory projection is stale", async () => {
    const candidate = createMemoryClaim({ claimId: "claim-stale", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 });
    const settled = settleMemoryClaim({ claim: candidate, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const retcon = retconMemoryClaim({ claim: settled, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#1"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(path.join(tempRoot, "demo"), settled, "settled", "original");
    await persistMemoryClaim(path.join(tempRoot, "demo"), retcon.obsolete, "obsoleted", "retcon");
    let calls = 0;
    const runner: ProcessRunner = { async run() { calls += 1; return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" }; } };

    const task = await runNovelTask("demo", "outline.generate", {}, runner);

    expect(task).toMatchObject({ status: "error", error: "MEMORY_PROJECTION_STALE" });
    expect(calls).toBe(0);
  });

  it("repairs one malformed structured response and preserves the original output", async () => {
    let calls = 0;
    const runner: ProcessRunner = {
      async run() {
        calls += 1;
        if (calls === 1) return { stdout: "", stderr: "", exitCode: 0, durationMs: 5, finalMessage: "not-json-original" };
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 5, finalMessage: JSON.stringify({ summary: "repaired", content: "ok", changes: [], risks: [], questions: [], patches: [] }) };
      }
    };
    const task = await runNovelTask("demo", "outline.generate", {}, runner);
    expect(task).toMatchObject({ status: "success", outputSummary: "repaired", result: { repairAttempted: true, originalRawOutput: "not-json-original" } });
    expect(calls).toBe(2);
  });

  it("returns repair_required after one failed structured-output repair", async () => {
    let calls = 0;
    const runner: ProcessRunner = {
      async run() {
        calls += 1;
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 5, finalMessage: calls === 1 ? "not-json-original" : "still-not-json" };
      }
    };
    const task = await runNovelTask("demo", "outline.generate", {}, runner);
    expect(task).toMatchObject({ status: "error", error: "repair_required", result: { repairAttempted: true, originalRawOutput: "not-json-original" } });
    expect(calls).toBe(2);
  });

  it("fails closed before a worker model call when a governed task omits authority binding", async () => {
    let called = false;
    const runner: ProcessRunner = {
      async run() {
        called = true;
        return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" };
      }
    };

    await expect(runNovelTask("demo", "outline.generate", { bookRunId: "book-run-governed" }, runner)).rejects.toThrow(
      "RUNTIME_MODEL_AUTHORITY_BINDING_REQUIRED"
    );
    expect(called).toBe(false);
    expect(await fs.readFile(path.join(tempRoot, "demo", "tasks", "invocations.jsonl"), "utf8")).toBe("");
  });

  it("fails closed before a governed worker call when its budget reservation is absent", async () => {
    const root = path.join(tempRoot, "demo");
    const fingerprints = ["a", "b", "c", "d", "e"].map((value) => value.repeat(64));
    const authorityBinding = createModelInvocationAuthorityBinding({
      bookRunId: "book-run-budgeted",
      frozenPublicationScopeRef: "sessions/publication-scopes/scope-1.json",
      frozenPublicationScopeFingerprint: fingerprints[0],
      storyContractRef: "sessions/story-contract.json",
      storyContractFingerprint: fingerprints[1],
      outlineRef: "sessions/outline.json",
      outlineFingerprint: fingerprints[2],
      forecastRef: "planning/length-forecast.json",
      forecastFingerprint: fingerprints[3],
      contextManifestRef: "sessions/context-manifest.json",
      contextManifestFingerprint: fingerprints[4]
    });
    for (const [ref, fingerprint] of [[authorityBinding.frozenPublicationScopeRef, fingerprints[0]], [authorityBinding.storyContractRef, fingerprints[1]], [authorityBinding.outlineRef, fingerprints[2]], [authorityBinding.forecastRef, fingerprints[3]], [authorityBinding.contextManifestRef, fingerprints[4]]] as const) {
      await fs.mkdir(path.dirname(path.join(root, ref)), { recursive: true });
      await fs.writeFile(path.join(root, ref), JSON.stringify({ fingerprint }), "utf8");
    }
    await fs.mkdir(path.join(root, "sessions", "book-runs"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "book-runs", "book-run-budgeted.json"), "{}");
    let called = false;
    const runner: ProcessRunner = { async run() { called = true; return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" }; } };
    await expect(runNovelTask("demo", "outline.generate", { bookRunId: "book-run-budgeted", authorityBinding }, runner)).rejects.toThrow("MODEL_INVOCATION_BUDGET_RESERVATION_REQUIRED");
    expect(called).toBe(false);
  });

  it("records provider-native usage and pricing metadata without downgrading it to an estimate", async () => {
    const nativeRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 2,
          finalMessage: JSON.stringify({ summary: "native", content: "content", changes: [], risks: [], questions: [], patches: [] }),
          usage: { inputTokens: 11, outputTokens: 7, cachedTokens: 2, measurement: "actual" as const, source: "provider-sdk" },
          cost: { amount: 0.02, currency: "USD", measurement: "actual" as const, pricingRef: "price://test/model/v1" },
          modelVersion: "test-model-v1"
        };
      }
    };
    const task = await runNovelTask("demo", "outline.generate", {}, nativeRunner);
    const records = await readModelInvocations(path.join(tempRoot, "demo"));
    const record = records.find((candidate) => candidate.taskId === task.id);
    expect(record).toMatchObject({ usage: { inputTokens: 11, outputTokens: 7, measurement: "actual" }, cost: { measurement: "actual", pricingRef: "price://test/model/v1" }, modelVersion: "test-model-v1", usageSource: "provider-sdk" });
  });

  it("accumulates governed provider spend while keeping the reservation active", async () => {
    const root = path.join(tempRoot, "demo");
    const fingerprints = ["a", "b", "c", "d", "e"].map((value) => value.repeat(64));
    const authorityBinding = createModelInvocationAuthorityBinding({ bookRunId: "book-run-consume", frozenPublicationScopeRef: "sessions/publication-scopes/scope-1.json", frozenPublicationScopeFingerprint: fingerprints[0], storyContractRef: "sessions/story-contract.json", storyContractFingerprint: fingerprints[1], outlineRef: "sessions/outline.json", outlineFingerprint: fingerprints[2], forecastRef: "planning/length-forecast.json", forecastFingerprint: fingerprints[3], contextManifestRef: "sessions/context-manifest.json", contextManifestFingerprint: fingerprints[4] });
    for (const [ref, fingerprint] of [[authorityBinding.frozenPublicationScopeRef, fingerprints[0]], [authorityBinding.storyContractRef, fingerprints[1]], [authorityBinding.outlineRef, fingerprints[2]], [authorityBinding.forecastRef, fingerprints[3]], [authorityBinding.contextManifestRef, fingerprints[4]]] as const) {
      await fs.mkdir(path.dirname(path.join(root, ref)), { recursive: true });
      await fs.writeFile(path.join(root, ref), JSON.stringify({ fingerprint }), "utf8");
    }
    await fs.mkdir(path.join(root, "sessions", "book-runs"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "book-runs", "book-run-consume.json"), "{}");
    const reservation = createBudgetReservation({ bookRunId: "book-run-consume", projectSlug: "demo", runVersion: 1, limitCents: 10 });
    await persistBudgetReservation(root, reservation);
    const runner: ProcessRunner = { async run() { return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: JSON.stringify({ summary: "ok", content: "ok", changes: [], risks: [], questions: [], patches: [] }) }; } };
    await expect(runNovelTask("demo", "outline.generate", { bookRunId: "book-run-consume", budgetReservationId: reservation.reservationId, authorityBinding }, runner)).resolves.toMatchObject({ status: "success" });
    const consumed = await readBudgetReservation(root, reservation.reservationId);
    expect(consumed).toMatchObject({ status: "reserved" });
    expect(consumed?.consumedCents).toBeGreaterThan(0);
  });

  it("hard-stops a retry before starting a second governed provider call", async () => {
    const root = path.join(tempRoot, "demo");
    const fingerprints = ["a", "b", "c", "d", "e"].map((value) => value.repeat(64));
    const authorityBinding = createModelInvocationAuthorityBinding({ bookRunId: "book-run-hard-stop", frozenPublicationScopeRef: "sessions/publication-scopes/scope-1.json", frozenPublicationScopeFingerprint: fingerprints[0], storyContractRef: "sessions/story-contract.json", storyContractFingerprint: fingerprints[1], outlineRef: "sessions/outline.json", outlineFingerprint: fingerprints[2], forecastRef: "planning/length-forecast.json", forecastFingerprint: fingerprints[3], contextManifestRef: "sessions/context-manifest.json", contextManifestFingerprint: fingerprints[4] });
    for (const [ref, fingerprint] of [[authorityBinding.frozenPublicationScopeRef, fingerprints[0]], [authorityBinding.storyContractRef, fingerprints[1]], [authorityBinding.outlineRef, fingerprints[2]], [authorityBinding.forecastRef, fingerprints[3]], [authorityBinding.contextManifestRef, fingerprints[4]]] as const) {
      await fs.mkdir(path.dirname(path.join(root, ref)), { recursive: true });
      await fs.writeFile(path.join(root, ref), JSON.stringify({ fingerprint }), "utf8");
    }
    await fs.mkdir(path.join(root, "sessions", "book-runs"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "book-runs", "book-run-hard-stop.json"), "{}");
    const reservation = createBudgetReservation({ bookRunId: "book-run-hard-stop", projectSlug: "demo", runVersion: 1, limitCents: 1 });
    await persistBudgetReservation(root, reservation);
    let calls = 0;
    const runner: ProcessRunner = { async run() { calls += 1; return { stdout: "", stderr: "HTTP_429 retry-after-ms=1", exitCode: 1, durationMs: 1, finalMessage: "", usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0, currency: "USD", measurement: "actual" } }; } };
    const task = await runNovelTask("demo", "outline.generate", { bookRunId: "book-run-hard-stop", budgetReservationId: reservation.reservationId, authorityBinding, estimatedCostCents: 1 }, runner);
    expect(task).toMatchObject({ status: "error", error: "BUDGET_HARD_STOP" });
    expect(calls).toBe(1);
  });

  it("blocks a model call when input would consume the output/tool context reserve", async () => {
    let calls = 0;
    const runner: ProcessRunner = { async run() { calls += 1; return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" }; } };
    const task = await runNovelTask("demo", "outline.generate", { roughIdea: "A".repeat(2000), modelContextTokens: 100, outputReserveTokens: 20, toolReserveTokens: 20 }, runner);
    expect(task).toMatchObject({ status: "error", error: "CONTEXT_TOKEN_BUDGET_EXCEEDED" });
    expect(task.contextBudget).toMatchObject({ status: "block", reason: "CONTEXT_TOKEN_BUDGET_EXCEEDED", availableInputTokens: 60 });
    expect(task.contextPlan).toMatchObject({ schemaVersion: "context-plan.v1", status: "pass" });
    expect(calls).toBe(0);
    expect((await readInvocations())[0].contextBudget).toMatchObject({ status: "block", reason: "CONTEXT_TOKEN_BUDGET_EXCEEDED", availableInputTokens: 60 });
  });

  it("blocks a task before the runner when context privacy detects a secret", async () => {
    let calls = 0;
    const runner: ProcessRunner = { async run() { calls += 1; return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" }; } };
    const task = await runNovelTask("demo", "outline.generate", { roughIdea: "Use api_key=sk-123456789abcdef only for this draft." }, runner);
    expect(task).toMatchObject({ status: "error", error: "CONTEXT_PRIVACY_BLOCKED" });
    expect(calls).toBe(0);
    const manifestRef = task.contextManifestRef || "";
    const manifest = await readTaskContextManifest(path.join(tempRoot, "demo"), path.basename(manifestRef, ".json"));
    expect(manifest).toMatchObject({ status: "block", warnings: expect.arrayContaining([expect.stringContaining("SECRET_DETECTED")]) });
    expect(manifest?.blocks.some((block) => block.selected === false && block.permission === "blocked" && block.exclusionReason?.includes("SECRET_DETECTED"))).toBe(true);
  });

  it("blocks a task when source authority conflicts are unresolved", async () => {
    let calls = 0;
    const runner: ProcessRunner = { async run() { calls += 1; return { stdout: "", stderr: "", exitCode: 0, durationMs: 1, finalMessage: "{}" }; } };
    const task = await runNovelTask("demo", "chapter.draft", {
      contextSourceDecisions: [
        { blockId: "项目配置", factKey: "same-fact", sourceRef: "canon://a", sourceVersion: "a", contentHash: "hash-a", authority: "canon", relevance: 1, selected: true },
        { blockId: "世界观", factKey: "same-fact", sourceRef: "chapter://b", sourceVersion: "b", contentHash: "hash-b", authority: "chapter", relevance: 1, selected: true }
      ]
    }, runner);
    expect(task).toMatchObject({ status: "error", error: "CONTEXT_SOURCE_BLOCKED" });
    expect(calls).toBe(0);
    const manifest = await readTaskContextManifest(path.join(tempRoot, "demo"), path.basename(task.contextManifestRef || "", ".json"));
    expect(manifest).toMatchObject({ status: "block", sourceGate: { status: "block", conflicts: [expect.objectContaining({ factKey: "same-fact" })] } });
  });

  it("starts, polls, and cancels an async task", async () => {
    const cancellableRunner: ProcessRunner = {
      async run(_prompt, _root, _config, options) {
        if (options?.signal?.aborted) {
          return {
            stdout: "",
            stderr: "cancelled before runner started",
            exitCode: null,
            durationMs: 1,
            finalMessage: "",
            cancelled: true
          };
        }
        return new Promise((resolve) => {
          options?.signal?.addEventListener(
            "abort",
            () =>
              resolve({
                stdout: "",
                stderr: "cancelled by test",
                exitCode: null,
                durationMs: 2,
                finalMessage: "",
                cancelled: true
              }),
            { once: true }
          );
        });
      }
    };

    const started = await startNovelTaskAsync("demo", "outline.generate", {}, cancellableRunner);
    const cancelRequested = await cancelNovelTask("demo", started.id);

    expect(started.status).toBe("running");
    expect(cancelRequested).toMatchObject({ id: started.id, status: "running" });

    let finished = await readNovelTask(path.join(tempRoot, "demo"), started.id);
    for (let attempt = 0; attempt < 20 && finished?.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = await readNovelTask(path.join(tempRoot, "demo"), started.id);
    }

    expect(finished).toMatchObject({
      id: started.id,
      status: "cancelled",
      cancelRequestedAt: expect.any(String)
    });
    const [historyTask] = await readTaskHistory(path.join(tempRoot, "demo"));
    expect(historyTask).toMatchObject({ id: started.id, status: "cancelled" });
  });

  it("deduplicates task history by latest task status", async () => {
    const root = path.join(tempRoot, "demo");
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(root, "tasks", "history.jsonl"),
      [
        JSON.stringify({
          id: "task-duplicate",
          type: "chapter.draft",
          status: "running",
          projectId: "demo",
          inputSummary: "{}",
          startedAt: "2026-06-11T00:00:00.000Z"
        }),
        JSON.stringify({
          id: "task-duplicate",
          type: "chapter.draft",
          status: "success",
          projectId: "demo",
          inputSummary: "{}",
          outputSummary: "done",
          startedAt: "2026-06-11T00:00:00.000Z",
          finishedAt: "2026-06-11T00:00:02.000Z",
          durationMs: 2000
        }),
        "not-json"
      ].join("\n"),
      "utf8"
    );

    const history = await readTaskHistory(root);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: "task-duplicate", status: "success" });
  });

  it("marks stale running history as an unrecoverable error", async () => {
    const root = path.join(tempRoot, "demo");
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(root, "tasks", "history.jsonl"),
      `${JSON.stringify({
        id: "task-stale-running",
        type: "chapter.draft",
        status: "running",
        projectId: "demo",
        inputSummary: "{}",
        startedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const history = await readTaskHistory(root);
    const persisted = await fs.readFile(path.join(root, "tasks", "history.jsonl"), "utf8");

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: "task-stale-running",
      status: "error",
      outputSummary: "AI task stopped before completion."
    });
    expect(history[0].error).toContain("previous API process");
    expect(persisted).toContain('"status":"running"');
    expect(persisted).toContain('"status":"error"');
  });

  it("records proposed patch targets in the AI invocation audit log", async () => {
    const patchRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 15,
          finalMessage: JSON.stringify({
            summary: "patch ready",
            content: "",
            changes: ["updated outline"],
            risks: [],
            questions: [],
            patches: [
              {
                target: "outline/chapter-001.md",
                mode: "replace-file",
                content: "# patched\n"
              }
            ]
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, patchRunner);

    expect(task.status).toBe("success");
    const [invocation] = await readInvocations();
    expect(invocation.adoptionDecision).toBe("pending");
    expect(invocation.proposedPatchTargets).toEqual(["outline/chapter-001.md"]);
    expect(invocation.acceptedPatchTargets).toEqual([]);
  });

  it("marks a proposed invocation patch as accepted after author confirmation", async () => {
    const patchRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 15,
          finalMessage: JSON.stringify({
            summary: "patch ready",
            content: "",
            changes: ["updated outline"],
            risks: [],
            questions: [],
            patches: [
              {
                target: "outline/chapter-001.md",
                mode: "replace-file",
                content: "# patched\n"
              }
            ]
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, patchRunner);
    await fs.appendFile(path.join(tempRoot, "demo", "tasks", "invocations.jsonl"), "not-json\n", "utf8");

    const update = await markInvocationPatchesAccepted(path.join(tempRoot, "demo"), task.id, ["outline/chapter-001.md"]);
    const [invocation] = await readInvocations();
    const raw = await fs.readFile(path.join(tempRoot, "demo", "tasks", "invocations.jsonl"), "utf8");

    expect(update.updated).toBe(true);
    expect(update.invocationId).toBe(invocation.id);
    expect(invocation.adoptionDecision).toBe("accepted");
    expect(invocation.acceptedPatchTargets).toEqual(["outline/chapter-001.md"]);
    expect(invocation.adoptionUpdatedAt).toBeTruthy();
    expect(raw).toContain("not-json");
  });

  it("ignores Codex command values stored in project files", async () => {
    const projectPath = path.join(tempRoot, "demo", "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    project.codex.command = "malicious-command";
    project.codex.model = "test-model";
    project.ai = { profileId: "unknown-profile", modelId: "test-model" };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const originalCommand = process.env.CODEX_COMMAND;
    delete process.env.CODEX_COMMAND;
    let commandFromRunner = "";
    let modelFromRunner = "";
    const capturingRunner: ProcessRunner = {
      async run(_prompt, _root, config) {
        commandFromRunner = config.command;
        modelFromRunner = config.model || "";
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 12,
          finalMessage: JSON.stringify({
            summary: "task done",
            content: "",
            changes: [],
            risks: [],
            questions: [],
            patches: []
          })
        };
      }
    };

    try {
      await runNovelTask("demo", "outline.generate", {}, capturingRunner);
    } finally {
      if (originalCommand === undefined) {
        delete process.env.CODEX_COMMAND;
      } else {
        process.env.CODEX_COMMAND = originalCommand;
      }
    }

    expect(commandFromRunner).toBe("codex");
    expect(modelFromRunner).toBe("test-model");
  });

  it("runs a task through the global novel AI scenario profile", async () => {
    const projectPath = path.join(tempRoot, "demo", "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    project.codex.command = "malicious-command";
    project.ai = { profileId: "codex-cli", modelId: "gpt-5" };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");
    await writePlatformAiConfig({
      ...defaultPlatformAiConfig(),
      scenarios: {
        ...defaultPlatformAiConfig().scenarios,
        novel: { profileId: "claude-code", modelId: "sonnet" }
      }
    });

    let commandFromRunner = "";
    let providerFromRunner = "";
    let modelFromRunner = "";
    const capturingRunner: ProcessRunner = {
      async run(_prompt, _root, config) {
        commandFromRunner = config.command;
        providerFromRunner = config.provider;
        modelFromRunner = config.model || "";
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 12,
          finalMessage: JSON.stringify({
            summary: "task done",
            content: "",
            changes: [],
            risks: [],
            questions: [],
            patches: []
          })
        };
      }
    };

    await runNovelTask("demo", "outline.generate", {}, capturingRunner);

    expect(commandFromRunner).toBe(process.env.CLAUDE_CODE_COMMAND || "claude");
    expect(providerFromRunner).toBe("claude-code");
    expect(modelFromRunner).toBe("sonnet");
  });

  it("records a failed Codex exit with the stderr message", async () => {
    const failingRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "network unavailable",
          exitCode: 1,
          durationMs: 8,
          finalMessage: JSON.stringify({
            summary: "任务失败",
            content: "",
            changes: [],
            risks: ["Codex 执行失败"],
            questions: [],
            patches: []
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.draft", { chapterId: "chapter-001" }, failingRunner);

    expect(task.status).toBe("error");
    expect(task.error).toContain("network unavailable");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("chapter.draft");
    expect(history).toContain("network unavailable");

    const [invocation] = await readInvocations();
    expect(invocation.status).toBe("error");
    expect(invocation.stageKey).toBe("pipeline.chapter.prose");
    expect(invocation.attempt.exitCode).toBe(1);
    expect(invocation.attempt.error).toContain("network unavailable");
    const [ledger] = await readModelInvocations(path.join(tempRoot, "demo"));
    expect(ledger).toMatchObject({ status: "failed", failure: { retryClass: "transient" } });
  });

  it("keeps clean exits successful when the JSON payload embeds markdown fences in content", async () => {
    const nestedFenceRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 8,
          finalMessage: '{"summary":"ok","content":"```json\\n{\\"broken\\":true}\\n```","changes":[],"risks":[],"questions":[],"patches":[]}'
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, nestedFenceRunner);

    expect(task.status).toBe("success");
    expect(task.result?.parseError).toBeUndefined();
  });

  it("marks parse failures as task errors even when the runner exits cleanly", async () => {
    const parseFailingRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 8,
          finalMessage: '{"summary":"broken","content":"oops"'
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, parseFailingRunner);

    expect(task.status).toBe("error");
    expect(task.result?.parseError).toBe("repair_required");
    expect(task.result?.repairAttempted).toBe(true);
    expect(task.result?.originalRawOutput).toContain('{"summary":"broken"');
    expect(task.error).toBe("repair_required");

    const [invocation] = await readInvocations();
    expect(invocation.status).toBe("error");
    expect(invocation.attempt.error).toBe("repair_required");
  });

  it("applies replace-file and replace-selection patches inside the project", async () => {
    const root = path.join(tempRoot, "demo");
    await applyPatch(root, {
      target: "outline/chapter-001.md",
      mode: "replace-file",
      content: "# 新章纲\n"
    });
    await applyPatch(root, {
      target: "outline/chapter-001.md",
      mode: "replace-selection",
      content: "精修章纲",
      selection: { start: 2, end: 5 }
    });

    await expect(
      applyPatch(root, {
        target: "../secret.md",
        mode: "replace-file",
        content: "bad"
      })
    ).rejects.toThrow("Unsafe file path");
    await expect(
      applyPatch(root, {
        target: "project.json",
        mode: "replace-file",
        content: "{}"
      })
    ).rejects.toThrow("Protected project metadata");

    const content = await fs.readFile(path.join(root, "outline", "chapter-001.md"), "utf8");
    expect(content).toBe("# 精修章纲\n");
  });

  it("rejects replace-selection patches with invalid ranges", async () => {
    const root = path.join(tempRoot, "demo");
    await applyPatch(root, {
      target: "outline/chapter-001.md",
      mode: "replace-file",
      content: "abcdef"
    });

    await expect(
      applyPatch(root, {
        target: "outline/chapter-001.md",
        mode: "replace-selection",
        content: "x",
        selection: { start: -1, end: 2 }
      })
    ).rejects.toThrow("Invalid patch selection range");
    await expect(
      applyPatch(root, {
        target: "outline/chapter-001.md",
        mode: "replace-selection",
        content: "x",
        selection: { start: 4, end: 3 }
      })
    ).rejects.toThrow("Invalid patch selection range");
    await expect(
      applyPatch(root, {
        target: "outline/chapter-001.md",
        mode: "replace-selection",
        content: "x",
        selection: { start: 0, end: 7 }
      })
    ).rejects.toThrow("Invalid patch selection range");

    await expect(fs.readFile(path.join(root, "outline", "chapter-001.md"), "utf8")).resolves.toBe("abcdef");
  });
});
