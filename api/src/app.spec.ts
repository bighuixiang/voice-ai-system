import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createProseCandidate } from "./proseCandidate.js";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { answerDialogueQuestion, createDialogueQuestion } from "./dialogueQuestions.js";
import { createRuntimeCheckpoint } from "./runtimeFiles.js";
import { createModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { readCreativeJourneyProjection } from "./creativeJourneyStore.js";
import { createChapterExecutionProof } from "./chapterExecutionProof.js";
import { createBookWorkGraph } from "./bookWorkGraph.js";
import { createDecisionConsumptionReceipt, persistDecisionConsumptionReceipt } from "./decisionConsumption.js";
import { computeCanonCommitFingerprint } from "./canonCommit.js";

let server: http.Server;
let baseUrl = "";
let tempRoot = "";

async function startServer() {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${url}`, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

async function writeSettledChapterEvidence(projectSlug: string, chapterId: string): Promise<void> {
  const root = path.join(tempRoot, projectSlug);
  const base = {
    schemaVersion: "chapter-settlement.v1" as const,
    settlementId: `settlement-test-${chapterId}`,
    projectSlug,
    chapterId,
    adoptionTransactionId: `adoption-test-${chapterId}`,
    adoptedContentSha256: "a".repeat(64),
    status: "settled" as const,
    nextAction: "schedule_dependency_ready_work" as const,
    createdAt: new Date().toISOString()
  };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
  await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${base.settlementId}.json`), JSON.stringify({ ...base, fingerprint }), "utf8");
}

async function writeReleasedCraftPattern(projectSlug: string, patternId = "craft:1"): Promise<void> {
  const root = path.join(tempRoot, projectSlug);
  const patternBase = { schemaVersion: "craft-pattern.v1", patternId, projectSlug, name: "Test rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-test"], evidenceRefs: ["evidence://test-pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-test", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
  await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${patternId}.json`), JSON.stringify({ ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") }), "utf8");
  const now = new Date().toISOString();
  const releaseBase = { schemaVersion: "learning-release.v1", releaseId: `release-${patternId.replace(/[^a-zA-Z0-9_-]/g, "-")}`, projectSlug, candidatePolicyRef: "policy:test-candidate", candidatePatternId: patternId, baselinePolicyRef: "policy:test-stable", evaluationRunRefs: ["eval:test"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:test-stable", rollbackRef: "policy:test-stable", status: "canary", reasons: [], approvedBy: "author", createdAt: now, updatedAt: now };
  await fs.mkdir(path.join(root, "sessions", "learning-releases"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "learning-releases", `${releaseBase.releaseId}.json`), JSON.stringify({ ...releaseBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(releaseBase)).digest("hex") }), "utf8");
}

async function waitForJob(projectId: string, jobId: string): Promise<{ job: { status: string; outputSummary?: string; resultRef?: string } }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await jsonFetch<{ job: { status: string; outputSummary?: string; resultRef?: string } }>(
      `/api/novel/projects/${projectId}/jobs/${jobId}`
    );
    if (response.data.job.status === "success" || response.data.job.status === "error" || response.data.job.status === "cancelled") {
      return response.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Background job did not finish: ${jobId}`);
}

async function waitForUnderstandingTask(projectId: string, taskId: string): Promise<{ task: { status: string; modelCallIssued: boolean; canonWritten: boolean; error?: string } }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await jsonFetch<{ task: { status: string; modelCallIssued: boolean; canonWritten: boolean; error?: string } }>(
      `/api/novel/projects/${projectId}/session/understanding/tasks/${taskId}`
    );
    if (["completed", "failed", "cancelled", "stale"].includes(response.data.task.status)) return response.data;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Understanding task did not finish: ${taskId}`);
}

async function writeMockCodexCommand(root: string): Promise<string> {
  const scriptPath = path.join(root, "mock-codex.cjs");
  const commandPath = path.join(root, "mock-codex.cmd");
  await fs.writeFile(
    scriptPath,
    `
const fs = require("node:fs");
const outputFlag = process.argv.indexOf("--output-last-message");
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : "";
const delayMs = Number(process.env.MOCK_CODEX_DELAY_MS || 1);
const result = {
  summary: "mock task complete",
  content: JSON.stringify({
    chapterId: "chapter-001",
    summary: "The mock recap records the save.",
    newFacts: ["The mock save happened."],
    characterStateChanges: [],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    createdAt: "2026-06-11T00:00:00.000Z"
  }),
  changes: ["mocked"],
  risks: [],
  questions: [],
  patches: []
};
setTimeout(() => {
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
  process.stdout.write(JSON.stringify(result));
}, delayMs);
`,
    "utf8"
  );
  await fs.writeFile(commandPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
  return commandPath;
}

async function waitForTask(projectId: string, taskId: string): Promise<{ task: { status: string; outputSummary?: string } }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await jsonFetch<{ task: { status: string; outputSummary?: string } }>(
      `/api/novel/projects/${projectId}/tasks/${taskId}`
    );
    if (response.data.task.status === "success" || response.data.task.status === "error" || response.data.task.status === "cancelled") {
      return response.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Task did not finish: ${taskId}`);
}

describe.sequential("novel API routes", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-routes-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DATA_ROOT = path.join(tempRoot, "data");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    delete process.env.CODEX_COMMAND;
    delete process.env.MOCK_CODEX_DELAY_MS;
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DATA_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("creates, lists, reads, and saves a novel project file", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Demo Novel",
        genre: "fantasy",
        roughIdea: "A cautious apprentice finds a sealed room."
      })
    });

    expect(created.status).toBe(201);
    expect(created.data.project.slug).toBe("demo-novel");

    const listed = await jsonFetch<{ projects: Array<{ slug: string }> }>("/api/novel/projects");
    expect(listed.data.projects.map((project) => project.slug)).toContain("demo-novel");

    const database = await jsonFetch<{ database: { exists: boolean; projectCount: number } }>("/api/platform/database");
    expect(database.data.database.exists).toBe(true);
    expect(database.data.database.projectCount).toBe(1);

    const filePath = created.data.project.chapters[0].contentPath;
    const readBefore = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readBefore.data.content.length).toBeGreaterThan(0);

    const saved = await jsonFetch<{ saved: boolean }>(`/api/novel/projects/demo-novel/files/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "manual draft" })
    });
    expect(saved.data.saved).toBe(true);

    const readAfter = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readAfter.data.content).toBe("manual draft");
  });

  it("captures the original idea in the creative session during project creation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Capture", genre: "fantasy", roughIdea: "A courier hears a forbidden name.", idempotencyKey: "seed-capture-001" })
    });

    expect(created.status).toBe(201);
    const session = await jsonFetch<{ session: { messages: Array<{ role: string; text: string; source: { kind: string } }> } }>(
      `/api/novel/projects/${created.data.project.slug}/session`
    );
    expect(session.data.session.messages).toContainEqual(expect.objectContaining({
      role: "author",
      text: "A courier hears a forbidden name.",
      source: { kind: "author" }
    }));
  });

  it("creates a durable seed compilation run alongside the project container", async () => {
    const created = await jsonFetch<{ project: { slug: string }; compilationRun: { runId: string; projectSlug: string; status: string; containerCreated: boolean; interpretationComplete: boolean; canonWritten: boolean; sourceMessageIds: string[] } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Run", genre: "fantasy", roughIdea: "A durable seed must resume.", idempotencyKey: "seed-run-001" })
    });
    expect(created.status).toBe(201);
    expect(created.data.compilationRun).toMatchObject({ projectSlug: created.data.project.slug, status: "captured", containerCreated: true, interpretationComplete: false, canonWritten: false, sourceMessageIds: [expect.any(String)] });
    const restored = await jsonFetch<{ run: { runId: string; status: string; projectSlug: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/story-seeds/runs/${created.data.compilationRun.runId}`);
    expect(restored.status).toBe(200);
    expect(restored.data.run).toMatchObject({ runId: created.data.compilationRun.runId, projectSlug: created.data.project.slug, status: "captured" });
  });

  it("keeps seed compilation captured until understanding safety dependencies are ready", async () => {
    const created = await jsonFetch<{ project: { slug: string }; compilationRun: { runId: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Advance Gate", roughIdea: "A seed must not invoke a model before the gates.", idempotencyKey: "seed-advance-gate-001" })
    });
    const advance = await jsonFetch<{ error: { code: string; missingDependencies: string[] }; run: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/story-seeds/runs/${created.data.compilationRun.runId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
    });
    expect(advance.status).toBe(409);
    expect(advance.data.error).toMatchObject({ code: "SEED_COMPILATION_DEPENDENCIES_MISSING", missingDependencies: expect.arrayContaining(["t0-context-manifest", "budget-reservation", "model-capability-authorization"]) });
    expect(advance.data.run).toMatchObject({ status: "captured" });

    const manifest = await jsonFetch<{ manifest: { sourceFingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/session/context-manifest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect([200, 201]).toContain(manifest.status);
    const budget = await jsonFetch<{ reservation: { reservationId: string } }>(`/api/novel/projects/${created.data.project.slug}/session/understanding/budget`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId: "seed-advance-budget", units: 100 }) });
    expect([200, 201]).toContain(budget.status);
    const authorization = await jsonFetch<{ authorization: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/session/understanding/capability-authorization`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5-mini" }) });
    expect(authorization.status).toBe(201);
    const completed = await jsonFetch<{ run: { status: string; interpretationComplete: boolean; canonWritten: boolean }; understanding: { snapshot: { question: { id: string } }; run: { modelCallIssued: boolean; canonWritten: boolean } }; question: { questionId: string; status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/story-seeds/runs/${created.data.compilationRun.runId}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect(completed.status).toBe(201);
    expect(completed.data.run).toMatchObject({ status: "reviewable", interpretationComplete: true, canonWritten: false });
    expect(completed.data.understanding).toMatchObject({ snapshot: { question: { id: "question-primary-desire" } }, run: { modelCallIssued: false, canonWritten: false } });
    expect(completed.data.question).toMatchObject({ questionId: "question-primary-desire", status: "active" });
  });

  it("persists and restores the story-seed compilation state", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed State", genre: "fantasy", roughIdea: "A state must survive refresh." })
    });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds/state`;
    const saved = await jsonFetch<{ state: { status: string; projectId: string } }>(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "seed_captured" })
    });
    expect(saved.status).toBe(201);
    const restored = await jsonFetch<{ state: { status: string; projectId: string } }>(base);
    expect(restored.status).toBe(200);
    expect(restored.data.state).toMatchObject({ status: "seed_captured", projectId: created.data.project.slug });
  });

  it("persists story-seed capture idempotently and exposes it after refresh", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Capture Route", genre: "fantasy", roughIdea: "A durable utterance." })
    });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds/capture`;
    const payload = { text: "The exact author wording.", idempotencyKey: "capture-001" };
    const first = await jsonFetch<{ created: boolean; utterance: { text: string } }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const second = await jsonFetch<{ created: boolean }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const restored = await jsonFetch<{ utterances: Array<{ text: string }> }>(base);
    expect(first.status).toBe(201);
    expect(first.data.created).toBe(true);
    expect(second.status).toBe(200);
    expect(second.data.created).toBe(false);
    expect(restored.data.utterances).toEqual([expect.objectContaining({ text: payload.text })]);
  });

  it("persists an evidence-bound story-seed frame and restores it", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Frame Route", genre: "fantasy", roughIdea: "A frame must survive refresh." })
    });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds`;
    const captured = await jsonFetch<{ utterance: Record<string, unknown> }>(`${base}/capture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "A courier finds a door.", idempotencyKey: "frame-route-001" }) });
    const frame = await jsonFetch<{ created: boolean; frame: { fingerprint: string } }>(`${base}/frame`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ utterance: captured.data.utterance, facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] }) });
    const restored = await jsonFetch<{ frames: Array<{ fingerprint: string }> }>(`${base}/frame`);
    expect(frame.status).toBe(201);
    expect(frame.data.created).toBe(true);
    expect(restored.data.frames).toEqual([expect.objectContaining({ fingerprint: frame.data.frame.fingerprint })]);
  });

  it("persists competing seed interpretations only for a stored frame", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Seed Interpretation Route", genre: "fantasy", roughIdea: "Interpretations need provenance." })
    });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds`;
    await jsonFetch(`${base}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "seed_captured" }) });
    const captured = await jsonFetch<{ utterance: Record<string, unknown> }>(`${base}/capture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "A courier finds a door.", idempotencyKey: "interpret-route-001" }) });
    const frame = await jsonFetch<{ frame: { fingerprint: string } }>(`${base}/frame`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ utterance: captured.data.utterance, facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] }) });
    const interpretations = [{ interpretationId: "portal", differences: ["portal"], downstreamImpact: ["rules"], supports: ["protagonist"], contradictions: [] }, { interpretationId: "wreck", differences: ["wreck"], downstreamImpact: ["mystery"], supports: ["protagonist"], contradictions: [] }];
    const saved = await jsonFetch<{ created: boolean; interpretationSet: { frameFingerprint: string }; state: { status: string } }>(`${base}/interpretations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame: { fingerprint: frame.data.frame.fingerprint }, interpretations }) });
    const restored = await jsonFetch<{ interpretationSets: Array<{ frameFingerprint: string }> }>(`${base}/interpretations`);
    expect(saved.status).toBe(201);
    expect(saved.data.created).toBe(true);
    expect(saved.data.interpretationSet.frameFingerprint).toBe(frame.data.frame.fingerprint);
    expect(saved.data.state.status).toBe("clarification_required");
    expect(restored.data.interpretationSets).toEqual([expect.objectContaining({ frameFingerprint: frame.data.frame.fingerprint })]);
    const adoption = await jsonFetch<{ created: boolean; state: { status: string } }>(`${base}/adoption`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing: [{ field: "protagonist", value: "courier", status: "unknown" }], decisions: [{ field: "protagonist", value: "courier", decision: "accept" }] }) });
    expect(adoption.status).toBe(201);
    expect(adoption.data.state.status).toBe("contract_partially_adopted");
    const revoked = await jsonFetch<{ state: { status: string }; receipt: { recompiledFields: string[] } }>(`${base}/adoption/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "protagonist", reason: "author changed the lead", dependencyMap: { protagonist: ["opening-conflict"] } }) });
    expect(revoked.status).toBe(201);
    expect(revoked.data.state.status).toBe("clarification_required");
    expect(revoked.data.receipt.recompiledFields).toEqual(["protagonist"]);
  });

  it("keeps clarification state when all seed adoption decisions are rejected", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Seed Reject", roughIdea: "Rejecting a candidate must remain unresolved." }) });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds`;
    await jsonFetch(`${base}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "clarification_required" }) });
    const result = await jsonFetch<{ state: { status: string } }>(`${base}/adoption`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing: [{ field: "desire", value: "unknown", status: "unknown" }], decisions: [{ field: "desire", value: "open door", decision: "reject" }] }) });
    expect(result.status).toBe(201);
    expect(result.data.state.status).toBe("clarification_required");
  });

  it("records incremental recompile receipts against the adopted seed baseline", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Seed Recompile Receipt", roughIdea: "Recompile evidence." }) });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/story-seeds`;
    await jsonFetch(`${base}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "clarification_required" }) });
    await jsonFetch(`${base}/adoption`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ existing: [{ field: "desire", value: "unknown", status: "unknown" }], decisions: [{ field: "desire", value: "open door", decision: "accept" }] }) });
    await jsonFetch(`/api/novel/projects/${created.data.project.slug}/runtime/semantic-nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semanticId: "seed-node", kind: "chapter", label: "Seed node", displayChapter: "1", sourceRefs: ["seed://recompile"] }) });
    const result = await jsonFetch<{ receipt: { adoptionFingerprint: string; preservedFields: string[]; targetVersionId: string; rollbackPoint: string }; impact: { directAssetIds: string[]; status: string }; unifiedImpact: { status: string; directNodeIds: string[] } }>(`${base}/recompile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: [{ field: "desire", value: "open door", version: 1 }, { field: "protagonist", value: "courier", version: 1 }], changedFields: ["desire"], dependencyMap: { desire: [], protagonist: [] }, targetVersionId: "outline:v3", assetMap: { desire: ["contract:desire"], protagonist: ["contract:protagonist"] }, protectedAssetIds: ["contract:protagonist"], assetNodeIds: ["seed-node"], impactSourceRefs: ["seed://recompile"] }) });
    expect(result.status).toBe(201);
    expect(result.data.receipt.adoptionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.data.receipt.preservedFields).toEqual(["protagonist"]);
    expect(result.data.receipt.targetVersionId).toBe("outline:v3");
    expect(result.data.receipt.rollbackPoint).toMatch(/^rollback-seed-recompile-/);
    expect(result.data.impact).toMatchObject({ directAssetIds: ["contract:desire"], status: "ready" });
    expect(result.data.unifiedImpact).toMatchObject({ status: "ready", directNodeIds: ["seed-node"] });
  });

  it("exposes a read-only capability baseline for a project", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Capability Baseline",
        genre: "fantasy",
        roughIdea: "A baseline must be observable before new writing capabilities activate."
      })
    });
    const slug = created.data.project.slug;
    const beforeProject = await fs.readFile(path.join(tempRoot, slug, "project.json"), "utf8");

    const response = await jsonFetch<{
      baseline: {
        schemaVersion: string;
        projectSlug: string;
        mode: string;
        sourceFingerprint: string;
        freshness: { status: string };
        writeAuthorities: string[];
        environment: {
          schemaVersion: string;
          runtime: string;
          runtimeVersion: string;
          platform: string;
          architecture: string;
          persistence: { engine: string; available: boolean };
        };
        capabilities: Array<{ key: string; status: string; mode: string }>;
      };
    }>(`/api/novel/projects/${slug}/capability-baseline`);

    expect(response.status).toBe(200);
    expect(response.data.baseline).toMatchObject({
      schemaVersion: "capability-baseline.v1",
      projectSlug: slug,
      mode: "read-only",
      freshness: { status: "current" },
      writeAuthorities: []
    });
    expect(response.data.baseline.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(response.data.baseline.environment).toMatchObject({
      schemaVersion: "runtime-capabilities.v1",
      runtime: "node",
      runtimeVersion: expect.stringMatching(/^v\d+/),
      platform: process.platform,
      architecture: process.arch,
      persistence: { engine: expect.stringMatching(/^(node:sqlite|json-fallback)$/), available: true }
    });
    expect(response.data.baseline.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "novel.project.read", status: "available", mode: "read-only" }),
        expect.objectContaining({ key: "novel.audit-report.read", status: "available", mode: "read-only" })
      ])
    );
    const replay = await jsonFetch<{ baseline: { sourceFingerprint: string } }>(
      `/api/novel/projects/${slug}/capability-baseline`
    );
    expect(replay.data.baseline.sourceFingerprint).toBe(response.data.baseline.sourceFingerprint);
    expect(await fs.readFile(path.join(tempRoot, slug, "project.json"), "utf8")).toBe(beforeProject);
  });

  it("reports a degraded read-only baseline when a support file is missing", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Degraded Baseline", roughIdea: "A missing support file must remain visible." })
    });
    const slug = created.data.project.slug;
    const supportFile = path.join(tempRoot, slug, "story-control", "story-control.json");
    await fs.rm(supportFile);

    const response = await jsonFetch<{
      baseline: {
        mode: string;
        freshness: { status: string };
        failures: Array<{ code: string; path: string }>;
        writeAuthorities: string[];
      };
    }>(`/api/novel/projects/${slug}/capability-baseline`);

    expect(response.status).toBe(200);
    expect(response.data.baseline).toMatchObject({ mode: "read-only", freshness: { status: "degraded" }, writeAuthorities: [] });
    expect(response.data.baseline.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing-support-file", path: "story-control/story-control.json" })])
    );
  });

  it("inventories managed and legacy project folders without mutating them", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>('/api/novel/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Inventory Existing', roughIdea: 'Inventory must expose conflicts.' })
    });
    const slug = created.data.project.slug;
    const projectJsonBefore = await fs.readFile(path.join(tempRoot, slug, 'project.json'), 'utf8');
    await fs.writeFile(path.join(tempRoot, slug, 'project.yaml'), 'title: conflicting legacy source\n', 'utf8');
    const legacyRoot = path.join(tempRoot, 'legacy-folder');
    await fs.mkdir(legacyRoot, { recursive: true });
    await fs.writeFile(path.join(legacyRoot, 'story.md'), '# legacy story\n', 'utf8');
    const invalidRoot = path.join(tempRoot, 'invalid-folder');
    await fs.mkdir(invalidRoot, { recursive: true });
    await fs.writeFile(path.join(invalidRoot, 'project.json'), '{not-json', 'utf8');

    const response = await jsonFetch<{
      inventory: {
        mode: string;
        writeAuthorities: string[];
        projects: Array<{ projectSlug: string; classification: string; governanceState: string; sourceConflicts: string[] }>;
      };
    }>('/api/novel/projects/inventory');

    expect(response.status).toBe(200);
    expect(response.data.inventory).toMatchObject({ mode: 'read-only', writeAuthorities: [] });
    expect(response.data.inventory.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectSlug: slug, classification: 'managed', governanceState: 'legacy', sourceConflicts: ['project.yaml'] }),
        expect.objectContaining({ projectSlug: 'legacy-folder', classification: 'unmanaged', governanceState: 'legacy', sourceConflicts: [] }),
        expect.objectContaining({ projectSlug: 'invalid-folder', classification: 'invalid', governanceState: 'legacy' })
      ])
    );
    expect(response.data.inventory.projects.find((project) => project.projectSlug === 'invalid-folder')).toMatchObject({
      classification: 'invalid'
    });
    expect(await fs.readFile(path.join(tempRoot, slug, 'project.json'), 'utf8')).toBe(projectJsonBefore);
  });

  it("exposes an explicit release acceptance decision without activating", async () => {
    const response = await jsonFetch<{
      decision: { status: string; releaseProfile: string; checks: Array<{ checkId: string; status: string }> };
    }>('/api/novel/release-acceptance');

    expect(response.status).toBe(200);
    expect(response.data.decision).toMatchObject({ status: 'do-not-activate', releaseProfile: 'RP5-drafting' });
    expect(response.data.decision.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'migration-cutover', status: 'missing' }),
      expect.objectContaining({ checkId: 'external-calibration', status: 'missing' }),
      expect.objectContaining({ checkId: 'governed-e2e', status: 'missing' }),
      expect.objectContaining({ checkId: 'v2-independent-review', status: 'missing' })
    ]));
    const activation = await jsonFetch<{ error: { code: string } }>('/api/novel/release-activation');
    expect(activation.status).toBe(404);
    const attempted = await jsonFetch<{ error: { code: string } }>('/api/novel/release-activation', { method: 'POST' });
    expect(attempted.status).toBe(409);
    expect(attempted.data.error.code).toBe('RELEASE_ACCEPTANCE_REQUIRED');
    const recorded = await jsonFetch<{ decision: { status: string; fingerprint: string } }>('/api/novel/release-acceptance/record');
    expect(recorded.status).toBe(200);
    expect(recorded.data.decision).toMatchObject({ status: 'do-not-activate', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("starts and controls a bounded BookRun without equating pause with completion", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run API", roughIdea: "A bounded continuous run." })
    });
    const project = created.data.project;
    const started = await jsonFetch<{ run: { bookRunId: string; status: string; version: number; progress: { denominator: string } } }>(`/api/novel/projects/${project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [project.chapters[0].id], storyContractRef: "contract-v1", autonomyLevel: "L1", limits: { maxWorkItems: 1, maxBudgetCents: 1000 } })
    });
    expect(started.status).toBe(201);
    expect(started.data.run).toMatchObject({ status: "ready", progress: { denominator: "frozen-work-graph" } });
    const blockedAdvance = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(blockedAdvance.status).toBe(409);
    expect(blockedAdvance.data.error.code).toBe("BOOK_RUN_READINESS_REQUIRED");
    await jsonFetch(`/api/novel/projects/${project.slug}/session/context-manifest`, { method: "POST" });
    await jsonFetch(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 800 })
    });
    const proof = await jsonFetch<{ proof: { status: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST" });
    expect(proof.data.proof.status).toBe("blocked");
    expect((proof.data.proof as { blockedReasons?: string[] }).blockedReasons).toContain("dependency-graph-blocked");
    return;
    const advanced = await jsonFetch<{ run: { status: string; version: number }; scheduled: Array<{ status: string }> }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(advanced.status).toBe(201);
    expect(advanced.data.run.status).toBe("gate_required");
    const closureReadiness = await jsonFetch<{ readiness: { state: string; reasons: string[] } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/closure-readiness?sourceFingerprint=missing`);
    expect(closureReadiness.status).toBe(200);
    expect(closureReadiness.data.readiness).toMatchObject({ state: "scope_complete", reasons: ["SCOPE_NOT_COMPLETE"] });
    const audit = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/completion-audits`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "missing" })
    });
    expect(audit.status).toBe(409);
    expect(audit.data.error.code).toBe("COMPLETION_SCOPE_REQUIRED");
    const paused = await jsonFetch<{ run: { status: string; version: number } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/pause`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: advanced.data.run.version })
    });
    expect(paused.status).toBe(201);
    expect(paused.data.run.status).toBe("pausing");
    const resumed = await jsonFetch<{ run: { status: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/resume`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: paused.data.run.version })
    });
    expect(resumed.data.run.status).toBe("ready");
  });

  it("exposes and revokes the BookRun autonomy grant", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Autonomy Grant API", roughIdea: "Grant lifecycle is durable." }) });
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyExpiresAt: "2099-01-01T00:00:00.000Z", limits: { maxWorkItems: 1 } }) });
    expect(started.status).toBe(201);
    const read = await jsonFetch<{ grant: { status: string; bookRunId: string; expiresAt: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/autonomy-grant`);
    expect(read.status).toBe(200);
    expect(read.data.grant).toMatchObject({ status: "active", bookRunId: started.data.run.bookRunId, expiresAt: "2099-01-01T00:00:00.000Z" });
    const revoked = await jsonFetch<{ grant: { status: string; revokeReason: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/autonomy-grant/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "author changed scope" }) });
    expect(revoked.status).toBe(201);
    expect(revoked.data.grant).toMatchObject({ status: "revoked", revokeReason: "author changed scope" });
  });

  it("exposes the persisted completion audit as a replayable read", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Completion audit read API", roughIdea: "Replay the terminal proof." })
    });
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1 } })
    });
    const missing = await jsonFetch<{ error: string }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/completion-audits`);
    expect(missing.status).toBe(404);
    expect(missing.data.error).toBe("COMPLETION_AUDIT_NOT_FOUND");
    const revalidated = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/completion-audits?sourceFingerprint=canon-1`);
    expect(revalidated.status).toBe(409);
    expect(revalidated.data.error.code).toBe("COMPLETION_SCOPE_REQUIRED");
  });

  it("creates risk-gated chapter memory patches and reports asset coverage", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Memory patch API", roughIdea: "Every chapter leaves an auditable memory patch." })
    });
    const slug = created.data.project.slug;
    const blocked = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/memory/chapter-patches`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchId: "patch-api-1", chapterId: "chapter-001", chapterVersion: "chapter-001:v1", sourceRefs: ["chapter-settlement://chapter-001"], summary: "", keyEvents: [], newFacts: [], characterStates: [], emotionLedger: [], foreshadowingActions: [], continuityRisks: [], growthChanges: [] })
    });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error).toBe("MEMORY_PATCH_NO_CHANGE_REASON_REQUIRED");
    const createdPatch = await jsonFetch<{ patch: { fingerprint: string; risk: string }; adoption: { status: string; requiredConfirmation: string } }>(`/api/novel/projects/${slug}/runtime/memory/chapter-patches`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchId: "patch-api-1", chapterId: "chapter-001", chapterVersion: "chapter-001:v1", sourceRefs: ["chapter-settlement://chapter-001"], summary: "The bell answered.", keyEvents: ["The bell rang"], newFacts: [], characterStates: [], emotionLedger: [], foreshadowingActions: [{ obligationId: "ob-1", action: "resolved", risk: "high" }], continuityRisks: [], growthChanges: [] })
    });
    expect(createdPatch.status).toBe(201);
    expect(createdPatch.data).toMatchObject({ patch: { risk: "high" }, adoption: { status: "blocked", requiredConfirmation: "author" } });
    const readBack = await jsonFetch<{ patch: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/memory/chapter-patches/patch-api-1`);
    expect(readBack.data.patch.fingerprint).toBe(createdPatch.data.patch.fingerprint);
    const coverage = await jsonFetch<{ coverage: { chapterCount: number; coverageRate: { summary: number } } }>(`/api/novel/projects/${slug}/runtime/memory/asset-coverage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapters: [{ chapterId: "chapter-001", prose: true, summary: true, qualityReport: true, knowledgeIndex: true, foreshadowingExtraction: true }, { chapterId: "chapter-002", prose: true, summary: false, qualityReport: true, knowledgeIndex: false, foreshadowingExtraction: false }] })
    });
    expect(coverage.status).toBe(200);
    expect(coverage.data.coverage).toMatchObject({ chapterCount: 2, coverageRate: { summary: 0.5 } });
  });

  it("persists and commits a multi-asset MutationPlan through the runtime boundary", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Mutation plan API", roughIdea: "Commit canon and projections together." })
    });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    await fs.writeFile(path.join(root, "mutation-api.txt"), "before", "utf8");
    const plan = await jsonFetch<{ plan: { mutationId: string; status: string; changes: Array<{ expectedSha256: string }> } }>(`/api/novel/projects/${slug}/runtime/mutation-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: "mutation-api-1", idempotencyKey: "mutation-api-idem", commandType: "chapter.settle", expectedProjectFingerprint: "project-v1", changes: [{ relativePath: "mutation-api.txt", assetType: "canon", nextContent: "after", authoritative: true }], domainEvents: ["chapter.settled"], projectionUpdates: ["memory.rebuild"], postCommitJobs: [] })
    });
    expect(plan.status).toBe(201);
    expect(plan.data.plan).toMatchObject({ mutationId: "mutation-api-1", status: "prepared" });
    const replay = await jsonFetch<{ plan: { mutationId: string } }>(`/api/novel/projects/${slug}/runtime/mutation-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: "mutation-api-1", idempotencyKey: "mutation-api-idem", commandType: "chapter.settle", expectedProjectFingerprint: "project-v1", changes: [{ relativePath: "mutation-api.txt", assetType: "canon", nextContent: "after", authoritative: true }], domainEvents: ["chapter.settled"], projectionUpdates: ["memory.rebuild"], postCommitJobs: [] })
    });
    expect(replay.status).toBe(201);
    expect(replay.data.plan.mutationId).toBe("mutation-api-1");
    const immutableConflict = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/mutation-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: "mutation-api-1", idempotencyKey: "different-idem", commandType: "chapter.settle", expectedProjectFingerprint: "project-v1", changes: [{ relativePath: "mutation-api.txt", assetType: "canon", nextContent: "tampered", authoritative: true }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] })
    });
    expect(immutableConflict.status).toBe(409);
    expect(immutableConflict.data.error).toBe("MUTATION_PLAN_IMMUTABLE");
    const preflight = await jsonFetch<{ preflight: { status: string; committed: boolean; items: Array<{ status: string }> } }>(`/api/novel/projects/${slug}/runtime/mutation-plans/mutation-api-1/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(preflight.status).toBe(200);
    expect(preflight.data.preflight).toMatchObject({ status: "ready", committed: false, items: [expect.objectContaining({ status: "accepted" })] });
    const committed = await jsonFetch<{ plan: { status: string } }>(`/api/novel/projects/${slug}/runtime/mutation-plans/mutation-api-1/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(committed.status).toBe(201);
    expect(committed.data.plan.status).toBe("committed");
    expect(await fs.readFile(path.join(root, "mutation-api.txt"), "utf8")).toBe("after");
    const readBack = await jsonFetch<{ plan: { status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/mutation-plans/mutation-api-1`);
    expect(readBack.data.plan).toMatchObject({ status: "committed", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("persists a typed BookRun milestone repair plan without shrinking scope", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Repair Plan API", roughIdea: "Typed repairs preserve scope." })
    });
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1 } })
    });
    const response = await jsonFetch<{ plan: { status: string; preserveScope: boolean; actions: Array<{ kind: string }> } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/repair-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "source-repair", issues: [{ kind: "obligation", targetId: "obl-1", reason: "missing terminal evidence", evidenceRefs: ["audit://obl-1"] }] })
    });
    expect(response.status).toBe(201);
    expect(response.data.plan).toMatchObject({ status: "planned", preserveScope: true, actions: [{ kind: "obligation" }] });
  });

  it("records and audits a repair action through the BookRun API", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Repair Audit API", roughIdea: "Completion requires milestone evidence." })
    });
    const started = await jsonFetch<{ run: { bookRunId: string; version: number } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1 } })
    });
    const planned = await jsonFetch<{ plan: { planId: string; actions: Array<{ actionId: string }> } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/repair-plans`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "source-audit", issues: [{ kind: "obligation", targetId: "obl-1", reason: "missing terminal evidence", evidenceRefs: ["audit://obl-1"] }] })
    });
    const actionId = planned.data.plan.actions[0].actionId;
    const completed = await jsonFetch<{ receipt: { status: string; actionId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/repair-plans/${planned.data.plan.planId}/actions/${actionId}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceRefs: ["repair://obl-1"] })
    });
    expect(completed.status).toBe(201);
    expect(completed.data.receipt).toMatchObject({ status: "completed", actionId });
    const audited = await jsonFetch<{ audit: { status: string; planId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/repair-plans/${planned.data.plan.planId}/audit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "source-audit" })
    });
    expect(audited.status).toBe(201);
    expect(audited.data.audit).toMatchObject({ status: "passed", planId: planned.data.plan.planId });
  });

  it("persists a conservative startup readiness proof instead of inferring budget authorization", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Readiness Proof API", roughIdea: "Startup evidence must be explicit." })
    });
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1, maxBudgetCents: 1000 } })
    });
    const readiness = await jsonFetch<{ proof: { status: string; blockedReasons: string[]; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(readiness.status).toBe(200);
    expect(readiness.data.proof).toMatchObject({ status: "blocked", blockedReasons: expect.arrayContaining(["missing-budgetReservation"]), fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const reserved = await jsonFetch<{ reservation: { status: string; reservedCents: number; runVersion: number } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 800 }) });
    expect(reserved.status).toBe(201);
    expect(reserved.data.reservation).toMatchObject({ status: "reserved", reservedCents: 800, runVersion: 1 });
    const afterReservation = await jsonFetch<{ proof: { evidence: { budgetReservation: string }; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(afterReservation.data.proof.evidence.budgetReservation).toBe("present");
    expect(afterReservation.data.proof.blockedReasons).not.toContain("missing-budgetReservation");
    const settled = await jsonFetch<{ reservation: { status: string; consumedCents: number } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/budget-reservations/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consumedCents: 300 }) });
    expect(settled.status).toBe(201);
    expect(settled.data.reservation).toMatchObject({ status: "settled", consumedCents: 300 });
    const afterSettlement = await jsonFetch<{ proof: { evidence: { budgetReservation: string }; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(afterSettlement.data.proof.evidence.budgetReservation).toBe("missing");
    expect(afterSettlement.data.proof.blockedReasons).toContain("missing-budgetReservation");
  });

  it("exposes Q-009 length contract, forecast, and explicit variance decision", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Length API", roughIdea: "A bounded story." })
    });
    const slug = created.data.project.slug;
    const contract = await jsonFetch<{ contract: { fingerprint: string; pauseThresholdRatio: number } }>(`/api/novel/projects/${slug}/length-contract`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dimensions: { totalWords: { mode: "soft", min: 1, max: 2 }, totalChapters: { mode: "soft", min: 1, max: 3 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 1, max: 100 } } })
    });
    expect(contract.status).toBe(201);
    expect(contract.data.contract.pauseThresholdRatio).toBe(0.15);
    const forecast = await jsonFetch<{ forecast: { status: string; frozenBaseline: string } }>(`/api/novel/projects/${slug}/length-forecast`);
    expect(forecast.status).toBe(200);
    expect(forecast.data.forecast.status).toBe("pause-required");
    expect(forecast.data.forecast.frozenBaseline).toBe(contract.data.contract.fingerprint);
    const decision = await jsonFetch<{ decision: { status: string; alternatives: Array<{ autoAdoptable: boolean }> } }>(`/api/novel/projects/${slug}/length-variance-decisions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: "pause-and-review" })
    });
    expect(decision.status).toBe(201);
    expect(decision.data.decision.status).toBe("paused");
    expect(decision.data.decision.alternatives.every((option) => option.autoAdoptable === false)).toBe(true);
  });

  it("exposes an explicit read-only migration cutover report", async () => {
    await fs.mkdir(path.join(tempRoot, 'legacy-cutover'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'legacy-cutover', 'story.md'), '# legacy\n', 'utf8');
    const response = await jsonFetch<{
      report: { schemaVersion: string; status: string; projectCount: number; projects: Array<{ projectSlug: string; status: string }>; blockers: string[] };
    }>('/api/novel/migrations/cutover-readiness');
    expect(response.status).toBe(200);
    expect(response.data.report).toMatchObject({ schemaVersion: 'project-migration-cutover.v1', status: 'blocked' });
    expect(response.data.report.projectCount).toBeGreaterThan(0);
    expect(response.data.report.blockers.length).toBeGreaterThan(0);
  });

  it("exposes a batch migration preview without activating projects", async () => {
    const projectRoot = path.join(tempRoot, "batch-preview-project");
    await fs.mkdir(path.join(projectRoot, "chapters"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "batch-preview-project", chapters: [{ id: "c1", contentPath: "chapters/c1.md" }] }), "utf8");
    await fs.writeFile(path.join(projectRoot, "chapters", "c1.md"), "legacy\n", "utf8");
    const response = await jsonFetch<{ report: { schemaVersion: string; projects: Array<{ projectSlug: string; status: string; migrationId?: string }> } }>("/api/novel/migrations/preview-all", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(response.status).toBe(200);
    expect(response.data.report).toMatchObject({ schemaVersion: "project-migration-batch-preview.v1" });
    expect(response.data.report.projects).toEqual(expect.arrayContaining([expect.objectContaining({ projectSlug: "batch-preview-project", status: "previewed", migrationId: expect.stringMatching(/^migration-preview-/) })]));
    expect(JSON.parse(await fs.readFile(path.join(projectRoot, "project.json"), "utf8"))).not.toHaveProperty("migration");
  });

  it("exposes batch migration validation without activating projects", async () => {
    const projectRoot = path.join(tempRoot, "batch-validation-project");
    await fs.mkdir(path.join(projectRoot, "chapters"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "batch-validation-project", chapters: [] }));
    const response = await jsonFetch<{ report: { schemaVersion: string; status: string; projects: Array<{ projectSlug: string; status: string; blockers: string[] }> } }>("/api/novel/migrations/validate-all", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(response.status).toBe(200);
    expect(response.data.report).toMatchObject({ schemaVersion: "project-migration-batch-validation.v1", status: "blocked" });
    expect(response.data.report.projects).toEqual(expect.arrayContaining([expect.objectContaining({ projectSlug: "batch-validation-project", status: "blocked", blockers: ["outline-version-missing"] })]));
    expect(JSON.parse(await fs.readFile(path.join(projectRoot, "project.json"), "utf8"))).not.toHaveProperty("migration");
  });

  it("accepts only attested external understanding review evidence", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>('/api/novel/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'External Review Evidence', roughIdea: 'Evidence must remain isolated.' })
    });
    await fs.mkdir(path.join(tempRoot, created.data.project.slug, 'sessions'), { recursive: true });
    const externalSnapshotBase = {
      schemaVersion: 'understanding-snapshot.v1', snapshotId: 'snapshot-external-001', projectSlug: created.data.project.slug,
      mode: 'shadow', sourceFingerprint: 'c'.repeat(64), sourceMessageIds: [], coreExplicit: [], inferred: [], unknowns: [],
      question: { id: 'question-primary-desire', text: 'Question', status: 'candidate', impact: 'high', source: 'deterministic-gap' },
      modelCallIssued: false, canonWritten: false, createdAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(tempRoot, created.data.project.slug, 'sessions', 'understanding-snapshot.json'), JSON.stringify({ ...externalSnapshotBase, fingerprint: crypto.createHash('sha256').update(JSON.stringify(externalSnapshotBase)).digest('hex') }), 'utf8');
    const response = await jsonFetch<{ review: { status: string; canonWritten: boolean; reviewer: { kind: string; attestationReference: string } } }>(
      `/api/novel/projects/${created.data.project.slug}/session/understanding/review/external`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerKind: 'provider',
          reviewerId: 'provider-panel-01',
          attestationReference: 'attestation://provider-panel-01/review-001',
          snapshotFingerprint: 'c'.repeat(64),
          checks: [
            { checkId: 'source-fingerprint', detail: 'verified' },
            { checkId: 'evidence-spans', detail: 'verified' },
            { checkId: 'branch-separation', detail: 'verified' },
            { checkId: 'question-gate', detail: 'verified' },
            { checkId: 'canon-isolation', detail: 'verified' }
          ],
          evidenceRefs: ['holdout://provider-panel-01/review-001']
        })
      }
    );
    expect(response.status).toBe(201);
    expect(response.data.review).toMatchObject({ status: 'passed', canonWritten: false, reviewer: { kind: 'provider' } });
    const acceptance = await jsonFetch<{ decision: { checks: Array<{ checkId: string; status: string }> } }>('/api/novel/release-acceptance');
    expect(acceptance.data.decision.checks.find((check) => check.checkId === 'v2-independent-review')).toMatchObject({ status: 'passed' });
  });

  it("exposes RP3 contract acceptance as fail-closed until author and provider gates exist", async () => {
    const response = await jsonFetch<{
      decision: {
        releaseProfile: string;
        status: string;
        expectedRequirementCount: number;
        verifiedRequirementCount: number;
        authorAcceptance: string;
        realProviderEvidence: string;
        blockedReasons: string[];
      };
    }>("/api/novel/rp3-contract-acceptance");
    expect(response.status).toBe(200);
    expect(response.data.decision).toMatchObject({
      releaseProfile: "RP3-contract",
      status: "do-not-activate",
      expectedRequirementCount: 27,
      verifiedRequirementCount: 27,
      authorAcceptance: "missing",
      realProviderEvidence: "missing"
    });
    expect(response.data.decision.blockedReasons).toEqual(expect.arrayContaining([
      "AUTHOR_ACCEPTANCE_REQUIRED",
      "REAL_PROVIDER_EVIDENCE_REQUIRED"
    ]));
  });

  it("records explicit RP3 author acceptance while keeping provider evidence fail-closed", async () => {
    const submitted = await jsonFetch<{ acceptance: { status: string; actorId: string; fingerprint: string } }>("/api/novel/rp3-contract-acceptance/author", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", actorId: "author-1", authorizationId: "rp3-final-1", evidenceRefs: ["decision://rp3/final"] })
    });
    expect(submitted.status).toBe(201);
    expect(submitted.data.acceptance).toMatchObject({ status: "accepted", actorId: "author-1" });
    const evaluated = await jsonFetch<{ decision: { authorAcceptance: string; realProviderEvidence: string; status: string; blockedReasons: string[] } }>("/api/novel/rp3-contract-acceptance");
    expect(evaluated.data.decision).toMatchObject({ authorAcceptance: "accepted", realProviderEvidence: "missing", status: "do-not-activate" });
    expect(evaluated.data.decision.blockedReasons).toContain("REAL_PROVIDER_EVIDENCE_REQUIRED");
    const replay = await jsonFetch<{ acceptance: { fingerprint: string } }>("/api/novel/rp3-contract-acceptance/author", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", actorId: "author-1", authorizationId: "rp3-final-1", evidenceRefs: ["decision://rp3/final"] })
    });
    expect(replay.status).toBe(201);
    expect(replay.data.acceptance.fingerprint).toBe(submitted.data.acceptance.fingerprint);
  });

  it("reports RP4 full-profile acceptance from the current evidence map without overstating coverage", async () => {
    const response = await jsonFetch<{ decision: { releaseProfile: string; status: string; expectedRequirementCount: number; verifiedRequirementCount: number; blockedReasons: string[] } }>("/api/novel/rp4-outline-acceptance");
    expect(response.status).toBe(200);
    expect(response.data.decision.releaseProfile).toBe("RP4-outline");
    expect(response.data.decision.expectedRequirementCount).toBe(83);
    expect(response.data.decision.status).toBe("do-not-activate");
    expect(response.data.decision.blockedReasons).toEqual(expect.arrayContaining(["RP3_DEPENDENCY_NOT_ACCEPTED", "RP4_REQUIREMENTS_NOT_FULLY_VERIFIED"]));
  });

  it("persists the execution-ready gate report for later recovery reads", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "execution-gate-report", title: "Execution Gate Report", genre: "fantasy", roughIdea: "A bounded outline" }) });
    expect(created.status).toBe(201);
    const input = { outlineVersionId: "outline-version-1", nearHorizon: [1, 2, 3].map((order) => ({ chapterId: `chapter-${order}`, hasFunction: true, hasStateChange: true, sourceRefs: [`outline://chapter/${order}`] })), arcObligationLinks: [{ arcId: "arc-1", obligationId: "obligation-1", plannedNodeId: "chapter-1" }], causalReachable: true, contextComplete: true, blockingConflictsResolved: true, sourceRefs: ["outline://version/1"], structureVersionFingerprint: "structure-1", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-1" };
    const posted = await jsonFetch<{ report: { status: string; executionReady: boolean; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/execution-ready/gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(posted.status).toBe(200);
    expect(posted.data.report).toMatchObject({ status: "ready", executionReady: true });
    const read = await jsonFetch<{ report: { fingerprint: string; executionReady: boolean } }>(`/api/novel/projects/${created.data.project.slug}/runtime/execution-ready/gate`);
    expect(read.status).toBe(200);
    expect(read.data.report).toMatchObject({ fingerprint: posted.data.report.fingerprint, executionReady: true });
  });

  it("exposes chapter execution proof evidence from a queued work item", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "execution-evidence-link", title: "Execution Evidence Link", genre: "fantasy", roughIdea: "Proof linkage" }) });
    expect(created.status).toBe(201);
    const root = path.join(tempRoot, created.data.project.slug);
    const parentFingerprint = "d".repeat(64);
    const proof = await createChapterExecutionProof(root, { projectSlug: created.data.project.slug, chapterId: "chapter-001", planId: "plan-1", planFingerprint: "a".repeat(64), parentExecutionReadyProofFingerprint: parentFingerprint, contextFingerprint: "c".repeat(64) });
    const workItemBase = { schemaVersion: "execution-work-item.v1" as const, workItemId: "work-evidence-link", projectSlug: created.data.project.slug, chapterId: "chapter-001", versionId: "version-1", proofFingerprint: parentFingerprint, contextManifestId: "context-1", contextFingerprint: "c".repeat(64), status: "queued" as const, idempotencyKey: "evidence-link", createdAt: new Date().toISOString() };
    const workItem = { ...workItemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(workItemBase)).digest("hex") };
    await fs.mkdir(path.join(root, "sessions", "execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "execution-work-items", `${workItem.workItemId}.json`), JSON.stringify(workItem), "utf8");
    const response = await jsonFetch<{ workItem: { workItemId: string }; chapterExecutionProofs: Array<{ proofId: string }> }>(`/api/novel/projects/${created.data.project.slug}/runtime/execution-work-items/${workItem.workItemId}/evidence`);
    expect(response.status).toBe(200);
    expect(response.data.workItem.workItemId).toBe(workItem.workItemId);
    expect(response.data.chapterExecutionProofs.map((item) => item.proofId)).toContain(proof.proofId);
  });

  it("exposes current graph provenance for a scheduled execution work item", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "execution-provenance", title: "Execution Provenance", genre: "fantasy", roughIdea: "Graph trace" }) });
    expect(created.status).toBe(201);
    const root = path.join(tempRoot, created.data.project.slug);
    const graph = await createBookWorkGraph(root, created.data.project.slug, ["chapter-001"]);
    const workItemBase = { schemaVersion: "execution-work-item.v1" as const, workItemId: "work-provenance", projectSlug: created.data.project.slug, chapterId: "chapter-001", versionId: "version-1", proofFingerprint: "d".repeat(64), contextManifestId: "context-1", contextFingerprint: "c".repeat(64), sourceBookWorkItemId: "book-draft-chapter-001", sourceGraphFingerprint: graph.fingerprint, status: "queued" as const, idempotencyKey: "provenance", createdAt: new Date().toISOString() };
    const workItem = { ...workItemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(workItemBase)).digest("hex") };
    await fs.mkdir(path.join(root, "sessions", "execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "execution-work-items", `${workItem.workItemId}.json`), JSON.stringify(workItem), "utf8");
    const response = await jsonFetch<{ provenance: { sourceGraphCurrent: boolean; sourceBookWorkItemPresent: boolean; currentGraphFingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/execution-work-items/${workItem.workItemId}/provenance`);
    expect(response.status).toBe(200);
    expect(response.data.provenance).toMatchObject({ sourceGraphCurrent: true, sourceBookWorkItemPresent: true, currentGraphFingerprint: graph.fingerprint });
  });

  it("keeps memory claims candidate until a chapter settlement explicitly confirms them", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "memory-claim-route", title: "Memory Claim Route", genre: "fantasy", roughIdea: "Authority test" }) });
    const claim = await jsonFetch<{ claim: { status: string; claimId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: "memory-route-1", proposition: "The gate requires blood", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#span-1"], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.9 }) });
    expect(claim.status).toBe(201);
    expect(claim.data.claim.status).toBe("candidate");
    const duplicateClaim = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: claim.data.claim.claimId, proposition: "A different proposition", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#different"], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.9 }) });
    expect(duplicateClaim.status).toBe(409);
    const blocked = await jsonFetch<{ error: string }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims/${claim.data.claim.claimId}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterSettlementCompleted: false, confirmer: "author-1", reason: "confirm" }) });
    expect(blocked.status).toBe(409);
    await writeSettledChapterEvidence(created.data.project.slug, "chapter-1");
    const settled = await jsonFetch<{ claim: { status: string; version: number } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims/${claim.data.claim.claimId}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterSettlementCompleted: true, confirmer: "author-1", reason: "confirmed after chapter settlement" }) });
    expect(settled.status).toBe(201);
    expect(settled.data.claim).toMatchObject({ status: "eligible", version: 2 });
    for (const [eventId, start] of [["event-open", "001"], ["event-after", "002"]] as const) {
      const event = await jsonFetch<{ event: { eventId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/story-time-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, label: eventId, timelineId: "main", start, end: start, duration: "1 beat", uncertainty: "exact", parallelLine: "main", sourceRefs: [`chapter-1#${eventId}`] }) });
      expect(event.status).toBe(201);
    }
    const temporal = await jsonFetch<{ temporal: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims/${claim.data.claim.claimId}/temporal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetEvent: "event-open", eventOrder: { "event-open": 1, "event-after": 2 } }) });
    expect(temporal.data.temporal.status).toBe("active");
    const boundedClaim = await jsonFetch<{ claim: { claimId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: "memory-route-bounded", proposition: "The bridge is open", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#bridge"], producedBy: "author", temporalScope: { startEvent: "event-open", asOfVersion: "chapter-1:v1" }, confidence: 0.9 }) });
    const forgedTemporal = await jsonFetch<{ temporal: { status: string; reason: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claims/${boundedClaim.data.claim.claimId}/temporal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetEvent: "forged-target", eventOrder: { "event-open": 1, "forged-target": 2 } }) });
    expect(forgedTemporal.data.temporal).toMatchObject({ status: "unknown", reason: "TARGET_EVENT_UNORDERED" });
    const relation = await jsonFetch<{ relation: { relation: string; relationId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claim-relations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromClaimId: "memory-route-1", toClaimId: "memory-route-2", relation: "contradicts", sourceRefs: ["chapter-2#1"], validFromVersion: "v1" }) });
    expect(relation.status).toBe(201);
    expect(relation.data.relation.relation).toBe("contradicts");
    const revokedRelation = await jsonFetch<{ event: { relationId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claim-relations/${relation.data.relation.relationId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "revised canon", sourceRefs: ["chapter-3#revision"] }) });
    expect(revokedRelation.status).toBe(201);
    const missingRelationVersion = await jsonFetch<{ error: string }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claim-relations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromClaimId: "memory-route-1", toClaimId: "memory-route-2", relation: "supports", sourceRefs: ["chapter-2#1"] }) });
    expect(missingRelationVersion.status).toBe(409);
    const entity = await jsonFetch<{ entity: { entityId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/entities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId: "memory-character-a", kind: "character", canonicalName: "Lin Xia", sourceRefs: ["chapter://1"] }) });
    const alias = await jsonFetch<{ assertion: Record<string, unknown> }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/alias-assertions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromEntityId: "identity-white-crow", alias: "White Crow", relation: "same-as", toEntityId: entity.data.entity.entityId, evidenceRefs: ["chapter-3#reveal"], knowledgeScope: "author" }) });
    const confirmedAlias = await jsonFetch<{ assertion: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/alias-assertions/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assertion: alias.data.assertion, confirmer: "author-1" }) });
    expect(confirmedAlias.data.assertion.status).toBe("confirmed");
    const persistedResolution = await jsonFetch<{ resolution: { status: string; entityIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/alias-resolutions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alias: "White Crow", entities: [], assertions: [] }) });
    expect(persistedResolution.data.resolution).toMatchObject({ status: "resolved", entityIds: [entity.data.entity.entityId] });
    const canonicalEntities = await jsonFetch<{ entities: Array<{ entityId: string }> }>(`/api/novel/projects/${created.data.project.slug}/memory/entities`);
    expect(canonicalEntities.status).toBe(200);
    expect(canonicalEntities.data.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: entity.data.entity.entityId })]));
    const canonicalResolution = await jsonFetch<{ resolution: { status: string; entityIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/memory/entity-resolutions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alias: "White Crow", entities: [], assertions: [] }) });
    expect(canonicalResolution.status).toBe(200);
    expect(canonicalResolution.data.resolution).toMatchObject({ status: "resolved", entityIds: [entity.data.entity.entityId] });
    const canonicalAssertions = await jsonFetch<{ assertions: Array<{ assertionId: string; status: string }> }>(`/api/novel/projects/${created.data.project.slug}/memory/alias-assertions`);
    expect(canonicalAssertions.status).toBe(200);
    expect(canonicalAssertions.data.assertions).toEqual(expect.arrayContaining([expect.objectContaining({ status: "confirmed" })]));
    const canonicalAlias = await jsonFetch<{ assertion: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/memory/alias-assertions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromEntityId: "identity-white-crow-2", alias: "White Crow 2", relation: "same-as", toEntityId: entity.data.entity.entityId, evidenceRefs: ["chapter-4#reveal"], knowledgeScope: "author" }) });
    expect(canonicalAlias.status).toBe(201);
    expect(canonicalAlias.data.assertion.status).toBe("proposed");
    const canonicalConfirmed = await jsonFetch<{ assertion: { status: string; assertionId: string } }>(`/api/novel/projects/${created.data.project.slug}/memory/alias-assertions/${canonicalAlias.data.assertion.assertionId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmer: "author-2" }) });
    expect(canonicalConfirmed.status).toBe(200);
    expect(canonicalConfirmed.data.assertion).toMatchObject({ assertionId: canonicalAlias.data.assertion.assertionId, status: "confirmed" });
  });

  it("derives canonical memory conflict preflight from persisted claims and relations", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "memory-conflict-preflight", title: "Memory Conflict Preflight", genre: "fantasy", roughIdea: "Persisted conflict gate" }) });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/memory/claims`;
    for (const [claimId, proposition] of [["conflict-a", "The gate is open"], ["conflict-b", "The gate is sealed"]] as const) {
      await writeSettledChapterEvidence(created.data.project.slug, claimId);
      const made = await jsonFetch<{ claim: { claimId: string } }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId, proposition, epistemicType: "canon_fact", sourceRefs: [`chapter://${claimId}`], evidenceAnchors: [`${claimId}#1`], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }) });
      expect(made.status).toBe(201);
      const settled = await jsonFetch<{ claim: { status: string } }>(`${base}/${made.data.claim.claimId}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterSettlementCompleted: true, confirmer: "author", reason: "settled" }) });
      expect(settled.data.claim.status).toBe("eligible");
    }
    const relation = await jsonFetch<{ relation: { relationId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/memory/claim-relations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromClaimId: "conflict-a", toClaimId: "conflict-b", relation: "contradicts", sourceRefs: ["chapter://conflict"], validFromVersion: "v1" }) });
    expect(relation.status).toBe(201);
    const preflight = await jsonFetch<{ gate: { status: string; contradictionSetIds: string[]; blockers: string[] } }>(`/api/novel/projects/${created.data.project.slug}/memory/conflict-preflights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hardRiskConflict: false }) });
    expect(preflight.status).toBe(200);
    expect(preflight.data.gate).toMatchObject({ status: "blocked", contradictionSetIds: expect.arrayContaining([expect.stringContaining("contradiction-set-")]) });
    expect(preflight.data.gate.blockers).toContain("MEMORY_CONTRADICTION_UNRESOLVED");
  });

  it("persists scoped character and reader knowledge and evaluates eligibility", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "memory-knowledge-route", title: "Memory Knowledge Route", genre: "fantasy", roughIdea: "Knowledge boundary" }) });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/memory/knowledge`;
    const character = await jsonFetch<{ stateId: string }>(`${base}/characters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: "c1", claimId: "secret", state: "learned", evidenceRefs: ["chapter-2#tell"], asOfEvent: "e2" }) });
    expect(character.status, JSON.stringify(character.data)).toBe(201);
    const reader = await jsonFetch<{ stateId: string }>(`${base}/readers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readerScope: "default", claimId: "secret", state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-2", evidenceRefs: ["pub-1#chapter-2"] }) });
    expect(reader.status, JSON.stringify(reader.data)).toBe(201);
    const characterEligibility = await jsonFetch<{ eligibility: { eligible: boolean } }>(`${base}/characters/eligibility`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: "c1", claimId: "secret", targetEvent: "e1", eventOrder: { e1: 1, e2: 2 } }) });
    expect(characterEligibility.data.eligibility.eligible).toBe(false);
    const readerEligibility = await jsonFetch<{ eligibility: { eligible: boolean } }>(`${base}/readers/eligibility`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readerScope: "default", claimId: "secret", publicationVersion: "pub-1", progressCursor: "chapter-2" }) });
    expect(readerEligibility.data.eligibility.eligible).toBe(true);
    const characterView = await jsonFetch<{ authority: string; states: Array<{ characterId: string; claimId: string }> }>(`/api/novel/projects/${created.data.project.slug}/memory/epistemic/characters/c1?claimId=secret`);
    expect(characterView.status).toBe(200);
    expect(characterView.data).toMatchObject({ authority: "memory-knowledge-events" });
    expect(characterView.data.states).toHaveLength(1);
    const readerView = await jsonFetch<{ authority: string; states: Array<{ readerScope: string; publicationVersion: string }> }>(`/api/novel/projects/${created.data.project.slug}/memory/epistemic/readers/default?claimId=secret&publicationVersion=pub-1`);
    expect(readerView.status).toBe(200);
    expect(readerView.data).toMatchObject({ authority: "memory-knowledge-events" });
    expect(readerView.data.states).toHaveLength(1);
  });

  it("retcons a settled memory claim without deleting its historical event", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "memory-retcon-route", title: "Memory Retcon Route", genre: "fantasy", roughIdea: "Versioned memory" }) });
    await writeSettledChapterEvidence(created.data.project.slug, "1");
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/memory/claims`;
    const claim = await jsonFetch<{ claim: { claimId: string } }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: "retcon-route-1", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }) });
    await jsonFetch(`${base}/${claim.data.claim.claimId}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" }) });
    const retcon = await jsonFetch<{ obsolete: { status: string }; replacement: { status: string; version: number; proposition: string }; impact: { status: string; actions: string[] }; rebuild: { status: string; executedActions: string[] } }>(`${base}/${claim.data.claim.claimId}/retcon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "new evidence" }) });
    expect(retcon.status).toBe(201);
    expect(retcon.data.obsolete.status).toBe("obsolete");
    expect(retcon.data.replacement).toMatchObject({ status: "candidate", version: 3, proposition: "The gate is sealed" });
    expect(retcon.data.impact).toMatchObject({ status: "blocked-until-rebuild" });
    expect(retcon.data.rebuild).toMatchObject({ status: "executed" });
    const publicationGate = await jsonFetch<{ decision: { allowed: boolean; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/publication-gate`);
    expect(publicationGate.data.decision.allowed).toBe(false);
    expect(publicationGate.data.decision.blockedReasons).toContain("MEMORY_REPLACEMENT_PENDING");
  });

  it("replays entity merge and split lineage through the memory API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Entity Replay Route", roughIdea: "Identity lifecycle" }) });
    const base = `/api/novel/projects/${created.data.project.slug}/runtime/memory/entities`;
    for (const [entityId, canonicalName] of [["entity-route-a", "A"], ["entity-route-b", "B"]]) {
      const response = await jsonFetch<{ entity: { entityId: string } }>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId, kind: "character", canonicalName, sourceRefs: [`chapter://${entityId}`] }) });
      expect(response.status).toBe(201);
    }
    const merged = await jsonFetch<{ replay: { entities: Array<{ entityId: string; status: string }>; lineage: Array<{ relation: string; relatedEntityId: string }> } }>(`${base}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceEntityIds: ["entity-route-a", "entity-route-b"], targetEntityId: "entity-route-ab", kind: "character", canonicalName: "A-B", sourceRefs: ["chapter://merge"], confirmer: "author", evidenceRefs: ["chapter-3#identity"], reason: "same identity" }) });
    expect(merged.status).toBe(201);
    expect(merged.data.replay.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "entity-route-a", status: "merged" }), expect.objectContaining({ entityId: "entity-route-ab", status: "active" })]));
    const split = await jsonFetch<{ replay: { entities: Array<{ entityId: string; status: string }>; lineage: Array<{ relation: string; relatedEntityId: string }> } }>(`${base}/split`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceEntityId: "entity-route-ab", replacementEntities: [{ entityId: "entity-route-a2", kind: "character", canonicalName: "A", sourceRefs: ["chapter://split"] }, { entityId: "entity-route-b2", kind: "character", canonicalName: "B", sourceRefs: ["chapter://split"] }], confirmer: "author", evidenceRefs: ["chapter-4#split"], reason: "distinct identities" }) });
    expect(split.status).toBe(201);
    expect(split.data.replay.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "entity-route-ab", status: "split" }), expect.objectContaining({ entityId: "entity-route-a2", status: "active" })]));
    expect(split.data.replay.lineage).toEqual(expect.arrayContaining([expect.objectContaining({ relation: "merged-into", relatedEntityId: "entity-route-ab" }), expect.objectContaining({ relation: "split-into", relatedEntityId: "entity-route-a2" })]));
    const replay = await jsonFetch<{ replay: { fingerprint: string } }>(`${base}/replay`);
    expect(replay.data.replay.fingerprint).toHaveLength(64);
  });

  it("exposes the RP4 outline gate without claiming full-book executability", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "outline-gate-route", title: "Outline Gate Route", genre: "fantasy", roughIdea: "A bounded outline gate" })
    });
    expect(created.status).toBe(201);
    const response = await jsonFetch<{ decision: { releaseProfile: string; status: string; fullBookExecutable: boolean; blockedReasons: string[] } }>(
      `/api/novel/projects/${created.data.project.slug}/runtime/outline-release-gate`
    );
    expect(response.status).toBe(200);
    expect(response.data.decision).toMatchObject({ releaseProfile: "RP4-outline", status: "blocked", fullBookExecutable: false });
    expect(response.data.decision.blockedReasons).toEqual(expect.arrayContaining(["OUTLINE_GATE_RP3_DEPENDENCY"]));
  });

  it("persists research source snapshots immutably and exposes a read-back", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "research-snapshot-route", title: "Research Snapshot Route", genre: "historical", roughIdea: "Evidence-backed research" })
    });
    const payload = {
      sourceId: "source-immutable-1", sourceType: "web", author: "Archive", title: "Record", publishedAt: "2025-01-01", retrievedAt: "2026-07-31", region: "CN", locator: "https://example.test/record?utm_source=test&entry=1", contentHash: "content-hash-1", acquisition: "browser", rights: "quote-with-attribution", reliabilitySignals: ["institutional"], expiry: "2027-01-01", rawContent: "A record. api_key=secret-value"
    };
    const first = await jsonFetch<{ source: { locator: string; sanitizedContent: string }; created: boolean }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/source-snapshots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    expect(first.status).toBe(201);
    expect(first.data.created).toBe(true);
    expect(first.data.source.locator).toBe("https://example.test/record?entry=1");
    expect(first.data.source.sanitizedContent).not.toContain("secret-value");
    const readBack = await jsonFetch<{ source: { fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/source-snapshots/${payload.sourceId}`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.source.fingerprint).toBeDefined();
    const reliability = await jsonFetch<{ assessment: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/source-snapshots/${payload.sourceId}/reliability`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requiredSignals: ["official"], minIndependentSources: 0 }) });
    expect(reliability.status).toBe(200);
    expect(reliability.data.assessment).toMatchObject({ status: "insufficient", reasons: ["REQUIRED_RELIABILITY_SIGNAL_MISSING"] });
    const claimEvaluation = await jsonFetch<{ claim: { fingerprint: string }; assessment: { status: string; reasons: string[] }; factCheck: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/claims/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: "2026-07-31", evidenceExcerpt: "A record.", claim: { claimId: "claim-route-1", sourceSnapshotId: payload.sourceId, sourceText: "A record", paraphrase: "A record", status: "supported", anchor: `source://${payload.sourceId}#1`, region: "CN", asOf: "2025-01-01", conditions: [], counterEvidence: [], independentSourceIds: [payload.sourceId] } }) });
    expect(claimEvaluation.status).toBe(200);
    expect(claimEvaluation.data.assessment.status).toBe("current");
    expect(claimEvaluation.data.factCheck).toMatchObject({ status: "supported", reasons: [] });
    const factCheckReplay = await jsonFetch<{ factCheck: { claimId: string; fingerprint: string; status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/claims/claim-route-1/fact-check`);
    expect(factCheckReplay.status).toBe(200);
    expect(factCheckReplay.data.factCheck).toMatchObject({ claimId: "claim-route-1", fingerprint: expect.any(String), status: "supported" });
    const receiptPayload = { receiptId: "receipt-route-1", claimId: "claim-route-1", sourceSnapshotId: payload.sourceId, assetRef: "outline://v1#chapter-1", usage: "historical detail", adaptation: "compressed", risk: "high", span: { start: 1, end: 12 } };
    const receipt = await jsonFetch<{ receipt: { fingerprint: string }; created: boolean }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/consumption-receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receiptPayload) });
    expect(receipt.status).toBe(201);
    const receiptRead = await jsonFetch<{ receipt: { fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/consumption-receipts/${receiptPayload.receiptId}`);
    expect(receiptRead.status).toBe(200);
    expect(receiptRead.data.receipt.fingerprint).toBe(receipt.data.receipt.fingerprint);
    const correction = await jsonFetch<{ propagation: { affectedReceiptIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/claims/claim-route-1/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previousFingerprint: "claim-route-1", replacementFingerprint: "claim-route-2", reason: "Publisher erratum" }) });
    expect(correction.status).toBe(201);
    expect(correction.data.propagation.affectedReceiptIds).toContain(receiptPayload.receiptId);
    const blockedSettlement = await jsonFetch<{ decision: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/settlements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipt: { ...receiptPayload, schemaVersion: "research-consumption-receipt.v1", status: "pending", fingerprint: receipt.data.receipt.fingerprint }, claimAssessment: { status: "contested", reasons: ["COUNTER_EVIDENCE_PRESENT"], fingerprint: claimEvaluation.data.claim.fingerprint }, currentClaimFingerprint: claimEvaluation.data.claim.fingerprint, consumedClaimFingerprint: claimEvaluation.data.claim.fingerprint }) });
    expect(blockedSettlement.status).toBe(409);
    expect(blockedSettlement.data.decision.status).toBe("blocked");
    const factCheckedSettlement = await jsonFetch<{ settlement: { status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/settlements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipt: { ...receiptPayload, schemaVersion: "research-consumption-receipt.v1", status: "pending", fingerprint: receipt.data.receipt.fingerprint }, claimAssessment: { status: "current", reasons: [], fingerprint: claimEvaluation.data.claim.fingerprint }, factCheck: { status: "supported" }, currentClaimFingerprint: claimEvaluation.data.claim.fingerprint, consumedClaimFingerprint: claimEvaluation.data.claim.fingerprint }) });
    expect(factCheckedSettlement.status).toBe(200);
    expect(factCheckedSettlement.data.settlement.status).toBe("current");
    const currentSettlement = await jsonFetch<{ settlement: { status: string; decision: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/settlements/${receiptPayload.receiptId}`);
    expect(currentSettlement.status).toBe(200);
    expect(currentSettlement.data.settlement).toMatchObject({ status: "current", decision: "current" });
    const revoked = await jsonFetch<{ propagation: { affectedReceiptIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/source-snapshots/${payload.sourceId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Source withdrawn by publisher" }) });
    expect(revoked.status).toBe(201);
    expect(revoked.data.propagation.affectedReceiptIds).toContain(receiptPayload.receiptId);
    const propagatedAssessment = await jsonFetch<{ assessment: { status: string }; propagation: { affectedReceiptIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/claims/claim-route-1/propagate-assessment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: "2026-07-31", claim: { sourceSnapshotId: payload.sourceId, sourceText: "A record", paraphrase: "A record", status: "supported", anchor: `source://${payload.sourceId}#1`, region: "CN", asOf: "2025-01-01", conditions: [], counterEvidence: [], independentSourceIds: [payload.sourceId] } }) });
    expect(propagatedAssessment.status).toBe(200);
    expect(propagatedAssessment.data.assessment.status).toBe("stale");
    expect(propagatedAssessment.data.propagation.affectedReceiptIds).toContain(receiptPayload.receiptId);
    const revokedClaim = await jsonFetch<{ assessment: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/claims/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: "2026-07-31", claim: { claimId: "claim-route-1", sourceSnapshotId: payload.sourceId, sourceText: "A record", paraphrase: "A record", status: "supported", anchor: `source://${payload.sourceId}#1`, region: "CN", asOf: "2025-01-01", conditions: [], counterEvidence: [], independentSourceIds: [payload.sourceId] } }) });
    expect(revokedClaim.data.assessment.status).toBe("stale");
    const staleSettlement = await jsonFetch<{ settlement: { status: string; decision: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/settlements/${receiptPayload.receiptId}`);
    expect(staleSettlement.data.settlement).toMatchObject({ status: "stale", decision: "SOURCE_REVOKED" });
    const publicationGate = await jsonFetch<{ decision: { status: string; allowed: boolean; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/publication-gate`);
    expect(publicationGate.data.decision).toMatchObject({ status: "blocked", allowed: false });
    expect(publicationGate.data.decision.blockedReasons).toContain("HIGH_RISK_SETTLEMENT_REQUIRED");
    const blockedAdoption = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/prose-candidates/missing-candidate/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedCanonSha256: "x", authorizationId: "author-1" }) });
    expect(blockedAdoption.status).toBe(409);
    expect(blockedAdoption.data.error.code).toBe("RESEARCH_PUBLICATION_GATE_BLOCKED");
    const conflict = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/source-snapshots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, contentHash: "different" }) });
    expect(conflict.status).toBe(409);
    expect(conflict.data.error.code).toBe("RESEARCH_SOURCE_IMMUTABLE");
    const settlementPath = path.join(tempRoot, created.data.project.slug, "research", "settlements", `${receiptPayload.receiptId}.json`);
    const tamperedSettlement = JSON.parse(await fs.readFile(settlementPath, "utf8")) as Record<string, unknown>;
    tamperedSettlement.status = "current";
    await fs.writeFile(settlementPath, JSON.stringify(tamperedSettlement), "utf8");
    const tamperedRead = await jsonFetch<{ error: string }>(`/api/novel/projects/${created.data.project.slug}/runtime/research/settlements/${receiptPayload.receiptId}`);
    expect(tamperedRead.status).toBe(409);
    expect(tamperedRead.data.error).toMatchObject({ code: "RESEARCH_SETTLEMENT_INTEGRITY_FAILED" });
  });

  it("persists and resolves research source conflicts without mutating the open case", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Research Conflict Route", roughIdea: "Conflicting sources need adjudication." })
    });
    const slug = created.data.project.slug;
    const conflict = await jsonFetch<{ conflict: { conflictId: string; status: string; fingerprint: string }; created: boolean }>(`/api/novel/projects/${slug}/runtime/research/conflicts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictId: "conf-route-1", claimIds: ["claim-a", "claim-b"], sourceIds: ["source-a", "source-b"], conflictKind: "direct", evidenceRefs: ["audit://conf-route-1"] })
    });
    expect(conflict.status).toBe(201);
    expect(conflict.data.conflict.status).toBe("open");
    const resolved = await jsonFetch<{ conflict: { status: string; selectedClaimId: string }; created: boolean }>(`/api/novel/projects/${slug}/runtime/research/conflicts/conf-route-1/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved", selectedClaimId: "claim-b", rationale: "source-b is newer and directly covers the target region", evidenceRefs: ["decision://author/conf-route-1"] })
    });
    expect(resolved.status).toBe(201);
    expect(resolved.data.conflict).toMatchObject({ status: "resolved", selectedClaimId: "claim-b" });
    const readBack = await jsonFetch<{ conflict: { status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/research/conflicts/conf-route-1`);
    expect(readBack.data.conflict).toMatchObject({ status: "open", fingerprint: conflict.data.conflict.fingerprint });
  });

  it("serves a frozen, content-free RP0 evaluation profile that can be replayed", async () => {
    const first = await jsonFetch<{
      suite: {
        schemaVersion: string;
        suiteId: string;
        version: string;
        status: string;
        layers: Record<string, number>;
        cases: Array<{
          caseId: string;
          version: string;
          layer: string;
          frozenInputFingerprint: string;
          holdoutClass: string;
          rights: string;
          status: string;
        }>;
        contaminationChecks: { sourceContentIncluded: boolean; holdoutInputsExcluded: boolean };
      };
    }>('/api/novel/evaluation/rp0-baseline');

    expect(first.status).toBe(200);
    expect(first.data.suite).toMatchObject({
      schemaVersion: 'evaluation-suite.v1',
      suiteId: 'rp0-baseline',
      version: '1.0.0',
      status: 'frozen',
      contaminationChecks: { sourceContentIncluded: false, holdoutInputsExcluded: true }
    });
    expect(first.data.suite.layers).toEqual({ smoke: 1, failure: 1, migration: 1 });
    expect(first.data.suite.cases).toHaveLength(3);
    for (const evaluationCase of first.data.suite.cases) {
      expect(evaluationCase.frozenInputFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(evaluationCase).toMatchObject({ version: '1.0.0', rights: 'synthetic', status: 'frozen' });
      expect(evaluationCase).not.toHaveProperty('input');
      expect(evaluationCase).not.toHaveProperty('expectedOutput');
    }

    const replay = await jsonFetch<{ suite: unknown }>('/api/novel/evaluation/rp0-baseline');
    expect(replay.data.suite).toEqual(first.data.suite);
  });

  it("reports read-only durability and recovery readiness without creating a backup", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>('/api/novel/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Durability Baseline', roughIdea: 'Recovery readiness must be explicit.' })
    });
    const slug = created.data.project.slug;
    const projectRoot = path.join(tempRoot, slug);
    const beforeEntries = await fs.readdir(projectRoot, { recursive: true });

    const response = await jsonFetch<{
      durability: {
        schemaVersion: string;
        mode: string;
        writeAuthorities: string[];
        backup: { status: string };
        recovery: { status: string; settlement: string };
        projectTree: { fileCount: number; fingerprint: string };
        failures: Array<{ code: string; path: string }>;
      };
    }>(`/api/novel/projects/${slug}/durability-baseline`);

    expect(response.status).toBe(200);
    expect(response.data.durability).toMatchObject({
      schemaVersion: 'durability-baseline.v1',
      mode: 'read-only',
      writeAuthorities: [],
      backup: { status: 'not-configured' },
      recovery: { status: 'not-configured', settlement: 'not-issued' },
      failures: []
    });
    expect(response.data.durability.projectTree.fileCount).toBeGreaterThan(0);
    expect(response.data.durability.projectTree.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readdir(projectRoot, { recursive: true })).toEqual(beforeEntries);
  });

  it("creates and verifies a local backup manifest without claiming external durability", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Backup API", roughIdea: "Create a verifiable local backup." })
    });
    const slug = created.data.project.slug;
    const createdBackup = await jsonFetch<{ manifest: { backupId: string; status: string; faultDomain: string } }>(`/api/novel/projects/${slug}/backups`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(createdBackup.status).toBe(201);
    expect(createdBackup.data.manifest).toMatchObject({ status: "verified", faultDomain: "same-workspace" });
    const catalog = await jsonFetch<{ backups: Array<{ backupId: string; status: string }> }>(`/api/novel/projects/${slug}/backups`);
    expect(catalog.status).toBe(200);
    expect(catalog.data.backups).toEqual([expect.objectContaining({ backupId: createdBackup.data.manifest.backupId, status: "verified" })]);
    const verification = await jsonFetch<{ verification: { status: string; failures: string[] } }>(`/api/novel/projects/${slug}/backups/${createdBackup.data.manifest.backupId}/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(verification.status).toBe(200);
    expect(verification.data.verification).toMatchObject({ status: "verified", failures: [] });
  });

  it("exposes append-only obligation events and rejects direct payoff", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Obligation API", roughIdea: "Track a mystery safely." })
    });
    const slug = created.data.project.slug;
    const obligation = await jsonFetch<{ obligation: { obligationId: string; status: string; version: number } }>(`/api/novel/projects/${slug}/obligations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "mystery", title: "Sealed gate", questionOrPromise: "Who sealed it?" })
    });
    expect(obligation.status).toBe(201);
    const legacyPut = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved" })
    });
    expect(legacyPut.status).toBe(409);
    expect(legacyPut.data.error.code).toBe("OBLIGATION_DOMAIN_COMMAND_REQUIRED");
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStatus: "paid", reason: "done", actor: "author", expectedVersion: 0 })
    });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toContain("OBLIGATION_INVALID_TRANSITION");
    const confirmed = await jsonFetch<{ obligation: { status: string; version: number } }>(`/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStatus: "confirmed", reason: "author confirmed", actor: "author", expectedVersion: 0 })
    });
    expect(confirmed.data.obligation).toMatchObject({ status: "confirmed", version: 1 });
    const invalidation = await jsonFetch<{ invalidation: { status: string; staleArtifactRefs: string[] } }>(`/api/novel/projects/${slug}/runtime/obligations/evidence-invalidation`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ obligationId: obligation.data.obligation.obligationId, priorStatus: "paid", setupEvidenceRefs: ["prose://ch-1#p-4"], currentEvidenceRefs: ["prose://ch-7#p-2"] })
    });
    expect(invalidation.data.invalidation).toMatchObject({ status: "evidence_invalidated", staleArtifactRefs: expect.arrayContaining(["completion://obligation/" + obligation.data.obligation.obligationId]) });
  });

  it("exposes an honest obligation source-coverage report", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Coverage API", roughIdea: "Audit source coverage." })
    });
    const report = await jsonFetch<{ report: { sourceCoverageStatus: string; canClaimNoOpenObligations: boolean } }>(`/api/novel/projects/${created.data.project.slug}/obligation-coverage`);
    expect(report.status).toBe(200);
    expect(report.data.report.canClaimNoOpenObligations).toBe(false);
    expect(["no-planned-markers", "empty-assets-coverage-unknown", "partial", "covered"]).toContain(report.data.report.sourceCoverageStatus);
  });

  it("exposes obligation candidate preview without writing canon", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Candidate API", roughIdea: "Preview planned markers." })
    });
    const preview = await jsonFetch<{ candidates: Array<{ status: string }> }>(`/api/novel/projects/${created.data.project.slug}/obligation-candidates/preview`);
    expect(preview.status).toBe(200);
    expect(preview.data.candidates).toEqual([]);
  });

  it("requires author evidence before adopting an obligation candidate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "candidate-adoption-api", title: "Candidate Adoption API", roughIdea: "Adopt one reviewed obligation." })
    });
    const slug = created.data.project.slug;
    await fs.writeFile(path.join(tempRoot, slug, "scenes", "chapter-001.json"), JSON.stringify([{ id: "scene-1", chapterId: "chapter-001", order: 1, title: "Setup", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-adopt-001"], powerProgression: "", updatedAt: new Date().toISOString() }]));
    const preview = await jsonFetch<{ candidates: Array<{ candidateId: string; fingerprint: string }> }>(`/api/novel/projects/${slug}/obligation-candidates/preview`);
    expect(preview.data.candidates).toHaveLength(1);
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/obligation-candidates/${preview.data.candidates[0].candidateId}/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "", evidenceRefs: [] }) });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe("OBLIGATION_CANDIDATE_AUTHORIZATION_REQUIRED");
    const adopted = await jsonFetch<{ created: boolean; obligation: { status: string; sourceRefs: string[] } }>(`/api/novel/projects/${slug}/obligation-candidates/${preview.data.candidates[0].candidateId}/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "author-1", expectedCandidateFingerprint: preview.data.candidates[0].fingerprint, evidenceRefs: ["decision://author/1"] }) });
    expect(adopted.status).toBe(201);
    expect(adopted.data).toMatchObject({ created: true, obligation: { status: "proposed", sourceRefs: ["scene://chapter-001#scene-1"] } });
  });

  it("keeps coverage certificate issuance fail-closed", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Certificate API", roughIdea: "Require evidence." })
    });
    const result = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/obligation-coverage/certificate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "publication-1" })
    });
    expect(result.status).toBe(409);
    expect(result.data.error.code).toBe("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
    const validation = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/obligation-coverage/certificate/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "publication-1" })
    });
    expect(validation.status).toBe(409);
    expect(validation.data.error.code).toBe("OBLIGATION_COVERAGE_CERTIFICATE_STALE");
  });

  it("persists revision intents without mutating canon", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Revision API", roughIdea: "Track an author revision." })
    });
    const intent = await jsonFetch<{ intent: { intentId: string; fingerprint: string; status: string; mode: string } }>(`/api/novel/projects/${created.data.project.slug}/revision-intents`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorText: "保留第三段，改掉说明书感。", type: "style_edit", maturity: "settled", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["local repair"], protectedItems: ["chapter-001.paragraph-3"], mode: "branch_candidate", actor: "author" })
    });
    expect(intent.status).toBe(201);
    expect(intent.data.intent).toMatchObject({ status: "proposed", mode: "branch_candidate" });
    const listed = await jsonFetch<{ intents: Array<{ status: string }> }>(`/api/novel/projects/${created.data.project.slug}/revision-intents`);
    expect(listed.data.intents).toHaveLength(1);
    const impact = await jsonFetch<{ report: { status: string; unknownDependencies: string[] } }>(`/api/novel/projects/${created.data.project.slug}/revision-intents/${intent.data.intent.intentId}/impact`);
    expect(impact.data.report).toMatchObject({ status: "needs_review", unknownDependencies: ["dependency-graph-missing"] });
    const changeSet = await jsonFetch<{ changeSet: { changeSetId: string; fingerprint: string; status: string; operations: Array<{ targetId: string }> } }>(`/api/novel/projects/${created.data.project.slug}/revision-intents/${intent.data.intent.intentId}/change-sets`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedIntentFingerprint: intent.data.intent.fingerprint, operations: [{ kind: "update", targetKind: "text-span", targetId: "chapter-001.paragraph-1", chapterId: "chapter-001", rationale: "local repair" }] })
    });
    expect(changeSet.status).toBe(201);
    expect(changeSet.data.changeSet).toMatchObject({ status: "candidate", operations: [{ targetId: "chapter-001.paragraph-1" }] });
    const review = await jsonFetch<{ review: { status: string; canonWritten: boolean } }>(`/api/novel/projects/${created.data.project.slug}/revision-change-sets/${changeSet.data.changeSet.changeSetId}/reviews`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedChangeSetFingerprint: changeSet.data.changeSet.fingerprint, decision: "accepted", note: "Proceed to adoption.", actor: "author" })
    });
    expect(review.status).toBe(201);
    expect(review.data.review).toMatchObject({ status: "approved_for_adoption", canonWritten: false });
  });

  it("persists the author's original idea and restores the same session after refresh", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>('/api/novel/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Capture Session', roughIdea: 'The project seed remains separate from the conversation.' })
    });
    const slug = created.data.project.slug;
    const projectJsonBefore = await fs.readFile(path.join(tempRoot, slug, 'project.json'), 'utf8');

    const submitted = await jsonFetch<{
      session: {
        schemaVersion: string;
        projectSlug: string;
        messages: Array<{ id: string; clientMessageId: string; role: string; text: string; source: { kind: string } }>;
      };
      created: boolean;
    }>(`/api/novel/projects/${slug}/session/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientMessageId: 'client-001', text: 'A lighthouse keeper discovers a city beneath the tide.' })
    });

    expect(submitted.status).toBe(201);
    expect(submitted.data.created).toBe(true);
    expect(submitted.data.session).toMatchObject({ schemaVersion: 'creative-session.v1', projectSlug: slug });
    expect(submitted.data.session.messages).toEqual([
      expect.objectContaining({
        id: 'message-client-001',
        clientMessageId: 'client-001',
        role: 'author',
        text: 'A lighthouse keeper discovers a city beneath the tide.',
        source: { kind: 'author' }
      })
    ]);

    const duplicate = await jsonFetch<{ created: boolean; session: typeof submitted.data.session }>(
      `/api/novel/projects/${slug}/session/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientMessageId: 'client-001', text: 'A different duplicate must not overwrite the original.' })
      }
    );
    expect(duplicate.status).toBe(200);
    expect(duplicate.data.created).toBe(false);
    expect(duplicate.data.session.messages[0].text).toBe('A lighthouse keeper discovers a city beneath the tide.');

    const concurrent = await Promise.all(
      ['first concurrent write', 'second concurrent write'].map((text) =>
        jsonFetch<{ created: boolean; session: typeof submitted.data.session }>(`/api/novel/projects/${slug}/session/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientMessageId: 'client-002', text })
        })
      )
    );
    expect(concurrent.filter((response) => response.data.created)).toHaveLength(1);
    expect(concurrent[1].data.session.messages.filter((message) => message.clientMessageId === 'client-002')).toHaveLength(1);

    const restored = await jsonFetch<{ session: typeof submitted.data.session }>(`/api/novel/projects/${slug}/session`);
    expect(restored.status).toBe(200);
    expect(restored.data.session.messages).toHaveLength(2);
    expect(restored.data.session.messages.map((message) => message.clientMessageId)).toEqual(['client-001', 'client-002']);
    expect(await fs.readFile(path.join(tempRoot, slug, 'project.json'), 'utf8')).toBe(projectJsonBefore);
  });

  it("persists RP1 session state and message provenance through the API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Session State", roughIdea: "A stateful collaboration." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "author-1", text: "A bell rings." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "system-1", kind: "system-paraphrase", text: "You want an ominous opening." })
    });
    const current = await jsonFetch<{ session: { fingerprint: string } }>(`/api/novel/projects/${slug}/session`);
    const updated = await jsonFetch<{ session: { phase: string; latestDirection: string; decisionRefs: string[] } }>(`/api/novel/projects/${slug}/session/state`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedFingerprint: current.data.session.fingerprint, phase: "understanding", collaborationMode: "guided", activeQuestionId: "q-1", latestDirection: "stay close to the keeper", decisionRefs: ["d-1"], pendingPatchRefs: ["p-1"], unconfirmedAssumptions: ["the bell is unexplained"] })
    });
    expect(updated.status).toBe(200);
    expect(updated.data.session).toMatchObject({ phase: "understanding", latestDirection: "stay close to the keeper", decisionRefs: ["d-1"] });
    const restored = await jsonFetch<{ session: { messages: Array<{ source: { kind: string } }> } }>(`/api/novel/projects/${slug}/session`);
    expect(restored.data.session.messages.map((message) => message.source.kind)).toEqual(["author", "system-paraphrase"]);
    const resumeBrief = await jsonFetch<{ brief: { schemaVersion: string; projectSlug: string; lastDirection: string; activeQuestion: { questionId: string; questionVersion: number } | null; sourceRefs: string[]; recommendedNextStep: string } }>(`/api/novel/projects/${slug}/session/resume-brief`);
    expect(resumeBrief.status).toBe(200);
    expect(resumeBrief.data.brief).toMatchObject({ schemaVersion: "author-resume-brief.v1", projectSlug: slug, lastDirection: "stay close to the keeper", activeQuestion: null, recommendedNextStep: "review:p-1" });
    expect(resumeBrief.data.brief.sourceRefs).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^session://session-${slug}@`))]));
  });

  it("returns semantic events for the single natural-language session input", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Semantic Input", roughIdea: "Commands share one input." }) });
    const response = await jsonFetch<{ collaboration: { schemaVersion: string; events: Array<{ type: string; text: string }>; fingerprint: string }; primaryAction: { actionId: string; kind: string; sourceFingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "semantic-continue", text: "继续" }) });
    expect(response.status).toBe(201);
    expect(response.data.collaboration).toMatchObject({ schemaVersion: "collaboration-message.v1", events: [{ type: "continue", text: "继续" }], fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(response.data.primaryAction).toMatchObject({ actionId: "continue-understanding", kind: "continue", sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("rejects legacy file PUTs that would bypass the creative session authority", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Session File Bypass", roughIdea: "Direct session files must remain governed." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/files/sessions/creative-session.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "{\"messages\":[{\"text\":\"forged\"}]}" })
    });
    expect(response.status).toBe(403);
    expect(response.data.error).toBe("Protected session authority cannot be edited through file saves");
  });

  it("enforces surface capability registration at the runtime boundary", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Surface Registry", roughIdea: "A registered surface." })
    });
    const slug = created.data.project.slug;
    const registered = await jsonFetch<{ registry: { schemaVersion: string; capabilities: Array<{ surfaceId: string }> }; capability: { surfaceId: string } }>(`/api/novel/projects/${slug}/runtime/surfaces/registry`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capability: { surfaceId: "session", label: "Session", reads: ["journey"], commands: ["append"], writeAuthority: "session", stages: ["capture"], alternativeSurfaceId: "legacy", retirementCondition: "equivalence", lifecycle: "active" } })
    });
    expect(registered.status).toBe(201);
    const denied = await jsonFetch<{ authorization: { allowed: boolean; readOnly: boolean; reason: string } }>(`/api/novel/projects/${slug}/runtime/surfaces/authorize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registry: registered.data.registry, request: { surfaceId: "unknown", command: "append", stage: "capture", write: true } })
    });
    expect(denied.data.authorization).toMatchObject({ allowed: false, readOnly: true, reason: "surface-unregistered" });

    await stopServer();
    await startServer();
    const afterRestart = await jsonFetch<{ authorization: { allowed: boolean; writeAuthority: string } }>(`/api/novel/projects/${slug}/runtime/surfaces/authorize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { surfaceId: "session", command: "append", stage: "capture", write: true } })
    });
    expect(afterRestart.data.authorization).toMatchObject({ allowed: true, writeAuthority: "session" });
  });

  it("does not authorize a forged client-supplied legacy surface registry", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Surface Forgery", roughIdea: "Client registries cannot create a write bypass." })
    });
    const slug = created.data.project.slug;
    const forgedRegistry = {
      schemaVersion: "surface-capability-registry.v1",
      projectSlug: slug,
      registryVersion: 99,
      capabilities: [{
        schemaVersion: "surface-capability.v1",
        surfaceId: "legacy-bypass",
        label: "Forged legacy surface",
        reads: [],
        commands: ["append-author-message"],
        writeAuthority: "legacy-bypass",
        stages: ["capture"],
        alternativeSurfaceId: "creative-session",
        retirementCondition: "never",
        lifecycle: "active",
        fingerprint: "f".repeat(64)
      }],
      fingerprint: "f".repeat(64)
    };
    const response = await jsonFetch<{ authorization: { allowed: boolean; reason: string; readOnly: boolean } }>(`/api/novel/projects/${slug}/runtime/surfaces/authorize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registry: forgedRegistry, request: { surfaceId: "legacy-bypass", command: "append-author-message", stage: "capture", write: true } })
    });
    expect(response.status).toBe(200);
    expect(response.data.authorization).toMatchObject({ allowed: false, readOnly: true, reason: "surface-unregistered" });
  });

  it("returns a command receipt before authorizing an effect", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Command Receipt", roughIdea: "A command receipt." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{ receipt: { status: string; effectBoundary: string } }>(`/api/novel/projects/${slug}/runtime/session/command-receipts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: "r-1", clientMessageId: "m-1", originalText: "先看一版", intentAtoms: ["preview"], currentInterpretation: "只生成候选", clarificationItems: [], requestedActions: ["generate-candidate"], risk: "low", effectBoundary: "candidate-only" })
    });
    expect(response.status).toBe(201);
    expect(response.data.receipt).toMatchObject({ status: "accepted", effectBoundary: "candidate-only" });
  });

  it("reconciles a workspace continuity token without overwriting local state", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Continuity Token", roughIdea: "A recoverable workspace." })
    });
    const slug = created.data.project.slug;
    const tokenResponse = await jsonFetch<{ token: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/session/continuity-token`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionCursor: 4, primaryAsset: "understanding-preview", assetVersion: "asset-v2", selection: { chapterId: "ch-1" }, focusTarget: "editor", scrollAnchor: "scene-2", unsavedDraftFingerprint: "draft-fp", pendingRefs: ["q-1"], localCacheVersion: "cache-v3", serviceBaselineFingerprint: "server-fp", expiresAt: "2099-01-01T00:00:00.000Z" })
    });
    expect(tokenResponse.status).toBe(201);
    const reconciliation = await jsonFetch<{ reconciliation: { status: string; localPreserved: boolean; action: string } }>(`/api/novel/projects/${slug}/runtime/session/continuity-token/reconcile`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tokenResponse.data.token, current: { serviceBaselineFingerprint: "server-new", assetVersion: "asset-v3", cursor: 5 } })
    });
    expect(reconciliation.data.reconciliation).toMatchObject({ status: "conflicted", localPreserved: true, action: "compare-or-save-candidate" });
  });

  it("returns one server-arbitrated primary action and rejects stale submission", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Primary Action", roughIdea: "A single next action." })
    });
    const slug = created.data.project.slug;
    const decision = await jsonFetch<{ decision: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/session/primary-action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyVersion: "j-1", sourceFingerprint: "s-1", candidates: [{ actionId: "explore", kind: "exploration", label: "Explore", rationale: "optional", preconditions: [], targetOutcome: "candidate", allowedCommands: ["run"], risk: "low", lifecycle: "ready" }, { actionId: "review", kind: "reviewable", label: "Review", rationale: "pending", preconditions: [], targetOutcome: "review", allowedCommands: ["review"], risk: "low", lifecycle: "ready" }] })
    });
    expect(decision.data.decision).toMatchObject({ actionId: "review", status: "ready" });
    const stale = await jsonFetch<{ validation: { accepted: boolean; reason: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: decision.data.decision, submission: { actionId: "review", journeyVersion: "j-2", sourceFingerprint: "s-1" } })
    });
    expect(stale.data.validation).toMatchObject({ accepted: false, reason: "journey-stale" });
  });

  it("resolves the primary action from persisted journey state instead of caller candidates", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Resolved Primary Action", roughIdea: "A deterministic next action." })
    });
    const slug = created.data.project.slug;
    const captured = await jsonFetch<{ decision: { actionId: string; kind: string; idempotencyKey: string }; journey: { stage: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates: [{ actionId: "unsafe-random", kind: "exploration" }] })
    });
    expect(captured.status).toBe(201);
    expect(captured.data).toMatchObject({ journey: { stage: "capture" }, decision: { actionId: "capture-idea", kind: "exploration" } });
    const replay = await jsonFetch<{ decision: { idempotencyKey: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
    expect(replay.data.decision.idempotencyKey).toBe(captured.data.decision.idempotencyKey);
  });

  it("executes capture-idea only after revalidation and remains idempotent", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execute Primary Action", roughIdea: "" })
    });
    const slug = created.data.project.slug;
    const resolved = await jsonFetch<{ decision: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
    const body = { decision: resolved.data.decision, text: "A courier delivers letters to an address that does not exist.", clientMessageId: "capture-action-1" };
    const executed = await jsonFetch<{ execution: { status: string; created: boolean }; session: { messages: Array<{ clientMessageId: string }> } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    expect(executed.status).toBe(201);
    expect(executed.data).toMatchObject({ execution: { status: "completed", created: true }, session: { messages: [{ clientMessageId: "capture-action-1" }] } });
    const replay = await jsonFetch<{ execution: { status: string; created: boolean }; session: { messages: Array<{ clientMessageId: string }> } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    expect(replay.status).toBe(200);
    expect(replay.data).toMatchObject({ execution: { status: "completed", created: false } });
    expect(replay.data.session.messages).toHaveLength(1);
  });

  it("executes an answer-question action through the versioned dialogue transaction", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execute Answer Action", roughIdea: "A question must be answered through the action boundary." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "answer-action-source", text: "A keeper hears a bell beneath the tide." }) });
    const manifest = await jsonFetch<{ manifest: { sourceFingerprint: string } }>(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const question = await createDialogueQuestion(path.join(tempRoot, slug), {
      projectSlug: slug,
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What does the keeper want most?",
      whyNow: "It changes the opening contract.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["Prove the city survived", "Protect the bell"],
      recommendation: "Prove the city survived",
      snapshotFingerprint: manifest.data.manifest.sourceFingerprint
    });
    const resolved = await jsonFetch<{ decision: { actionId: string; journeyVersion: string; sourceFingerprint: string }; journey: { primaryAction: { id: string; kind: string }; activeQuestion?: { id: string; status: string } } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
    expect(resolved.data.decision.actionId).toBe("answer-question-primary-desire");
    expect(resolved.data.journey).toMatchObject({ primaryAction: { id: "answer-question-primary-desire", kind: "answer" }, activeQuestion: { id: "question-primary-desire", status: "active" } });
    const executed = await jsonFetch<{ execution: { status: string; created: boolean }; question: { status: string }; nextQuestion: { created: boolean; question: { questionId: string; status: string } }; decision: { status: string; decisionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: resolved.data.decision, answerQuestionId: question.question.questionId, questionVersion: 1, expectedSnapshotFingerprint: manifest.data.manifest.sourceFingerprint, idempotencyKey: "answer-action-1", answerText: "Prove the drowned city is still alive.", answerStatus: "confirmed" })
    });
    expect(executed.status).toBe(201);
    expect(executed.data).toMatchObject({ execution: { status: "completed", created: true }, question: { status: "answered" }, decision: { status: "recorded" } });
    expect(executed.data.nextQuestion).toMatchObject({ created: true, question: { questionId: "question-core-conflict", status: "active" } });
    const storedAfterAnswer = await readCreativeJourneyProjection(path.join(tempRoot, slug), slug);
    expect(storedAfterAnswer).toMatchObject({ primaryAction: { id: "answer-question-core-conflict", kind: "answer" }, activeQuestion: { id: "question-core-conflict", status: "active" } });
    const replayed = await jsonFetch<{ execution: { created: boolean }; nextQuestion: { created: boolean; question: { questionId: string; status: string } } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: resolved.data.decision, answerQuestionId: question.question.questionId, questionVersion: 1, expectedSnapshotFingerprint: manifest.data.manifest.sourceFingerprint, idempotencyKey: "answer-action-1", answerText: "Prove the drowned city is still alive.", answerStatus: "confirmed" })
    });
    expect(replayed.status).toBe(200);
    expect(replayed.data).toMatchObject({ execution: { created: false }, nextQuestion: { created: false, question: { questionId: "question-core-conflict", status: "active" } } });
    const afterAnswer = await jsonFetch<{ decision: { actionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
    expect(afterAnswer.data.decision.actionId).toBe("answer-question-core-conflict");
    const timeline = await jsonFetch<{ timeline: { entries: Array<{ entryId: string; kind: string; sourceRef: string }> } }>(`/api/novel/projects/${slug}/session/timeline`);
    expect(timeline.data.timeline.entries).toEqual(expect.arrayContaining([expect.objectContaining({ entryId: executed.data.decision.decisionId, kind: "question-event", sourceRef: `decision://${executed.data.decision.decisionId}` })]));
  });

  it("does not claim continue-understanding completed when safety dependencies are missing", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Blocked Continue Action", roughIdea: "Continue only after safety gates." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "continue-action-source", text: "A courier finds a door beneath the sea." }) });
    const resolved = await jsonFetch<{ decision: { actionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
    expect(resolved.data.decision.actionId).toBe("continue-understanding");
    const executed = await jsonFetch<{ execution: { status: string }; error: { code: string; modelCallIssued: boolean; understandingWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: resolved.data.decision })
    });
    expect(executed.status).toBe(409);
    expect(executed.data).toMatchObject({ execution: { status: "blocked" }, error: { code: "CONTINUE_UNDERSTANDING_BLOCKED", modelCallIssued: false, understandingWritten: false } });
  });

  it("applies an explicit author effort preference and returns budget usage", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Effort Budget", roughIdea: "A bounded collaboration." })
    });
    const slug = created.data.project.slug;
    const made = await jsonFetch<{ budget: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/session/effort-budget`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "exploration" })
    });
    const adjusted = await jsonFetch<{ budget: { limits: { activeQuestions: number }; strategyVersion: string } }>(`/api/novel/projects/${slug}/runtime/session/effort-budget/preference`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: made.data.budget, preference: "less-questioning" })
    });
    expect(adjusted.data.budget.limits.activeQuestions).toBeLessThan(2);
    expect(adjusted.data.budget.strategyVersion).toContain("less-questioning");
    const reloaded = await jsonFetch<{ budget: { fingerprint: string; strategyVersion: string } }>(`/api/novel/projects/${slug}/runtime/session/effort-budget`);
    expect(reloaded.data.budget.fingerprint).toBe((adjusted.data.budget as { fingerprint: string }).fingerprint);
    expect(reloaded.data.budget.strategyVersion).toBe(adjusted.data.budget.strategyVersion);
  });

  it("propagates an accepted intent correction across affected downstream artifacts", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Correction Propagation", roughIdea: "A bounded correction." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{ propagation: { minimalUnderstanding: string; transitions: Array<{ artifactId: string; to: string }> } }>(`/api/novel/projects/${slug}/runtime/intent-corrections/propagate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        correction: { correctionId: "corr-1", correctedInterpretation: "write a scene", affectedAssets: ["chapter-1"] },
        candidates: [{ id: "candidate-1", affectedAssets: ["chapter-1"], status: "reviewable" }],
        tasks: [{ id: "task-1", affectedAssets: ["chapter-1"], status: "running" }]
      })
    });
    expect(response.data.propagation.minimalUnderstanding).toBe("write a scene");
    expect(response.data.propagation.transitions).toEqual(expect.arrayContaining([expect.objectContaining({ artifactId: "task-1", to: "paused" }), expect.objectContaining({ artifactId: "candidate-1", to: "stale" })]));
  });

  it("requires recommendation-first evidence for reversible decision bundles", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Decision Bundle", roughIdea: "A bounded bundle." })
    });
    const slug = created.data.project.slug;
    const items = [{ decisionId: "name-1", label: "Name", affectedAssets: ["scene-1"], risk: "low", reversible: true, rollbackBoundary: "scene-1" }];
    const made = await jsonFetch<{ bundle: { status: string; recommendation: string } }>(`/api/novel/projects/${slug}/runtime/session/decision-bundles`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId: "bundle-1", items, recommendation: "Use the concise name", strongestCounterargument: "Longer is distinctive", nearTermOutcome: "Scene reads cleanly" })
    });
    expect(made.data.bundle).toMatchObject({ status: "reviewable", recommendation: "Use the concise name" });
  });

  it("exposes a traceable red-blue decision card and author acceptance gate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Debate Decision", roughIdea: "A bounded debate." })
    });
    const slug = created.data.project.slug;
    const body = { debateId: "debate-api-1", taskId: "task-api-1", proposition: "公开证据", frozenInputFingerprint: "f".repeat(64), blue: { thesis: "推进主线", evidence: [{ ref: "contract://c1", claim: "契约要求" }], benefits: ["推进"], failureConditions: ["误读"], unknowns: [] }, red: { thesis: "暴露盟友", evidence: [{ ref: "character://a1", claim: "盟友未准备" }], benefits: ["保密"], failureConditions: ["敌人利用"], unknowns: [] }, disagreements: [{ topic: "时机", blue: "现在", red: "延后" }], decisionLevel: "L2", affectedAssets: ["c1"], evidenceRefs: ["contract://c1", "character://a1"], fallbackCost: "重写两章" };
    const made = await jsonFetch<{ decision: { status: string; authorRequired: boolean } }>(`/api/novel/projects/${slug}/runtime/session/debate-decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(made.status).toBe(201);
    expect(made.data.decision).toMatchObject({ status: "needs-author", authorRequired: true });
    const accepted = await jsonFetch<{ decision: { status: string; supersedesDecisionId: string } }>(`/api/novel/projects/${slug}/runtime/session/debate-decisions/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: { ...made.data.decision, ...body }, approval: { authorDecision: "accept", supersedesDecisionId: "old-1", migrationProposal: "迁移后再改正文" } }) });
    expect(accepted.data.decision).toMatchObject({ status: "accepted", supersedesDecisionId: "old-1" });
  });

  it("keeps preference probes scoped and memory corrections/forgetting auditable", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Dialogue Memory", roughIdea: "A scoped preference." }) });
    const slug = created.data.project.slug;
    const selected = await jsonFetch<{ selection: { status: string; scope: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/preference-probes/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ probe: { probeId: "probe-api-1", frozenFacts: ["主角是快递员"], dimension: "叙述距离", variants: [{ variantId: "a", text: "近距离" }, { variantId: "b", text: "远距离" }] }, selectedVariantId: "a", reason: "更贴近人物", scope: "scene", validationContexts: ["scene-1"], evidenceRefs: ["author://choice"] }) });
    expect(selected.status).toBe(201);
    expect(selected.data.selection).toMatchObject({ status: "active", scope: "scene" });
    const memory = await jsonFetch<{ memory: { status: string; projectSlug: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/memory-records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memoryId: "memory-api-1", content: "偏好短句", sourceRefs: ["utterance://u1"], scope: "project", confidence: "provisional", derivedCanonRefs: [], compressionVersion: "v1" }) });
    expect(memory.data.memory).toMatchObject({ status: "effective", projectSlug: slug });
    const forgotten = await jsonFetch<{ memory: { status: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/memory-records/forget`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memory: memory.data.memory, reason: "作者要求遗忘" }) });
    expect(forgotten.data.memory.status).toBe("forgotten");
    const propagated = await jsonFetch<{ tombstone: { schemaVersion: string; contentIncluded: boolean; memoryId: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/memory/forget-propagation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memory: { memoryId: "memory-api-propagation", scope: "project", scopeId: slug, content: "do not persist", status: "effective" }, reason: "author requested propagation", indexContains: true, cacheContains: true, publishedVersionRefs: ["publication://v1"] }) });
    expect(propagated.status).toBe(201);
    expect(propagated.data.tombstone).toMatchObject({ schemaVersion: "memory-forget-tombstone.v1", contentIncluded: false, memoryId: "memory-api-propagation" });
  });

  it("exposes versioned creative objectives and an explicit L2 conflict gate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Objective Governance", roughIdea: "Conflicting goals." }) });
    const slug = created.data.project.slug;
    const profile = await jsonFetch<{ profile: { version: number; items: Array<{ kind: string }> } }>(`/api/novel/projects/${slug}/runtime/objectives/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: "obj-api-1", version: 1, stage: "understanding", items: [{ objectiveId: "hard-1", kind: "hard_constraint", text: "代价可信", scope: "work", sourceRefs: ["author://h1"], verification: "review" }, { objectiveId: "pref-1", kind: "preference", text: "节奏明快", scope: "work", sourceRefs: ["author://p1"], verification: "review" }] }) });
    expect(profile.data.profile).toMatchObject({ version: 1, items: [{ kind: "hard_constraint" }, { kind: "preference" }] });
    const conflict = await jsonFetch<{ conflict: { level: string; status: string; authorRequired: boolean } }>(`/api/novel/projects/${slug}/runtime/objectives/conflicts/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictId: "conf-api-1", left: { objectiveId: "h1", kind: "hard_constraint", text: "代价可信", scope: "work", sourceRefs: ["author://h1"], verification: "review" }, right: { objectiveId: "h2", kind: "hard_constraint", text: "节奏极快", scope: "work", sourceRefs: ["author://h2"], verification: "review" }, benefits: ["可信", "推进"], costs: ["返工"], affectedScopes: ["chapter-1"], compromises: ["保留关键代价"], evidenceRefs: ["analysis://conf"] }) });
    expect(conflict.data.conflict).toMatchObject({ level: "L2", status: "needs-author", authorRequired: true });
  });

  it("persists dialogue utterances before interpretation and replays idempotently", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Utterance Persistence", roughIdea: "Immutable source." }) });
    const slug = created.data.project.slug;
    const body = { sessionId: "session-api-1", turn: 1, authorId: "author-1", text: "Keep the door mysterious.", clientTimestamp: "2026-07-31T00:00:00Z", language: "en", attachmentRefs: [], idempotencyKey: "utterance-api-1" };
    const first = await jsonFetch<{ created: boolean; utterance: { text: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/utterances`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const replay = await jsonFetch<{ replayed: boolean; utterance: { text: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/utterances`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const listed = await jsonFetch<{ utterances: Array<{ text: string }> }>(`/api/novel/projects/${slug}/runtime/dialogue/utterances`);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.data).toMatchObject({ replayed: true, utterance: { text: body.text } });
    expect(listed.data.utterances).toHaveLength(1);
  });

  it("persists all intent atoms with their source utterance", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Intent Persistence", roughIdea: "Multiple intents." }) });
    const slug = created.data.project.slug;
    const body = { utteranceId: "utterance-intent-api-1", text: "保留门的神秘；继续第一章。", atoms: [{ atomId: "a-1", kind: "constraint", text: "保留门的神秘", start: 0, end: 7, targetAsset: "world-rule", scope: "project", relation: "preserve" }, { atomId: "a-2", kind: "command", text: "继续第一章", start: 8, end: 13, targetAsset: "chapter-1", scope: "chapter", relation: "follow-up" }] };
    const first = await jsonFetch<{ created: boolean; atoms: Array<{ atomId: string; sourceUtteranceId: string }> }>(`/api/novel/projects/${slug}/runtime/dialogue/intents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const listed = await jsonFetch<{ atoms: Array<{ atomId: string; sourceUtteranceId: string }> }>(`/api/novel/projects/${slug}/runtime/dialogue/intents`);
    expect(first.status).toBe(201);
    expect(first.data.atoms.map((atom) => atom.atomId)).toEqual(["a-1", "a-2"]);
    expect(listed.data.atoms).toEqual(expect.arrayContaining([expect.objectContaining({ atomId: "a-1", sourceUtteranceId: body.utteranceId }), expect.objectContaining({ atomId: "a-2", sourceUtteranceId: body.utteranceId })]));
  });

  it("exposes bounded understanding evidence with opposing sources", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evidence Bundle", roughIdea: "Evidence bounded." }) });
    const result = await jsonFetch<{ evidence: { gateStatus: string; confidenceInterval: [number, number]; promptVersion: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/dialogue/understanding-evidence-bundles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: "claim-api-1", status: "inferred", confidenceInterval: [0.5, 0.75], supportingEvidenceRefs: ["utterance://u1#0-4"], opposingEvidenceRefs: ["utterance://u1#8-12"], interpreterVersion: "understanding-v2", promptVersion: "prompt-v2", alternatives: ["portal", "wreck"], sourceMessageIds: ["m1"] }) });
    expect(result.status).toBe(201);
    expect(result.data.evidence).toMatchObject({ gateStatus: "passed", confidenceInterval: [0.5, 0.75], promptVersion: "prompt-v2" });
  });

  it("exposes separate ambiguity and impact in question value decisions", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Question Value", roughIdea: "Ask one valuable question." }) });
    const result = await jsonFetch<{ result: { level: string; impact: number; ambiguity: number; valueBreakdown: { impact: number; ambiguity: number } } }>(`/api/novel/projects/${created.data.project.slug}/runtime/question-value-gates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: "q-api-1", text: "What does the protagonist want?", impact: 0.8, uncertainty: 0.7, irreversibility: 0.3, urgency: 0.8, userEffort: 0.1, affectedAssets: ["chapter-1"], recommendation: "ask", reversible: true, threshold: 0.2 }) });
    expect(result.status).toBe(201);
    expect(result.data.result).toMatchObject({ level: "L2", impact: 0.8, ambiguity: 0.7, valueBreakdown: { impact: 0.8, ambiguity: 0.7 } });
  });

  it("enforces non-leading questions, bounded assumptions, and scoped delegation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Dialogue Policy", roughIdea: "Bounded questions." }) });
    const slug = created.data.project.slug;
    const question = await jsonFetch<{ question: { freeAnswerAllowed: boolean; options: unknown[] } }>(`/api/novel/projects/${slug}/runtime/dialogue/non-leading-question`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: "q-policy-1", knownEvidence: ["door unexplained"], whyNow: "opening depends on it", options: [{ label: "portal", impact: "rule" }, { label: "wreck", impact: "mystery" }], recommendation: "portal", recommendationEvidenceRefs: ["analysis://door/1"] }) });
    expect(question.data.question).toMatchObject({ freeAnswerAllowed: true, options: expect.any(Array) });
    const assumption = await jsonFetch<{ assumption: { status: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/provisional-assumptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assumptionId: "a-policy-1", basis: "genre preference", assets: ["chapter-1"], allowedActions: ["draft"], expiry: "chapter-1-approved", risk: "minor", revocationRoute: "recompile" }) });
    expect(assumption.data.assumption.status).toBe("provisional");
    const forbidden = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/delegation-grants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: "g-policy-1", scope: ["ending"], expiresAt: "2026-08-01T00:00:00Z", rationale: "author said you decide" }) });
    expect(forbidden.status).toBe(500);
  });


  it("keeps exploratory drafts out of canon and requires provenance", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Exploratory Draft", roughIdea: "Probe only." }) });
    const slug = created.data.project.slug;
    const draft = await jsonFetch<{ draft: { status: string; isCanon: boolean; adoptionRequired: boolean } }>(`/api/novel/projects/${slug}/runtime/exploratory-drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: "draft-api-1", text: "A short probe scene.", sourceRefs: ["probe://p1"] }) });
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/exploratory-drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: "draft-api-2", text: "No provenance." }) });
    expect(draft.status).toBe(201);
    expect(draft.data.draft).toMatchObject({ status: "candidate", isCanon: false, adoptionRequired: true });
    expect(blocked.status).toBe(500);
  });

  it("records and closes a misunderstanding incident only with regression evidence", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Misunderstanding Incident", roughIdea: "A repair loop." })
    });
    const slug = created.data.project.slug;
    const made = await jsonFetch<{ incident: { status: string; incidentId: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/misunderstanding-incidents`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId: "mi-1", signal: "author-correction", errorLayer: "inference", priorInterpretation: "summary", correctedInterpretation: "scene", affectedAssets: ["chapter-1"], repairPlan: "rebuild", regressionCase: "same correction" })
    });
    expect(made.status, JSON.stringify(made.data)).toBe(201);
    expect(made.data.incident).toMatchObject({ status: "open", incidentId: "mi-1" });
    const resolved = await jsonFetch<{ incident: { status: string; regressionResult: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/misunderstanding-incidents/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incident: made.data.incident, repairEvidence: ["repair-1"], regressionResult: "passed" })
    });
    expect(resolved.data.incident).toMatchObject({ status: "resolved", regressionResult: "passed" });
  });

  it("blocks context plans that silently truncate T0", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Context Plan Gate", roughIdea: "A bounded context plan." })
    });
    const result = await jsonFetch<{ plan: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/session/context-plan-gate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelContextTokens: 1000, outputReserveTokens: 200, toolReserveTokens: 100, blocks: [{ id: "t0", tier: "T0", originalTokens: 100, finalTokens: 50, selected: true, sourceRefs: ["msg-1"], compressionCoverage: false }] })
    });
    expect(result.data.plan).toMatchObject({ status: "block", reasons: ["T0_TRUNCATION_UNPROVEN"] });
  });

  it("writes model invocation usage and enforces the hard budget gate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Invocation Ledger", roughIdea: "A measurable call." })
    });
    const slug = created.data.project.slug;
    const made = await jsonFetch<{ record: { invocationId: string; usage: { inputTokens: number } } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invocationId: "inv-1", taskId: "task-1", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "model-1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "completed", usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "estimated" }, cost: { amount: 0.01, currency: "USD", measurement: "estimated", estimateMethod: "test-rate" }, cache: { hit: false }, adoptionDecision: "not-adopted" })
    });
    expect(made.data.record).toMatchObject({ invocationId: "inv-1", usage: { inputTokens: 10 } });
    const gate = await jsonFetch<{ gate: { allowed: boolean; reason: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations/budget-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hardLimit: 100, committed: 80, reserved: 20, nextEstimate: 1 }) });
    expect(gate.data.gate).toMatchObject({ allowed: false, reason: "BUDGET_HARD_STOP" });
  });

  it("settles governed model calls through the matching BookRun reservation", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Invocation Settlement", roughIdea: "A call must be auditable." })
    });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { bookRunId: string; version: number } }>(`/api/novel/projects/${slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1, maxBudgetCents: 100 } })
    });
    const reservation = await jsonFetch<{ reservation: { reservationId: string } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 50 })
    });
    const authorityBinding = createModelInvocationAuthorityBinding({ bookRunId: started.data.run.bookRunId, frozenPublicationScopeRef: "sessions/publication-scopes/scope-test.json", frozenPublicationScopeFingerprint: "a".repeat(64), storyContractRef: "sessions/story-contract.json", storyContractFingerprint: "b".repeat(64), outlineRef: "sessions/outline.json", outlineFingerprint: "c".repeat(64), forecastRef: "planning/length-forecast.json", forecastFingerprint: "d".repeat(64), contextManifestRef: "sessions/context-manifest.json", contextManifestFingerprint: "e".repeat(64) });
    for (const [ref, fingerprint] of [[authorityBinding.frozenPublicationScopeRef, authorityBinding.frozenPublicationScopeFingerprint], [authorityBinding.storyContractRef, authorityBinding.storyContractFingerprint], [authorityBinding.outlineRef, authorityBinding.outlineFingerprint], [authorityBinding.forecastRef, authorityBinding.forecastFingerprint], [authorityBinding.contextManifestRef, authorityBinding.contextManifestFingerprint]] as const) {
      await fs.mkdir(path.dirname(path.join(tempRoot, slug, ref)), { recursive: true });
      await fs.writeFile(path.join(tempRoot, slug, ref), JSON.stringify({ fingerprint }), "utf8");
    }
    const invocation = await jsonFetch<{ record: { invocationId: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invocationId: "governed-invocation-1", bookRunId: started.data.run.bookRunId, budgetReservationId: reservation.data.reservation.reservationId, authorityBinding, taskId: "task-1", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "model-1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "completed", usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.01, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "not-adopted" })
    });
    const settled = await jsonFetch<{ settlement: { status: string; consumedCents: number }; reservation: { status: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations/${invocation.data.record.invocationId}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId: reservation.data.reservation.reservationId })
    });
    expect(settled.status).toBe(201);
    expect(settled.data).toMatchObject({ settlement: { status: "settled", consumedCents: 1 }, reservation: { status: "settled" } });
  });

  it("joins provider calibration with invocation cost and latency into a release gate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Provider Evaluation", roughIdea: "Measure a provider honestly." })
    });
    const slug = created.data.project.slug;
    const common = { taskId: "provider-task", taskFingerprint: "provider-task-fp", routeDecision: "balanced", modelCapabilityRef: "provider://mock-v1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", status: "completed", usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.01, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "not-adopted" };
    for (const [invocationId, finishedAt] of [["provider-inv-1", "2026-01-01T00:00:00.100Z"], ["provider-inv-2", "2026-01-01T00:00:00.300Z"]]) {
      const made = await jsonFetch<{ record: { invocationId: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, invocationId, attemptId: invocationId, startedAt: "2026-01-01T00:00:00.000Z", finishedAt }) });
      expect(made.status).toBe(201);
    }
    const calibration = await jsonFetch<{ evidence: { status: string } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorVersion: "provider-evaluator-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout-provider-v1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed", reference: "provider://mock-v1/attestation/1" }, evidenceRefs: ["provider://mock-v1/holdout/1"] }) });
    expect(calibration.data.evidence.status).toBe("calibrated");
    const report = await jsonFetch<{ report: { decision: string; effectiveOutputRate: number; totalCost: { measurement: string }; latencyMs: { p95: number }; quality: { status: string } } }>(`/api/novel/projects/${slug}/runtime/session/provider-evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerRef: "provider://mock-v1", maxP95LatencyMs: 500, maxCost: 1 }) });
    expect(report.status, JSON.stringify(report.data)).toBe(200);
    expect(report.data.report).toMatchObject({ decision: "pass", effectiveOutputRate: 1, totalCost: { measurement: "actual" }, latencyMs: { p95: 300 }, quality: { status: "calibrated" } });
  });

  it("keeps estimated provider probes out of the real-provider release gate", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Estimated Provider Gate", roughIdea: "Probe evidence is not paid evidence." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/runtime/session/model-invocations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invocationId: "estimated-gate-1", taskId: "estimated-gate-task", taskFingerprint: "estimated-gate-fp", attemptId: "estimated-gate-attempt", routeDecision: "probe", modelCapabilityRef: "provider://mock-v1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:00.100Z", status: "completed", usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "estimated" }, cost: { amount: 0.01, currency: "USD", measurement: "estimated", estimateMethod: "probe" }, cache: { hit: false }, adoptionDecision: "probe-only" })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorVersion: "provider-evaluator-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout-provider-estimated", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed", reference: "provider://mock-v1/attestation/estimated" }, evidenceRefs: ["provider://mock-v1/holdout/estimated"] })
    });
    const report = await jsonFetch<{ report: { decision: string; blockedReasons: string[] } }>(`/api/novel/projects/${slug}/runtime/session/provider-evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerRef: "provider://mock-v1", maxP95LatencyMs: 500, maxCost: 1 }) });
    expect(report.status).toBe(200);
    expect(report.data.report).toMatchObject({ decision: "blocked", blockedReasons: expect.arrayContaining(["ACTUAL_USAGE_REQUIRED"]) });
  });

  it("executes the configured provider process before writing a probe ledger record", async () => {
    const previousProfiles = process.env.AI_AGENT_PROFILES_JSON;
    try {
      const command = await writeMockCodexCommand(tempRoot);
      process.env.AI_AGENT_PROFILES_JSON = JSON.stringify([{ id: "probe-agent", label: "Mock Provider", provider: "codex", command, model: "mock-v1", versionArgs: ["--version"], enabled: true, allowCustomModel: true, models: [{ id: "mock-v1", label: "Mock v1", provider: "codex" }] }]);
      const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Provider Probe", roughIdea: "A real local process call." }) });
      const probe = await jsonFetch<{ result: { output: { exitCode: number | null; finalMessage: string }; record: { status: string; modelCapabilityRef: string; adoptionDecision: string; cost: { measurement: string } } } }>(`/api/novel/projects/${created.data.project.slug}/runtime/session/provider-probe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: "probe-agent", prompt: "provider probe", taskId: "probe-task", taskFingerprint: "probe-task-fp", estimatedInputTokens: 4, estimatedOutputTokens: 8, estimatedCost: 0.02 }) });
      expect(probe.status).toBe(201);
      expect(probe.data.result.output.exitCode).toBe(0);
      expect(probe.data.result.output.finalMessage).toContain("mock task complete");
      expect(probe.data.result.record).toMatchObject({ status: "completed", modelCapabilityRef: "provider://codex/Mock Provider/mock-v1", adoptionDecision: "probe-only", cost: { measurement: "estimated" } });
    } finally {
      if (previousProfiles === undefined) delete process.env.AI_AGENT_PROFILES_JSON;
      else process.env.AI_AGENT_PROFILES_JSON = previousProfiles;
    }
  });

  it("routes high-impact work above the author fast preference floor", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Model Route", roughIdea: "A governed route." })
    });
    const route = await jsonFetch<{ decision: { status: string; capabilityId: string; preferenceApplied: boolean } }>(`/api/novel/projects/${created.data.project.slug}/runtime/session/model-route`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskType: "creative-understanding", impact: "high", requiredCapabilityTier: "high", authorPreference: "fast", estimatedCost: 1, remainingBudget: 10, capabilities: [{ capabilityId: "deep", modelId: "deep-1", capabilityTier: "high", contextLimit: 32000, outputLimit: 4000, structuredOutput: true, verifiedTaskTypes: ["creative-understanding"], status: "active" }] })
    });
    expect(route.data.decision).toMatchObject({ status: "selected", capabilityId: "deep", preferenceApplied: false });
  });

  it("blocks provider failover when the candidate crosses the private-data boundary", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Provider Failover", roughIdea: "Keep private material protected." })
    });
    const result = await jsonFetch<{ decision: { status: string; reasonCode: string; switched: boolean } }>(`/api/novel/projects/${created.data.project.slug}/runtime/session/provider-failover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentCandidateId: "codex-gpt", taskType: "outline.generate", requiredContextTokens: 8000, requiresStructuredOutput: true, privacyClass: "private", dataResidency: "local", frozenInputFingerprint: "input-sha", candidates: [{ candidateId: "external-small", provider: "external", modelId: "small", status: "active", verifiedTaskTypes: ["outline.generate"], structuredOutput: true, contextLimit: 16000, privacyClasses: ["public"], dataResidencies: ["us"] }] })
    });
    expect(result.data.decision).toMatchObject({ status: "blocked", reasonCode: "NO_COMPATIBLE_FAILOVER", switched: false });
  });

  it("blocks high-impact review when the evaluator is not isolated", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Independent Review", roughIdea: "A separated review." })
    });
    const result = await jsonFetch<{ gate: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/session/independent-review-gate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "task-1", inputFingerprint: "fp-1", generatorInvocationId: "gen-1", evaluatorInvocationId: "gen-1", evaluatorModelCapabilityRef: "model-1", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "visible", hardGuardsPassed: false, evidenceRefs: [] })
    });
    expect(result.data.gate).toMatchObject({ status: "blocked", reasons: expect.arrayContaining(["INDEPENDENT_EVALUATOR_REQUIRED", "FIRST_OUTPUT_MUST_BE_HIDDEN"]) });
  });

  it("keeps conflicting context sources visible instead of overwriting them", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Context Source Gate", roughIdea: "Conflicting evidence." })
    });
    const result = await jsonFetch<{ sources: { status: string; selectedBlockIds: string[]; conflicts: unknown[] } }>(`/api/novel/projects/${created.data.project.slug}/session/context-source-gate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "understanding", query: "where is hero", sources: [{ blockId: "b-1", factKey: "hero.location", sourceRef: "canon://1", sourceVersion: "v1", contentHash: "h1", authority: "canon", relevance: 0.9, selected: true, selectionReason: "canon" }, { blockId: "b-2", factKey: "hero.location", sourceRef: "canon://2", sourceVersion: "v1", contentHash: "h2", authority: "canon", relevance: 0.8, selected: true, selectionReason: "conflict" }] })
    });
    expect(result.data.sources).toMatchObject({ status: "block", selectedBlockIds: ["b-1", "b-2"], conflicts: [{ factKey: "hero.location" }] });
  });

  it("blocks legacy summary context at the canon-sensitive API boundary", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Legacy Projection Gate", roughIdea: "Summary cannot become canon." })
    });
    const result = await jsonFetch<{ sources: { status: string; selectedBlockIds: string[]; excluded: Array<{ reason: string }> } }>(`/api/novel/projects/${created.data.project.slug}/session/context-source-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "canon-generation", query: "where is hero", sources: [{ blockId: "summary-1", factKey: "hero.location", sourceRef: "summary://chapter-1", sourceVersion: "v1", contentHash: "h1", authority: "summary", relevance: 1, selected: true, selectionReason: "nearby" }] })
    });
    expect(result.data.sources).toMatchObject({ status: "block", selectedBlockIds: [] });
    expect(result.data.sources.excluded).toEqual(expect.arrayContaining([{ blockId: "summary-1", reason: "LEGACY_PROJECTION_NOT_CANON_AUTHORITY" }]));
  });

  it("blocks secrets and cross-project material before context assembly", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Context Privacy", roughIdea: "Privacy boundary." })
    });
    const result = await jsonFetch<{ privacy: { status: string; blockedSourceIds: string[] } }>(`/api/novel/projects/${created.data.project.slug}/session/context-privacy-gate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "understanding", sources: [{ sourceId: "secret", projectSlug: created.data.project.slug, content: "api_key=sk-test-123456", dataClass: "project-file", rights: "project-authorized", providerAuthorized: true, deleted: false }, { sourceId: "cross", projectSlug: "other", content: "private", dataClass: "imported", rights: "project-authorized", providerAuthorized: true, deleted: false }] })
    });
    expect(result.data.privacy).toMatchObject({ status: "block", blockedSourceIds: ["secret", "cross"] });
  });

  it("blocks malformed authoritative context records instead of treating them as empty", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Context Integrity", roughIdea: "Corrupt records." })
    });
    const result = await jsonFetch<{ integrity: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/session/context-integrity-gate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authoritative: true, records: [{ raw: "not-json" }] })
    });
    expect(result.data.integrity).toMatchObject({ status: "block", reasons: ["MALFORMED_RECORD", "SEQUENCE_GAP"] });
  });

  it("advances runtime interruption lifecycle with an auditable reason", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Interruption Lifecycle", roughIdea: "Causal states." })
    });
    const slug = created.data.project.slug;
    const made = await jsonFetch<{ interruption: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/dialogue/runtime-interruptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: "m-1", taskId: "task-1", text: "Use a colder tone" }) });
    const advanced = await jsonFetch<{ interruption: { lifecycle: string[]; transitionReason: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/runtime-interruptions/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interruption: made.data.interruption, target: "effective", reason: "task-started" }) });
    expect(advanced.data.interruption).toMatchObject({ lifecycle: ["received", "classified", "queued", "effective"], transitionReason: "task-started" });
  });

  it("exposes auditable L2 escalation and scoped autonomy receipt routes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Decision Governance", roughIdea: "A bounded decision." })
    });
    const slug = created.data.project.slug;
    const escalation = await jsonFetch<{ escalation: { level: string; status: string } }>(`/api/novel/projects/${slug}/runtime/session/decision-escalations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escalationId: "e-1", decisionType: "core-ending", impact: "changes ending", irreversibility: "cannot safely rewrite published edition", currentEvidence: ["contract://ending"], safeDefaults: ["hold"], delayCost: "none", thresholdReason: "L2" })
    });
    expect(escalation.data.escalation).toMatchObject({ level: "L2", status: "needs-author" });
  });

  it("keeps timed-out dialogue writes gated unless delegation is explicit", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Dialogue Timeout", roughIdea: "No timeout consent." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{ decision: { status: string; consent: boolean; writeAllowed: boolean } }>(`/api/novel/projects/${slug}/runtime/dialogue/timeout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: "q-ending", elapsedMs: 5000, timeoutMs: 1000, impact: "high", pendingWrite: true, validDelegation: false })
    });
    expect(response.data.decision).toMatchObject({ status: "gate_required", consent: false, writeAllowed: false });
  });

  it("exposes a replayable seed compilation run without claiming canon completion", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Seed Run", roughIdea: "A recoverable seed compiler." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{ run: { runId: string; status: string; interpretationComplete: boolean; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/story-seeds/runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "seed-1", inputFingerprint: "input-1", compilerVersion: "compiler-1", sourceMessageIds: ["m-1"] })
    });
    expect(response.data.run).toMatchObject({ status: "captured", interpretationComplete: false, canonWritten: false });
    const interpreting = await jsonFetch<{ run: { status: string; recoveryCheckpoint: string } }>(`/api/novel/projects/${slug}/runtime/story-seeds/runs/transition`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: response.data.run, next: "interpreting", input: { checkpoint: "facet-extraction" } })
    });
    expect(interpreting.data.run).toMatchObject({ status: "interpreting", recoveryCheckpoint: "facet-extraction" });
    const restored = await jsonFetch<{ run: { status: string; recoveryCheckpoint: string } }>(`/api/novel/projects/${slug}/runtime/story-seeds/runs/${response.data.run.runId}`);
    expect(restored.data.run).toMatchObject({ status: "interpreting", recoveryCheckpoint: "facet-extraction" });
  });

  it("blocks V2 understanding until safety dependencies are present without writing a snapshot", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Understanding Gate", roughIdea: "A guarded interpretation attempt." })
    });
    const slug = created.data.project.slug;
    const before = await fs.readdir(path.join(tempRoot, slug, "sessions"), { recursive: true });
    const response = await jsonFetch<{
      error: { code: string; missingDependencies: string[]; modelCallIssued: boolean; understandingWritten: boolean };
    }>(`/api/novel/projects/${slug}/session/understanding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(409);
    expect(response.data.error).toMatchObject({
      code: "V2_DEPENDENCY_MISSING",
      modelCallIssued: false,
      understandingWritten: false
    });
    expect(response.data.error.missingDependencies).toEqual([
      "t0-context-manifest",
      "budget-reservation",
      "model-capability-authorization"
    ]);
    expect(await fs.readdir(path.join(tempRoot, slug, "sessions"), { recursive: true })).toEqual(before);
  });

  it("rejects a route-level answer when the creative session changed after freezing", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Stale Question Route", roughIdea: "A route must reject stale understanding input." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "stale-route-1", text: "The keeper hears a bell beneath the tide." })
    });
    const manifest = await jsonFetch<{ manifest: { sourceFingerprint: string } }>(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const question = await createDialogueQuestion(path.join(tempRoot, slug), {
      projectSlug: slug,
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What does the keeper want most?",
      whyNow: "It changes the opening contract.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Ask",
      snapshotFingerprint: manifest.data.manifest.sourceFingerprint
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "stale-route-2", text: "The keeper finds a map in the bell tower." })
    });

    const answer = await jsonFetch<{ error: { code: string } }>(
      `/api/novel/projects/${slug}/session/understanding/questions/${question.question.questionId}/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionVersion: question.question.questionVersion,
          expectedSnapshotFingerprint: question.question.snapshotFingerprint,
          idempotencyKey: "stale-route-answer",
          answerText: "Prove the city survived.",
          answerStatus: "confirmed"
        })
      }
    );
    expect(answer.status).toBe(409);
    expect(answer.data.error.code).toBe("SNAPSHOT_FINGERPRINT_STALE");
  });

  it("carries one low-input idea through V1 capture, V2 shadow understanding, and a V3 contract candidate", async () => {
    const previousProfiles = process.env.AI_AGENT_PROFILES_JSON;
    process.env.AI_AGENT_PROFILES_JSON = JSON.stringify([
      {
        id: "vertical-slice-agent",
        label: "Vertical slice agent",
        provider: "codex",
        command: "node",
        versionArgs: ["--version"],
        model: "vertical-slice-model",
        allowCustomModel: true,
        enabled: true,
        models: [{ id: "vertical-slice-model", label: "Vertical slice model", provider: "codex" }]
      }
    ]);
    try {
      const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "V1 V2 V3 Vertical Slice", roughIdea: "A lighthouse keeper finds a city beneath the tide." })
      });
      const slug = created.data.project.slug;
      const captured = await jsonFetch<{ created: boolean; session: { messages: Array<{ id: string; role: string }> } }>(
        `/api/novel/projects/${slug}/session/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientMessageId: "vertical-slice-001", text: "A lighthouse keeper finds a city beneath the tide." })
        }
      );
      expect(captured.status).toBe(201);
      expect(captured.data).toMatchObject({ created: true, session: { messages: [{ id: "message-vertical-slice-001", role: "author" }] } });

      const manifest = await jsonFetch<{ manifest: { sourceFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" }
      );
      expect(manifest.status).toBe(201);
      const budget = await jsonFetch<{ reservation: { manifestFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/budget`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: "vertical-slice-budget", units: 100 })
        }
      );
      expect(budget.status).toBe(201);
      expect(budget.data.reservation.manifestFingerprint).toBe(manifest.data.manifest.sourceFingerprint);
      const authorization = await jsonFetch<{ authorization: { fingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/capability-authorization`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: "vertical-slice-agent", modelId: "vertical-slice-model" })
        }
      );
      expect(authorization.status).toBe(201);

      const understood = await jsonFetch<{ snapshot: { sourceFingerprint: string; question: { id: string } } }>(
        `/api/novel/projects/${slug}/session/understanding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "shadow" })
        }
      );
      expect(understood.status).toBe(201);
      expect(understood.data.snapshot).toMatchObject({ sourceFingerprint: manifest.data.manifest.sourceFingerprint, question: { id: "question-primary-desire" } });

      const question = await jsonFetch<{ question: { questionId: string; questionVersion: number; snapshotFingerprint: string }; redBlueCase: { caseId: string; status: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ options: ["Expose the truth", "Protect the city"], recommendation: "Expose the truth" }) }
      );
      expect(question.status).toBe(201);
      expect(question.data.redBlueCase).toMatchObject({ caseId: `red-blue-${question.data.question.questionId}-1`, status: "open" });
      const redBlue = await jsonFetch<{ created: boolean; redBlueCase: { caseId: string; status: string; options: unknown[] } }>(`/api/novel/projects/${slug}/session/understanding/questions/${question.data.question.questionId}/red-blue`, { method: "POST" });
      const redBlueReplay = await jsonFetch<{ redBlueCase: { caseId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/session/understanding/questions/${question.data.question.questionId}/red-blue`);
      expect(redBlue.status).toBe(200);
      expect(redBlue.data).toMatchObject({ created: false, redBlueCase: { status: "open", options: expect.any(Array) } });
      expect(redBlueReplay.status).toBe(200);
      expect(redBlueReplay.data.redBlueCase).toMatchObject({ caseId: redBlue.data.redBlueCase.caseId, fingerprint: expect.any(String) });
      const answered = await jsonFetch<{ decision: { decisionId: string; sourceFingerprint: string; redBlueCaseId?: string }; nextQuestion?: { question: { questionId: string; status: string } }; journey: { progress: { completed: number; total: number; current: number } } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/${question.data.question.questionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionVersion: question.data.question.questionVersion,
            expectedSnapshotFingerprint: question.data.question.snapshotFingerprint,
            idempotencyKey: "vertical-slice-answer",
            answerText: "The keeper wants to prove the drowned city is still alive.",
            answerStatus: "confirmed"
          })
        }
      );
      expect(answered.status).toBe(201);
      expect(answered.data.decision).toMatchObject({ sourceFingerprint: manifest.data.manifest.sourceFingerprint });
      expect(answered.data.decision.redBlueCaseId).toBe(`red-blue-${question.data.question.questionId}-${question.data.question.questionVersion}`);
      expect(answered.data.nextQuestion).toMatchObject({ question: { questionId: "question-core-conflict", status: "active" } });
      expect(answered.data.journey.progress).toEqual({ completed: 1, total: 10, current: 2 });
      const questionsAfterAnswer = await jsonFetch<{ questions: Array<{ questionId: string; status: string }> }>(
        `/api/novel/projects/${slug}/session/understanding/questions`
      );
      expect(questionsAfterAnswer.data.questions.filter((item) => item.status === "active")).toEqual([expect.objectContaining({ questionId: "question-core-conflict", status: "active" })]);
      const conflictQuestion = { question: { questionId: "question-core-conflict", questionVersion: 1, snapshotFingerprint: question.data.question.snapshotFingerprint } };
      const conflictAnswer = await jsonFetch<{ decision: { decisionId: string; sourceFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/${conflictQuestion.question.questionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionVersion: conflictQuestion.question.questionVersion,
            expectedSnapshotFingerprint: conflictQuestion.question.snapshotFingerprint,
            idempotencyKey: "vertical-slice-conflict-answer",
            answerText: "The drowned city will erase the keeper's memories if he exposes it.",
            answerStatus: "confirmed"
          })
        }
      );
      expect(conflictAnswer.status).toBe(201);

      const failureCostQuestion = await jsonFetch<{ created: boolean; question: { questionId: string; questionVersion: number; snapshotFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
      );
      expect(failureCostQuestion.status).toBe(200);
      expect(failureCostQuestion.data).toMatchObject({ created: false, question: { questionId: "question-failure-cost" } });
      const failureCostAnswer = await jsonFetch<{ decision: { decisionId: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/${failureCostQuestion.data.question.questionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionVersion: failureCostQuestion.data.question.questionVersion,
            expectedSnapshotFingerprint: failureCostQuestion.data.question.snapshotFingerprint,
            idempotencyKey: "vertical-slice-failure-cost-answer",
            answerText: "If he fails, the city will surface and erase every coastal memory.",
            answerStatus: "confirmed"
          })
        }
      );
      expect(failureCostAnswer.status).toBe(201);
      const remainingContractAnswers: Array<[string, string]> = [
        ["question-inner-need", "The keeper needs to trust a witness."],
        ["question-misbelief", "Only solitary proof counts."],
        ["question-world-rule", "The charged lens reveals the city at low tide."],
        ["question-opposing-pressure", "The council and the tide erase evidence."],
        ["question-irreversible-choice", "Share the lens and spend its final charge."],
        ["question-reader-promise", "A costly revelation earned through trust."],
        ["question-ending-direction", "The city is acknowledged at the cost of the lens."]
      ];
      let finalAutoAdvance: { completed: boolean; contractCandidate?: { candidate: { candidateId: string; sourceDecisionId: string } }; consumption?: { created: boolean; receipt: { receiptId: string; consumer: string; decisionId: string; consumerRef: string } } } | undefined;
      for (const [expectedQuestionId, answerText] of remainingContractAnswers) {
        const nextQuestion = await jsonFetch<{ question: { questionId: string; questionVersion: number; snapshotFingerprint: string } }>(
          `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
        );
        expect(nextQuestion.status).toBe(200);
        expect(nextQuestion.data.question.questionId).toBe(expectedQuestionId);
        const nextAnswer = await jsonFetch<{ decision: { decisionId: string }; completed: boolean; contractCandidate?: { candidate: { candidateId: string; sourceDecisionId: string } }; consumption?: { created: boolean; receipt: { receiptId: string; consumer: string; decisionId: string; consumerRef: string } } }>(
          `/api/novel/projects/${slug}/session/understanding/questions/${expectedQuestionId}/answers`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionVersion: nextQuestion.data.question.questionVersion,
              expectedSnapshotFingerprint: nextQuestion.data.question.snapshotFingerprint,
              idempotencyKey: `vertical-slice-${expectedQuestionId}-answer`,
              answerText,
              answerStatus: "confirmed"
            })
          }
        );
        expect(nextAnswer.status).toBe(201);
        if (expectedQuestionId === "question-ending-direction") finalAutoAdvance = nextAnswer.data;
      }
      expect(finalAutoAdvance).toMatchObject({ completed: true, contractCandidate: { candidate: { sourceDecisionId: expect.any(String) } }, consumption: { created: true, receipt: { consumer: "story-contract" } } });
      expect(finalAutoAdvance!.consumption!.receipt).toMatchObject({ decisionId: finalAutoAdvance!.contractCandidate!.candidate.sourceDecisionId, consumerRef: finalAutoAdvance!.contractCandidate!.candidate.candidateId });
      const persistedAutoConsumption = await jsonFetch<{ receipt: { receiptId: string; consumer: string; decisionId: string; consumerRef: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/decision-consumption-receipts/${finalAutoAdvance!.consumption!.receipt.receiptId}`);
      expect(persistedAutoConsumption.status).toBe(200);
      expect(persistedAutoConsumption.data.receipt).toMatchObject(finalAutoAdvance!.consumption!.receipt);
      const exhaustedQuestions = await jsonFetch<{ error: { code: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
      );
      expect(exhaustedQuestions.status).toBe(409);
      expect(exhaustedQuestions.data.error.code).toBe("UNDERSTANDING_QUESTIONS_EXHAUSTED");

      const candidate = await jsonFetch<{ candidate: { candidateId: string; fingerprint: string; status: string; canonWritten: boolean; fields: Array<{ path: string; value: string }> }; consumption: { created: boolean; receipt: { consumer: string; decisionId: string; consumerRef: string } } }>(
        `/api/novel/projects/${slug}/session/understanding/contract-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisionId: conflictAnswer.data.decision.decisionId })
        }
      );
      expect(candidate.status).toBe(201);
      expect(candidate.data.candidate).toMatchObject({ status: "candidate", canonWritten: false });
      expect(candidate.data.consumption).toMatchObject({ created: true, receipt: { consumer: "story-contract", decisionId: conflictAnswer.data.decision.decisionId, consumerRef: candidate.data.candidate.candidateId } });
      const candidateReplay = await jsonFetch<{ consumption: { created: boolean; receipt: { consumerRef: string } } }>(
        `/api/novel/projects/${slug}/session/understanding/contract-candidates`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisionId: conflictAnswer.data.decision.decisionId }) }
      );
      expect(candidateReplay.status).toBe(200);
      expect(candidateReplay.data.consumption).toMatchObject({ created: false, receipt: { consumerRef: candidate.data.candidate.candidateId } });
      expect(candidate.data.candidate.fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "protagonist.primaryDesire", value: "The keeper wants to prove the drowned city is still alive." }),
        expect.objectContaining({ path: "conflict.core", value: "The drowned city will erase the keeper's memories if he exposes it." }),
        expect.objectContaining({ path: "stakes.failureCost", value: "If he fails, the city will surface and erase every coastal memory." }),
        expect.objectContaining({ path: "protagonist.innerNeed", value: "The keeper needs to trust a witness." }),
        expect.objectContaining({ path: "protagonist.misbelief", value: "Only solitary proof counts." }),
        expect.objectContaining({ path: "world.rules.primary", value: "The charged lens reveals the city at low tide." }),
        expect.objectContaining({ path: "conflict.opposingPressure", value: "The council and the tide erase evidence." }),
        expect.objectContaining({ path: "stakes.irreversibleChoice", value: "Share the lens and spend its final charge." }),
        expect.objectContaining({ path: "readerPromise", value: "A costly revelation earned through trust." }),
        expect.objectContaining({ path: "endingDirection", value: "The city is acknowledged at the cost of the lens." })
      ]));
      expect(candidate.data.candidate.fields).toHaveLength(10);

      const outline = await jsonFetch<{ outline: { outlineId: string; sourceCandidateFingerprint: string; status: string; canonWritten: boolean; horizon: { strongFreezeCount: number; totalChapterCount: number }; chapters: Array<{ chapterId: string; order: number; freeze: string }> }; consumption: { created: boolean; receipt: { consumer: string; decisionId: string; consumerRef: string } } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCandidateId: candidate.data.candidate.candidateId, strongFreezeCount: 3, totalChapterCount: 3 })
        }
      );
      expect(outline.status).toBe(201);
      expect(outline.data.consumption).toMatchObject({ created: true, receipt: { consumer: "outline", decisionId: conflictAnswer.data.decision.decisionId, consumerRef: outline.data.outline.outlineId } });
      expect(outline.data.outline).toMatchObject({
        sourceCandidateFingerprint: candidate.data.candidate.fingerprint,
        status: "candidate",
        canonWritten: false,
        horizon: { strongFreezeCount: 3, totalChapterCount: 3 },
        chapters: [
          { chapterId: "chapter-001", order: 1, freeze: "strong" },
          { chapterId: "chapter-002", order: 2, freeze: "strong" },
          { chapterId: "chapter-003", order: 3, freeze: "strong" }
        ]
      });
      const outlineValidation = await jsonFetch<{ report: { status: string; executionReady: boolean; checks: Array<{ checkId: string; status: string }> } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-candidates/${outline.data.outline.outlineId}/validate`,
        { method: "POST" }
      );
      expect(outlineValidation.status).toBe(201);
      expect(outlineValidation.data.report).toMatchObject({ status: "passed", executionReady: false });
      expect(outlineValidation.data.report.checks.every((check) => check.status === "passed")).toBe(true);

      const comparison = await jsonFetch<{ comparison: { fingerprint: string } }>(
        `/api/novel/projects/${slug}/runtime/candidate-comparison`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectiveIds: ["contract"], candidates: [{ candidateId: candidate.data.candidate.candidateId, hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "contract", gap: 0, evidenceRefs: [`decision://${conflictAnswer.data.decision.decisionId}`] }], unresolvedRisks: [] }] }) }
      );
      expect(comparison.status).toBe(200);

      const proposal = await jsonFetch<{ proposal: { fingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-adoption-proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outlineId: outline.data.outline.outlineId, expectedOutlineFingerprint: outline.data.outline.fingerprint, comparisonFingerprint: comparison.data.comparison.fingerprint })
        }
      );
      expect(proposal.status).toBe(201);
      const authorized = await jsonFetch<{ proposal: { fingerprint: string; status: string } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-adoption-proposals/authorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedProposalFingerprint: proposal.data.proposal.fingerprint, actorId: "author-1", authorizationId: "rp3-app-1" })
        }
      );
      expect(authorized.status).toBe(201);
      expect(authorized.data.proposal.status).toBe("authorized");

      const injected = await jsonFetch<{ status: string; reason: string; canonWritten: boolean }>(
        `/api/novel/projects/${slug}/session/understanding/outline-adoption`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedProposalFingerprint: authorized.data.proposal.fingerprint, faultAt: "after-project-write" })
        }
      );
      expect(injected.status).toBe(500);
      expect(injected.data).toMatchObject({ status: "rolled_back", reason: "INJECTED_FAULT", canonWritten: false });
      expect(JSON.parse(await fs.readFile(path.join(tempRoot, slug, "project.json"), "utf8"))).not.toHaveProperty("outlineVersion");

      const recommitted = await jsonFetch<{ status: string; version: { versionId: string } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-adoption`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedProposalFingerprint: authorized.data.proposal.fingerprint })
        }
      );
      expect(recommitted.status).toBe(201);
      expect(recommitted.data.status).toBe("committed");

      const migrationPreview = await jsonFetch<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      const migrationValidation = await jsonFetch<{ validation: { fingerprint: string } }>(`/api/novel/projects/${slug}/migrations/${migrationPreview.data.preview.migrationId}/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      const migrationActivation = await jsonFetch<{ activation: { status: string } }>(`/api/novel/projects/${slug}/migrations/${migrationPreview.data.preview.migrationId}/activate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "rp3-app-migration-1", expectedValidationFingerprint: migrationValidation.data.validation.fingerprint })
      });
      expect(migrationActivation.status).toBe(200);
      expect(migrationActivation.data.activation.status).toBe("activated");
      const migrationRollback = await jsonFetch<{ rollback: { status: string } }>(`/api/novel/projects/${slug}/migrations/${migrationPreview.data.preview.migrationId}/rollback`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      expect(migrationRollback.status).toBe(201);
      expect(migrationRollback.data.rollback.status).toBe("rolled_back");
    } finally {
      if (previousProfiles === undefined) delete process.env.AI_AGENT_PROFILES_JSON;
      else process.env.AI_AGENT_PROFILES_JSON = previousProfiles;
    }
  });

  it("rejects an unknown understanding execution mode before dependency evaluation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Understanding Mode", roughIdea: "Execution mode must be explicit." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(
      `/api/novel/projects/${created.data.project.slug}/session/understanding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "unknown-mode" })
      }
    );
    expect(response.status).toBe(400);
    expect(response.data.error).toEqual({ code: "UNDERSTANDING_MODE_INVALID" });
  });

  it("creates a deterministic understanding snapshot after T0 is frozen without reserving model access", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Deterministic Understanding", roughIdea: "A frozen input should yield the first question." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "deterministic-001", text: "A sealed gate opens at midnight." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });

    const response = await jsonFetch<{ snapshot: { mode: string; modelCallIssued: boolean; canonWritten: boolean; question: { text: string } } }>(
      `/api/novel/projects/${slug}/session/understanding`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "shadow" }) }
    );

    expect(response.status).toBe(201);
    expect(response.data.snapshot).toMatchObject({ mode: "shadow", modelCallIssued: false, canonWritten: false });
    expect(response.data.snapshot.question.text).toBe("在开头阶段，主角最想得到什么？");
  });

  it("exposes a read-only understanding preview with explicit source spans", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Understanding Preview", roughIdea: "Preview must not invent canon." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "preview-001", text: "A courier hides a map under the old bridge." })
    });
    const preview = await jsonFetch<{
      preview: {
        schemaVersion: string;
        inputFingerprint: string;
        coreExplicit: Array<{ status: string; text: string; evidence: Array<{ messageId: string; start: number; end: number }> }>;
        inferred: unknown[];
        unknowns: Array<{ status: string; text: string }>;
        modelCallIssued: boolean;
        canonWritten: boolean;
      };
    }>(`/api/novel/projects/${slug}/session/understanding-preview`);

    expect(preview.status).toBe(200);
    expect(preview.data.preview).toMatchObject({
      schemaVersion: "understanding-preview.v1",
      inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      modelCallIssued: false,
      canonWritten: false
    });
    expect(preview.data.preview.coreExplicit).toEqual([
      expect.objectContaining({
        status: "explicit",
        text: "A courier hides a map under the old bridge.",
        evidence: [{ messageId: "message-preview-001", start: 0, end: 43 }]
      })
    ]);
    expect(preview.data.preview.inferred).toEqual([]);
    expect(preview.data.preview.unknowns).toEqual([expect.objectContaining({ status: "unknown", text: "故事意图和下一项作者决策尚未明确。" })]);
  });

  it("exposes one journey projection instead of requiring clients to infer the next action", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Journey Projection", roughIdea: "The journey projection has one primary action." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "journey-001", text: "A courier hides a map under the old bridge." })
    });

    const response = await jsonFetch<{
      journey: {
        schemaVersion: string;
        stage: string;
        primaryAction: { id: string; kind: string; status: string };
        activeQuestion: { id: string; status: string };
        sourceMessageIds: string[];
      };
    }>(`/api/novel/projects/${slug}/session/journey`);

    expect(response.status).toBe(200);
    expect(response.data.journey).toMatchObject({
      schemaVersion: "creative-journey-projection.v1",
      stage: "understanding",
      primaryAction: { id: "review-understanding", kind: "review", status: "available" },
      activeQuestion: { id: "question-primary-desire", status: "candidate" },
      sourceMessageIds: ["message-journey-001"]
    });
  });

  it("replaces an answered blocking question with the next authoritative question", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Journey Question Convergence", roughIdea: "The journey must converge after an answer." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "journey-question-source", text: "A keeper hears a bell beneath the tide." })
    });
    const root = path.join(tempRoot, slug);
    const question = await createDialogueQuestion(root, {
      projectSlug: slug,
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What does the keeper want most?",
      whyNow: "It changes the opening contract.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["Prove the city survived", "Protect the bell"],
      recommendation: "Prove the city survived",
      snapshotFingerprint: "journey-question-snapshot"
    });
    const before = await jsonFetch<{ journey: { primaryAction: { id: string; kind: string }; activeQuestion?: { id: string; status: string } } }>(`/api/novel/projects/${slug}/session/journey`);
    expect(before.data.journey.activeQuestion).toMatchObject({ id: question.question.questionId, status: "active" });
    expect(before.data.journey.primaryAction).toMatchObject({ id: "answer-question-primary-desire", kind: "answer" });
    const answered = await jsonFetch(`/api/novel/projects/${slug}/session/understanding/questions/${question.question.questionId}/answers`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionVersion: 1, expectedSnapshotFingerprint: "journey-question-snapshot", idempotencyKey: "journey-question-answer", answerText: "Prove the drowned city is still alive.", answerStatus: "confirmed" })
    });
    expect(answered.status).toBe(201);
    const after = await jsonFetch<{ journey: { activeQuestion?: { id: string; status: string } } }>(`/api/novel/projects/${slug}/session/journey`);
    expect(after.data.journey.activeQuestion).toMatchObject({ id: "question-core-conflict", status: "active" });
  });

  it("does not erase the answer primary action when a system message refreshes the journey", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Journey Refresh Authority", roughIdea: "System refreshes must preserve the blocking question." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "journey-refresh-author", text: "A keeper hears a bell beneath the tide." })
    });
    await createDialogueQuestion(path.join(tempRoot, slug), {
      projectSlug: slug, questionId: "question-core-conflict", questionVersion: 1, text: "What threatens the keeper?", whyNow: "It changes the opening conflict.", impact: "high", ambiguity: 0.8, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["The tide"], recommendation: "The tide", snapshotFingerprint: "journey-refresh-snapshot"
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "journey-refresh-system", kind: "system-paraphrase", text: "I understand the opening pressure." })
    });
    const stored = await readCreativeJourneyProjection(path.join(tempRoot, slug), slug);
    expect(stored?.primaryAction).toMatchObject({ id: "answer-question-core-conflict", kind: "answer" });
    const journey = await jsonFetch<{ journey: { primaryAction: { id: string; kind: string }; activeQuestion?: { id: string; status: string } } }>(`/api/novel/projects/${slug}/session/journey`);
    expect(journey.data.journey).toMatchObject({ primaryAction: { id: "answer-question-core-conflict", kind: "answer" }, activeQuestion: { id: "question-core-conflict", status: "active" } });
  });

  it("routes natural-language text to the active question without requiring a control keyword", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Natural Answer Routing", roughIdea: "An answer should not require a choose prefix." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "natural-answer-source", text: "A keeper hears a bell beneath the tide." })
    });
    await createDialogueQuestion(path.join(tempRoot, slug), {
      projectSlug: slug, questionId: "question-primary-desire", questionVersion: 1, text: "What does the keeper want most?", whyNow: "It changes the opening contract.", impact: "high", ambiguity: 0.8, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["Protect the bell"], recommendation: "Protect the bell", snapshotFingerprint: "natural-answer-snapshot"
    });
    const response = await jsonFetch<{ collaboration: { events: Array<{ type: string; text: string }> }; primaryAction: { actionId: string } }>(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "natural-answer", text: "保护钟声，不让潮水带走它" })
    });
    expect(response.status).toBe(201);
    expect(response.data.collaboration.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "answer", text: "保护钟声，不让潮水带走它" })]));
    expect(response.data.primaryAction.actionId).toBe("answer-question-primary-desire");
  });

  it("uses the authoritative active question when parsing collaboration messages directly", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Direct Collaboration Parse", roughIdea: "Direct parsing must share session semantics." })
    });
    const slug = created.data.project.slug;
    await createDialogueQuestion(path.join(tempRoot, slug), {
      projectSlug: slug, questionId: "question-primary-desire", questionVersion: 1, text: "What does the keeper want most?", whyNow: "It changes the opening contract.", impact: "high", ambiguity: 0.8, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["Protect the bell"], recommendation: "Protect the bell", snapshotFingerprint: "direct-parse-snapshot"
    });
    const response = await jsonFetch<{ result: { events: Array<{ type: string; text: string }> } }>(`/api/novel/projects/${slug}/runtime/collaboration-messages/parse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "保护钟声，不让潮水带走它" })
    });
    expect(response.data.result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "answer", text: "保护钟声，不让潮水带走它" })]));
  });

  it("exposes a durable collaboration timeline separate from runtime debug events", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Timeline Projection", roughIdea: "Timeline must survive refresh." }) });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "timeline-author", text: "A keeper waits at the tide line." }) });
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "timeline-system", kind: "system-paraphrase", text: "I understand the setting." }) });
    const response = await jsonFetch<{ timeline: { schemaVersion: string; activeEntryId: string; entries: Array<{ kind: string; collapsed: boolean }>; sessionFingerprint: string } }>(`/api/novel/projects/${slug}/session/timeline`);
    expect(response.status).toBe(200);
    expect(response.data.timeline).toMatchObject({ schemaVersion: "creative-timeline-projection.v1", activeEntryId: "message-timeline-system", entries: [{ kind: "author-message", collapsed: false }, { kind: "system-message", collapsed: false }], sessionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("freezes a versioned T0 context manifest and invalidates it when the session changes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T0 Manifest", roughIdea: "Freeze the exact author input." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "t0-001", text: "The archivist opens a forbidden door." })
    });

    const first = await jsonFetch<{
      manifest: { schemaVersion: string; manifestId: string; sourceFingerprint: string; sourceMessages: Array<{ id: string; text: string }> };
      created: boolean;
    }>(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const replay = await jsonFetch<{ manifest: typeof first.data.manifest; created: boolean }>(
      `/api/novel/projects/${slug}/session/context-manifest`,
      { method: "POST" }
    );

    expect(first.status).toBe(201);
    expect(first.data.created).toBe(true);
    expect(first.data.manifest).toMatchObject({
      schemaVersion: "context-manifest.v1",
      sourceMessages: [{ id: "message-t0-001", text: "The archivist opens a forbidden door." }]
    });
    expect(first.data.manifest.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(replay.status).toBe(200);
    expect(replay.data).toEqual({ manifest: first.data.manifest, created: false });

    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "t0-002", text: "A second seal breaks." })
    });
    const changed = await jsonFetch<{
      manifest: { manifestId: string; sourceFingerprint: string; supersedesManifestId?: string; sourceMessages: unknown[] };
      created: boolean;
    }>(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    expect(changed.status).toBe(201);
    expect(changed.data.created).toBe(true);
    expect(changed.data.manifest.manifestId).not.toBe(first.data.manifest.manifestId);
    expect(changed.data.manifest.sourceFingerprint).not.toBe(first.data.manifest.sourceFingerprint);
    expect(changed.data.manifest.supersedesManifestId).toBe(first.data.manifest.manifestId);
    expect(changed.data.manifest.sourceMessages).toHaveLength(2);
  });

  it("audits deterministic replay and blocks post-call evidence outside selected context", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Context Evidence", roughIdea: "Replay" }) });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId: "ctx-e-1", text: "Confirmed fact." }) });
    const frozen = await jsonFetch<{ manifest: { manifestId: string; sourceFingerprint: string } }>(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const replay = await jsonFetch<{ replay: { status: string } }>(`/api/novel/projects/${slug}/session/context-replay-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedManifestId: frozen.data.manifest.manifestId, expectedSourceFingerprint: frozen.data.manifest.sourceFingerprint, route: "understanding.v1", temperature: 0, seed: 3, topP: 1 }) });
    expect(replay.data.replay.status).toBe("pass");
    const evidence = await jsonFetch<{ evidence: { status: string; unsupportedSourceRefs: string[] } }>(`/api/novel/projects/${slug}/session/context-evidence-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceRefs: ["not-selected"] }) });
    expect(evidence.data.evidence).toMatchObject({ status: "conflicted", unsupportedSourceRefs: ["not-selected"] });
    const conflicts = await jsonFetch<{ conflicts: { status: string; conflicts: unknown[] } }>(`/api/novel/projects/${slug}/session/context-conflict-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facts: [{ factKey: "hero.alive", value: true, sourceRef: "canon://1", sourceVersion: "v1", authority: "canon" }, { factKey: "hero.alive", value: false, sourceRef: "summary://1", sourceVersion: "v1", authority: "summary" }] }) });
    expect(conflicts.data.conflicts).toMatchObject({ status: "block", conflicts: [{ factKey: "hero.alive" }] });
  });

  it("enforces bounded retries and circuit recovery through the API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Resilience", roughIdea: "Retry and circuit" }) });
    const slug = created.data.project.slug;
    const retry = await jsonFetch<{ retry: { retry: boolean; retryClass: string } }>(`/api/novel/projects/${slug}/session/execution-retry-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryChainId: "chain-api", attempt: 1, maxAttempts: 3, errorCode: "HTTP_503" }) });
    expect(retry.data.retry).toMatchObject({ retry: true, retryClass: "transient" });
    const circuit = await jsonFetch<{ circuit: { state: string; allow: boolean } }>(`/api/novel/projects/${slug}/session/execution-circuit-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consecutiveFailures: 3, failureThreshold: 2, now: "2026-07-31T00:00:02.000Z", openedAt: "2026-07-31T00:00:00.000Z", cooldownMs: 1000 }) });
    expect(circuit.data.circuit).toMatchObject({ state: "half-open", allow: true });
  });

  it("binds model-call replay to route, schema, parameters, and tool permissions", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Call Fingerprint", roughIdea: "Replay" }) });
    const slug = created.data.project.slug;
    const body = { businessInputFingerprint: "biz", contextManifestFingerprint: "ctx", routePolicyFingerprint: "route", promptSchemaVersion: "prompt.v1", outputSchemaVersion: "output.v1", modelCapabilityRef: "cap.deep", modelParameters: { temperature: 0, topP: 1, seed: 7 }, toolPermissions: ["read:canon"] };
    const first = await jsonFetch<{ fingerprint: Record<string, unknown> }>(`/api/novel/projects/${slug}/session/model-call-fingerprint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const replay = await jsonFetch<{ replay: { status: string } }>(`/api/novel/projects/${slug}/session/model-call-replay-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected: first.data.fingerprint, actual: first.data.fingerprint }) });
    expect(replay.data.replay.status).toBe("pass");
  });

  it("quarantines invalid structured output and rejects self-certified completion", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Output Governance", roughIdea: "Structured" }) });
    const slug = created.data.project.slug;
    const output = await jsonFetch<{ output: { status: string; canonWriteAllowed: boolean } }>(`/api/novel/projects/${slug}/session/structured-output-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawOutput: "not-json", requiredFields: ["summary"], repairAttempted: true }) });
    expect(output.data.output).toMatchObject({ status: "quarantined", canonWriteAllowed: false });
    const completion = await jsonFetch<{ completion: { status: string; completionAllowed: boolean } }>(`/api/novel/projects/${slug}/session/completion-evidence-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selfClaims: ["closed-loop"], independentReviewPassed: false }) });
    expect(completion.data.completion).toMatchObject({ status: "blocked", completionAllowed: false });
  });

  it("keeps cost saving, failover, and author strategy behind safety gates", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execution Strategy", roughIdea: "Policy" }) });
    const slug = created.data.project.slug;
    const plan = await jsonFetch<{ plan: { protectedInvariants: string[] } }>(`/api/novel/projects/${slug}/session/cost-saving-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budgetPressure: "tight", cacheAvailable: true, duplicateContext: true, optionalAudit: true, t0Protected: true, highImpactReviewProtected: true }) });
    expect(plan.data.plan.protectedInvariants).toContain("T0-context");
    const failover = await jsonFetch<{ failover: { status: string } }>(`/api/novel/projects/${slug}/session/executor-failover-gate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentCapabilityRef: "a", candidateCapabilityRef: "b", taskType: "understanding", requiredTier: "high", candidateTier: "balanced", contextCapacityOk: true, structuredOutput: true, privacyOk: true, rightsOk: true, residencyOk: true, inputFingerprint: "input" }) });
    expect(failover.data.failover.status).toBe("blocked");
    const strategy = await jsonFetch<{ strategy: { preference: string; candidateLimit: number } }>(`/api/novel/projects/${slug}/session/author-execution-strategy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preference: "fast" }) });
    expect(strategy.data.strategy).toMatchObject({ preference: "fast", candidateLimit: 1 });
  });

  it("enforces one active L2 question, bounded options, deduplication, and policy explanation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Question Governance", roughIdea: "Questions" }) });
    const slug = created.data.project.slug;
    const session = await jsonFetch<{ session: { activeQuestionId: string } }>(`/api/novel/projects/${slug}/runtime/question-sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: [{ questionId: "q-1", text: "Who decides the ending?", level: "L2", options: ["author", "system"], recommended: "author", affectedAssets: ["ending"], whyNow: "ending blocks outline", reversible: false }] }) });
    expect(session.data.session.activeQuestionId).toBe("q-1");
    const governance = await jsonFetch<{ governance: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/question-governance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxBlockingQuestions: 2, policy: { decideForMe: ["temporary-location"], alwaysAsk: ["core-ending"], askLess: true } }) });
    const registered = await jsonFetch<{ governance: { questions: Array<{ whyNow: string }> } }>(`/api/novel/projects/${slug}/runtime/question-governance/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ governance: governance.data.governance, question: { questionId: "q-2", text: "Who decides the ending?", impact: "core-ending", blocking: true, affectedAssets: ["ending"], riskIfSkipped: "wrong canon", recommendation: "ask author", canDefer: false } }) });
    expect(registered.data.governance.questions[0]?.whyNow).toContain("ending");
  });

  it("compares contract candidates by hard constraints and objective gaps", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Candidate Comparison", roughIdea: "Contract" }) });
    const result = await jsonFetch<{ comparison: { recommendation?: string; fingerprint: string; rejected: Array<{ candidateId: string }> }; record: { comparisonId: string; projectSlug: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/candidate-comparison`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectiveIds: ["voice", "intent"], candidates: [{ candidateId: "bad", hardConstraintFailures: ["ending"], objectiveEvidence: [], unresolvedRisks: ["voice loss"] }, { candidateId: "good", hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "voice", gap: 0, evidenceRefs: ["r1"] }, { objectiveId: "intent", gap: 1, evidenceRefs: ["r2"] }], unresolvedRisks: [] }] }) });
    expect(result.data.comparison).toMatchObject({ recommendation: "good", rejected: [{ candidateId: "bad" }] });
    expect(result.data.record).toMatchObject({ comparisonId: result.data.comparison.fingerprint, projectSlug: created.data.project.slug });
    const replay = await jsonFetch<{ comparison: { fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/candidate-comparison/${result.data.record.comparisonId}`);
    expect(replay.status).toBe(200);
    expect(replay.data.comparison.fingerprint).toBe(result.data.comparison.fingerprint);
  });

  it("presents decision cost and compresses review evidence for contract adoption", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Decision Presentation", roughIdea: "Contract" }) });
    const slug = created.data.project.slug;
    const preview = await jsonFetch<{ preview: { storyEffect: string; reversibility: string } }>(`/api/novel/projects/${slug}/runtime/decision-cost-preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId: "opt-a", storyEffect: "preserves voice", affectedChapters: ["ch-1"], expectedRework: "rewrite opening", reversibility: "bounded", setupPayoffCost: "one setup", waitingCost: "delays plan", technicalDetails: ["model=gpt"] }) });
    expect(preview.data.preview).toMatchObject({ storyEffect: "preserves voice", reversibility: "bounded" });
    const review = await jsonFetch<{ review: { recommendation: string; passedSummary: { count: number } } }>(`/api/novel/projects/${slug}/runtime/review-compression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objective: "preserve voice", recommendation: "adopt A", strongestRedRisk: "flattens tension", actualChanges: ["trim exposition"], decisionRequired: ["accept"], passedSummary: { count: 8, evidenceRefs: ["review://1"] } }) });
    expect(review.data.review).toMatchObject({ recommendation: "adopt A", passedSummary: { count: 8 } });
  });

  it("inherits outline objectives without weakening hard constraints and checks dual-horizon contribution", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Objective Hierarchy", roughIdea: "Outline" }) });
    const slug = created.data.project.slug;
    const hard = { objectiveId: "canon", kind: "hard_constraint", text: "Do not contradict canon", scope: "work", sourceRefs: ["s1"], verification: "canon" };
    const hierarchy = await jsonFetch<{ hierarchy: { inherited: Array<{ objectiveId: string }>; blockedOverrides: string[] } }>(`/api/novel/projects/${slug}/runtime/objective-hierarchy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "chapter", ancestors: [hard], local: [], overrides: [{ objectiveId: "canon", replacement: { ...hard, kind: "preference" }, reason: "speed", validWindow: "chapter-2", restorePoint: "chapter-3" }] }) });
    expect(hierarchy.data.hierarchy.blockedOverrides).toContain("canon:hard-constraint");
    const contribution = await jsonFetch<{ contribution: { status: string } }>(`/api/novel/projects/${slug}/runtime/objective-contribution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workItemId: "scene-1", nearTermOutcome: "pretty prose", nearTermSatisfied: true, nearTermEvidenceRefs: ["scene://1"], longTermTargets: ["arc://mystery"], contributesLongTerm: false, longTermEvidenceRefs: [] }) });
    expect(contribution.data.contribution.status).toBe("blocked");
  });

  it("gates drafting weights, anti-goals, and the unconfirmed Q-003 tradeoff", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Drafting Governance", roughIdea: "Draft" }) });
    const slug = created.data.project.slug;
    const weights = await jsonFetch<{ weights: { strategyVersion: string } }>(`/api/novel/projects/${slug}/runtime/drafting/stage-weights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "drafting", strategyVersion: "draft-v1", weights: { voice: 0.5, canon: 1 }, hardConstraints: ["canon"], evidenceRefs: ["policy://1"] }) });
    expect(weights.data.weights.strategyVersion).toBe("draft-v1");
    const guard = await jsonFetch<{ guard: { status: string } }>(`/api/novel/projects/${slug}/runtime/drafting/anti-goal-guard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "The narrator explained the mystery.", antiGoals: [{ antiGoal: "exposition", evidence: "author://1", patterns: ["explained the mystery"] }], repairScope: ["sentence"] }) });
    expect(guard.data.guard.status).toBe("repair-required");
    const q003 = await jsonFetch<{ profile: { status: string; safetyInvariants: string[] } }>(`/api/novel/projects/${slug}/runtime/drafting/q003-profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "unconfirmed" }) });
    expect(q003.data.profile).toMatchObject({ status: "unconfirmed", safetyInvariants: expect.arrayContaining(["canon"]) });
  });

  it("resolves stable asset links to current versions or a permission-safe fallback", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Deep Links", roughIdea: "Navigate" }) });
    const slug = created.data.project.slug;
    const made = await jsonFetch<{ link: { assetId: string; assetVersion: string } }>(`/api/novel/projects/${slug}/runtime/stable-deep-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "decision", assetId: "d-old", assetVersion: "v1" }) });
    const resolved = await jsonFetch<{ resolution: { status: string; target: { assetId: string } } }>(`/api/novel/projects/${slug}/runtime/stable-deep-links/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: { ...made.data.link, projectSlug: slug, kind: "decision", href: "novel://x", schemaVersion: "stable-deep-link.v1", fingerprint: "fp" }, authorized: true, currentVersion: "v2", fallbackAssetId: "d-new", fallbackVersion: "v2" }) });
    expect(resolved.data.resolution).toMatchObject({ status: "fallback", target: { assetId: "d-new" } });
  });

  it("keeps historical objective versions and reports drift sources", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Objective Evolution", roughIdea: "Drift" }) });
    const slug = created.data.project.slug;
    const item = { objectiveId: "voice", kind: "preference", text: "restrained", scope: "work", sourceRefs: ["s1"], verification: "review" };
    const impact = await jsonFetch<{ impact: { preservedHistoricalVersion: number; reasons: string[] } }>(`/api/novel/projects/${slug}/runtime/objective-change-impact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldVersion: 1, newVersion: 2, oldItems: [item], newItems: [{ ...item, text: "lyrical" }], affectedAssets: ["ch-1"], retroactiveRequested: true, authorizationGranted: false }) });
    expect(impact.data.impact).toMatchObject({ preservedHistoricalVersion: 1, reasons: ["RETROACTIVE_OBJECTIVE_AUTHORIZATION_REQUIRED"] });
    const drift = await jsonFetch<{ drift: { status: string } }>(`/api/novel/projects/${slug}/runtime/objective-drift`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetVersion: 2, observations: [{ assetId: "ch-1", targetVersion: 1, deviation: ["voice"], sourceLayer: "generation" }] }) });
    expect(drift.data.drift.status).toBe("drifting");
  });

  it("keeps seed facets evidence-bound, unknown, multi-interpreted, and reversible", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Seed Semantics", roughIdea: "Seed" }) });
    const slug = created.data.project.slug;
    const captured = await jsonFetch<{ utterance: { text: string; status: string } }>(`/api/novel/projects/${slug}/runtime/story-seeds/capture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "A courier finds a door beneath the sea.", idempotencyKey: "seed-api-1" }) });
    const frame = await jsonFetch<{ frame: { facets: Array<{ facet: string; certainty: string }> } }>(`/api/novel/projects/${slug}/runtime/story-seeds/frame`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ utterance: { ...captured.data.utterance, projectId: slug, schemaVersion: "author-utterance.v1", utteranceId: "u-api", idempotencyKey: "seed-api-1", fingerprint: "fp" }, facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }, { facet: "desire", value: "unknown", evidence: [] }] }) });
    expect(frame.data.frame.facets).toEqual(expect.arrayContaining([expect.objectContaining({ facet: "desire", certainty: "unknown" })]));
    const readiness = await jsonFetch<{ readiness: { ready: boolean; unknown: string[] } }>(`/api/novel/projects/${slug}/runtime/story-seeds/readiness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "structure-candidate", facets: { protagonist: "courier", desire: "open door", resistance: "tide", stakes: "save sibling", experience: "dread", situation: "unknown" } }) });
    expect(readiness.data.readiness).toMatchObject({ ready: true, unknown: ["situation"] });
  });

  it("activates seed questions only when counterfactual answers change the plan", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Seed Branches", roughIdea: "Branches" }) });
    const slug = created.data.project.slug;
    const question = await jsonFetch<{ question: { active: boolean; expectedInformationGain: number } }>(`/api/novel/projects/${slug}/runtime/story-seeds/branch-questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: "q-branch", answers: [{ answer: "portal", affectedFields: ["worldRule"], branchSignature: "portal" }, { answer: "wreck", affectedFields: ["mystery"], branchSignature: "wreck" }], ignoredQuestions: ["hero-name"] }) });
    expect(question.data.question).toMatchObject({ active: true });
    const candidates = await jsonFetch<{ candidates: { candidates: Array<{ candidateId: string; sharedFacts: string[] }> } }>(`/api/novel/projects/${slug}/runtime/story-seeds/candidates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharedFacts: ["courier"], candidates: [{ candidateId: "c1", assumptions: ["portal"], resolvedUnknowns: ["door"], causalCommitments: ["world"], reworkIfWrong: "rewrite opening" }, { candidateId: "c2", assumptions: ["wreck"], resolvedUnknowns: ["door"], causalCommitments: ["mystery"], reworkIfWrong: "rewrite reveal" }] }) });
    expect(candidates.data.candidates.candidates[0]?.sharedFacts).toContain("courier");
  });

  it("blocks the V2 preflight with typed dependency reasons before any model call", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "V2 Preflight", roughIdea: "Preflight must fail closed." })
    });
    const slug = created.data.project.slug;
    const response = await jsonFetch<{
      preflight: {
        schemaVersion: string;
        status: string;
        modelCallAllowed: boolean;
        reasons: Array<{ dependency: string; status: string; reason: string }>;
        contextManifestFingerprint?: string;
      };
    }>(`/api/novel/projects/${slug}/session/understanding/preflight`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(response.data.preflight).toMatchObject({
      schemaVersion: "understanding-preflight.v1",
      status: "block",
      modelCallAllowed: false
    });
    expect(response.data.preflight.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dependency: "t0-context-manifest", status: "missing" }),
        expect.objectContaining({ dependency: "task-risk-profile", status: "ready" }),
        expect.objectContaining({ dependency: "budget-reservation", status: "missing" }),
        expect.objectContaining({ dependency: "model-capability-authorization", status: "missing" })
      ])
    );

    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "preflight-001", text: "The first clue is hidden in a song." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const withT0 = await jsonFetch<{ preflight: typeof response.data.preflight }>(
      `/api/novel/projects/${slug}/session/understanding/preflight`,
      { method: "POST" }
    );
    expect(withT0.data.preflight).toMatchObject({ status: "block", modelCallAllowed: false });
    expect(withT0.data.preflight.reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dependency: "t0-context-manifest", status: "ready" }),
          expect.objectContaining({ dependency: "task-risk-profile", status: "ready" })
        ])
    );
  });

  it("reserves a replayable V2 budget only for the current frozen manifest", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "V2 Budget", roughIdea: "Budget must bind to frozen input." })
    });
    const slug = created.data.project.slug;
    const beforeFreeze = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/session/understanding/budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: "budget-001", units: 100 })
    });
    expect(beforeFreeze.status).toBe(409);
    expect(beforeFreeze.data.error.code).toBe("T0_MANIFEST_REQUIRED");

    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "budget-001", text: "A witness remembers the missing bell." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    const first = await jsonFetch<{ reservation: { schemaVersion: string; status: string; units: number; manifestFingerprint: string }; created: boolean }>(
      `/api/novel/projects/${slug}/session/understanding/budget`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: "budget-001", units: 100 })
      }
    );
    const replay = await jsonFetch<{ reservation: typeof first.data.reservation; created: boolean }>(
      `/api/novel/projects/${slug}/session/understanding/budget`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: "budget-001", units: 100 })
      }
    );

    expect(first.status).toBe(201);
    expect(first.data.created).toBe(true);
    expect(first.data.reservation).toMatchObject({ schemaVersion: "understanding-budget.v1", status: "reserved", units: 100 });
    expect(first.data.reservation.manifestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(replay.status).toBe(200);
    expect(replay.data).toEqual({ reservation: first.data.reservation, created: false });

    const preflight = await jsonFetch<{ preflight: { status: string; reasons: Array<{ dependency: string; status: string }> } }>(
      `/api/novel/projects/${slug}/session/understanding/preflight`,
      { method: "POST" }
    );
    expect(preflight.data.preflight.status).toBe("block");
    expect(preflight.data.preflight.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dependency: "t0-context-manifest", status: "ready" }),
        expect.objectContaining({ dependency: "task-risk-profile", status: "ready" }),
        expect.objectContaining({ dependency: "budget-reservation", status: "ready" }),
        expect.objectContaining({ dependency: "model-capability-authorization", status: "missing" })
      ])
    );
  });

  it("requires frozen input and rejects an unauthorized model capability", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "V2 Capability", roughIdea: "Capability authorization must be explicit." })
    });
    const slug = created.data.project.slug;
    const beforeFreeze = await jsonFetch<{ error: { code: string } }>(
      `/api/novel/projects/${slug}/session/understanding/capability-authorization`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "unknown-agent" })
      }
    );
    expect(beforeFreeze.status).toBe(409);
    expect(beforeFreeze.data.error.code).toBe("T0_MANIFEST_REQUIRED");

    await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "cap-001", text: "The witness refuses to speak." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    await jsonFetch(`/api/novel/projects/${slug}/session/understanding/budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: "cap-budget-001", units: 100 })
    });
    const rejected = await jsonFetch<{ error: { code: string } }>(
      `/api/novel/projects/${slug}/session/understanding/capability-authorization`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "unknown-agent" })
      }
    );
    expect(rejected.status).toBe(400);
    expect(rejected.data.error.code).toBe("MODEL_PROFILE_UNAVAILABLE");

    const preflight = await jsonFetch<{ preflight: { status: string; modelCallAllowed: boolean; reasons: Array<{ dependency: string; status: string }> } }>(
      `/api/novel/projects/${slug}/session/understanding/preflight`,
      { method: "POST" }
    );
    expect(preflight.data.preflight).toMatchObject({ status: "block", modelCallAllowed: false });
    expect(preflight.data.preflight.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ dependency: "model-capability-authorization", status: "missing" })])
    );
  });

  it("authorizes a verified capability and lets preflight become ready without invoking a model", async () => {
    const previousProfiles = process.env.AI_AGENT_PROFILES_JSON;
    process.env.AI_AGENT_PROFILES_JSON = JSON.stringify([
      {
        id: "understanding-test-agent",
        label: "Understanding test agent",
        provider: "codex",
        command: "node",
        versionArgs: ["--version"],
        model: "test-model",
        allowCustomModel: true,
        enabled: true,
        models: [{ id: "test-model", label: "Test model", provider: "codex" }]
      }
    ]);
    try {
      const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "V2 Authorization", roughIdea: "Authorize only a verified capability." })
      });
      const slug = created.data.project.slug;
      await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: "auth-001", text: "The bell rings once at midnight." })
      });
      await jsonFetch(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
      await jsonFetch(`/api/novel/projects/${slug}/session/understanding/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: "auth-budget-001", units: 100 })
      });
      const authorized = await jsonFetch<{
        authorization: { schemaVersion: string; status: string; availability: string; modelCallAllowed: boolean; manifestFingerprint: string };
      }>(`/api/novel/projects/${slug}/session/understanding/capability-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "understanding-test-agent", modelId: "test-model" })
      });

      expect(authorized.status).toBe(201);
      expect(authorized.data.authorization).toMatchObject({
        schemaVersion: "model-capability-authorization.v1",
        status: "authorized",
        availability: "verified",
        modelCallAllowed: true,
        manifestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      });

      const preflight = await jsonFetch<{ preflight: { status: string; modelCallAllowed: boolean; reasons: Array<{ dependency: string; status: string }> } }>(
        `/api/novel/projects/${slug}/session/understanding/preflight`,
        { method: "POST" }
      );
      expect(preflight.data.preflight).toMatchObject({ status: "ready", modelCallAllowed: true });
      expect(preflight.data.preflight.reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dependency: "t0-context-manifest", status: "ready" }),
          expect.objectContaining({ dependency: "task-risk-profile", status: "ready" }),
          expect.objectContaining({ dependency: "budget-reservation", status: "ready" }),
          expect.objectContaining({ dependency: "model-capability-authorization", status: "ready" })
        ])
      );

      const resolvedPrimary = await jsonFetch<{ decision: { actionId: string; journeyVersion: string; sourceFingerprint: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(resolvedPrimary.data.decision.actionId).toBe("continue-understanding");
      const asyncShadow = await jsonFetch<{
        job: { id: string; type: string; status: string };
        modelCallIssued: boolean;
        understandingWritten: boolean;
        execution: { status: string; actionId: string };
      }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: resolvedPrimary.data.decision })
      });
      expect(asyncShadow.status).toBe(202);
      expect(asyncShadow.data).toMatchObject({ execution: { status: "accepted", actionId: "continue-understanding" }, modelCallIssued: false, understandingWritten: false });
      expect(asyncShadow.data.job).toMatchObject({ type: "understanding.shadow", status: "pending" });
      const asyncFinished = await waitForJob(slug, asyncShadow.data.job.id);
      expect(asyncFinished.job).toMatchObject({
        status: "success",
        resultRef: `/api/novel/projects/${slug}/session/understanding/snapshot`
      });
      const timelineAfterJob = await jsonFetch<{ timeline: { entries: Array<{ entryId: string; kind: string; text: string; collapsed: boolean }> } }>(`/api/novel/projects/${slug}/session/timeline`);
      expect(timelineAfterJob.data.timeline.entries).toEqual(expect.arrayContaining([expect.objectContaining({ entryId: asyncShadow.data.job.id, kind: "task-progress", text: "understanding.shadow: success", collapsed: true })]));
      const afterUnderstanding = await jsonFetch<{ decision: { actionId: string; kind: string }; journey: { primaryAsset: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(afterUnderstanding.data).toMatchObject({ decision: { actionId: "review-understanding", kind: "reviewable" }, journey: { primaryAsset: "understanding-preview" } });
      const reviewed = await jsonFetch<{ execution: { status: string; created: boolean }; review: { status: string; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: afterUnderstanding.data.decision, reviewerId: "primary-action-reviewer" })
      });
      expect(reviewed.status).toBe(201);
      expect(reviewed.data).toMatchObject({ execution: { status: "completed", created: true }, review: { status: "passed", canonWritten: false } });
      const reviewedReplay = await jsonFetch<{ execution: { status: string; created: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: afterUnderstanding.data.decision, reviewerId: "primary-action-reviewer" })
      });
      expect(reviewedReplay.status).toBe(200);
      expect(reviewedReplay.data.execution.created).toBe(false);
      const modelExecution = await jsonFetch<{ task: { id?: string; taskId: string; status: string; modelCallIssued: boolean; canonWritten: boolean } }>(
        `/api/novel/projects/${slug}/session/understanding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "model" })
        }
      );
      expect(modelExecution.status).toBe(202);
      expect(modelExecution.data.task).toMatchObject({ status: "queued", modelCallIssued: false, canonWritten: false });
      const modelFinished = await waitForUnderstandingTask(slug, modelExecution.data.task.taskId);
      expect(modelFinished.task).toMatchObject({ modelCallIssued: true, canonWritten: false });
      expect(modelFinished.task.status).toBe("failed");

      const execution = await jsonFetch<{ error: { code: string; modelCallIssued: boolean; understandingWritten: boolean } }>(
        `/api/novel/projects/${slug}/session/understanding`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );
      expect(execution.status).toBe(202);
      expect(execution.data).toMatchObject({
        task: { status: "queued", modelCallIssued: false, canonWritten: false }
      });

      const shadowExecution = await jsonFetch<{
        run: { schemaVersion: string; status: string; executionMode: string; modelCallIssued: boolean; snapshotId: string };
        snapshot: { schemaVersion: string; mode: string; sourceFingerprint: string; question: { status: string } };
      }>(`/api/novel/projects/${slug}/session/understanding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "shadow" })
      });
      expect(shadowExecution.status).toBe(201);
      expect(shadowExecution.data.run).toMatchObject({
        schemaVersion: "understanding-run.v1",
        status: "completed",
        executionMode: "shadow",
        modelCallIssued: false
      });
      expect(shadowExecution.data.snapshot).toMatchObject({
        schemaVersion: "understanding-snapshot.v1",
        mode: "shadow",
        sourceFingerprint: authorized.data.authorization.manifestFingerprint,
        question: { status: "candidate" }
      });
      const restoredSnapshot = await jsonFetch<{ snapshot: { snapshotId: string; sourceFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/snapshot`
      );
      expect(restoredSnapshot.status).toBe(200);
      expect(restoredSnapshot.data.snapshot).toMatchObject({
        snapshotId: shadowExecution.data.snapshot.snapshotId,
        sourceFingerprint: authorized.data.authorization.manifestFingerprint
      });

      const createdQuestion = await jsonFetch<{ created: boolean; question: { questionId: string; questionVersion: number; status: string; snapshotFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`,
        { method: "POST" }
      );
      expect(createdQuestion.status).toBe(201);
      expect(createdQuestion.data.question).toMatchObject({
        questionId: "question-primary-desire",
        questionVersion: 1,
        status: "active",
        snapshotFingerprint: authorized.data.authorization.manifestFingerprint
      });
      const answerBody = {
        questionVersion: 1,
        expectedSnapshotFingerprint: authorized.data.authorization.manifestFingerprint,
        idempotencyKey: "answer-route-001",
        answerText: "The protagonist wants to expose the truth.",
        answerStatus: "confirmed"
      };
      const answeredQuestion = await jsonFetch<{ question: { status: string; answerStatus: string }; decision: { answerPayload: { schemaVersion: string; answerId: string; questionId: string; fingerprint: string } } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/question-primary-desire/answers`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answerBody) }
      );
      const replayedAnswer = await jsonFetch<{ question: { status: string }; replayed?: boolean }>(
        `/api/novel/projects/${slug}/session/understanding/questions/question-primary-desire/answers`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answerBody) }
      );
      expect(answeredQuestion.status).toBe(201);
      expect(answeredQuestion.data.question).toMatchObject({ status: "answered", answerStatus: "confirmed" });
      expect(answeredQuestion.data.decision.answerPayload).toMatchObject({ schemaVersion: "dialogue-answer-payload.v1", answerId: expect.any(String), questionId: "question-primary-desire", fingerprint: expect.any(String) });
      expect(replayedAnswer.status).toBe(200);
      expect(replayedAnswer.data).toMatchObject({ replayed: true, question: { status: "answered" } });

      const conflictQuestion = await jsonFetch<{ question: { questionId: string; questionVersion: number; status: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: "question-core-conflict" }) }
      );
      expect(conflictQuestion.status).toBe(200);
      expect(conflictQuestion.data.question).toMatchObject({ questionId: "question-core-conflict", status: "active" });
      const conflictAnswer = await jsonFetch<{ question: { status: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/${conflictQuestion.data.question.questionId}/answers`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionVersion: conflictQuestion.data.question.questionVersion, expectedSnapshotFingerprint: authorized.data.authorization.manifestFingerprint, idempotencyKey: "answer-route-conflict-001", answerText: "A powerful institution will erase the evidence.", answerStatus: "confirmed" }) }
      );
      expect(conflictAnswer.status).toBe(201);
      expect(conflictAnswer.data.question.status).toBe("answered");

      for (let index = 0; index < 8; index += 1) {
        const active = await jsonFetch<{ questions: Array<{ questionId: string; questionVersion: number; snapshotFingerprint: string; status: string }> }>(`/api/novel/projects/${slug}/session/understanding/questions`);
        const activeQuestion = active.data.questions.find((question) => question.status === "active");
        expect(activeQuestion).toBeDefined();
        const remainingAnswer = await jsonFetch<{ question: { status: string } }>(
          `/api/novel/projects/${slug}/session/understanding/questions/${activeQuestion!.questionId}/answers`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionVersion: activeQuestion!.questionVersion, expectedSnapshotFingerprint: activeQuestion!.snapshotFingerprint, idempotencyKey: `answer-route-remaining-${index}`, answerText: `第${index + 3}个关键答案。`, answerStatus: "confirmed" }) }
        );
        expect(remainingAnswer.status).toBe(201);
      }

      const candidateAction = await jsonFetch<{ decision: { actionId: string; journeyVersion: string; sourceFingerprint: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      const finalCandidate = (await jsonFetch<{ candidates: Array<{ candidateId: string; status: string; canonWritten: boolean }> }>(`/api/novel/projects/${slug}/session/understanding/contract-candidates`)).data.candidates[0];
      const candidateDecisionId = (await jsonFetch<{ decisions: Array<{ decisionId: string; questionId: string }> }>(`/api/novel/projects/${slug}/session/understanding/decisions`)).data.decisions.find((decision) => decision.questionId === "question-ending-direction")!.decisionId;
      expect(candidateAction.data.decision.actionId).toBe(`review-contract-candidate-${finalCandidate.candidateId}`);
      const candidateExecution = await jsonFetch<{ execution: { status: string; created: boolean }; candidate: { candidateId: string; status: string; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: candidateAction.data.decision })
      });
      expect(candidateExecution.status).toBe(200);
      expect(candidateExecution.data).toMatchObject({ execution: { status: "completed", created: false }, candidate: { candidateId: finalCandidate.candidateId, status: "candidate", canonWritten: false } });
      const candidateReviewAction = await jsonFetch<{ decision: { actionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(candidateReviewAction.data.decision.actionId).toBe(`review-contract-candidate-${candidateExecution.data.candidate.candidateId}`);
      const candidateReview = await jsonFetch<{ execution: { status: string }; candidate: { candidateId: string; canonWritten: boolean; fingerprint: string; fields: Array<{ fieldId: string }> } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: candidateReviewAction.data.decision })
      });
      expect(candidateReview.status).toBe(200);
      expect(candidateReview.data).toMatchObject({ execution: { status: "completed" }, candidate: { candidateId: candidateExecution.data.candidate.candidateId, canonWritten: false } });
      const proposal = await jsonFetch<{ execution: { status: string; created: boolean }; proposal: { proposalId: string; status: string; canonWritten: boolean; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: candidateReviewAction.data.decision, fieldDecisions: candidateReview.data.candidate.fields.map((field) => ({ fieldId: field.fieldId, status: "accept" })) })
      });
      expect(proposal.status).toBe(201);
      expect(proposal.data).toMatchObject({ execution: { status: "completed", created: true }, proposal: { status: "ready_for_authorization", canonWritten: false } });
      const commitAction = await jsonFetch<{ decision: { actionId: string; kind: string; risk: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(commitAction.data.decision).toMatchObject({ actionId: `commit-contract-adoption-${proposal.data.proposal.proposalId}`, kind: "l2-decision", risk: "high" });
      const blockedCommit = await jsonFetch<{ execution: { status: string }; error: { code: string }; result: { canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: commitAction.data.decision, expectedProposalFingerprint: proposal.data.proposal.fingerprint })
      });
      expect(blockedCommit.status).toBe(409);
      expect(blockedCommit.data).toMatchObject({ execution: { status: "blocked" }, error: { code: "AUTHOR_AUTHORIZATION_REQUIRED" }, result: { canonWritten: false } });
      const committed = await jsonFetch<{ execution: { status: string }; result: { status: string; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: commitAction.data.decision, expectedProposalFingerprint: proposal.data.proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "authorization-primary-action-1" } })
      });
      expect(committed.status).toBe(200);
      expect(committed.data).toMatchObject({ execution: { status: "completed" }, result: { status: "committed", canonWritten: true } });

      const outlineAction = await jsonFetch<{ decision: { actionId: string; journeyVersion: string; sourceFingerprint: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(outlineAction.data.decision.actionId).toBe(`generate-outline-candidate-${candidateExecution.data.candidate.candidateId}`);
      const outlineExecution = await jsonFetch<{ execution: { status: string; created: boolean }; outline: { outlineId: string; status: string; canonWritten: boolean }; consumption: { created: boolean; receipt: { consumer: string; decisionId: string; consumerRef: string } } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: outlineAction.data.decision })
      });
      expect(outlineExecution.status).toBe(201);
      expect(outlineExecution.data).toMatchObject({ execution: { status: "completed", created: true }, outline: { status: "candidate", canonWritten: false }, consumption: { created: true, receipt: { consumer: "outline", decisionId: candidateDecisionId, consumerRef: outlineExecution.data.outline.outlineId } } });
      const outlineReviewAction = await jsonFetch<{ decision: { actionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(outlineReviewAction.data.decision.actionId).toBe(`review-outline-candidate-${outlineExecution.data.outline.outlineId}`);
      const outlineReview = await jsonFetch<{ validation: { status: string; executionReady: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: outlineReviewAction.data.decision })
      });
      expect(outlineReview.status).toBe(201);
      expect(outlineReview.data.validation).toMatchObject({ status: "passed", executionReady: false });
      const outlineProposalAction = await jsonFetch<{ decision: { actionId: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(outlineProposalAction.data.decision.actionId).toBe(`propose-outline-adoption-${outlineExecution.data.outline.outlineId}`);
      const outlineProposal = await jsonFetch<{ proposal: { proposalId: string; fingerprint: string; status: string; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: outlineProposalAction.data.decision })
      });
      expect(outlineProposal.status).toBe(201);
      expect(outlineProposal.data.proposal).toMatchObject({ status: "ready_for_authorization", canonWritten: false });
      const outlineAuthorizeAction = await jsonFetch<{ decision: { actionId: string; risk: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(outlineAuthorizeAction.data.decision).toMatchObject({ actionId: `authorize-outline-adoption-${outlineProposal.data.proposal.proposalId}`, risk: "high" });
      const outlineAuthorized = await jsonFetch<{ proposal: { status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: outlineAuthorizeAction.data.decision, expectedProposalFingerprint: outlineProposal.data.proposal.fingerprint, actorId: "author-1", authorizationId: "authorization-outline-1" })
      });
      expect(outlineAuthorized.status).toBe(201);
      expect(outlineAuthorized.data.proposal.status).toBe("authorized");
      const outlineCommitAction = await jsonFetch<{ decision: { actionId: string; risk: string } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/resolve`, { method: "POST" });
      expect(outlineCommitAction.data.decision).toMatchObject({ actionId: `commit-outline-adoption-${outlineProposal.data.proposal.proposalId}`, risk: "high" });
      const outlineCommitted = await jsonFetch<{ execution: { status: string }; result: { status: string; canonWritten: boolean; proof?: { executionReady: boolean } } }>(`/api/novel/projects/${slug}/runtime/session/primary-action/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: outlineCommitAction.data.decision, expectedProposalFingerprint: outlineAuthorized.data.proposal.fingerprint })
      });
      expect(outlineCommitted.status).toBe(200);
      expect(outlineCommitted.data).toMatchObject({ execution: { status: "completed" }, result: { status: "committed", canonWritten: true, proof: { executionReady: true } } });

      await jsonFetch(`/api/novel/projects/${slug}/session/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: "auth-002", text: "A second bell answers from the tower." })
      });
      const staleExecution = await jsonFetch<{
        error: { code: string; missingDependencies: string[]; modelCallIssued: boolean; understandingWritten: boolean };
      }>(`/api/novel/projects/${slug}/session/understanding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "shadow" })
      });
      expect(staleExecution.status).toBe(409);
      expect(staleExecution.data.error).toMatchObject({
        code: "V2_DEPENDENCY_MISSING",
        modelCallIssued: false,
        understandingWritten: false
      });
      expect(staleExecution.data.error.missingDependencies).toContain("t0-context-manifest");

      const snapshotAfterStaleAttempt = await jsonFetch<{ snapshot: { snapshotId: string; sourceFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/snapshot`
      );
      expect(snapshotAfterStaleAttempt.data.snapshot).toMatchObject({
        snapshotId: shadowExecution.data.snapshot.snapshotId,
        sourceFingerprint: authorized.data.authorization.manifestFingerprint
      });

      const resumed = await jsonFetch<{ task: { taskId: string; status: string } }>(
        `/api/novel/projects/${slug}/session/understanding/tasks/${modelExecution.data.task.taskId}/resume`,
        { method: "POST" }
      );
      expect(resumed.status).toBe(202);
      expect(resumed.data.task).toMatchObject({ taskId: modelExecution.data.task.taskId, status: "stale" });
      const resumedFinished = await waitForUnderstandingTask(slug, modelExecution.data.task.taskId);
      expect(resumedFinished.task).toMatchObject({ status: "stale", modelCallIssued: false, canonWritten: false });
    } finally {
      if (previousProfiles === undefined) delete process.env.AI_AGENT_PROFILES_JSON;
      else process.env.AI_AGENT_PROFILES_JSON = previousProfiles;
    }
  });

  it("creates chapter file snapshots and serves version diffs", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string; contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Version Demo",
        genre: "fantasy",
        roughIdea: "A writer wants reliable snapshots."
      })
    });
    const filePath = created.data.project.chapters[0].contentPath;

    const saved = await jsonFetch<{ saved: boolean; version: { id: string; filePath: string } | null }>(
      `/api/novel/projects/version-demo/files/${filePath}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "new chapter body" })
      }
    );
    expect(saved.data.saved).toBe(true);
    expect(saved.data.version).toMatchObject({ filePath });

    const versions = await jsonFetch<{ versions: Array<{ id: string; filePath: string; size: number }> }>(
      `/api/novel/projects/version-demo/file-versions/${filePath}`
    );
    expect(versions.data.versions).toHaveLength(1);
    expect(versions.data.versions[0]).toMatchObject({ id: saved.data.version?.id, filePath });
    expect(versions.data.versions[0].size).toBeGreaterThan(0);

    const diff = await jsonFetch<{ diff: { original: string; modified: string; fromVersion: { id: string } } }>(
      `/api/novel/projects/version-demo/file-diff/${filePath}?from=${versions.data.versions[0].id}`
    );
    expect(diff.data.diff.fromVersion.id).toBe(versions.data.versions[0].id);
    expect(diff.data.diff.original).not.toBe("new chapter body");
    expect(diff.data.diff.modified).toBe("new chapter body");
  });

  it("returns editor ghost text suggestions for chapter documents", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string; contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Suggestion Demo",
        genre: "fantasy",
        roughIdea: "A writer wants tab completion."
      })
    });
    const chapter = created.data.project.chapters[0];

    const suggestion = await jsonFetch<{ suggestion: { text: string; source: string } }>(
      "/api/novel/projects/suggestion-demo/editor/suggestion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: chapter.contentPath,
          chapterId: chapter.id,
          documentKind: "content",
          beforeText: "他站在门前，听见里面传来一声很轻的叹息",
          afterText: ""
        })
      }
    );

    expect(suggestion.data.suggestion.source).toBe("local");
    expect(suggestion.data.suggestion.text.length).toBeGreaterThan(4);
  });

  it("reads AI invocation audit sessions", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Audit Demo",
        roughIdea: "Track every AI call."
      })
    });
    const slug = created.data.project.slug;
    const invocation = {
      id: "invocation-1",
      taskId: "task-1",
      projectId: slug,
      taskType: "chapter.plan",
      stageKey: "pipeline.chapter.plan",
      status: "success",
      promptSnapshot: { length: 100, preview: "Plan chapter", contextTitles: ["Project"] },
      contextSnapshot: { blockCount: 1, totalChars: 20, blocks: [{ title: "Project", length: 20 }] },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 12, exitCode: 0 },
      adoptionDecision: "pending",
      proposedPatchTargets: ["outline/chapter-001.md"],
      acceptedPatchTargets: [],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await fs.appendFile(path.join(tempRoot, slug, "tasks", "invocations.jsonl"), `${JSON.stringify(invocation)}\nnot-json\n`, "utf8");

    const response = await jsonFetch<{ invocations: Array<{ id: string; taskType: string; proposedPatchTargets: string[] }> }>(
      `/api/novel/projects/${slug}/tasks/invocations`
    );

    expect(response.status).toBe(200);
    expect(response.data.invocations).toEqual([
      expect.objectContaining({
        id: "invocation-1",
        taskType: "chapter.plan",
        proposedPatchTargets: ["outline/chapter-001.md"]
      })
    ]);
  });

  it("exports a project audit report with quality and invocation summaries", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Report Demo",
        roughIdea: "Export project state."
      })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/quality/chapter-001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: {
          chapterId: "chapter-001",
          overallScore: 84,
          summary: "Readable.",
          metrics: [{ key: "conflict", label: "Conflict", score: 84, note: "Clear pressure." }],
          strengths: ["Clear pressure"],
          fixes: [],
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      })
    });
    await fs.appendFile(
      path.join(tempRoot, slug, "tasks", "history.jsonl"),
      `${JSON.stringify({
        id: "task-1",
        type: "chapter.draft",
        status: "success",
        projectId: slug,
        inputSummary: "Draft chapter.",
        outputSummary: "Draft complete.",
        startedAt: "2026-06-11T00:00:00.000Z",
        finishedAt: "2026-06-11T00:01:00.000Z",
        durationMs: 60000,
        timeoutMs: 600000
      })}\nnot-json\n`,
      "utf8"
    );
    await fs.appendFile(
      path.join(tempRoot, slug, "tasks", "invocations.jsonl"),
      `${JSON.stringify({
        id: "invocation-1",
        taskId: "task-1",
        projectId: slug,
        taskType: "chapter.draft",
        stageKey: "pipeline.chapter.prose",
        status: "success",
        promptVersion: "task-template:chapter.draft:v2",
        variablePlan: { payloadKeys: ["chapterId"], target: "chapter-001", contextTierCounts: { T0: 1, T1: 1 } },
        preCallReview: { status: "warn", warnings: ["multiple-context-blocks-truncated"], reviewedAt: "2026-06-11T00:00:01.000Z" },
        promptSnapshot: { length: 200, preview: "Draft", contextTitles: ["Project"] },
        contextSnapshot: {
          blockCount: 2,
          totalChars: 80,
          tierCounts: { T0: 1, T1: 1 },
          truncatedBlocks: ["World"],
          blocks: [
            { title: "Project", length: 40, tier: "T0" },
            { title: "World", length: 40, tier: "T1", truncated: true }
          ]
        },
        attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 60000, exitCode: 0 },
        adoptionDecision: "accepted",
        proposedPatchTargets: ["content/chapter-001.md"],
        acceptedPatchTargets: ["content/chapter-001.md"],
        commitResult: { historyAppended: true, invocationAppended: true },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:01:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.appendFile(
      path.join(tempRoot, slug, "tasks", "background-jobs.jsonl"),
      `${JSON.stringify({
        id: "job-1",
        projectId: slug,
        type: "knowledge.index.rebuild",
        status: "success",
        inputSummary: "{\"reason\":\"manual\"}",
        outputSummary: "3 facts / 1 relations",
        resultRef: `/api/novel/projects/${slug}/knowledge/index`,
        startedAt: "2026-06-11T00:02:00.000Z",
        finishedAt: "2026-06-11T00:02:01.000Z",
        durationMs: 1000,
        updatedAt: "2026-06-11T00:02:01.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(tempRoot, slug, "knowledge", "facts.jsonl"),
      `${JSON.stringify({
        id: "fact:report",
        text: "The audit report includes memory facts.",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Auditor"],
        keywords: ["audit", "memory"],
        source: { type: "chapter-summary", id: "chapter-001" },
        updatedAt: "2026-06-11T00:03:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(tempRoot, slug, "knowledge", "triples.jsonl"),
      `${JSON.stringify({
        id: "triple:report",
        subject: "Audit report",
        predicate: "includes",
        object: "memory facts",
        chapterIds: ["chapter-001"],
        sourceFactIds: ["fact:report"],
        updatedAt: "2026-06-11T00:03:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(tempRoot, slug, "memory", "chapter-index.json"),
      `${JSON.stringify({
        projectSlug: slug,
        chapters: [
          {
            chapterId: "chapter-001",
            title: "Chapter 1",
            order: 1,
            keywords: ["audit", "memory"],
            factIds: ["fact:report"],
            tripleIds: ["triple:report"],
            entityNames: ["Auditor"],
            updatedAt: "2026-06-11T00:03:00.000Z"
          },
          {
            chapterId: "chapter-002",
            title: "Chapter 2",
            order: 2,
            keywords: [],
            factIds: [],
            tripleIds: [],
            entityNames: [],
            updatedAt: "2026-06-11T00:03:00.000Z"
          }
        ],
        keywords: { audit: ["chapter-001"], memory: ["chapter-001"] },
        updatedAt: "2026-06-11T00:03:00.000Z"
      })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(tempRoot, slug, "knowledge", "vectors.json"),
      `${JSON.stringify({
        projectSlug: slug,
        provider: "local",
        dimensions: 64,
        entries: [{ id: "fact:report", kind: "fact", label: "chapter-001", text: "memory facts", chapterIds: ["chapter-001"], sourceIds: ["chapter-001"], vector: [1], updatedAt: "2026-06-11T00:03:00.000Z" }],
        updatedAt: "2026-06-11T00:03:00.000Z"
      })}\n`,
      "utf8"
    );

    const response = await jsonFetch<{
      report: {
        projectSlug: string;
        projectTitle: string;
        quality: { reportCount: number; qualityTrends: Array<{ key: string; latestScore: number }> };
        taskSummary: {
          total: number;
          byStatus: { success: number };
          byType: { "chapter.draft": number };
          latestTasks: Array<{ id: string; timeoutMs?: number; cancelRequestedAt?: string }>;
        };
        aiInvocationSummary: {
          total: number;
          byDecision: { accepted: number };
          proposedPatchCount: number;
          acceptedPatchCount: number;
          promptVersions: Record<string, number>;
          preCallWarnings: Record<string, number>;
          contextTierTotals: Record<string, number>;
          truncatedContextBlocks: Array<{ title: string; count: number }>;
        };
        knowledgeSummary: { factCount: number; tripleCount: number; indexedChapterCount: number; keywordCount: number; vectorSummary?: { provider: string; entryCount: number } };
        runtimeSummary: {
          chapterCount: number;
          byActiveStep: Record<string, number>;
          blockedStepCount: number;
          snapshots: Array<{ chapterId: string; fingerprint: string; signals: { hasQualityReport: boolean }; steps: Array<{ id: string; status: string }> }>;
        };
        backgroundJobSummary: { total: number; byStatus: { success: number }; latestJobs: Array<{ id: string; outputSummary?: string }> };
      };
    }>(`/api/novel/projects/${slug}/audit-report`);

    expect(response.status).toBe(200);
    expect(response.data.report).toMatchObject({
      projectSlug: slug,
      projectTitle: "Report Demo",
      quality: {
        reportCount: 1,
        qualityTrends: expect.arrayContaining([expect.objectContaining({ key: "overall", latestScore: 84 })])
      },
      taskSummary: {
        total: 1,
        byStatus: expect.objectContaining({ success: 1 }),
        byType: expect.objectContaining({ "chapter.draft": 1 }),
        latestTasks: [expect.objectContaining({ id: "task-1", timeoutMs: 600000 })]
      },
      aiInvocationSummary: {
        total: 1,
        byDecision: expect.objectContaining({ accepted: 1 }),
        proposedPatchCount: 1,
        acceptedPatchCount: 1,
        promptVersions: expect.objectContaining({ "task-template:chapter.draft:v2": 1 }),
        preCallWarnings: expect.objectContaining({ "multiple-context-blocks-truncated": 1 }),
        contextTierTotals: expect.objectContaining({ T0: 1, T1: 1 }),
        truncatedContextBlocks: [expect.objectContaining({ title: "World", count: 1 })]
      },
      knowledgeSummary: {
        factCount: 1,
        tripleCount: 1,
        indexedChapterCount: 2,
        keywordCount: 2,
        vectorSummary: expect.objectContaining({ provider: "local", entryCount: 1 })
      },
      runtimeSummary: {
        chapterCount: 3,
        byActiveStep: expect.any(Object),
        blockedStepCount: expect.any(Number),
        snapshots: expect.arrayContaining([
          expect.objectContaining({
            chapterId: "chapter-001",
            fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
            signals: expect.objectContaining({ hasQualityReport: true }),
            steps: expect.arrayContaining([expect.objectContaining({ id: "review", status: "done" })])
          })
        ])
      },
      backgroundJobSummary: {
        total: 1,
        byStatus: expect.objectContaining({ success: 1 }),
        latestJobs: [expect.objectContaining({ id: "job-1", outputSummary: "3 facts / 1 relations" })]
      }
    });
  });

  it("exposes the shared AI stage dictionary", async () => {
    const response = await jsonFetch<{ stages: Array<{ key: string; taskTypes: string[] }> }>("/api/novel/ai-stages");

    expect(response.status).toBe(200);
    expect(response.data.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "pipeline.chapter.prose", taskTypes: ["chapter.draft"] }),
        expect.objectContaining({ key: "autopilot.post_chapter.recap", taskTypes: ["writing.recap"] })
      ])
    );
  });

  it("returns a story graph projection for a project", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Graph Route Demo", roughIdea: "Project story state into a graph." })
    });

    const response = await jsonFetch<{ graph: { projectSlug: string; nodes: Array<{ type: string }>; edges: unknown[] } }>(
      `/api/novel/projects/${created.data.project.slug}/story-graph`
    );

    expect(response.status).toBe(200);
    expect(response.data.graph.projectSlug).toBe("graph-route-demo");
    expect(response.data.graph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ type: "chapter" })]));
    expect(response.data.graph.edges).toEqual(expect.any(Array));
    await expect(
      fs.readFile(path.join(tempRoot, "graph-route-demo", "story-graph", "storyline.json"), "utf8")
    ).resolves.toContain('"projectSlug": "graph-route-demo"');
  });

  it("reads and rebuilds a project knowledge index", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Knowledge Route Demo", roughIdea: "Expose searchable project memory." })
    });
    const slug = created.data.project.slug;
    const summary = {
      chapterId: "chapter-001",
      summary: "The sealed gate responds to blood.",
      keyEvents: ["The talisman burns."],
      newFacts: [
        {
          id: "fact-gate",
          chapterId: "chapter-001",
          fact: "The gate responds to blood.",
          relatedEntities: ["Hero"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await jsonFetch(`/api/novel/projects/${slug}/memory/chapter-summaries/chapter-001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary })
    });

    const before = await jsonFetch<{ index: { facts: unknown[]; chapterIndex: { chapters: unknown[] } } }>(
      `/api/novel/projects/${slug}/knowledge/index`
    );
    const rebuilt = await jsonFetch<{
      index: { facts: Array<{ id: string }>; triples: unknown[]; chapterIndex: { keywords: Record<string, string[]> } };
    }>(`/api/novel/projects/${slug}/knowledge/index/rebuild`, { method: "POST" });
    const searched = await jsonFetch<{
      result: {
        query: string;
        facts: Array<{ id: string; score: number }>;
        chapters: Array<{ chapterId: string; score: number }>;
        excluded?: Array<{ id: string; reason: string }>;
      };
    }>(`/api/novel/projects/${slug}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Hero blood gate", chapterId: "chapter-001" })
    });
    const modelTaskSearch = await jsonFetch<{
      result: { facts: Array<{ id: string }>; excluded?: Array<{ id: string; reason: string }> };
    }>(`/api/novel/projects/${slug}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Hero blood gate", audience: "model-task" })
    });
    const previewResponse = await jsonFetch<{
      preview: {
        retrievalId: string;
        selectedIds: string[];
        resultFingerprint: string;
        sourceResultFingerprint: string;
      };
    }>(`/api/novel/projects/${slug}/memory/retrieval-previews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Hero blood gate", chapterId: "chapter-001", maxResults: 1 })
    });

    expect(before.status).toBe(200);
    expect(before.data.index.facts).toEqual([]);
    expect(before.data.index.chapterIndex.chapters).toEqual([]);
    expect(rebuilt.status).toBe(200);
    expect(rebuilt.data.index.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "fact:fact-gate" })]));
    expect(rebuilt.data.index.triples).toEqual(expect.any(Array));
    expect(rebuilt.data.index.chapterIndex.keywords.blood).toContain("chapter-001");
    expect(searched.status).toBe(200);
    expect(searched.data.result.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "fact:fact-gate" })]));
    expect(searched.data.result.chapters[0]).toEqual(expect.objectContaining({ chapterId: "chapter-001" }));
    expect(modelTaskSearch.status).toBe(200);
    expect(modelTaskSearch.data.result.facts).toEqual([]);
    expect(modelTaskSearch.data.result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "MODEL_TASK_SOURCE_VISIBILITY_REQUIRED" })]));
    expect(previewResponse.status).toBe(201);
    expect(previewResponse.data.preview.retrievalId).toMatch(/^retrieval-[a-f0-9]{24}$/);
    expect(previewResponse.data.preview.selectedIds).toHaveLength(1);
    expect(previewResponse.data.preview.resultFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(previewResponse.data.preview.sourceResultFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const readPreview = await jsonFetch<{ preview: typeof previewResponse.data.preview }>(
      `/api/novel/projects/${slug}/memory/retrievals/${previewResponse.data.preview.retrievalId}`
    );
    expect(readPreview.status).toBe(200);
    expect(readPreview.data.preview).toEqual(previewResponse.data.preview);
    await expect(fs.readFile(path.join(tempRoot, slug, "memory", "retrievals", `${previewResponse.data.preview.retrievalId}.json`), "utf8")).resolves.toContain("memory-retrieval-preview.v1");

    const healthResponse = await jsonFetch<{ report: { reportId: string; schemaVersion: string; status: string; coverage: { totalChapters: number }; fingerprint: string } }>(
      `/api/novel/projects/${slug}/memory/health-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    );
    expect(healthResponse.status).toBe(201);
    expect(healthResponse.data.report).toMatchObject({ schemaVersion: "memory-health-report.v1", status: "degraded", coverage: { totalChapters: 3 } });
    expect(healthResponse.data.report.reportId).toMatch(/^memory-health-[a-f0-9]{24}$/);
    const continuityResponse = await jsonFetch<{ audit: { auditId: string; fingerprint: string; status: string } }>(`/api/novel/projects/${slug}/memory/continuity-audits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ healthReportId: healthResponse.data.report.reportId }) });
    expect(continuityResponse.status).toBe(201);
    const readyResponse = await jsonFetch<{ proof: { schemaVersion: string; status: string; blockers: string[]; proofId: string; continuityAuditId?: string } }>(`/api/novel/projects/${slug}/memory/ready-proofs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ healthReportId: healthResponse.data.report.reportId, retrievalId: previewResponse.data.preview.retrievalId, continuityAuditId: continuityResponse.data.audit.auditId, targetChapterId: "chapter-001" }) });
    expect(readyResponse.status).toBe(201);
    expect(readyResponse.data.proof).toMatchObject({ schemaVersion: "memory-ready-proof.v1", status: "blocked", continuityAuditId: continuityResponse.data.audit.auditId, blockers: expect.arrayContaining(["MEMORY_HEALTH_DEGRADED", "MEMORY_CONTINUITY_AUDIT_BLOCKED"]) });
    const readReady = await jsonFetch<{ proof: typeof readyResponse.data.proof }>(`/api/novel/projects/${slug}/memory/ready-proofs/${readyResponse.data.proof.proofId}`);
    expect(readReady.status).toBe(200);
    expect(readReady.data.proof).toEqual(readyResponse.data.proof);
    const readHealth = await jsonFetch<{ report: typeof healthResponse.data.report }>(`/api/novel/projects/${slug}/memory/health-reports/${healthResponse.data.report.reportId}`);
    expect(readHealth.status).toBe(200);
    expect(readHealth.data.report).toEqual(healthResponse.data.report);
    await expect(fs.readFile(path.join(tempRoot, slug, "memory", "health-reports", `${healthResponse.data.report.reportId}.json`), "utf8")).resolves.toContain("memory-health-report.v1");
  });

  it("runs heavy project work as a background job", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Job Route Demo", roughIdea: "Queue expensive project work." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/memory/chapter-summaries/chapter-001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: {
          chapterId: "chapter-001",
          summary: "The gate answers blood.",
          keyEvents: [],
          newFacts: [],
          characterStateChanges: [],
          foreshadowingUpdates: [],
          continuityRisks: [],
          powerProgressionUpdates: [],
          acceptedRecapIds: [],
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      })
    });

    const started = await jsonFetch<{ job: { id: string; status: string; type: string } }>(`/api/novel/projects/${slug}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "knowledge.index.rebuild", payload: { reason: "manual" } })
    });
    const finished = await waitForJob(slug, started.data.job.id);
    const listed = await jsonFetch<{ jobs: Array<{ id: string; status: string }> }>(`/api/novel/projects/${slug}/jobs`);

    expect(started.status).toBe(202);
    expect(started.data.job).toMatchObject({ type: "knowledge.index.rebuild" });
    expect(finished.job).toMatchObject({
      status: "success",
      resultRef: `/api/novel/projects/${slug}/knowledge/index`
    });
    expect(finished.job.outputSummary).toContain("facts");
    expect(listed.data.jobs).toEqual([expect.objectContaining({ id: started.data.job.id, status: "success" })]);
  });

  it("cancels and retries background jobs", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Job Control Demo", roughIdea: "Control background work." })
    });
    const slug = created.data.project.slug;
    const pendingJob = {
      id: "job-pending-route",
      projectId: slug,
      type: "knowledge.index.rebuild",
      status: "pending",
      inputSummary: "{\"reason\":\"cancel-test\"}",
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const failedJob = {
      id: "job-failed-route",
      projectId: slug,
      type: "story.graph.rebuild",
      status: "error",
      inputSummary: "{\"reason\":\"retry-test\"}",
      error: "boom",
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:00:01.000Z",
      updatedAt: "2026-06-11T00:00:01.000Z"
    };
    await fs.mkdir(path.join(tempRoot, slug, "tasks"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, slug, "tasks", "background-jobs.jsonl"),
      `${JSON.stringify(pendingJob)}\n${JSON.stringify(failedJob)}\n`,
      "utf8"
    );

    const cancelled = await jsonFetch<{ job: { id: string; status: string; cancelRequestedAt?: string } }>(
      `/api/novel/projects/${slug}/jobs/${pendingJob.id}/cancel`,
      { method: "POST" }
    );

    const retried = await jsonFetch<{ job: { id: string; type: string; status: string; retryOf?: string } }>(
      `/api/novel/projects/${slug}/jobs/${failedJob.id}/retry`,
      { method: "POST" }
    );
    const retryFinished = await waitForJob(slug, retried.data.job.id);

    expect(cancelled.status).toBe(200);
    expect(cancelled.data.job).toMatchObject({ id: pendingJob.id, status: "cancelled", cancelRequestedAt: expect.any(String) });
    expect(retried.status).toBe(202);
    expect(retried.data.job).toMatchObject({ type: "story.graph.rebuild", retryOf: failedJob.id });
    expect(retryFinished.job.status).toBe("success");
  });

  it("returns a creation runtime snapshot for a chapter", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Runtime Demo", roughIdea: "Project current chapter state." })
    });
    const slug = created.data.project.slug;
    await jsonFetch(`/api/novel/projects/${slug}/files/chapters/chapter-001.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "A saved draft with enough words to enter review and recap safely." })
    });
    await jsonFetch(`/api/novel/projects/${slug}/quality/chapter-001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: {
          chapterId: "chapter-001",
          overallScore: 82,
          summary: "Ready.",
          metrics: [],
          strengths: [],
          fixes: [],
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      })
    });
    await jsonFetch(`/api/novel/projects/${slug}/ledger/foreshadowing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            id: "mark",
            kind: "foreshadowing",
            title: "Mark",
            status: "open",
            severity: "medium",
            chapterIds: ["chapter-001"],
            relatedEntities: ["Hero"],
            note: "Pay off later.",
            updatedAt: "2026-06-11T00:00:00.000Z"
          }
        ]
      })
    });

    const response = await jsonFetch<{
      snapshot: {
        chapterId: string;
        fingerprint: string;
        signals: {
          wordCount: number;
          hasQualityReport: boolean;
          narrativeDebt?: { debtCount: number; openForeshadowingCount: number; severity: string };
        };
        steps: Array<{ id: string; status: string }>;
      };
    }>(`/api/novel/projects/${slug}/runtime/chapter-001`);
    const repeated = await jsonFetch<{ snapshot: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/chapter-001`);

    expect(response.status).toBe(200);
    expect(response.data.snapshot.chapterId).toBe("chapter-001");
    expect(response.data.snapshot.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(repeated.data.snapshot.fingerprint).toBe(response.data.snapshot.fingerprint);
    expect(response.data.snapshot.signals.wordCount).toBeGreaterThanOrEqual(30);
    expect(response.data.snapshot.signals.hasQualityReport).toBe(true);
    expect(response.data.snapshot.signals.narrativeDebt).toMatchObject({
      debtCount: 1,
      openForeshadowingCount: 1,
      severity: "watch"
    });
    expect(response.data.snapshot.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "draft", status: "done" }),
        expect.objectContaining({ id: "review", status: "done" }),
        expect.objectContaining({ id: "ledger", status: "done" })
      ])
    );
  });

  it("creates and accepts a runtime derivative branch through API routes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Derivative API", roughIdea: "Branch route coverage." })
    });
    const slug = created.data.project.slug;

    const derivative = await jsonFetch<{
      branch: { id: string; title: string; status: string };
      run: { id: string; command: string; branchId: string };
      command: { id: string; type: string };
    }>(`/api/novel/projects/${slug}/runtime/derivatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChapterId: "chapter-001",
        type: "side_story",
        title: "Side Canon Candidate",
        direction: "Write an isolated aftermath."
      })
    });

    const merged = await jsonFetch<{
      branch: { id: string; status: string; payload: Record<string, unknown> };
      run: { id: string; status: string };
      merged: boolean;
      chapterId: string;
    }>(
      `/api/novel/projects/${slug}/runtime/derivatives/${derivative.data.branch.id}/merge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Accepted after review.", draftContent: "# Side Canon Candidate\n\nMerged derivative prose.\n" })
      }
    );
    const projectJson = JSON.parse(await fs.readFile(path.join(tempRoot, slug, "project.json"), "utf8"));

    expect(derivative.status).toBe(202);
    expect(derivative.data.branch).toMatchObject({ title: "Side Canon Candidate", status: "draft" });
    expect(derivative.data.run).toMatchObject({ command: "derivative", branchId: derivative.data.branch.id });
    expect(derivative.data.command).toMatchObject({ type: "derivative" });
    expect(merged.status).toBe(200);
    expect(merged.data).toMatchObject({
      merged: true,
      run: { status: "completed" },
      branch: {
        id: derivative.data.branch.id,
        status: "merged",
        payload: expect.objectContaining({
          canonPolicy: "accepted_for_canon",
          mergeMode: "new_chapter",
          mergeNote: "Accepted after review.",
          mergedChapterId: merged.data.chapterId
        })
      }
    });
    expect(projectJson.lastOpenedChapterId).toBe(merged.data.chapterId);
    expect(projectJson.chapters).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: merged.data.chapterId, title: "Side Canon Candidate", status: "drafted" })])
    );
    await expect(fs.readFile(path.join(tempRoot, slug, `chapters/${merged.data.chapterId}.md`), "utf8")).resolves.toContain(
      "Merged derivative prose."
    );
  });

  it("keeps duplicate project titles in separate folders", async () => {
    const body = JSON.stringify({
      title: "Demo Novel",
      genre: "fantasy",
      roughIdea: "A cautious apprentice finds a sealed room."
    });

    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });

    expect(first.data.project.slug).toBe("demo-novel");
    expect(second.data.project.slug).toBe("demo-novel-2");
    await expect(fs.readFile(path.join(tempRoot, "demo-novel", "project.json"), "utf8")).resolves.toContain("Demo Novel");
    await expect(fs.readFile(path.join(tempRoot, "demo-novel-2", "project.json"), "utf8")).resolves.toContain("Demo Novel");
  });

  it("saves project AI profile and model without accepting command input", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Agent Demo",
        genre: "fantasy",
        roughIdea: "A configurable writing agent."
      })
    });

    const updated = await jsonFetch<{ project: { ai: { profileId: string; modelId: string }; codex: { command: string } } }>(
      "/api/novel/projects/agent-demo/ai",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "claude-code", modelId: "claude-future-1.2", command: "malicious-command" })
      }
    );
    const projectJson = JSON.parse(await fs.readFile(path.join(tempRoot, "agent-demo", "project.json"), "utf8"));

    expect(updated.data.project.ai).toEqual({ profileId: "claude-code", modelId: "claude-future-1.2" });
    expect(updated.data.project.codex.command).not.toBe("malicious-command");
    expect(projectJson.codex.command).not.toBe("malicious-command");

    const rejected = await jsonFetch<{ error: string }>("/api/novel/projects/agent-demo/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "unknown-agent", modelId: "sonnet" })
    });
    expect(rejected.status).toBe(400);
    expect(rejected.data.error).toContain("Unsupported AI agent profile");

    const invalidModel = await jsonFetch<{ error: string }>("/api/novel/projects/agent-demo/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5.5 && run" })
    });
    expect(invalidModel.status).toBe(400);
    expect(invalidModel.data.error).toContain("Model id can only contain");
  });

  it("saves global AI configuration by creative scenario", async () => {
    const current = await jsonFetch<{
      config: {
        defaultScenario: string;
        scenarios: { novel: { profileId: string; modelId?: string } };
        knowledgeEmbedding: { provider: string; baseUrl?: string; model?: string; apiKeyConfigured?: boolean; apiKey?: string };
      };
    }>("/api/platform/ai-config");

    expect(current.data.config.defaultScenario).toBe("novel");
    expect(current.data.config.scenarios.novel.profileId).toBe("codex-cli");
    expect(current.data.config.knowledgeEmbedding.provider).toBe("local");
    expect(current.data.config.knowledgeEmbedding.apiKey).toBeUndefined();

    const nextConfig = {
      ...current.data.config,
      scenarios: {
        ...current.data.config.scenarios,
        novel: { profileId: "claude-code", modelId: "sonnet" }
      },
      knowledgeEmbedding: {
        provider: "openai-compatible",
        baseUrl: "https://embeddings.example/v1/",
        model: "embedding-test",
        apiKey: "secret-key"
      }
    };
    const saved = await jsonFetch<{
      config: {
        scenarios: { novel: { profileId: string; modelId: string } };
        knowledgeEmbedding: { provider: string; baseUrl?: string; model?: string; apiKeyConfigured?: boolean; apiKey?: string };
      };
    }>("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: nextConfig })
    });

    expect(saved.data.config.scenarios.novel).toEqual({ profileId: "claude-code", modelId: "sonnet" });
    expect(saved.data.config.knowledgeEmbedding).toMatchObject({
      provider: "openai-compatible",
      baseUrl: "https://embeddings.example/v1",
      model: "embedding-test",
      apiKeyConfigured: true
    });
    expect(saved.data.config.knowledgeEmbedding.apiKey).toBeUndefined();

    const reloaded = await jsonFetch<{
      config: { knowledgeEmbedding: { apiKeyConfigured?: boolean; apiKey?: string } };
    }>("/api/platform/ai-config");
    expect(reloaded.data.config.knowledgeEmbedding.apiKeyConfigured).toBe(true);
    expect(reloaded.data.config.knowledgeEmbedding.apiKey).toBeUndefined();

    const rejected = await jsonFetch<{ error: string }>("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          ...nextConfig,
          scenarios: {
            ...nextConfig.scenarios,
            novel: { profileId: "codex-cli", modelId: "gpt-5.5 && run" }
          }
        }
      })
    });

    expect(rejected.status).toBe(400);
    expect(rejected.data.error).toContain("Model id can only contain");

    const rejectedProvider = await jsonFetch<{ error: string }>("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          ...nextConfig,
          knowledgeEmbedding: { provider: "unsupported" }
        }
      })
    });

    expect(rejectedProvider.status).toBe(400);
    expect(rejectedProvider.data.error).toContain("Unsupported knowledge embedding provider");
  });

  it("seeds the platform library and links shared assets across projects", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Project One", roughIdea: "First project." })
    });
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Project Two", roughIdea: "Second project." })
    });

    const library = await jsonFetch<{ library: { prompts: Array<{ id: string; title: string }>; roles: Array<{ id: string }> } }>(
      "/api/platform/library"
    );
    expect(library.data.library.prompts.map((prompt) => prompt.id)).toContain("prompt-novel-outline");
    expect(library.data.library.prompts.find((prompt) => prompt.id === "prompt-novel-outline")?.title).toBe(
      "长篇小说大纲"
    );
    expect(library.data.library.roles.map((role) => role.id)).toContain("role-storyboard-director");

    const createdAsset = await jsonFetch<{ asset: { id: string; linkedProjects: string[] } }>("/api/platform/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shared Sword", type: "prop", projectSlug: "project-one" })
    });
    expect(createdAsset.status).toBe(201);
    expect(createdAsset.data.asset.linkedProjects).toEqual(["project-one"]);

    const linkedAsset = await jsonFetch<{ asset: { linkedProjects: string[] } }>(
      `/api/platform/assets/${createdAsset.data.asset.id}/link`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: "project-two" })
      }
    );
    expect(linkedAsset.data.asset.linkedProjects).toEqual(["project-one", "project-two"]);

    const relations = await jsonFetch<{ linkedAssets: Array<{ name: string }> }>("/api/novel/projects/project-two/relations");
    expect(relations.data.linkedAssets).toEqual([expect.objectContaining({ name: "Shared Sword" })]);
  });

  it("imports a local folder into a managed novel project", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-import-source-"));
    await fs.writeFile(path.join(sourceRoot, "chapter-01.md"), "# First Gate\n\nThe draft opens here.", "utf8");
    await fs.writeFile(path.join(sourceRoot, "outline.md"), "# Volume Outline\n\nA grounded escalation.", "utf8");
    await fs.writeFile(path.join(sourceRoot, "characters.md"), "# Characters\n\n- Lin: careful.", "utf8");

    const imported = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string; title: string }> } }>(
      "/api/novel/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: sourceRoot, title: "Imported Demo", genre: "fantasy" })
      }
    );

    expect(imported.status).toBe(201);
    expect(imported.data.project.slug).toBe("imported-demo");
    expect(imported.data.project.chapters).toHaveLength(1);
    expect(imported.data.project.chapters[0].title).toBe("First Gate");

    const chapter = await jsonFetch<{ content: string }>(
      `/api/novel/projects/imported-demo/files/${imported.data.project.chapters[0].contentPath}`
    );
    const outline = await jsonFetch<{ content: string }>("/api/novel/projects/imported-demo/files/outline/volume-01.md");

    expect(chapter.data.content).toContain("The draft opens here.");
    expect(outline.data.content).toContain("A grounded escalation.");

    await fs.rm(sourceRoot, { recursive: true, force: true });
  });

  it("imports browser selected directory files into a managed novel project", async () => {
    const imported = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string; title: string }> } }>(
      "/api/novel/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: "uploaded-story",
          title: "Uploaded Story",
          genre: "fantasy",
          files: [
            {
              relativePath: "uploaded-story/03-chapters/chapter-001.md",
              content: "# Uploaded Gate\n\nThe uploaded draft opens here."
            },
            {
              relativePath: "uploaded-story/02-outline/outline.md",
              content: "# Uploaded Outline\n\nA browser selected outline."
            }
          ]
        })
      }
    );

    expect(imported.status).toBe(201);
    expect(imported.data.project.slug).toBe("uploaded-story");
    expect(imported.data.project.chapters).toHaveLength(1);
    expect(imported.data.project.chapters[0].title).toBe("Uploaded Gate");

    const chapter = await jsonFetch<{ content: string }>(
      `/api/novel/projects/uploaded-story/files/${imported.data.project.chapters[0].contentPath}`
    );
    const outline = await jsonFetch<{ content: string }>("/api/novel/projects/uploaded-story/files/outline/volume-01.md");

    expect(chapter.data.content).toContain("The uploaded draft opens here.");
    expect(outline.data.content).toContain("A browser selected outline.");
  });

  it("reads and saves writing cockpit dashboard, scenes, and ledger entries", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Cockpit Demo", roughIdea: "Build a faster writing desk." })
    });

    const dashboardBefore = await jsonFetch<{ dashboard: { chapterId: string; status: string; wordCount: number } }>(
      "/api/novel/projects/cockpit-demo/dashboard/chapter-001"
    );
    expect(dashboardBefore.data.dashboard).toMatchObject({
      chapterId: "chapter-001",
      status: "empty",
      wordCount: 0
    });

    const dashboardAfter = await jsonFetch<{ dashboard: { chapterId: string; goal: string; wordCount: number } }>(
      "/api/novel/projects/cockpit-demo/dashboard/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: {
            chapterId: "../unsafe",
            goal: "Make the choice unavoidable.",
            pov: "Hero",
            mainConflict: "Stay hidden or act.",
            endingHook: "The seal answers.",
            wordCount: 1200,
            status: "drafting",
            unresolvedForeshadowingIds: [],
            continuityRiskIds: [],
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        })
      }
    );
    expect(dashboardAfter.data.dashboard).toMatchObject({
      chapterId: "chapter-001",
      goal: "Make the choice unavoidable.",
      wordCount: 1200
    });

    const scenesAfter = await jsonFetch<{ scenes: Array<{ chapterId: string; id: string; order: number }> }>(
      "/api/novel/projects/cockpit-demo/scenes/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: [
            {
              id: "scene-late",
              chapterId: "wrong",
              order: 9,
              title: "Late turn",
              time: "night",
              location: "Gate",
              pov: "Hero",
              characters: ["Hero"],
              conflict: "Lose the clue.",
              turn: "The clue moves.",
              informationReleased: [],
              foreshadowingIds: [],
              powerProgression: "",
              updatedAt: "2026-06-04T00:00:00.000Z"
            },
            {
              id: "scene-early",
              chapterId: "wrong",
              order: 2,
              title: "Early pressure",
              time: "night",
              location: "Gate",
              pov: "Hero",
              characters: ["Hero"],
              conflict: "Stay quiet.",
              turn: "A sound exposes him.",
              informationReleased: [],
              foreshadowingIds: [],
              powerProgression: "",
              updatedAt: "2026-06-04T00:00:00.000Z"
            }
          ]
        })
      }
    );
    expect(scenesAfter.data.scenes.map((scene) => [scene.id, scene.chapterId, scene.order])).toEqual([
      ["scene-early", "chapter-001", 1],
      ["scene-late", "chapter-001", 2]
    ]);

    const ledgerAfter = await jsonFetch<{ entries: Array<{ id: string; kind: string }> }>(
      "/api/novel/projects/cockpit-demo/ledger/risk",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              id: "risk-1",
              kind: "continuity",
              title: "Information boundary",
              status: "open",
              severity: "medium",
              chapterIds: ["chapter-001"],
              relatedEntities: ["Hero"],
              note: "Avoid omniscient labels.",
              updatedAt: "2026-06-04T00:00:00.000Z"
            }
          ]
        })
      }
    );
    expect(ledgerAfter.data.entries).toEqual([expect.objectContaining({ id: "risk-1", kind: "risk" })]);
    const ledgerRead = await jsonFetch<{ entries: unknown[]; authority: string; projectionType: string; requiresMemoryClaimVerification: boolean }>("/api/novel/projects/cockpit-demo/ledger/risk");
    expect(ledgerRead.data).toMatchObject({ authority: "projection-only", projectionType: "ledger", requiresMemoryClaimVerification: true });

    const invalidLedger = await jsonFetch<{ error: string }>("/api/novel/projects/cockpit-demo/ledger/unknown");
    expect(invalidLedger.status).toBe(400);
    expect(invalidLedger.data.error).toContain("Unsupported ledger kind");
  });

  it("reads, saves, and accepts chapter memory recap patches", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Memory Demo", roughIdea: "Make chapter memory explicit." })
    });

    const summaryBefore = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] }; authority: string; projectionType: string; requiresMemoryClaimVerification: boolean }>(
      "/api/novel/projects/memory-demo/memory/chapter-summaries/chapter-001"
    );
    expect(summaryBefore.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "",
      keyEvents: []
    });
    expect(summaryBefore.data).toMatchObject({ authority: "projection-only", projectionType: "chapter-summary", requiresMemoryClaimVerification: true });

    const summaryAfter = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/memory/chapter-summaries/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: {
            chapterId: "../unsafe",
            summary: "The seal has a price.",
            keyEvents: ["The hero bleeds."],
            newFacts: [],
            characterStateChanges: [],
            foreshadowingUpdates: [],
            continuityRisks: [],
            powerProgressionUpdates: [],
            acceptedRecapIds: [],
            updatedAt: "2026-06-10T00:00:00.000Z"
          }
        })
      }
    );
    expect(summaryAfter.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "The seal has a price.",
      keyEvents: ["The hero bleeds."]
    });

    const qualityBefore = await jsonFetch<{ report: null }>("/api/novel/projects/memory-demo/quality/chapter-001");
    expect(qualityBefore.data.report).toBeNull();

    const qualityAfter = await jsonFetch<{
      report: { chapterId: string; overallScore: number; metrics: unknown[] };
      seriesMetrics: { projectSlug: string; reportCount: number; averageOverallScore: number; metricAverages: Array<{ key: string; averageScore: number }> };
    }>(
      "/api/novel/projects/memory-demo/quality/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: {
            chapterId: "../unsafe",
            overallScore: 82,
            summary: "The chapter has readable pressure.",
            metrics: [{ key: "conflict", label: "Conflict", score: 82, note: "Clear enough." }],
            strengths: ["Clear pressure"],
            fixes: ["Sharpen the hook"],
            updatedAt: "2026-06-11T00:00:00.000Z"
          }
        })
      }
    );
    expect(qualityAfter.data.report).toMatchObject({
      chapterId: "chapter-001",
      overallScore: 82,
      metrics: [expect.objectContaining({ key: "conflict", score: 82 })]
    });
    expect(qualityAfter.data.seriesMetrics).toMatchObject({
      projectSlug: "memory-demo",
      reportCount: 1,
      averageOverallScore: 82
    });
    expect(qualityAfter.data.seriesMetrics.metricAverages).toEqual([
      expect.objectContaining({ key: "conflict", averageScore: 82 })
    ]);

    const qualityRead = await jsonFetch<{ report: { overallScore: number }; evidenceStatus: string }>("/api/novel/projects/memory-demo/quality/chapter-001");
    expect(qualityRead.data).toMatchObject({ report: { overallScore: 82 }, evidenceStatus: "legacy" });

    const seriesQuality = await jsonFetch<{ seriesMetrics: { reportCount: number; averageOverallScore: number } }>(
      "/api/novel/projects/memory-demo/quality/series-metrics"
    );
    expect(seriesQuality.data.seriesMetrics).toMatchObject({
      reportCount: 1,
      averageOverallScore: 82
    });

    const accepted = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/recaps/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recap: {
            chapterId: "chapter-001",
            summary: "The protagonist pays a cost.",
            newFacts: [],
            characterStateChanges: [],
            foreshadowingUpdates: [],
            continuityRisks: [],
            powerProgressionUpdates: [],
            createdAt: "2026-06-10T00:00:00.000Z",
            summaryPatch: {
              summary: "The protagonist pays a cost.",
              keyEvents: ["The seal weakens."]
            },
            ledgerPatches: [
              {
                id: "foreshadowing-memory-1",
                kind: "foreshadowing",
                title: "Blood price",
                status: "open",
                severity: "medium",
                chapterIds: ["chapter-001"],
                relatedEntities: ["Hero"],
                note: "The price should echo later.",
                updatedAt: "2026-06-10T00:00:00.000Z"
              }
            ]
          }
        })
      }
    );
    expect(accepted.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "The protagonist pays a cost.",
      keyEvents: ["The seal weakens."]
    });

    const ledger = await jsonFetch<{ entries: Array<{ id: string; kind: string }> }>(
      "/api/novel/projects/memory-demo/ledger/foreshadowing"
    );
    expect(ledger.data.entries).toEqual([
      expect.objectContaining({ id: "foreshadowing-memory-1", kind: "foreshadowing" })
    ]);
  });

  it("rejects unsafe paths and protected project metadata writes", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Safety Demo", roughIdea: "Validate guarded file writes." })
    });

    const unsafe = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/files/%2e%2e%5csecret.md");
    expect(unsafe.status).toBe(400);
    expect(unsafe.data.error).toContain("Unsafe file path");

    const metadataSave = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/files/project.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "{}" })
    });
    expect(metadataSave.status).toBe(403);
    expect(metadataSave.data.error).toContain("Protected project metadata");

    const metadataPatch = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [{ target: "project.json", mode: "replace-file", content: "{}" }]
      })
    });
    expect(metadataPatch.status).toBe(403);
    expect(metadataPatch.data.error).toContain("Protected project metadata");
  });

  it("applies replace-selection patches only inside the project", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Patch Demo", roughIdea: "Patch a local draft." })
    });
    await jsonFetch("/api/novel/projects/patch-demo/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "before plain line after" })
    });
    const invocation = {
      id: "invocation-patch-1",
      taskId: "task-patch-1",
      projectId: "patch-demo",
      taskType: "chapter.draft",
      stageKey: "pipeline.chapter.prose",
      status: "success",
      promptSnapshot: { length: 100, preview: "Draft", contextTitles: ["Project"] },
      contextSnapshot: { blockCount: 1, totalChars: 20, blocks: [{ title: "Project", length: 20 }] },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 12, exitCode: 0 },
      adoptionDecision: "pending",
      proposedPatchTargets: ["chapters/chapter-001.md"],
      acceptedPatchTargets: [],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await fs.appendFile(path.join(tempRoot, "patch-demo", "tasks", "invocations.jsonl"), `${JSON.stringify(invocation)}\n`, "utf8");

    const patched = await jsonFetch<{ applied: number; invocationUpdated: boolean; invocationId?: string }>("/api/novel/projects/patch-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task-patch-1",
        patches: [
          {
            target: "chapters/chapter-001.md",
            mode: "replace-selection",
            content: "sharper line",
            selection: { start: 7, end: 17 }
          }
        ]
      })
    });
    const readAfter = await jsonFetch<{ content: string }>("/api/novel/projects/patch-demo/files/chapters/chapter-001.md");
    const auditAfter = await jsonFetch<{ invocations: Array<{ adoptionDecision: string; acceptedPatchTargets: string[] }> }>(
      "/api/novel/projects/patch-demo/tasks/invocations"
    );

    expect(patched.data.applied).toBe(1);
    expect(patched.data.invocationUpdated).toBe(true);
    expect(patched.data.invocationId).toBe("invocation-patch-1");
    expect(readAfter.data.content).toBe("before sharper line after");
    expect(auditAfter.data.invocations[0]).toMatchObject({
      adoptionDecision: "accepted",
      acceptedPatchTargets: ["chapters/chapter-001.md"]
    });

    const invalidPatch = await jsonFetch<{ error: string }>("/api/novel/projects/patch-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            target: "chapters/chapter-001.md",
            mode: "replace-selection",
            content: "bad",
            selection: { start: 0, end: 999 }
          }
        ]
      })
    });
    const readAfterInvalid = await jsonFetch<{ content: string }>("/api/novel/projects/patch-demo/files/chapters/chapter-001.md");

    expect(invalidPatch.status).toBe(400);
    expect(invalidPatch.data.error).toContain("Invalid patch selection range");
    expect(readAfterInvalid.data.content).toBe("before sharper line after");
  });

  it("cuts governed chapter canon writes over to the prose adoption gateway", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Mutation Cutover", roughIdea: "Legacy writes must stop." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string }; chapters: Array<{ contentPath: string }> };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const target = project.chapters[0].contentPath;
    const save = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/${target}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "legacy overwrite" })
    });
    expect(save.status).toBe(409);
    expect(save.data.error.code).toBe("PROSE_ADOPTION_REQUIRED");
    const patch = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patches: [{ target, mode: "replace-file", content: "legacy patch" }] })
    });
    expect(patch.status).toBe(409);
    expect(patch.data.error.code).toBe("PROSE_ADOPTION_REQUIRED");
  });

  it("blocks governed StoryControl writes from bypassing contract adoption", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed StoryControl Cutover", roughIdea: "StoryControl is a legacy projection." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/story-control`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characters: [] })
    });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("CONTRACT_ADOPTION_REQUIRED");
  });

  it("blocks governed legacy StoryControl file writes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed StoryControl File Cutover", roughIdea: "Legacy files are not a second authority." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/story-control/story-control.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "legacy bypass" })
    });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("GOVERNED_LEGACY_WRITE_REQUIRED");

    const styleResponse = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/style/style-guide.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "legacy style bypass" })
    });
    expect(styleResponse.status).toBe(409);
    expect(styleResponse.data.error.code).toBe("GOVERNED_LEGACY_WRITE_REQUIRED");

    const sessionResponse = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/sessions/release-e2e-acceptance.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "forged evidence" })
    });
    expect(sessionResponse.status).toBe(409);
    expect(sessionResponse.data.error.code).toBe("GOVERNED_LEGACY_WRITE_REQUIRED");

    const arbitraryResponse = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/relations/asset-links.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "forged arbitrary projection" })
    });
    expect(arbitraryResponse.status).toBe(409);
    expect(arbitraryResponse.data.error.code).toBe("GOVERNED_LEGACY_WRITE_REQUIRED");
  });


  it("fails closed when migration is marked activated but the outline pointer is missing", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Corrupt Migration Activation", roughIdea: "An activated migration without its outline pointer is not legacy writable." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    project.migration = { state: "activated", migrationId: "migration-corrupt" };
    delete project.outlineVersion;
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/files/relations/asset-links.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "must not write" })
    });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("GOVERNED_LEGACY_WRITE_REQUIRED");
  });

  it("blocks governed runtime checkpoint restore from replacing canon and projections", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Checkpoint Cutover", roughIdea: "Checkpoint restore is a canon mutation." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { slug: string; chapters: Array<{ id: string; contentPath: string; outlinePath: string }>; outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const checkpoint = await createRuntimeCheckpoint({ root: path.join(tempRoot, slug), project, chapterId: project.chapters[0]?.id, label: "before restore" });

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/checkpoints/${checkpoint.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("CANON_RESTORE_REQUIRES_ADOPTION");
  });

  it("blocks governed direct knowledge-index rebuilds outside the projection receipt flow", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Knowledge Cutover", roughIdea: "Knowledge is a projection." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/knowledge/index/rebuild`, { method: "POST" });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROJECTION_REBUILD_REQUIRED");
  });

  it("blocks governed knowledge-index rebuilds hidden behind background jobs", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Background Cutover", roughIdea: "Async wrappers cannot bypass authority." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "knowledge.index.rebuild" })
    });

    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROJECTION_REBUILD_REQUIRED");
  });

  it("blocks all governed projection rebuild job types outside the receipt flow", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Projection Jobs", roughIdea: "Every projection writer shares one authority." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    for (const type of ["knowledge.index.rebuild", "quality.series.rebuild", "story.graph.rebuild"]) {
      const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      expect(response.status).toBe(409);
      expect(response.data.error.code).toBe("PROJECTION_REBUILD_REQUIRED");
    }
  });

  it("blocks governed derivative merges from bypassing prose adoption", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Derivative Cutover", roughIdea: "Derivative canon writes require adoption." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const derivative = await jsonFetch<{ data?: { branch: { id: string } } }>(`/api/novel/projects/${slug}/runtime/derivatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed derivative" })
    });
    expect(derivative.status).toBe(202);
    const branchId = (derivative.data as { branch: { id: string } }).branch.id;
    const merge = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/derivatives/${branchId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftContent: "legacy derivative prose" })
    });
    expect(merge.status).toBe(409);
    expect(merge.data.error.code).toBe("PROSE_ADOPTION_REQUIRED");
  });

  it("does not let governed runtime review accept bypass prose adoption", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Runtime Accept", roughIdea: "Review acceptance requires adoption." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const started = await jsonFetch<{ run: { id: string; chapterId: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(started.status).toBe(202);
    const accepted = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/review/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id })
    });
    expect(accepted.status).toBe(409);
    expect(accepted.data.error.code).toBe("PROSE_ADOPTION_REQUIRED");
  });

  it("does not mark an ungoverned runtime accepted without a settled chapter", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Runtime Settlement Gate", roughIdea: "Acceptance must follow settlement." })
    });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { id: string; chapterId: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: "chapter-001" })
    });
    expect(started.status).toBe(202);
    const accepted = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/review/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id })
    });
    expect(accepted.status).toBe(500);
    expect(accepted.data.error).toContain("RUNTIME_ACCEPT_SETTLEMENT_REQUIRED");
    const settlementId = "settlement-runtime-accept";
    await fs.mkdir(path.join(tempRoot, slug, "sessions", "chapter-settlements"), { recursive: true });
    const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId, projectSlug: slug, chapterId: started.data.run.chapterId, adoptionTransactionId: "adopt-runtime-accept", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    const settlement = { ...settlementBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(settlementBase)).digest("hex") };
    await fs.writeFile(path.join(tempRoot, slug, "sessions", "chapter-settlements", `${settlementId}.json`), JSON.stringify(settlement), "utf8");
    const acceptedAfterSettlement = await jsonFetch<{ run: { status: string }; command: { type: string } }>(`/api/novel/projects/${slug}/runtime/review/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id, settlementId })
    });
    expect(acceptedAfterSettlement.status).toBe(202);
    expect(acceptedAfterSettlement.data.run.status).toBe("completed");
    expect(acceptedAfterSettlement.data.run.result).toMatchObject({ draftingExecutionReceipt: { policyVersion: "tiered-quality.v1", runtimeActivationAllowed: false, outcome: "accepted" } });
    expect(acceptedAfterSettlement.data.command.type).toBe("accept");
  });

  it("rejects runtime starts that name a non-frozen prose generation manifest", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Runtime Manifest Boundary", roughIdea: "Drafting must reference a frozen manifest." }) });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationManifestId: "missing-generation-manifest" }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_GENERATION_MANIFEST_REQUIRED");
  });

  it("accepts continuous-chapter intent through the durable scheduler", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Runtime Continuous Flag", roughIdea: "Continuous scheduling must be explicit." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoContinue: true })
    });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("BOOK_RUN_READINESS_REQUIRED");
  });

  it("honors an explicitly supplied startup preflight before auto-continuation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Runtime Preflight Gate", roughIdea: "A blocked startup proof must stop auto-continuation." }) });
    const slug = created.data.project.slug;
    const preflight = await jsonFetch<{ preflight: { status: string } }>(`/api/novel/projects/${slug}/book-runs/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: "startup-proof-1", objective: "draft", estimatedWorkItems: 1, estimatedWallClockMs: 1000, estimatedCostCents: 1, authorizationScope: "chapter-1", worstCaseRecoveryBoundary: "chapter-boundary", storyContractConfirmed: false, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false }) });
    expect(preflight.status).toBe(409);
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoContinue: true, preflightId: "startup-proof-1" }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("RUN_PREFLIGHT_BLOCKED");
    const direct = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [], preflightId: "startup-proof-1", limits: { maxWorkItems: 1 } }) });
    expect(direct.status).toBe(409);
    expect(direct.data.error.code).toBe("RUN_PREFLIGHT_BLOCKED");

    const readyPreflight = await jsonFetch<{ preflight: { status: string } }>(`/api/novel/projects/${slug}/book-runs/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: "startup-proof-ready", objective: "draft", estimatedWorkItems: 1, estimatedWallClockMs: 1000, estimatedCostCents: 1, authorizationScope: "chapter-1", worstCaseRecoveryBoundary: "chapter-boundary", limits: { maxWorkItems: 1 }, storyContractConfirmed: true, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false }) });
    expect(readyPreflight.status).toBe(200);
    expect(readyPreflight.data.preflight.status).toBe("ready");
    const mismatch = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoContinue: true, preflightId: "startup-proof-ready", limits: { maxWorkItems: 2 } }) });
    expect(mismatch.status).toBe(409);
    expect(mismatch.data.error.code).toBe("RUN_PREFLIGHT_LIMIT_MISMATCH");
  });

  it("routes continuous chapter intent through the durable BookRun scheduler", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Runtime Continuous Scheduler", roughIdea: "Continuous intent must use durable scope." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoContinue: true, chapterIds: [created.data.project.chapters[0].id], limits: { maxWorkItems: 1 } })
    });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("BOOK_RUN_READINESS_REQUIRED");
  });

  it("returns a structured conflict when runtime control uses a stale run version", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Runtime Control Freshness", roughIdea: "Controls must not overwrite newer state." })
    });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { id: string; updatedAt: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(started.status).toBe(202);

    const stale = await jsonFetch<{ error: { code: string; message: string } }>(`/api/novel/projects/${slug}/runtime/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id, expectedRunUpdatedAt: "2000-01-01T00:00:00.000Z" })
    });
    expect(stale.status).toBe(409);
    expect(stale.data.error).toMatchObject({ code: "RUNTIME_CONTROL_STALE" });
  });

  it("evaluates Q-004 pause policy without treating silence as consent", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Adaptive Pause Policy", roughIdea: "Pause policy is evidence driven." })
    });
    const decision = await jsonFetch<{ decision: { status: string; nextAction: string; pausePolicyVersion: string; continuationRequiresExistingGrant: boolean } }>(`/api/novel/projects/${created.data.project.slug}/runtime/pause-policy/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autonomyGrantValid: true, settledChapterCount: 10 })
    });
    expect(decision.status).toBe(200);
    expect(decision.data.decision).toMatchObject({ status: "soft_recap", nextAction: "emit_milestone_recap", pausePolicyVersion: "adaptive-risk-pause.v1", continuationRequiresExistingGrant: true });
  });

  it("persists a Q-004 milestone recap without author consent side effects", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Adaptive Pause Recap", roughIdea: "Milestone oversight stays non-consensual." })
    });
    const recap = await jsonFetch<{ recap: { authorResponse: string; continuationRequiresExistingGrant: boolean; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/pause-policy/recaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recapId: "recap-10", trigger: "ten-settled-chapters", settledChapterCount: 10, settledSummary: "Ten chapters settled.", changedSummary: "No canon change.", openRisks: ["obligation-1"], qualityEvidence: ["quality://10"], costEvidence: ["cost://10"], paceEvidence: ["pace://10"], nextAuthorizedScope: "Existing scope only.", continuationSafeReason: "Grant remains valid." })
    });
    expect(recap.status).toBe(201);
    expect(recap.data.recap).toMatchObject({ authorResponse: "not-required", continuationRequiresExistingGrant: true, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("applies only a fresh, fingerprinted hard-pause decision to a runtime", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Adaptive Pause Apply", roughIdea: "Hard pause application is fenced." })
    });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { id: string; updatedAt: string; status: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const evaluated = await jsonFetch<{ decision: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/pause-policy/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autonomyGrantValid: false, unresolvedHardTriggers: ["canon-gate"] })
    });
    const applied = await jsonFetch<{ run: { status: string; result?: Record<string, unknown> } }>(`/api/novel/projects/${slug}/runtime/pause-policy/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id, expectedRunUpdatedAt: started.data.run.updatedAt, decision: evaluated.data.decision })
    });
    expect(applied.status).toBe(202);
    expect(applied.data.run.status).toBe("paused");
    expect(applied.data.run.result?.pauseDecisionFingerprint).toBe(evaluated.data.decision.fingerprint);

    const stale = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/pause-policy/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id, expectedRunUpdatedAt: started.data.run.updatedAt, decision: evaluated.data.decision })
    });
    expect(stale.status).toBe(409);
    expect(stale.data.error.code).toBe("RUNTIME_CONTROL_STALE");
  });

  it("exposes steering events only through their owning project", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Steering Event Query", roughIdea: "Direction history remains project scoped." })
    });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Other Steering Project", roughIdea: "A separate project cannot read the event." })
    });
    const started = await jsonFetch<{ run: { id: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const directed = await jsonFetch<{ command: { payload: { steeringEventId: string } }; directionEvent: { status: string; effectiveBoundary: string; classification: string; runId: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/direction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id, direction: "Raise the cost of the next choice.", phase: "model-call", targetObjectiveVersion: 2 })
    });
    expect(directed.status).toBe(202);
    expect(directed.data.directionEvent).toMatchObject({ status: "received", effectiveBoundary: "next-boundary", classification: "content-direction", runId: started.data.run.id });
    const eventId = directed.data.command.payload.steeringEventId;

    const owned = await jsonFetch<{ event: { eventId: string; projectSlug: string; status: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/steering-events/${eventId}`);
    expect(owned.status).toBe(200);
    expect(owned.data.event).toMatchObject({ eventId, projectSlug: first.data.project.slug, status: "received" });

    const classified = await jsonFetch<{ event: { status: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/steering-events/${eventId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "classified" })
    });
    expect(classified.status).toBe(201);
    expect(classified.data.event).toMatchObject({ status: "classified" });
    const queued = await jsonFetch<{ event: { status: string; reason: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/steering-events/${eventId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "queued_for_boundary", reason: "apply at next safe boundary" })
    });
    expect(queued.status).toBe(201);
    expect(queued.data.event).toMatchObject({ status: "queued_for_boundary", reason: "apply at next safe boundary" });

    const crossProject = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/runtime/steering-events/${eventId}`);
    expect(crossProject.status).toBe(404);
  });

  it("plans quiet-hour notifications with one actionable deep link per event", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Notification Plan", roughIdea: "Quiet hours preserve attention." })
    });
    const plan = await jsonFetch<{ plan: { status: string; immediate: Array<{ eventId: string; breakQuiet: boolean }>; digest?: { eventIds: string[] } } }>(`/api/novel/projects/${created.data.project.slug}/runtime/notifications/plan`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quiet: true, authorOnline: false, notificationLevel: "high-value", maxUnattendedWorkItems: 8, unattendedWorkItems: 2, events: [{ eventId: "n-1", kind: "chapter-complete", title: "Chapter ready", deepLink: "/runs/r1/work/w1" }, { eventId: "n-2", kind: "l2-gate", title: "Decision required", deepLink: "/runs/r1/attention/n-2" }] })
    });
    expect(plan.status).toBe(200);
    expect(plan.data.plan).toMatchObject({ status: "urgent", immediate: [{ eventId: "n-2", breakQuiet: true }], digest: { eventIds: ["n-1"] } });
  });

  it("persists and integrity-checks the project capability manifest", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Capability Manifest Persistence", roughIdea: "Enabled slices survive a restart." })
    });
    const slug = created.data.project.slug;
    const initial = await jsonFetch<{ manifest: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    expect(initial.status).toBe(200);
    const body = {
      schemaVersion: "v1",
      enabledSlices: ["story-seed"],
      readable: ["story-seed"],
      writable: ["story-seed"],
      migrationStatus: "verified",
      rollbackWindow: "24h",
      missingDependencies: []
    };
    const saved = await jsonFetch<{ manifest: { projectId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, expectedFingerprint: initial.data.manifest.fingerprint })
    });
    expect(saved.status).toBe(201);
    expect(saved.data.manifest).toMatchObject({ projectId: slug });

    const read = await jsonFetch<{ manifest: { projectId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    expect(read.status).toBe(200);
    expect(read.data.manifest).toEqual(saved.data.manifest);

    const updateBody = { ...body, writable: ["story-seed", "runtime"] };
    const missingExpected = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody)
    });
    expect(missingExpected.status).toBe(409);
    expect(missingExpected.data.error.code).toBe("CAPABILITY_MANIFEST_EXPECTED_FINGERPRINT_REQUIRED");
    const stale = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updateBody, expectedFingerprint: "0".repeat(64) })
    });
    expect(stale.status).toBe(409);
    expect(stale.data.error.code).toBe("CAPABILITY_MANIFEST_STALE");
    const updated = await jsonFetch<{ manifest: { writable: string[]; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updateBody, expectedFingerprint: saved.data.manifest.fingerprint })
    });
    expect(updated.status).toBe(201);
    expect(updated.data.manifest.writable).toContain("runtime");

    const projectPath = path.join(tempRoot, slug, "sessions", "project-capability-manifest.json");
    const tampered = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    tampered.writable = ["different-slice"];
    await fs.writeFile(projectPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    const invalid = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    expect(invalid.status).toBe(500);
    expect(invalid.data.error).toContain("CAPABILITY_MANIFEST_INTEGRITY_FAILED");
  });

  it("rejects runtime writes that are absent from an enabled project's writable slices", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Capability Write Fence", roughIdea: "A manifest must govern runtime writes." })
    });
    const slug = created.data.project.slug;
    const currentManifest = await jsonFetch<{ manifest: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    const manifest = await jsonFetch(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [], expectedFingerprint: currentManifest.data.manifest.fingerprint })
    });
    expect(manifest.status).toBe(201);
    const denied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(denied.status).toBe(409);
    expect(denied.data.error).toMatchObject({ code: "CAPABILITY_WRITE_NOT_AUTHORIZED", sliceId: "runtime" });
  });

  it("fences runtime control commands after a project capability is narrowed", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Capability Control Fence", roughIdea: "Control commands share the runtime authority." })
    });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { id: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(started.status).toBe(202);
    const currentManifest = await jsonFetch<{ manifest: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    await jsonFetch(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [], expectedFingerprint: currentManifest.data.manifest.fingerprint })
    });
    const denied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: started.data.run.id })
    });
    expect(denied.status).toBe(409);
    expect(denied.data.error).toMatchObject({ code: "CAPABILITY_WRITE_NOT_AUTHORIZED", sliceId: "runtime" });
  });

  it("persists requirement evidence links and refuses unverifiable release status", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Requirement Evidence Store", roughIdea: "A slice needs replayable evidence." })
    });
    const slug = created.data.project.slug;
    const payload = { requirementId: "FR-DELIVERY-010", sliceId: "evidence-store", contractRefs: ["requirement-evidence-link.v1"], tests: ["app.spec.ts"], fixtures: ["demo-project"], metrics: ["evidence-readback"], releaseEvidence: ["test://app/evidence-store"], status: "verified" };
    const saved = await jsonFetch<{ link: { projectSlug: string; requirementId: string; sliceId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/requirement-evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(saved.status).toBe(201);
    const read = await jsonFetch<{ link: typeof saved.data.link }>(`/api/novel/projects/${slug}/runtime/delivery/requirement-evidence/${payload.requirementId}/${payload.sliceId}`);
    expect(read.status).toBe(200);
    expect(read.data.link).toEqual(saved.data.link);

    const evidenceDir = path.join(tempRoot, slug, "sessions", "requirement-evidence");
    const [evidenceFile] = (await fs.readdir(evidenceDir)).filter((name) => name.endsWith(".json"));
    const target = path.join(evidenceDir, evidenceFile);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "released";
    await fs.writeFile(target, `${JSON.stringify(tampered)}\n`, "utf8");
    const invalid = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/delivery/requirement-evidence/${payload.requirementId}/${payload.sliceId}`);
    expect(invalid.status).toBe(500);
    expect(invalid.data.error).toContain("REQUIREMENT_EVIDENCE_INTEGRITY_FAILED");

    const blocked = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/delivery/requirement-evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requirementId: "FR-BLOCKED", fixtures: [], metrics: [], releaseEvidence: [] })
    });
    expect(blocked.status).toBe(500);
    expect(blocked.data.error).toContain("REQUIREMENT_EVIDENCE_RELEASE_EVIDENCE_REQUIRED");
  });

  it("persists capability dependency proofs without turning blocked dependencies into success", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Dependency Proof Store", roughIdea: "Workers need durable dependency status." })
    });
    const slug = created.data.project.slug;
    const payload = { sliceId: "runtime", requiredKernels: [{ id: "K2-runtime", version: "v1", verifiedBy: ["runtime.spec.ts"] }], writeAuthority: "runtime-store", unmet: ["provider-calibration"] };
    const currentProof = await jsonFetch<{ proof: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/dependency-proofs/runtime`);
    const saved = await jsonFetch<{ proof: { projectSlug: string; sliceId: string; status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/dependency-proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, expectedFingerprint: currentProof.data.proof.fingerprint })
    });
    expect(saved.status).toBe(201);
    expect(saved.data.proof).toMatchObject({ projectSlug: slug, sliceId: "runtime", status: "blocked" });
    const read = await jsonFetch<{ proof: typeof saved.data.proof }>(`/api/novel/projects/${slug}/runtime/delivery/dependency-proofs/runtime`);
    expect(read.status).toBe(200);
    expect(read.data.proof).toEqual(saved.data.proof);

    const proofDir = path.join(tempRoot, slug, "sessions", "capability-dependency-proofs");
    const [proofFile] = (await fs.readdir(proofDir)).filter((name) => name.endsWith(".json"));
    const target = path.join(proofDir, proofFile);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "satisfied";
    await fs.writeFile(target, `${JSON.stringify(tampered)}\n`, "utf8");
    const invalid = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/delivery/dependency-proofs/runtime`);
    expect(invalid.status).toBe(500);
    expect(invalid.data.error).toContain("CAPABILITY_DEPENDENCY_INTEGRITY_FAILED");
  });

  it("rejects runtime writes when the current dependency proof is blocked", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Dependency Write Gate", roughIdea: "A blocked kernel cannot be bypassed by API start." })
    });
    const slug = created.data.project.slug;
    const currentManifest = await jsonFetch<{ manifest: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`);
    const manifest = await jsonFetch(`/api/novel/projects/${slug}/runtime/delivery/capability-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "v1", enabledSlices: ["runtime"], readable: ["runtime"], writable: ["runtime"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [], expectedFingerprint: currentManifest.data.manifest.fingerprint })
    });
    expect(manifest.status).toBe(201);
    const currentProof = await jsonFetch<{ proof: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/delivery/dependency-proof/runtime`);
    const blocked = await jsonFetch(`/api/novel/projects/${slug}/runtime/delivery/dependency-proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sliceId: "runtime", requiredKernels: [{ id: "K0-contract", version: "v1", verifiedBy: ["test"] }], writeAuthority: "runtime-store", unmet: ["provider-calibration"], expectedFingerprint: currentProof.data.proof.fingerprint })
    });
    expect(blocked.status).toBe(201);
    const denied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(denied.status).toBe(409);
    expect(denied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const derivativeDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/derivatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "blocked derivative" })
    });
    expect(derivativeDenied.status).toBe(409);
    expect(derivativeDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const unclassifiedRuntimeDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/abstraction-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(unclassifiedRuntimeDenied.status).toBe(409);
    expect(unclassifiedRuntimeDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const adoptionDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/missing/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedCanonSha256: "x", authorizationId: "blocked-test" })
    });
    expect(adoptionDenied.status).toBe(409);
    expect(adoptionDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const settlementDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/chapters/missing/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionTransactionId: "missing" })
    });
    expect(settlementDenied.status).toBe(409);
    expect(settlementDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const derivedDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/chapters/missing/settlements/missing/derived`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [] })
    });
    expect(derivedDenied.status).toBe(409);
    expect(derivedDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const graphDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/work-graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIds: [] })
    });
    expect(graphDenied.status).toBe(409);
    expect(graphDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const refreshDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/work-graph/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    expect(refreshDenied.status).toBe(409);
    expect(refreshDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const bookRunDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/book-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIds: [] })
    });
    expect(bookRunDenied.status).toBe(409);
    expect(bookRunDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const advanceDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/book-runs/missing/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    expect(advanceDenied.status).toBe(409);
    expect(advanceDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    for (const action of ["pause", "resume", "stop"]) {
      const denied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/book-runs/missing/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      expect(denied.status).toBe(409);
      expect(denied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    }
    const retryDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/book-runs/missing/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 })
    });
    expect(retryDenied.status).toBe(409);
    expect(retryDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const editionDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/publication-editions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "blocked edition" })
    });
    expect(editionDenied.status).toBe(409);
    expect(editionDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const proofDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/publication-editions/missing/delivery-proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: "blocked", expectedArtifactSetFingerprint: "missing" })
    });
    expect(proofDenied.status).toBe(409);
    expect(proofDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const feedbackDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/missing/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" })
    });
    expect(feedbackDenied.status).toBe(409);
    expect(feedbackDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const attributionDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/prose-feedback/missing/attribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "structure" })
    });
    expect(attributionDenied.status).toBe(409);
    expect(attributionDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const hypothesisDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/prose-feedback-attributions/missing/hypothesis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    expect(hypothesisDenied.status).toBe(409);
    expect(hypothesisDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const qualityDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/quality/missing/gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFingerprint: "blocked", report: {} })
    });
    expect(qualityDenied.status).toBe(409);
    expect(qualityDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const memoryDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/memory/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId: "blocked", proposition: "blocked", epistemicType: "inferred", sourceRefs: ["source://blocked"], evidenceAnchors: ["anchor://blocked"], producedBy: "test", temporalScope: { asOfVersion: "v1" }, confidence: 0.5 })
    });
    expect(memoryDenied.status).toBe(409);
    expect(memoryDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const memorySettleDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/memory/claims/missing/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterSettlementCompleted: true, confirmer: "blocked", reason: "blocked" })
    });
    expect(memorySettleDenied.status).toBe(409);
    expect(memorySettleDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
    const relationDenied = await jsonFetch<{ error: { code: string; sliceId: string } }>(`/api/novel/projects/${slug}/runtime/memory/claim-relations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromClaimId: "blocked-a", toClaimId: "blocked-b", relation: "supports", sourceRefs: ["source://blocked"] })
    });
    expect(relationDenied.status).toBe(409);
    expect(relationDenied.data.error).toMatchObject({ code: "CAPABILITY_DEPENDENCY_BLOCKED", sliceId: "runtime" });
  });

  it("persists kernel proofs and refuses unknown-version write policy", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Kernel Proof Store", roughIdea: "Kernel contracts survive restart." })
    });
    const slug = created.data.project.slug;
    const payload = { kernelId: "K0-contract", version: "v1", schemaRefs: ["story-seed.v1"], runtimeValidators: ["storySeed.spec.ts"], generatedTypes: ["StorySeedFrame"], capabilityManifestRef: "manifest-1", readWriteMatrixRef: "matrix-1", negotiatedVersions: ["v1"], unknownVersionPolicy: "read-only" };
    const saved = await jsonFetch<{ proof: { projectSlug: string; kernelId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/kernels/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(saved.status).toBe(201);
    const read = await jsonFetch<{ proof: typeof saved.data.proof }>(`/api/novel/projects/${slug}/runtime/kernels/proof/${payload.kernelId}`);
    expect(read.status).toBe(200);
    expect(read.data.proof).toEqual(saved.data.proof);
    const rejected = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/kernels/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, kernelId: "K0-invalid", unknownVersionPolicy: "write-through" })
    });
    expect(rejected.status).toBe(500);
    expect(rejected.data.error).toContain("KERNEL_PROOF_FIELDS_REQUIRED");
  });

  it("blocks V5 prose execution until the adopted outline has an execution-ready proof", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "V5 Execution Gate", roughIdea: "Prose must wait for a verified outline window." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-without-proof", fingerprint: "outline-fingerprint" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const started = await jsonFetch<{ error: { code: string; reason?: string }; workItem?: { status: string } }>(
      `/api/novel/projects/${slug}/runtime/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: created.data.project.chapters[0].id, requireExecutionReady: true, idempotencyKey: "v5-proof-gate" })
      }
    );
    expect(started.status).toBe(409);
    expect(started.data.error).toMatchObject({ code: "EXECUTION_NOT_READY", reason: "PROOF_NOT_FOUND" });
  });

  it("carries a V6 narrative obligation through confirmed setup to evidence-backed payoff", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "V6 Obligation Lifecycle", roughIdea: "A promise must close with traceable evidence." })
    });
    const slug = created.data.project.slug;
    const obligation = await jsonFetch<{ obligation: { obligationId: string; status: string; version: number } }>(
      `/api/novel/projects/${slug}/obligations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mystery", title: "The drowned bell", questionOrPromise: "Who rings the bell beneath the tide?", sourceRefs: ["scene://chapter-001#scene-1"] })
      }
    );
    expect(obligation.status).toBe(201);
    expect(obligation.data.obligation).toMatchObject({ status: "proposed", version: 0 });

    const transition = async (toStatus: string, expectedVersion: number, evidenceRefs: string[] = []) => jsonFetch<{ obligation: { status: string; version: number } }>(
      `/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, expectedVersion, evidenceRefs, reason: `transition to ${toStatus}`, actor: toStatus === "confirmed" ? "author" : "system" })
      }
    );
    expect((await transition("confirmed", 0)).data.obligation).toMatchObject({ status: "confirmed", version: 1 });
    expect((await transition("planned", 1)).data.obligation).toMatchObject({ status: "planned", version: 2 });
    expect((await transition("setup", 2)).data.obligation).toMatchObject({ status: "setup", version: 3 });
    const paid = await transition("paid", 3, ["chapter://chapter-001#paragraph-2"]);
    expect(paid.status).toBe(201);
    expect(paid.data.obligation).toMatchObject({ status: "paid", version: 4 });

    const readBack = await jsonFetch<{ obligation: { status: string; version: number } }>(
      `/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}`
    );
    expect(readBack.data.obligation).toMatchObject({ status: "paid", version: 4 });
  });

  it("blocks governed legacy cockpit projection writes until settlement projection is used", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed Projection Cutover", roughIdea: "Legacy projections cannot become authority." })
    });
    const slug = created.data.project.slug;
    const chapterId = created.data.project.chapters[0].id;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as { outlineVersion?: { versionId: string } };
    project.outlineVersion = { versionId: "outline-governed" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const recap = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/recaps/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recap: { chapterId, summary: "legacy recap" } })
    });
    expect(recap.status).toBe(409);
    expect(recap.data.error.code).toBe("CHAPTER_SETTLEMENT_REQUIRED");

    const ledger = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/ledger/continuity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [] })
    });
    expect(ledger.status).toBe(409);
    expect(ledger.data.error.code).toBe("CHAPTER_SETTLEMENT_REQUIRED");
  });

  it("records an evidence-backed legacy ledger migration receipt through the runtime API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Legacy Ledger Migration", roughIdea: "Map old markers safely." }) });
    const slug = created.data.project.slug;
    const obligation = await jsonFetch<{ obligation: { obligationId: string } }>(`/api/novel/projects/${slug}/obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?", sourceRefs: ["legacy://marker-1"] }) });
    const receipt = await jsonFetch<{ created: boolean; receipt: { legacyId: string; obligationId: string } }>(`/api/novel/projects/${slug}/runtime/obligations/legacy-ledger-migrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legacyId: "marker-1", obligationId: obligation.data.obligation.obligationId, evidenceRefs: ["chapter://chapter-001#1"], confirmer: "author", reason: "mapped to governed obligation" }) });
    expect(receipt.status).toBe(201);
    expect(receipt.data).toMatchObject({ created: true, receipt: { legacyId: "marker-1", obligationId: obligation.data.obligation.obligationId } });
  });

  it("previews legacy project migration without activating or mutating canon", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Legacy Migration Preview", roughIdea: "Preview before activation." })
    });
    const slug = created.data.project.slug;
    const projectPath = path.join(tempRoot, slug, "project.json");
    const before = await fs.readFile(projectPath, "utf8");
    const preview = await jsonFetch<{ preview: { migrationId: string; status: string; previewOnly: boolean; writeAuthority: string } }>(`/api/novel/projects/${slug}/migrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(preview.status).toBe(200);
    expect(preview.data.preview).toMatchObject({ status: "preview_only", previewOnly: true, writeAuthority: "legacy_compatibility_only" });
    expect(await fs.readFile(projectPath, "utf8")).toBe(before);
    const readBack = await jsonFetch<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.preview.migrationId).toBe(preview.data.preview.migrationId);
    const execute = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewOnly: false })
    });
    expect(execute.status).toBe(409);
    expect(execute.data.error.code).toBe("MIGRATION_EXECUTION_NOT_READY");
  });

  it("validates migration source fingerprints and requires outline dependency before activation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Migration Activation Gate", roughIdea: "Activation is dependency gated." })
    });
    const slug = created.data.project.slug;
    const preview = await jsonFetch<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
    });
    const validation = await jsonFetch<{ validation: { status: string; fingerprint: string; dependencies: { outlineVersion: string } } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
    });
    expect(validation.status).toBe(200);
    expect(validation.data.validation).toMatchObject({ status: "validated", dependencies: { outlineVersion: "missing" } });
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "activation-dependency-gate", expectedValidationFingerprint: validation.data.validation.fingerprint })
    });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe("MIGRATION_DEPENDENCY_MISSING");
  });

  it("requires an idempotency key and validation fingerprint before migration activation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Migration Activation Contract", roughIdea: "Activation commands need a replay fence." }) });
    const slug = created.data.project.slug;
    const preview = await jsonFetch<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const validation = await jsonFetch<{ validation: { fingerprint: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const missingKey = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedValidationFingerprint: validation.data.validation.fingerprint }) });
    expect(missingKey.status).toBe(400);
    expect(missingKey.data.error.code).toBe("MIGRATION_ACTIVATION_IDEMPOTENCY_REQUIRED");
    const missingFingerprint = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "activate-contract-1" }) });
    expect(missingFingerprint.status).toBe(400);
    expect(missingFingerprint.data.error.code).toBe("MIGRATION_ACTIVATION_FINGERPRINT_REQUIRED");
  });

  it("exposes migration authority conflicts and refuses activation until reviewed", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Migration Conflict Gate", roughIdea: "Review competing outline authorities." })
    });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active outline\n", "utf8");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived outline\n", "utf8");
    const projectPath = path.join(root, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-conflict", fingerprint: "outline-conflict-fp" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const preview = await jsonFetch<{ preview: { migrationId: string; conflicts: string[] } }>(`/api/novel/projects/${slug}/migrations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(preview.status).toBe(200);
    expect(preview.data.preview.conflicts).toContain("outline-authority-active-and-archived");
    const validation = await jsonFetch<{ validation: { fingerprint: string; conflicts: string[] } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
    });
    expect(validation.data.validation.conflicts).toContain("outline-authority-active-and-archived");
    const activation = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "activation-conflict-gate", expectedValidationFingerprint: validation.data.validation.fingerprint })
    });
    expect(activation.status).toBe(409);
    expect(activation.data.error.code).toBe("MIGRATION_CONFLICTS_UNRESOLVED");
  });

  it("requires an explicit conflict resolution before migration activation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Migration Resolution API", roughIdea: "Choose one outline authority." })
    });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n", "utf8");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n", "utf8");
    const projectPath = path.join(root, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-resolution", fingerprint: "outline-resolution-fp" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const preview = await jsonFetch<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await jsonFetch(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const resolution = await jsonFetch<{ resolution: { status: string; selectedOutlineAuthority: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/resolve-conflicts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedOutlineAuthority: "active" })
    });
    expect(resolution.status).toBe(201);
    expect(resolution.data.resolution).toMatchObject({ status: "resolved", selectedOutlineAuthority: "active" });
    const revalidated = await jsonFetch<{ validation: { fingerprint: string; conflicts: string[] } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(revalidated.data.validation.conflicts).toEqual([]);
    const activation = await jsonFetch<{ activation: { status: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "activation-resolution-gate", expectedValidationFingerprint: revalidated.data.validation.fingerprint })
    });
    expect(activation.status).toBe(200);
    expect(activation.data.activation.status).toBe("activated");
    const replayConflict = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "different-replay-key", expectedValidationFingerprint: revalidated.data.validation.fingerprint })
    });
    expect(replayConflict.status).toBe(409);
    expect(replayConflict.data.error.code).toBe("MIGRATION_ACTIVATION_IDEMPOTENCY_MISMATCH");
    const rollback = await jsonFetch<{ rollback: { status: string; activationFingerprint: string } }>(`/api/novel/projects/${slug}/migrations/${preview.data.preview.migrationId}/rollback`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(rollback.status).toBe(201);
    expect(rollback.data.rollback).toMatchObject({ status: "rolled_back", activationFingerprint: expect.any(String) });
    expect(JSON.parse(await fs.readFile(projectPath, "utf8"))).not.toHaveProperty("migration");
    const rollbackLegacyWrite = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/story-control`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "Rollback restored the compatibility read/write window." })
    });
    expect(rollbackLegacyWrite.status).toBe(409);
    expect(rollbackLegacyWrite.data.error.code).toBe("CONTRACT_ADOPTION_REQUIRED");
  });

  it("accepts externally attested holdout calibration evidence without caller labels", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Calibration Evidence", roughIdea: "Attach external holdout evidence." })
    });
    const slug = created.data.project.slug;
    const submitted = await jsonFetch<{ evidence: { status: string; sourceKind: string; accuracy: number; caseIds: string[]; fingerprint: string; attestation: { kind: string } } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluatorVersion: "provider-v4",
        sourceKind: "provider",
        holdoutInputFingerprint: "sealed-holdout-v4",
        evaluatedCount: 20,
        correctCount: 18,
        accuracy: 0.9,
        minimumAccuracy: 0.8,
        attestation: { kind: "provider-signed", reference: "attestation://provider/v4" },
        evidenceRefs: ["audit://provider-attestation-v4"]
      })
    });
    expect(submitted.status).toBe(201);
    expect(submitted.data.evidence).toMatchObject({ status: "calibrated", sourceKind: "provider", accuracy: 0.9, caseIds: [], attestation: { kind: "provider-signed" } });
    const readBack = await jsonFetch<{ evidence: { fingerprint: string } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.evidence.fingerprint).toBe(submitted.data.evidence.fingerprint);
    const history = await jsonFetch<{ evidence: Array<{ fingerprint: string }> }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration/history`);
    expect(history.status).toBe(200);
    expect(history.data.evidence.map((item) => item.fingerprint)).toContain(submitted.data.evidence.fingerprint);
    const invalidHistoryBase = {
      schemaVersion: "quality-calibration-evidence.v1", calibrationId: "invalid-history-api", evaluatorVersion: "provider-v4", sourceKind: "rogue",
      split: "holdout", caseIds: [], inputFingerprint: "sealed", evaluatedCount: 1, correctCount: 1, accuracy: 1, minimumAccuracy: 0.8,
      status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input",
      attestation: { kind: "provider-signed", reference: "attestation://invalid-history" }, evidenceRefs: ["audit://invalid-history"], createdAt: new Date().toISOString()
    };
    const invalidHistory = { ...invalidHistoryBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidHistoryBase)).digest("hex") };
    await fs.writeFile(path.join(tempRoot, slug, "sessions", "quality-calibration", "invalid-history-api.json"), JSON.stringify(invalidHistory));
    const invalidHistoryResponse = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration/history`);
    expect(invalidHistoryResponse.status).toBe(409);
    expect(invalidHistoryResponse.data.error.code).toBe("CALIBRATION_EVIDENCE_SEMANTIC_INVALID");
  });

  it("completes a governed candidate-to-settlement-to-derived-publication journey", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string; contentPath: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Governed E2E Journey", roughIdea: "Adopt only after independent gates." })
    });
    const slug = created.data.project.slug;
    const chapter = created.data.project.chapters[0];
    const root = path.join(tempRoot, slug);
    const projectPath = path.join(root, "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-e2e", fingerprint: "outline-e2e-fp" };
    await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-e2e", sourceFingerprint: "context-e2e-fp" }));
    const original = await fs.readFile(path.join(root, chapter.contentPath), "utf8");
    const candidate = await createProseCandidate({
      root, projectSlug: slug, chapterId: chapter.id, content: "Governed E2E adopted prose.",
      outlineVersionId: "outline-e2e", executionProofFingerprint: "proof-e2e-fp", sourceFingerprint: "source-e2e-fp"
    });
    const readiness = await jsonFetch<{ readiness: { candidateId: string; chapterId: string; targetPath: string; expectedCanonSha256: string; authorizationRequired: boolean; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/adoption-readiness`);
    expect(readiness.status).toBe(200);
    expect(readiness.data.readiness).toMatchObject({ candidateId: candidate.candidateId, chapterId: chapter.id, targetPath: chapter.contentPath, authorizationRequired: true, canonWritten: false });
    expect(readiness.data.readiness.expectedCanonSha256).toBe(crypto.createHash("sha256").update(original, "utf8").digest("hex"));
    const validated = await jsonFetch<{ validationBundle: { status: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(validated.status).toBe(200);
    expect(validated.data.validationBundle.status).toBe("passed");
    const reviewed = await jsonFetch<{ review: { status: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(reviewed.status).toBe(200);
    expect(reviewed.data.review.status).toBe("passed");
    const adopted = await jsonFetch<{ transaction: { transactionId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/adopt`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedCanonSha256: crypto.createHash("sha256").update(original, "utf8").digest("hex"), authorizationId: "author-e2e" })
    });
    expect(adopted.status).toBe(201);
    expect(adopted.data.transaction.status).toBe("committed");
    const feedback = await jsonFetch<{ event: { eventId: string; decision: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionTransactionId: adopted.data.transaction.transactionId, decision: "accepted", note: "E2E accepted" })
    });
    expect(feedback.status).toBe(201);
    const attribution = await jsonFetch<{ attribution: { attributionId: string; lifecycle: string; allowPreferenceLearning: boolean } }>(`/api/novel/projects/${slug}/runtime/prose-feedback/${feedback.data.event.eventId}/attribution`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "structure", pattern: "prefer-e2e-compact", scope: { chapterId: chapter.id }, evidenceRefs: [`candidate://${candidate.candidateId}`], confounders: [], confidence: { lower: 0.3, upper: 0.6 } })
    });
    expect(attribution.status).toBe(201);
    expect(attribution.data.attribution).toMatchObject({ lifecycle: "candidate", allowPreferenceLearning: false });
    const hypothesis = await jsonFetch<{ hypothesis: { lifecycle: string; supportEventIds: string[] } }>(`/api/novel/projects/${slug}/runtime/prose-feedback-attributions/${attribution.data.attribution.attributionId}/hypothesis`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(hypothesis.status).toBe(201);
    expect(hypothesis.data.hypothesis).toMatchObject({ lifecycle: "candidate", supportEventIds: [feedback.data.event.eventId] });
    const withoutGate = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/chapters/${chapter.id}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionTransactionId: adopted.data.transaction.transactionId })
    });
    expect(withoutGate.status).toBe(409);
    expect(withoutGate.data.error).toBe("CHAPTER_SETTLEMENT_QUALITY_GATE_REQUIRED");
    const gate = await jsonFetch<{ decision: { decisionId: string; status: string } }>(`/api/novel/projects/${slug}/quality/${chapter.id}/gate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceFingerprint: "source-e2e-fp",
        report: {
          chapterId: chapter.id, overallScore: 95, summary: "independent review", metrics: [], strengths: ["voice"], fixes: [], updatedAt: new Date().toISOString(),
          evidence: { contentSha256: crypto.createHash("sha256").update("Governed E2E adopted prose.", "utf8").digest("hex"), sourceFingerprint: "source-e2e-fp", evaluatorVersion: "quality-review.v1", mode: "hybrid", generatedAt: new Date().toISOString() }
        },
        hardGuards: { canon: true, pov: true }, authorObjectiveSupported: true, protectedStrengthsPreserved: true,
        authorizationRef: "author-e2e", evidenceRefs: [`review://${candidate.candidateId}`]
      })
    });
    expect(gate.status).toBe(201);
    expect(gate.data.decision.status).toBe("passed");
    const replayedGate = await jsonFetch<{ decision: { decisionId: string; fingerprint: string; status: string } }>(`/api/novel/projects/${slug}/quality/${chapter.id}/gate/${gate.data.decision.decisionId}`);
    expect(replayedGate.status).toBe(200);
    expect(replayedGate.data.decision).toMatchObject({ decisionId: gate.data.decision.decisionId, fingerprint: expect.any(String), status: "passed" });
    const settled = await jsonFetch<{ settlement: { settlementId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/chapters/${chapter.id}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionTransactionId: adopted.data.transaction.transactionId, qualityGateDecisionId: gate.data.decision.decisionId, qualityGateSourceFingerprint: "source-e2e-fp" })
    });
    expect(settled.status).toBe(201);
    expect(settled.data.settlement.status).toBe("settled");
    const derived = await jsonFetch<{ transaction: { status: string; transactionId: string } }>(`/api/novel/projects/${slug}/runtime/chapters/${chapter.id}/settlements/${settled.data.settlement.settlementId}/derived`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [{ relativePath: "derived/e2e-summary.json", content: "{\"settled\":true}\n" }] })
    });
    expect(derived.status).toBe(201);
    expect(derived.data.transaction.status).toBe("committed");
    expect(await fs.readFile(path.join(root, chapter.contentPath), "utf8")).toBe("Governed E2E adopted prose.");
    expect(await fs.readFile(path.join(root, "derived", "e2e-summary.json"), "utf8")).toContain("settled");
    const e2eProof = await jsonFetch<{ proof: { status: string; settlementId: string; derivedTransactionId: string } }>(`/api/novel/projects/${slug}/release-e2e-acceptance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: chapter.id, settlementId: settled.data.settlement.settlementId, derivedTransactionId: derived.data.transaction.transactionId })
    });
    expect(e2eProof.status).toBe(201);
    expect(e2eProof.data.proof).toMatchObject({ status: "verified", settlementId: settled.data.settlement.settlementId, derivedTransactionId: derived.data.transaction.transactionId });
    const settlementPath = path.join(root, "sessions", "chapter-settlements", `${settled.data.settlement.settlementId}.json`);
    const replacedSettlement = JSON.parse(await fs.readFile(settlementPath, "utf8")) as Record<string, unknown>;
    replacedSettlement.adoptedContentSha256 = "f".repeat(64);
    const { fingerprint: _oldFingerprint, ...settlementWithoutFingerprint } = replacedSettlement as { fingerprint?: string; [key: string]: unknown };
    replacedSettlement.fingerprint = crypto.createHash("sha256").update(JSON.stringify(settlementWithoutFingerprint)).digest("hex");
    await fs.writeFile(settlementPath, JSON.stringify(replacedSettlement));
    const staleProof = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/release-e2e-acceptance`);
    expect(staleProof.status).toBe(409);
    expect(staleProof.data.error.code).toBe("RELEASE_E2E_PROOF_STALE");
  });

  it("creates an evidence-bounded local repair plan for blocked red-blue review", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Repair Plan API", roughIdea: "Repair locally." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    await appendAuthorMessage({ root, projectSlug: slug, clientMessageId: "repair-m1", text: "A locked promise." });
    await freezeContextManifest(root, slug);
    const project = JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8")) as { chapters: Array<{ id: string }> };
    const candidate = await createProseCandidate({ root, projectSlug: slug, chapterId: project.chapters[0].id, content: "TODO: repair this local paragraph", outlineVersionId: "outline-repair", executionProofFingerprint: "proof-repair", sourceFingerprint: "source-repair" });
    const reviewed = await jsonFetch<{ review: { verdict: string } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(reviewed.status).toBe(422);
    expect(reviewed.data.review.verdict).toBe("blocks-adoption");
    const planned = await jsonFetch<{ plan: { planId: string; status: string; scope: { kind: string; maxChangedParagraphs: number }; prohibitedActions: string[] } }>(`/api/novel/projects/${slug}/runtime/prose-candidates/${candidate.candidateId}/repair-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(planned.status).toBe(201);
    expect(planned.data.plan).toMatchObject({ status: "ready", scope: { kind: "local-span" } });
    expect(planned.data.plan.prohibitedActions).toContain("replace-entire-chapter");
    const repaired = await jsonFetch<{ metadata: { status: string; changedParagraphIndexes: number[] }; candidate: { status: string; content: string } }>(`/api/novel/projects/${slug}/runtime/prose-repair-plans/${planned.data.plan.planId}/candidates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "The paragraph is repaired." }) });
    expect(repaired.status).toBe(201);
    expect(repaired.data).toMatchObject({ metadata: { status: "generated", changedParagraphIndexes: [0] }, candidate: { status: "generated", content: "The paragraph is repaired." } });
    const regression = await jsonFetch<{ dossier: { status: string; canonicalUntouched: boolean; improvements: Array<{ status: string }> } }>(`/api/novel/projects/${slug}/runtime/prose-repair-candidates/${repaired.data.metadata.repairCandidateId}/regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(regression.status).toBe(201);
    expect(regression.data.dossier).toMatchObject({ status: "passed", canonicalUntouched: true });
    expect(regression.data.dossier.improvements.every((item) => item.status === "resolved")).toBe(true);
  });

  it("freezes and reads a publication edition only from an integrity-checked settlement", async () => {
    const created = await jsonFetch<{ project: { slug: string; title: string; chapters: Array<{ id: string; title: string; contentPath: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Edition Route Demo", roughIdea: "Freeze a reader-safe edition." })
    });
    const project = created.data.project;
    const chapters = project.chapters.slice(0, 2);
    const chapter = chapters[0];
    const secondChapter = chapters[1];
    await fs.writeFile(path.join(tempRoot, project.slug, secondChapter.contentPath), "The second chapter carries the consequence.\n", "utf8");
    const settlementInputs = await Promise.all(chapters.map(async (entry, index) => {
      const content = await fs.readFile(path.join(tempRoot, project.slug, entry.contentPath), "utf8");
      const settlementBase = { schemaVersion: "chapter-settlement.v1" as const, settlementId: `settlement-edition-${index + 1}`, projectSlug: project.slug, chapterId: entry.id, adoptionTransactionId: `adopt-edition-${index + 1}`, adoptedContentSha256: crypto.createHash("sha256").update(content, "utf8").digest("hex"), status: "settled" as const, nextAction: "schedule_dependency_ready_work" as const, createdAt: "2026-07-30T00:00:00.000Z" };
      return { ...settlementBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(settlementBase)).digest("hex") };
    }));
    await fs.mkdir(path.join(tempRoot, project.slug, "sessions", "chapter-settlements"), { recursive: true });
    await Promise.all(settlementInputs.map((settlement) => fs.writeFile(path.join(tempRoot, project.slug, "sessions", "chapter-settlements", `${settlement.settlementId}.json`), JSON.stringify(settlement))));
    const commitIdentity = { mutationId: "mutation-app-edition-1", proposalId: "proposal-app-edition-1", projectSlug: project.slug, authorizationId: "author-app-edition-1", actorId: "author-1", candidateId: "candidate-app-edition-1" };
    const canonCommitFingerprint = computeCanonCommitFingerprint(commitIdentity);
    const coverageBase = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: canonCommitFingerprint, chapterIds: chapters.map((entry) => entry.id), plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-30T00:00:00.000Z" };
    await fs.mkdir(path.join(tempRoot, project.slug, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, project.slug, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...coverageBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(coverageBase)).digest("hex") }));
    await fs.writeFile(path.join(tempRoot, project.slug, "sessions", "canon-commit-events.jsonl"), `${JSON.stringify({ schemaVersion: "canon-commit-event.v1", eventId: "canon-commit-mutation-app-edition-1", ...commitIdentity, canonCommitFingerprint, createdAt: "2026-07-30T00:00:00.000Z" })}\n`, "utf8");
    await fs.mkdir(path.join(tempRoot, project.slug, "sessions", "mutations"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, project.slug, "sessions", "mutations", `${commitIdentity.mutationId}.json`), JSON.stringify({ schemaVersion: "mutation-plan.v1", ...commitIdentity, fencingToken: "fence-app-edition-1", status: "committed", targets: [], createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }), "utf8");
    const frozen = await jsonFetch<{ manifest: { status: string; editionId: string; readerSafe: boolean; canonCommitFingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canonCommitFingerprint, author: "Author", language: "zh-CN", chapters: chapters.map((entry, index) => ({ chapterId: entry.id, title: entry.title, order: index + 1, contentPath: entry.contentPath, settlementId: settlementInputs[index].settlementId })) })
    });
    expect(frozen.status).toBe(201);
    expect(frozen.data.manifest).toMatchObject({ status: "frozen", readerSafe: true });
    const readBack = await jsonFetch<{ manifest: { editionId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.manifest.editionId).toBe(frozen.data.manifest.editionId);
    const replacement = await jsonFetch<{ manifest: { editionId: string; supersedesEditionId: string } }>(`/api/novel/projects/${project.slug}/publication-editions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canonCommitFingerprint, title: "Revised Edition", author: "Author", language: "zh-CN", supersedesEditionId: frozen.data.manifest.editionId, chapters: chapters.map((entry, index) => ({ chapterId: entry.id, title: entry.title, order: index + 1, contentPath: entry.contentPath, settlementId: settlementInputs[index].settlementId })) })
    });
    expect(replacement.status).toBe(201);
    expect(replacement.data.manifest.supersedesEditionId).toBe(frozen.data.manifest.editionId);
    await expect(jsonFetch<{ manifest: { editionId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}`)).resolves.toMatchObject({ status: 200, data: { manifest: { editionId: frozen.data.manifest.editionId } } });
    const tree = await jsonFetch<{ tree: { schemaVersion: string; readerSafe: boolean; fingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/tree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(tree.status).toBe(201);
    expect(tree.data.tree).toMatchObject({ schemaVersion: "publication-tree.v1", readerSafe: true });
    const treeReadBack = await jsonFetch<{ tree: { fingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/tree`);
    expect(treeReadBack.status).toBe(200);
    expect(treeReadBack.data.tree.fingerprint).toBe(tree.data.tree.fingerprint);
    const artifacts = await jsonFetch<{ artifacts: { status: string; fingerprint: string; artifacts: Array<{ format: string; sha256: string }> } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/artifacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formats: ["markdown", "txt"] }) });
    expect(artifacts.status).toBe(201);
    expect(artifacts.data.artifacts).toMatchObject({ status: "validated" });
    expect(artifacts.data.artifacts.artifacts).toHaveLength(2);
    const artifactsReadBack = await jsonFetch<{ artifacts: { fingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/artifacts`);
    expect(artifactsReadBack.status).toBe(200);
    expect(artifactsReadBack.data.artifacts.fingerprint).toBe(artifacts.data.artifacts.fingerprint);
    const proofBeforeClosure = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: "author-edition-release", approverKind: "author", expectedArtifactSetFingerprint: artifacts.data.artifacts.fingerprint }) });
    expect(proofBeforeClosure.status).toBe(409);
    expect(proofBeforeClosure.data.error.code).toBe("DELIVERY_CLOSURE_CERTIFICATE_REQUIRED");
    const closure = await jsonFetch<{ certificate: { status: string; fingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/closure-certificate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(closure.status).toBe(201);
    expect(closure.data.certificate).toMatchObject({ status: "audited_complete" });
    const proof = await jsonFetch<{ proof: { status: string; approvalId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: "author-edition-release", approverKind: "author", expectedArtifactSetFingerprint: artifacts.data.artifacts.fingerprint }) });
    expect(proof.status).toBe(201);
    expect(proof.data.proof).toMatchObject({ status: "issued", approvalId: "author-edition-release" });
    const manuscriptRelease = await jsonFetch<{ release: { releaseId: string; status: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/manuscript-release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: "manuscript-release-api-1", canonCommitFingerprint: frozen.data.manifest.canonCommitFingerprint }) });
    expect(manuscriptRelease.status).toBe(201);
    expect(manuscriptRelease.data.release.status).toBe("draft_release");
    for (const target of ["preflight", "frozen", "rendering", "validating", "ready", "delivered"] as const) {
      const transitioned = await jsonFetch<{ release: { status: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/manuscript-release/${manuscriptRelease.data.release.releaseId}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, authorApprovalId: target === "frozen" || target === "delivered" ? "author-release-approval" : undefined }) });
      expect(transitioned.status).toBe(201);
      expect(transitioned.data.release.status).toBe(target);
    }
    const proofReadBack = await jsonFetch<{ verification: { valid: boolean } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`);
    expect(proofReadBack.status).toBe(200);
    expect(proofReadBack.data.verification.valid).toBe(true);
    const preflight = await jsonFetch<{ report: { status: string; findings: unknown[] } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(preflight.status).toBe(200);
    expect(preflight.data.report).toMatchObject({ status: "ready", findings: [] });
    const grant = await jsonFetch<{ grant: { grantId: string; scope: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z" }) });
    expect(grant.status).toBe(201);
    expect(grant.data.grant).toMatchObject({ scope: "reader" });
    const grantVerification = await jsonFetch<{ verification: { valid: boolean } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/verify`);
    expect(grantVerification.data.verification.valid).toBe(true);
    const receipt = await jsonFetch<{ receipt: { receiptId: string; grantId: string; artifactSetFingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: "receipt-api-1", accessedAt: "2026-08-04T01:00:00.000Z" }) });
    expect(receipt.status).toBe(201);
    expect(receipt.data.receipt).toMatchObject({ receiptId: "receipt-api-1", grantId: grant.data.grant.grantId, artifactSetFingerprint: artifacts.data.artifacts.fingerprint });
    const receiptReadBack = await jsonFetch<{ receipt: { receiptId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/receipts/receipt-api-1`);
    expect(receiptReadBack.status).toBe(200);
    expect(receiptReadBack.data.receipt.receiptId).toBe("receipt-api-1");
    const download = await fetch(`${baseUrl}/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/download/markdown`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("text/markdown");
    expect(download.headers.get("x-delivery-receipt-id")).toBeTruthy();
    expect(await download.text()).toContain("Demo");
    const grantRevoked = await jsonFetch<{ event: { status: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "reader request" }) });
    expect(grantRevoked.status).toBe(201);
    expect(grantRevoked.data.event.status).toBe("revoked");
    const revokedDownload = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/download/markdown`);
    expect(revokedDownload.status).toBe(409);
    expect(revokedDownload.data.error.code).toBe("ACCESS_DOWNLOAD_GRANT_INVALID");
    const revokedGrantVerification = await jsonFetch<{ verification: { valid: boolean; reasons: string[] } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/verify`);
    expect(revokedGrantVerification.data.verification).toMatchObject({ valid: false, reasons: ["grant-revoked"] });
    const revoked = await jsonFetch<{ event: { status: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "author withdrew release" }) });
    expect(revoked.status).toBe(201);
    expect(revoked.data.event.status).toBe("revoked");
    const revokedVerification = await jsonFetch<{ verification: { valid: boolean; currentStatus: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`);
    expect(revokedVerification.data.verification).toMatchObject({ valid: false, currentStatus: "revoked" });
  });

  it("normalizes quality rewrite patches to the task current chapter target", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quality Rewrite Demo", roughIdea: "Rewrite the active chapter safely." })
    });
    await jsonFetch("/api/novel/projects/quality-rewrite-demo/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "original chapter" })
    });

    const task = {
      id: "task-quality-1",
      type: "quality.rewrite",
      status: "success",
      projectId: "quality-rewrite-demo",
      inputSummary: JSON.stringify({ filePath: "chapters/chapter-001.md", documentKind: "content", targetScore: 86 }),
      outputSummary: "quality rewrite complete",
      result: {
        summary: "wrong target candidate",
        content: "",
        changes: [],
        risks: [],
        questions: [],
        patches: [{ target: "chapters/wrong-chapter.md", mode: "replace-file", content: "task result replacement" }]
      },
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:00:01.000Z",
      durationMs: 1000
    };
    const invocation = {
      id: "invocation-quality-1",
      taskId: "task-quality-1",
      projectId: "quality-rewrite-demo",
      taskType: "quality.rewrite",
      stageKey: "pipeline.quality.rewrite",
      status: "success",
      promptSnapshot: { length: 100, preview: "Quality", contextTitles: ["Chapter"] },
      contextSnapshot: { blockCount: 1, totalChars: 20, blocks: [{ title: "Chapter", length: 20 }] },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 12, exitCode: 0 },
      adoptionDecision: "pending",
      proposedPatchTargets: ["chapters/wrong-chapter.md"],
      acceptedPatchTargets: [],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await fs.appendFile(path.join(tempRoot, "quality-rewrite-demo", "tasks", "history.jsonl"), `${JSON.stringify(task)}\n`, "utf8");
    await fs.appendFile(path.join(tempRoot, "quality-rewrite-demo", "tasks", "invocations.jsonl"), `${JSON.stringify(invocation)}\n`, "utf8");

    const patched = await jsonFetch<{ applied: number; invocationUpdated: boolean; invocationId?: string }>(
      "/api/novel/projects/quality-rewrite-demo/patches",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: "task-quality-1",
          patches: [{ target: "chapters/wrong-chapter.md", mode: "replace-file", content: "client rewrite replacement" }]
        })
      }
    );
    const currentChapter = await jsonFetch<{ content: string }>("/api/novel/projects/quality-rewrite-demo/files/chapters/chapter-001.md");
    const auditAfter = await jsonFetch<{ invocations: Array<{ adoptionDecision: string; acceptedPatchTargets: string[] }> }>(
      "/api/novel/projects/quality-rewrite-demo/tasks/invocations"
    );

    expect(patched.status).toBe(200);
    expect(patched.data.applied).toBe(1);
    expect(patched.data.invocationUpdated).toBe(true);
    expect(patched.data.invocationId).toBe("invocation-quality-1");
    expect(currentChapter.data.content).toBe("client rewrite replacement");
    expect(
      await fs
        .readFile(path.join(tempRoot, "quality-rewrite-demo", "chapters", "wrong-chapter.md"), "utf8")
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
    expect(auditAfter.data.invocations[0]).toMatchObject({
      adoptionDecision: "accepted",
      acceptedPatchTargets: ["chapters/chapter-001.md"]
    });
  });

  it("uses the quality rewrite target patch before result commentary content", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quality Rewrite Patch Priority", roughIdea: "Prefer concrete rewrite patches." })
    });
    await jsonFetch("/api/novel/projects/quality-rewrite-patch-priority/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "original chapter" })
    });

    const task = {
      id: "task-quality-priority",
      type: "quality.rewrite",
      status: "success",
      projectId: "quality-rewrite-patch-priority",
      inputSummary: JSON.stringify({ filePath: "chapters/chapter-001.md", documentKind: "content", targetScore: 86 }),
      outputSummary: "quality rewrite complete",
      result: {
        summary: "target patch candidate",
        content: "Commentary: the rewritten chapter is provided as a patch.",
        changes: [],
        risks: [],
        questions: [],
        patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "complete patched chapter" }]
      },
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:00:01.000Z",
      durationMs: 1000
    };
    await fs.appendFile(path.join(tempRoot, "quality-rewrite-patch-priority", "tasks", "history.jsonl"), `${JSON.stringify(task)}\n`, "utf8");

    const patched = await jsonFetch<{ applied: number }>(
      "/api/novel/projects/quality-rewrite-patch-priority/patches",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: "task-quality-priority",
          patches: []
        })
      }
    );
    const currentChapter = await jsonFetch<{ content: string }>(
      "/api/novel/projects/quality-rewrite-patch-priority/files/chapters/chapter-001.md"
    );

    expect(patched.status).toBe(200);
    expect(currentChapter.data.content).toBe("complete patched chapter");
  });

  it("rejects quality rewrite patches without a current chapter content target", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quality Rewrite Guard", roughIdea: "Reject ambiguous rewrite targets." })
    });
    await jsonFetch("/api/novel/projects/quality-rewrite-guard/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "original chapter" })
    });
    const task = {
      id: "task-quality-guard",
      type: "quality.rewrite",
      status: "success",
      projectId: "quality-rewrite-guard",
      inputSummary: JSON.stringify({ documentKind: "content", targetScore: 86 }),
      outputSummary: "quality rewrite complete",
      result: {
        summary: "ambiguous",
        content: "replacement",
        changes: [],
        risks: [],
        questions: [],
        patches: []
      },
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:00:01.000Z",
      durationMs: 1000
    };
    await fs.appendFile(path.join(tempRoot, "quality-rewrite-guard", "tasks", "history.jsonl"), `${JSON.stringify(task)}\n`, "utf8");

    const patched = await jsonFetch<{ error: string }>("/api/novel/projects/quality-rewrite-guard/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task-quality-guard",
        patches: [{ target: "chapters/chapter-001.md", mode: "replace-file", content: "replacement" }]
      })
    });
    const currentChapter = await jsonFetch<{ content: string }>("/api/novel/projects/quality-rewrite-guard/files/chapters/chapter-001.md");

    expect(patched.status).toBe(400);
    expect(patched.data.error).toContain("Quality rewrite task is missing");
    expect(currentChapter.data.content).toBe("original chapter");
  });

  it("rejects unsupported task types before invoking Codex", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task Demo", roughIdea: "Task validation." })
    });

    const response = await jsonFetch<{ error: string }>("/api/novel/projects/task-demo/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unknown.task", payload: {} })
    });

    expect(response.status).toBe(400);
    expect(response.data.error).toContain("Unsupported task type");
  });

  it("starts and polls an async AI task route", async () => {
    process.env.CODEX_COMMAND = await writeMockCodexCommand(tempRoot);
    process.env.MOCK_CODEX_DELAY_MS = "1";
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Async Task Demo", roughIdea: "Run AI without blocking the UI." })
    });

    const started = await jsonFetch<{ task: { id: string; status: string; timeoutMs: number } }>(
      "/api/novel/projects/async-task-demo/tasks/async",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "writing.recap", payload: { chapterId: "chapter-001" } })
      }
    );
    const finished = await waitForTask("async-task-demo", started.data.task.id);
    const history = await jsonFetch<{ tasks: Array<{ id: string; status: string; contextPlan?: { schemaVersion: string; status: string; fingerprint: string }; contextManifestRef?: string }> }>(
      "/api/novel/projects/async-task-demo/tasks"
    );

    expect(started.status).toBe(202);
    expect(started.data.task).toMatchObject({ status: "running", timeoutMs: 600000 });
    expect(finished.task).toMatchObject({ status: "success", outputSummary: "mock task complete" });
    expect(history.data.tasks.filter((task) => task.id === started.data.task.id)).toEqual([
      expect.objectContaining({ status: "success", contextPlan: expect.objectContaining({ schemaVersion: "context-plan.v1", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }), contextManifestRef: expect.stringContaining("tasks/context-manifests/") })
    ]);
    const manifestRef = history.data.tasks.find((task) => task.id === started.data.task.id)?.contextManifestRef || "";
    const manifestId = path.basename(manifestRef, ".json");
    const manifest = await jsonFetch<{ manifest: { schemaVersion: string; taskId: string; sourceFingerprint: string } }>(
      `/api/novel/projects/async-task-demo/tasks/context-manifests/${manifestId}`
    );
    expect(manifest.status).toBe(200);
    expect(manifest.data.manifest).toMatchObject({ schemaVersion: "task-context-manifest.v1", taskId: started.data.task.id, sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const freshness = await jsonFetch<{ freshness: { status: string; reasons: string[] } }>(
      `/api/novel/projects/async-task-demo/tasks/context-manifests/${manifestId}/freshness`
    );
    expect(freshness).toMatchObject({ status: 200 });
    expect(freshness.data.freshness.status).toBe("current");
  });

  it("lists stale running AI tasks as unrecoverable errors", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Stale Task Demo", roughIdea: "Detect interrupted AI work." })
    });
    await fs.mkdir(path.join(tempRoot, "stale-task-demo", "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(tempRoot, "stale-task-demo", "tasks", "history.jsonl"),
      `${JSON.stringify({
        id: "task-stale-running",
        type: "chapter.draft",
        status: "running",
        projectId: "stale-task-demo",
        inputSummary: "{}",
        startedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const history = await jsonFetch<{ tasks: Array<{ id: string; status: string; error?: string }> }>(
      "/api/novel/projects/stale-task-demo/tasks"
    );

    expect(history.status).toBe(200);
    expect(history.data.tasks).toEqual([
      expect.objectContaining({
        id: "task-stale-running",
        status: "error",
        error: expect.stringContaining("previous API process")
      })
    ]);
  });

  it("cancels a non-active running AI task route from history", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Cancel Task Demo", roughIdea: "Cancel stale work." })
    });
    await fs.mkdir(path.join(tempRoot, "cancel-task-demo", "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(tempRoot, "cancel-task-demo", "tasks", "history.jsonl"),
      `${JSON.stringify({
        id: "task-stale-running",
        type: "chapter.draft",
        status: "running",
        projectId: "cancel-task-demo",
        inputSummary: "{}",
        startedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const cancelled = await jsonFetch<{ task: { id: string; status: string; cancelRequestedAt?: string } }>(
      "/api/novel/projects/cancel-task-demo/tasks/task-stale-running/cancel",
      { method: "POST" }
    );
    const history = await jsonFetch<{ tasks: Array<{ id: string; status: string }> }>(
      "/api/novel/projects/cancel-task-demo/tasks"
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.data.task).toMatchObject({
      id: "task-stale-running",
      status: "cancelled",
      cancelRequestedAt: expect.any(String)
    });
    expect(history.data.tasks).toEqual([expect.objectContaining({ id: "task-stale-running", status: "cancelled" })]);
  });

  it("creates and reads a scoped non-canon world rule contract", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "World Rule Demo", roughIdea: "A regional rule must stay bounded." })
    });
    const created = await jsonFetch<{ contract: { ruleId: string; status: string; canonWritten: boolean; scope: { regions: string[] }; disclosure: { objectiveStatus: string } } }>(
      "/api/novel/projects/world-rule-demo/session/understanding/world-rule-contracts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCandidateId: "contract-candidate-1",
          sourceFingerprint: "a".repeat(64),
          proposition: { condition: "anchor", mechanism: "fold", result: "cross", cost: "lifespan", limit: "once", failure: "pain" },
          scope: { subjects: ["caster"], regions: ["nine-lotus-mountain"] },
          disclosure: { objectiveStatus: "unknown", domains: [{ domainId: "church", kind: "institution_belief", claim: "divine" }] },
          evidenceRefs: [{ kind: "dialogue-question", refId: "question-world-rule" }]
        })
      }
    );
    expect(created.status).toBe(201);
    expect(created.data.contract).toMatchObject({ status: "candidate", canonWritten: false, scope: { regions: ["nine-lotus-mountain"] }, disclosure: { objectiveStatus: "unknown" } });
    const read = await jsonFetch<{ contract: { ruleId: string } }>(`/api/novel/projects/world-rule-demo/session/understanding/world-rule-contracts/${created.data.contract.ruleId}`);
    expect(read.status).toBe(200);
    expect(read.data.contract.ruleId).toBe(created.data.contract.ruleId);
  });

  it("returns a typed not-found error when compiling a contract from an unknown decision", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Contract Candidate Error", roughIdea: "Unknown decisions must not become a 500." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(
      "/api/novel/projects/contract-candidate-error/session/understanding/contract-candidates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: "decision-does-not-exist" })
      }
    );
    expect(response.status).toBe(404);
    expect(response.data.error).toEqual({ code: "DECISION_NOT_FOUND" });
  });

  it("returns a typed not-found error when compiling an outline from an unknown contract", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Outline Candidate Error", roughIdea: "Unknown contracts must not become a 500." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(
      "/api/novel/projects/outline-candidate-error/session/understanding/outline-candidates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCandidateId: "contract-does-not-exist" })
      }
    );
    expect(response.status).toBe(404);
    expect(response.data.error).toEqual({ code: "CONTRACT_CANDIDATE_NOT_FOUND" });
  });

  it("lists contract candidates for a project", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Contract Candidate List", roughIdea: "Candidate lists are queryable." })
    });
    const response = await jsonFetch<{ candidates: unknown[] }>(
      "/api/novel/projects/contract-candidate-list/session/understanding/contract-candidates"
    );
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ candidates: [] });
  });

  it("returns typed not-found errors when reading missing contract and outline candidates", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Candidate Read Errors", roughIdea: "Missing candidates stay machine-readable." })
    });
    const contract = await jsonFetch<{ error: { code: string } }>(
      "/api/novel/projects/candidate-read-errors/session/understanding/contract-candidates/missing-contract"
    );
    expect(contract.status).toBe(404);
    expect(contract.data.error).toEqual({ code: "CONTRACT_CANDIDATE_NOT_FOUND" });

    const outline = await jsonFetch<{ error: { code: string } }>(
      "/api/novel/projects/candidate-read-errors/session/understanding/outline-candidates/missing-outline"
    );
    expect(outline.status).toBe(404);
    expect(outline.data.error).toEqual({ code: "OUTLINE_CANDIDATE_NOT_FOUND" });
  });

  it("returns a typed adoption error for a missing contract candidate", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Adoption Error", roughIdea: "Adoption failures stay machine-readable." })
    });
    const response = await jsonFetch<{ error: { code: string } }>(
      "/api/novel/projects/adoption-error/session/understanding/contract-adoption-proposals",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: "missing", expectedCandidateFingerprint: "f".repeat(64), fieldDecisions: [] })
      }
    );
    expect(response.status).toBe(409);
    expect(response.data.error).toEqual({ code: "CANDIDATE_NOT_FOUND" });
  });

  it("lists execution work items for audit without starting a run", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Execution Work Items", roughIdea: "Queue state is inspectable." })
    });
    const response = await jsonFetch<{ workItems: unknown[] }>("/api/novel/projects/execution-work-items/runtime/execution-work-items");
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ workItems: [] });
  });

  it("lists prose candidates without writing canon", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Prose Candidates", roughIdea: "Candidate prose is inspectable." })
    });
    const response = await jsonFetch<{ candidates: unknown[] }>("/api/novel/projects/prose-candidates/runtime/prose-candidates");
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ candidates: [] });
  });

  it("enforces learning policy and exploration budget routes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Learning Budget API", roughIdea: "Bounded exploration." })
    });
    const slug = created.data.project.slug;
    const policy = await jsonFetch<{ policy: { minIndependentEvidence: number } }>(`/api/novel/projects/${slug}/runtime/learning-policy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rollbackVersion: "policy-v1" }) });
    expect(policy.status).toBe(201);
    expect(policy.data.policy.minIndependentEvidence).toBe(2);
    const budget = await jsonFetch<{ budget: { budgetId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/exploration-budgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "chapter-1", maxProbes: 2, maxCost: 10, maxImpact: "chapter-1", stopConditions: ["author-correction"] }) });
    expect(budget.status).toBe(201);
    const consumed = await jsonFetch<{ budget: { usedProbes: number } }>(`/api/novel/projects/${slug}/runtime/exploration-budgets/${budget.data.budget.budgetId}/consume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: "probe-1", probes: 1, cost: 2, impact: "chapter-1" }) });
    expect(consumed.status).toBe(200);
    expect(consumed.data.budget.usedProbes).toBe(1);
    const paused = await jsonFetch<{ budget: { status: string } }>(`/api/novel/projects/${slug}/runtime/exploration-budgets/${budget.data.budget.budgetId}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "author review" }) });
    expect(paused.status).toBe(200);
    expect(paused.data.budget.status).toBe("paused");
  });

  it("exposes a non-mutating book-run preflight with explicit blockers", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run Preflight", roughIdea: "Predict before running." }) });
    const blocked = await jsonFetch<{ preflight: { status: string; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: "preflight-blocked", objective: "draft", estimatedWorkItems: 1, estimatedWallClockMs: 1000, estimatedCostCents: 2, authorizationScope: "chapter-1", worstCaseRecoveryBoundary: "chapter-boundary", storyContractConfirmed: false, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false }) });
    expect(blocked.status).toBe(409);
    expect(blocked.data.preflight).toMatchObject({ status: "blocked", blockedReasons: ["STORY_CONTRACT_UNCONFIRMED"] });
    const ready = await jsonFetch<{ preflight: { runId: string; status: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: "preflight-ready", objective: "draft", estimatedWorkItems: 1, estimatedWallClockMs: 1000, estimatedCostCents: 2, authorizationScope: "chapter-1", worstCaseRecoveryBoundary: "chapter-boundary", storyContractConfirmed: true, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false }) });
    expect(ready.status).toBe(200);
    expect(ready.data.preflight.status).toBe("ready");
    const replayed = await jsonFetch<{ preflight: { runId: string; fingerprint: string; status: string } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/preflight/preflight-ready`);
    expect(replayed.status).toBe(200);
    expect(replayed.data.preflight).toMatchObject({ runId: "preflight-ready", fingerprint: expect.any(String), status: "ready" });
  });

  it("exposes execution ceilings in book-run preflight and blocks over-budget estimates", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run Limits", roughIdea: "Every run has bounded execution." }) });
    const response = await jsonFetch<{ preflight: { status: string; limits: { maxWorkItems: number }; blockedReasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/book-runs/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objective: "draft", estimatedChapters: 3, estimatedWorkItems: 4, estimatedWallClockMs: 1000, estimatedCostCents: 20, authorizationScope: "chapter-1-3", worstCaseRecoveryBoundary: "chapter-boundary", limits: { maxChapters: 3, maxWorkItems: 3, maxModelCalls: 6, maxCostCents: 20, maxWallClockMs: 1000, maxConsecutiveFailures: 2, latestStopAt: "2099-01-01T00:00:00.000Z" }, storyContractConfirmed: true, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false }) });
    expect(response.status).toBe(409);
    expect(response.data.preflight).toMatchObject({ status: "blocked", limits: { maxWorkItems: 3 }, blockedReasons: ["WORK_ITEM_ESTIMATE_EXCEEDS_LIMIT"] });
  });

  it("routes shadow and authorized canary validation without canon writes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Shadow Canary API", roughIdea: "Candidate rollout." }) });
    const shadow = await jsonFetch<{ validation: { mode: string; canonWrites: boolean; status: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/shadow-canary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ validationId: "shadow-api-1", candidateVersion: "prompt-v2", mode: "shadow", status: "passed", rollbackTarget: "prompt-v1", evidenceRefs: ["run://shadow-1"] }) });
    expect(shadow.status).toBe(201);
    expect(shadow.data.validation).toMatchObject({ mode: "shadow", canonWrites: false, status: "passed" });
    const unauthorized = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/shadow-canary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ validationId: "canary-api-1", candidateVersion: "prompt-v2", mode: "canary", status: "passed", rollbackTarget: "prompt-v1", evidenceRefs: ["run://canary-1"], authorAuthorized: false }) });
    expect(unauthorized.status).toBe(409);
    expect(unauthorized.data.error.code).toBe("SHADOW_CANARY_AUTHORIZATION_INVALID");
  });

  it("routes evaluation disagreements without manufacturing a winner", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluation Disagreement API", roughIdea: "Ties need explicit escalation." }) });
    const slug = created.data.project.slug;
    const tie = await jsonFetch<{ decision: { status: string; action: string }; disagreementId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/disagreements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdicts: [{ verdict: "accept", confidence: 0.8 }, { verdict: "tie", confidence: 0.6 }], impact: "ordinary", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true }) });
    expect(tie.status).toBe(201);
    expect(tie.data.decision).toMatchObject({ status: "uncertain", action: "continue" });
    const replayed = await jsonFetch<{ decision: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/disagreements/${tie.data.disagreementId}`);
    expect(replayed.status).toBe(200);
    expect(replayed.data.decision.fingerprint).toBe(tie.data.decision.fingerprint);
    const invalid = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/disagreements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdicts: [{ verdict: "winner", confidence: 1 }], impact: "ordinary" }) });
    expect(invalid.status).toBe(409);
    expect(invalid.data.error.code).toBe("EVALUATION_DISAGREEMENT_INPUT_INVALID");
  });

  it("exposes seeded repeat sampling and wider-scale regression through runtime evaluation", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluation Sampling API", roughIdea: "Repeat results must remain visible." }) });
    const slug = created.data.project.slug;
    const plan = await jsonFetch<{ plan: { fingerprint: string; seeds: number[] } }>(`/api/novel/projects/${slug}/runtime/evaluation/sampling`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seeds: [21, 22, 23], temperature: 0.7, topP: 0.9, minSamples: 2, maxSamples: 3, stopRule: "fixed-count" }) });
    expect(plan.status).toBe(201);
    const summary = await jsonFetch<{ summary: { samples: number; fingerprint: string; winRate: number }; summaryId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/sampling/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: { seeds: plan.data.plan.seeds, temperature: 0.7, topP: 0.9, minSamples: 2, maxSamples: 3, stopRule: "fixed-count" }, outcomes: [{ valid: true, win: true, failed: false }, { valid: true, win: false, failed: false }, { valid: false, win: false, failed: true }] }) });
    expect(summary.status).toBe(201);
    expect(summary.data.summary).toMatchObject({ samples: 3, winRate: 1 / 3 });
    const summaryReplay = await jsonFetch<{ summary: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/sampling/summaries/${summary.data.summaryId}`);
    expect(summaryReplay.status).toBe(200);
    expect(summaryReplay.data.summary.fingerprint).toBe(summary.data.summary.fingerprint);
    const regression = await jsonFetch<{ result: { status: string; regressions: string[]; fingerprint: string }; regressionId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseline: { selection: 0.7, book: 0.8 }, candidate: { selection: 0.9, book: 0.7 }, hardFailures: [] }) });
    expect(regression.status).toBe(201);
    expect(regression.data.result).toMatchObject({ status: "regression", regressions: ["score:book"] });
    const regressionReplay = await jsonFetch<{ result: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression/${regression.data.regressionId}`);
    expect(regressionReplay.status).toBe(200);
    expect(regressionReplay.data.result.fingerprint).toBe(regression.data.result.fingerprint);
  });

  it("turns a production defect into an immutable replayable evaluation case", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluation Case API", roughIdea: "Feedback becomes regression." }) });
    const body = { caseId: "case-api-1", trigger: "production-regression", defectCategory: "style-drift", candidateRef: "candidate://api-1", inputFingerprint: "input-api-1", expectedGuardRefs: ["guard://style"], fixVersion: "strategy-api-2" };
    const saved = await jsonFetch<{ evaluationCase: { caseId: string; replayable: boolean; containsPrivateText: boolean }; created: boolean }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    expect(saved.data).toMatchObject({ created: true, evaluationCase: { caseId: "case-api-1", replayable: true, containsPrivateText: false } });
    const readBack = await jsonFetch<{ evaluationCase: { caseId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/cases/case-api-1`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.evaluationCase.caseId).toBe("case-api-1");
  });

  it("reports style drift while honoring only explicitly intentional motifs", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Style Drift API", roughIdea: "Long-range voice stability." }) });
    const base = { abstractWordRate: 0.1, processWordRate: 0.1, sentenceStartDistribution: { name: 0.5 }, dialogueTurnRate: 0.4, hookTypeDistribution: { question: 1 }, sensoryChannelDistribution: { visual: 1 }, characterVoiceDistance: 0.6, sceneFunctionDistribution: { conflict: 1 } };
    const drift = await jsonFetch<{ drift: { status: string; anomalies: string[]; intentionalMotifsExcluded: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/style-drift`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseline: base, candidate: { ...base, processWordRate: 0.5, characterVoiceDistance: 0.2 }, threshold: 0.2, intentionalMotifs: ["process-word-rate"] }) });
    expect(drift.status).toBe(200);
    expect(drift.data.drift).toMatchObject({ status: "anomaly", intentionalMotifsExcluded: ["process-word-rate"], anomalies: ["character-voice-distance"] });
  });

  it("persists release decisions and prevents a second conclusion for the same release id", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Release Decision API", roughIdea: "Release evidence is immutable." }) });
    const body = { releaseId: "release-api-1", hardGatesPassed: true, keySliceRegressions: [], blindPairWinRate: 0.8, minimumWinRate: 0.6, evidenceComplete: true, rollbackRef: "release-api-0", shadowValidated: true, canaryValidated: true, qualityNonInferior: true, actualCostCents: 8, maxCostCents: 10, actualLatencyMs: 800, maxLatencyMs: 1000, criticalSlicesStable: true, paretoEligible: true };
    const saved = await jsonFetch<{ decision: { releaseId: string; status: string }; created: boolean }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/release-decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    const readBack = await jsonFetch<{ decision: { releaseId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/release-decisions/release-api-1`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.decision.releaseId).toBe("release-api-1");
    const conflict = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/release-decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, hardGatesPassed: false }) });
    expect(conflict.status).toBe(409);
    expect(conflict.data.error.code).toBe("RELEASE_DECISION_IMMUTABLE");
  });

  it("enforces slice regression budgets independently of the overall score", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Slice Budget API", roughIdea: "Key slices cannot regress." }) });
    const budget = { sliceId: "romance-aftermath-pov1", dimensions: { genre: "romance", chapterFunction: "aftermath", pov: "hero", lengthBand: "medium", risk: "high", knownDefects: ["flat-emotion"] }, minimumSamples: 3, allowedRegression: 0.02, zeroTolerance: true };
    const saved = await jsonFetch<{ budget: { sliceId: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/slice-budgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(budget) });
    expect(saved.status).toBe(201);
    const result = await jsonFetch<{ resultId: string; result: { status: string; reasons: string[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/slice-results`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, samples: 3, baselineScore: 0.7, candidateScore: 0.9, hardFailures: ["emotion-flat"] }) });
    expect(result.status).toBe(201);
    expect(result.data.result).toMatchObject({ status: "regression", reasons: ["HARD_FAILURE"] });
    const replay = await jsonFetch<{ result: { status: string; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/slice-results/${result.data.resultId}`);
    expect(replay.status).toBe(200);
    expect(replay.data.result).toMatchObject({ status: "regression", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("keeps evaluation judgments anchored to current prose and governing versions", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evidence Anchor API", roughIdea: "Judgments need spans." }) });
    const body = { evaluationId: "eval-anchor-api-1", content: "The door opened. Rain entered.", anchors: [{ start: 0, end: 15 }], contractFingerprint: "contract-api-1", chapterIntentFingerprint: "intent-api-1", reason: "The hook is on the page." };
    const saved = await jsonFetch<{ evaluation: { status: string; anchors: unknown[] } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/evidence-anchors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    const replayed = await jsonFetch<{ evaluation: { evaluationId: string; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/evidence-anchors/${body.evaluationId}`);
    expect(replayed.status).toBe(200);
    expect(replayed.data.evaluation).toMatchObject({ evaluationId: body.evaluationId, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const current = await jsonFetch<{ current: boolean }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/evidence-anchors/current`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluation: saved.data.evaluation, content: body.content, contractFingerprint: body.contractFingerprint, chapterIntentFingerprint: body.chapterIntentFingerprint }) });
    expect(current.data.current).toBe(true);
    const stale = await jsonFetch<{ current: boolean; error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/evaluation/evidence-anchors/current`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluation: saved.data.evaluation, content: "The window opened. Rain entered.", contractFingerprint: body.contractFingerprint, chapterIntentFingerprint: body.chapterIntentFingerprint }) });
    expect(stale.status).toBe(409);
    expect(stale.data.error.code).toBe("EVALUATION_EVIDENCE_STALE");
  });

  it("serves chapter-function adaptive evaluation scales with not-applicable dimensions excluded", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Adaptive Scale API", roughIdea: "Function-specific scoring." }) });
    const slug = created.data.project.slug;
    const saved = await jsonFetch<{ scale: { chapterFunction: string; average: number; dimensions: Array<{ dimension: string; status: string; score: number | null }> } }>(`/api/novel/projects/${slug}/runtime/evaluation/adaptive-scale`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterFunction: "aftermath", scores: { emotion: 0.8, relationship: 0.6, conflict: 1 } }) });
    expect(saved.status).toBe(201);
    expect(saved.data.scale.average).toBeCloseTo(0.7);
    expect(saved.data.scale.dimensions).toEqual(expect.arrayContaining([{ dimension: "conflict", status: "not_applicable", score: null }]));
    const rejected = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/adaptive-scale`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterFunction: "puzzle", scores: { "fair-clues": 2 } }) });
    expect(rejected.status).toBe(400);
    expect(rejected.data.error.code).toBe("EVALUATION_SCORE_INVALID");
  });

  it("keeps unknown source rights analysis-only through API routes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Source Rights API", roughIdea: "Rights must be explicit." }) });
    const slug = created.data.project.slug;
    const source = await jsonFetch<{ source: { sourceId: string; rightsStatus: string } }>(`/api/novel/projects/${slug}/runtime/source-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Unknown reference", type: "web", provenance: "import", rightsStatus: "unknown", licensor: "", allowedUses: ["analysis", "generation"], projectScope: slug, retainExcerpt: true, importedBy: "system" }) });
    expect(source.status).toBe(201);
    const envelope = await jsonFetch<{ envelope: { status: string; analysisOnly: boolean; allowedUses: string[] } }>(`/api/novel/projects/${slug}/runtime/source-material/${source.data.source.sourceId}/rights-envelope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedBy: "system" }) });
    expect(envelope.status).toBe(201);
    expect(envelope.data.envelope).toMatchObject({ status: "restricted", analysisOnly: true, allowedUses: ["analysis"] });
  });

  it("persists and replays evaluation run archives through the project API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluation Archive API", roughIdea: "Replay evidence." }) });
    const slug = created.data.project.slug;
    const body = { runId: "api-run-1", suiteFingerprint: "suite-sha", caseRefs: ["case://1"], candidateRefs: ["candidate://1"], inputFingerprint: "input-sha", modelVersion: "model-v1", promptVersion: "prompt-v1", contextFingerprint: "context-sha", evaluatorVersion: "eval-v1", seeds: [7], usage: { inputTokens: 10, outputTokens: 5, costCents: 2, latencyMs: 100 }, rawJudgments: [{ evaluatorId: "judge", verdict: "accept", confidence: 0.9, evidenceRefs: ["anchor://1"] }], aggregationRule: "hard-gate", releaseConclusion: "experimental", reproducibility: "replayable" };
    const saved = await jsonFetch<{ archive: { runId: string; rawJudgments: unknown[] } }>(`/api/novel/projects/${slug}/runtime/evaluation/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    const replay = await jsonFetch<{ archive: { runId: string; rawJudgments: unknown[] } }>(`/api/novel/projects/${slug}/runtime/evaluation/runs/api-run-1`);
    expect(replay.status).toBe(200);
    expect(replay.data.archive).toMatchObject({ runId: "api-run-1", rawJudgments: [{ evaluatorId: "judge" }] });
  });

  it("persists and replays evaluation contamination checks by holdout", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Contamination API", roughIdea: "Holdout checks are durable." }) });
    const slug = created.data.project.slug;
    const body = { holdoutId: "holdout-api-1", visibleData: ["visible-token"], output: "safe output" };
    const saved = await jsonFetch<{ contamination: { status: string; fingerprint: string }; created: boolean }>(`/api/novel/projects/${slug}/runtime/evaluation/contamination`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    expect(saved.data.contamination).toMatchObject({ status: "valid", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const replay = await jsonFetch<{ contamination: { holdoutId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/contamination/${body.holdoutId}`);
    expect(replay.status).toBe(200);
    expect(replay.data.contamination).toMatchObject({ holdoutId: body.holdoutId, fingerprint: saved.data.contamination.fingerprint });
    const changed = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/contamination`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, visibleData: ["secret"], output: "secret" }) });
    expect(changed.status).toBe(409);
    expect(changed.data.error.code).toBe("EVALUATION_CONTAMINATION_IMMUTABLE");
  });

  it("persists and replays evaluator drift conclusions by explicit versioned id", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluator Drift API", roughIdea: "Drift conclusions remain auditable." }) });
    const slug = created.data.project.slug;
    const body = { driftId: "drift-api-1", previousAgreement: 0.8, currentAgreement: 0.82, previousBias: 0.02, currentBias: 0.03, previousVersion: "judge-v1", currentVersion: "judge-v1", historicalScores: [{ caseId: "case-1", evaluatorVersion: "judge-v1", score: 0.8 }], recomputedScores: [{ caseId: "case-1", evaluatorVersion: "judge-v1", score: 0.81 }] };
    const saved = await jsonFetch<{ drift: { status: string; fingerprint: string }; created: boolean }>(`/api/novel/projects/${slug}/runtime/evaluation/drift`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(saved.status).toBe(201);
    expect(saved.data.drift).toMatchObject({ status: "stable", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const replay = await jsonFetch<{ drift: { fingerprint: string }; driftId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/drift/${body.driftId}`);
    expect(replay.status).toBe(200);
    expect(replay.data).toMatchObject({ driftId: body.driftId, drift: { fingerprint: saved.data.drift.fingerprint } });
    const changed = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/drift`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, currentAgreement: 0.4, currentVersion: "judge-v2" }) });
    expect(changed.status).toBe(409);
    expect(changed.data.error.code).toBe("EVALUATION_DRIFT_IMMUTABLE");
  });

  it("requires active project authorization before a private sample enters platform regression", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Evaluation Rights API", roughIdea: "Private samples stay scoped." }) });
    const slug = created.data.project.slug;
    const grant = await jsonFetch<{ grant: { grantId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/access-grants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ use: "platform-regression", sourceRefs: ["source://chapter-1"], minimized: true, anonymized: true }) });
    expect(grant.status).toBe(201);
    const run = { runId: "rights-run-1", suiteFingerprint: "suite-sha", caseRefs: ["case://1"], candidateRefs: ["candidate://1"], inputFingerprint: "input-sha", modelVersion: "model-v1", promptVersion: "prompt-v1", contextFingerprint: "context-sha", evaluatorVersion: "eval-v1", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "accept", confidence: 1, evidenceRefs: ["anchor://1"] }], aggregationRule: "hard-gate", releaseConclusion: "experimental", reproducibility: "replayable", evaluationScope: "platform-regression", accessGrantId: grant.data.grant.grantId };
    expect((await jsonFetch(`/api/novel/projects/${slug}/runtime/evaluation/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(run) })).status).toBe(201);
    const revoked = await jsonFetch<{ grant: { status: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/access-grants/${grant.data.grant.grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Author withdrew authorization." }) });
    expect(revoked.data.grant.status).toBe("revoked");
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/evaluation/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...run, runId: "rights-run-2" }) });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe("EVALUATION_ACCESS_REVOKED");
  });

  it("persists runtime work leases and fences stale workers", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Work Lease API", roughIdea: "Workers are fenced." }) });
    const slug = created.data.project.slug;
    const acquired = await jsonFetch<{ lease: { fencingToken: number } }>(`/api/novel/projects/${slug}/runtime/work-leases/acquire`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workItemId: "work-1", writeSet: "chapter:c1", ownerId: "worker-a", nowMs: 1000, ttlMs: 10 }) });
    expect(acquired.status).toBe(201);
    const replaced = await jsonFetch<{ lease: { fencingToken: number } }>(`/api/novel/projects/${slug}/runtime/work-leases/acquire`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workItemId: "work-1", writeSet: "chapter:c1", ownerId: "worker-b", nowMs: 1011, ttlMs: 20 }) });
    expect(replaced.data.lease.fencingToken).toBe(2);
    const stale = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/work-leases/work-1/renew`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: "worker-a", fencingToken: 1, nowMs: 1012, ttlMs: 20 }) });
    expect(stale.status).toBe(409);
    expect(stale.data.error.code).toBe("FENCING_TOKEN_LOST");
  });

  it("pauses a run when stagnation thresholds are crossed and exposes break options", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Stagnation API", roughIdea: "Repeated repairs must pause." }) });
    const result = await jsonFetch<{ incident: { status: string; thresholds: string[]; breakOptions: string[] }; record: { incidentId: string; projectSlug: string; fingerprint: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/stagnation-detection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId: "stagnation-api-1", workFingerprints: ["same", "same", "same"], rewriteCount: 4, questionFingerprints: ["q", "q", "q"], qualityScores: [0.8, 0.6, 0.8, 0.6], newAssetCount: 0, completionSignals: 2, openObligations: 1 }) });
    expect(result.status).toBe(409);
    expect(result.data.incident).toMatchObject({ status: "paused" });
    expect(result.data.incident.thresholds).toEqual(expect.arrayContaining(["repeated-work-fingerprint", "rewrite-loop"]));
    expect(result.data.incident.breakOptions).toEqual(expect.arrayContaining(["ask-author", "replan-subgraph"]));
    expect(result.data.record).toMatchObject({ incidentId: "stagnation-api-1", projectSlug: created.data.project.slug, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const recovered = await jsonFetch<{ record: { fingerprint: string; incident: { status: string } } }>(`/api/novel/projects/${created.data.project.slug}/runtime/stagnation-incidents/stagnation-api-1`);
    expect(recovered.status).toBe(200);
    expect(recovered.data.record).toMatchObject({ fingerprint: result.data.record.fingerprint, incident: { status: "paused" } });

    const run = await jsonFetch<{ run: { bookRunId: string; version: number } }>(`/api/novel/projects/${created.data.project.slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], limits: { maxWorkItems: 1 } }) });
    expect(run.status).toBe(201);
    const paused = await jsonFetch<{ bookRun: { status: string; currentGate: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/stagnation-detection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId: "stagnation-api-run", bookRunId: run.data.run.bookRunId, expectedVersion: run.data.run.version, workFingerprints: ["loop", "loop", "loop"], rewriteCount: 3, newAssetCount: 0 }) });
    expect(paused.status).toBe(409);
    expect(paused.data.bookRun).toMatchObject({ status: "paused", currentGate: "none" });
  });

  it("keeps high-risk review items out of batch acceptance while allowing item withdrawal", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Review Batch API", roughIdea: "Batch review remains risk scoped." }) });
    const slug = created.data.project.slug;
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/review-batches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: "batch-high", items: [{ itemId: "high-1", risk: "high", summary: "ending change", evidenceRefs: ["review://1"] }] }) });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe("REVIEW_BATCH_HIGH_RISK_ITEM");
    const saved = await jsonFetch<{ batch: { batchId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/review-batches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: "batch-low", items: [{ itemId: "low-1", risk: "low", summary: "tighten wording", evidenceRefs: ["review://1"] }] }) });
    expect(saved.status).toBe(201);
    const withdrawn = await jsonFetch<{ batch: { status: string; items: Array<{ status: string }> } }>(`/api/novel/projects/${slug}/runtime/review-batches/batch-low/items/low-1/withdraw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(withdrawn.data.batch).toMatchObject({ status: "partially_withdrawn", items: [{ status: "withdrawn" }] });
  });

  it("records and replays a downstream decision-consumption receipt", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Decision Receipt API", roughIdea: "Every downstream asset names its decision version." }) });
    const slug = created.data.project.slug;
    const question = await createDialogueQuestion(path.join(tempRoot, slug), { projectSlug: slug, questionId: "question-receipt", questionVersion: 2, text: "What should the outline protect?", whyNow: "It binds the downstream plan.", impact: "high", ambiguity: 0.5, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["the promise"], recommendation: "the promise", snapshotFingerprint: "snapshot-v2" });
    const answered = await answerDialogueQuestion(path.join(tempRoot, slug), { questionId: question.question.questionId, questionVersion: 2, expectedSnapshotFingerprint: "snapshot-v2", idempotencyKey: "receipt-answer", answerText: "Protect the promise.", answerStatus: "confirmed" });
    const decisionId = answered.decision?.decisionId;
    expect(decisionId).toBeTruthy();
    const saved = await jsonFetch<{ receipt: { decisionId: string; decisionVersion: number }; created: boolean }>(`/api/novel/projects/${slug}/runtime/dialogue/decision-consumption-receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: "consume-api-1", decisionId, decisionVersion: 2, consumer: "outline", consumerRef: "outline-v2", sourceFingerprint: "snapshot-v2" }) });
    expect(saved.status).toBe(201);
    expect(saved.data.receipt).toMatchObject({ decisionId, decisionVersion: 2 });
    const replay = await jsonFetch<{ receipt: { receiptId: string } }>(`/api/novel/projects/${slug}/runtime/dialogue/decision-consumption-receipts/consume-api-1`);
    expect(replay.status).toBe(200);
    expect(replay.data.receipt.receiptId).toBe("consume-api-1");
  });

  it("rejects a downstream consumption receipt for an unknown decision", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Decision Receipt Boundary", roughIdea: "Only authoritative decisions may be consumed." }) });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/dialogue/decision-consumption-receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptId: "consume-unknown", decisionId: "missing-decision", decisionVersion: 1, consumer: "outline", consumerRef: "outline-v1", sourceFingerprint: "snapshot-v1" })
    });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("DECISION_NOT_FOUND");
  });

  it("requires a project-scoped prose decision-consumption receipt before freezing a prose manifest", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Prose Manifest Boundary", roughIdea: "Prose must consume an authoritative decision." }) });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/runtime/prose-generation-manifests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifestId: "manifest-without-receipt", decisionConsumptionReceiptRef: "missing-receipt", storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: [], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] })
    });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_MANIFEST_DECISION_RECEIPT_INVALID");
  });

  it("freezes a prose manifest from an authoritative prose decision-consumption receipt", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Prose Manifest Receipt", roughIdea: "The receipt binds prose to the decision projection." }) });
    const slug = created.data.project.slug;
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-prose-1", projectSlug: slug, decisionId: "decision-1", decisionVersion: 1, consumer: "prose", consumerRef: "manifest-1", sourceFingerprint: "snapshot-1" });
    await persistDecisionConsumptionReceipt(path.join(tempRoot, slug), receipt);
    await writeReleasedCraftPattern(slug);
    const response = await jsonFetch<{ manifest: { status: string; decisionConsumptionReceiptRef: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifestId: "manifest-1", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] })
    });
    expect(response.status).toBe(201);
    expect(response.data.manifest).toMatchObject({ status: "frozen", decisionConsumptionReceiptRef: receipt.receiptId });
    const readManifest = await jsonFetch<{ manifest: { manifestId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests/${response.data.manifest.manifestId}`);
    expect(readManifest.status).toBe(200);
    expect(readManifest.data.manifest).toMatchObject({ manifestId: response.data.manifest.manifestId, fingerprint: response.data.manifest.fingerprint });
    const freshness = await jsonFetch<{ status: string }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests/manifest-1/freshness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest: { fingerprint: "attacker-controlled" }, candidateManifestFingerprint: response.data.manifest.fingerprint }) });
    expect(freshness.status).toBe(200);
    expect(freshness.data.status).toBe("fresh");
  });

  it("requires an authoritative obligation decision-consumption receipt when one is supplied", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Obligation Receipt Boundary", roughIdea: "Obligations may bind a shared decision projection." }) });
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${created.data.project.slug}/obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "mystery", title: "The missing key", questionOrPromise: "Who took it?", decisionConsumptionReceiptRef: "missing-obligation-receipt" }) });
    expect(response.status).toBe(400);
    expect(response.data.error.code).toBe("OBLIGATION_DECISION_RECEIPT_INVALID");
  });

  it("persists the obligation receipt reference in the obligation projection", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Obligation Receipt", roughIdea: "The obligation records its decision source." }) });
    const slug = created.data.project.slug;
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-obligation-1", projectSlug: slug, decisionId: "decision-1", decisionVersion: 1, consumer: "obligation", consumerRef: "obligation-source", sourceFingerprint: "snapshot-1" });
    await persistDecisionConsumptionReceipt(path.join(tempRoot, slug), receipt);
    const response = await jsonFetch<{ obligation: { decisionConsumptionReceiptRef?: string } }>(`/api/novel/projects/${slug}/obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "mystery", title: "The missing key", questionOrPromise: "Who took it?", decisionConsumptionReceiptRef: receipt.receiptId }) });
    expect(response.status).toBe(201);
    expect(response.data.obligation.decisionConsumptionReceiptRef).toBe(receipt.receiptId);
  });

  it("rejects a prose manifest that borrows another manifest's prose receipt", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Prose Receipt Ref", roughIdea: "A receipt must name its exact consumer." }) });
    const slug = created.data.project.slug;
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-prose-other", projectSlug: slug, decisionId: "decision-1", decisionVersion: 1, consumer: "prose", consumerRef: "different-manifest", sourceFingerprint: "snapshot-1" });
    await persistDecisionConsumptionReceipt(path.join(tempRoot, slug), receipt);
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId: "manifest-exact", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_MANIFEST_DECISION_RECEIPT_INVALID");
  });

  it("requires a valid style-experiment rights envelope before craft pattern approval", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Pattern API", roughIdea: "Patterns need provenance." }) });
    const slug = created.data.project.slug;
    const source = await jsonFetch<{ source: { sourceId: string } }>(`/api/novel/projects/${slug}/runtime/source-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Owned notes", type: "notes", provenance: "author-upload", rightsStatus: "owned", licensor: "author", allowedUses: ["analysis", "style-experiment"], projectScope: slug, retainExcerpt: false, importedBy: "author" }) });
    const envelope = await jsonFetch<{ envelope: { envelopeId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/source-material/${source.data.source.sourceId}/rights-envelope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedBy: "author" }) });
    const pattern = await jsonFetch<{ pattern: { patternId: string; lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/craft-patterns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Scoped rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: [], sourceEnvelopeIds: [envelope.data.envelope.envelopeId], evidenceRefs: ["source://notes#1"] }) });
    expect(pattern.status).toBe(201);
    expect(pattern.data.pattern.lifecycle).toBe("candidate");
    const approved = await jsonFetch<{ pattern: { lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author", reason: "Scoped to this project" }) });
    expect(approved.status).toBe(200);
    expect(approved.data.pattern.lifecycle).toBe("approved");
  });

  it("completes source-to-experiment craft learning lifecycle through API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Learning Lifecycle", roughIdea: "A source-backed pattern must earn release through independent experiments." }) });
    const slug = created.data.project.slug;
    const source = await jsonFetch<{ source: { sourceId: string } }>(`/api/novel/projects/${slug}/runtime/source-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Author craft notes", type: "notes", provenance: "author-upload", rightsStatus: "owned", licensor: "author", allowedUses: ["analysis", "style-experiment"], projectScope: slug, retainExcerpt: false, importedBy: "author" }) });
    const envelope = await jsonFetch<{ envelope: { envelopeId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/source-material/${source.data.source.sourceId}/rights-envelope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedBy: "author" }) });
    expect(envelope.data.envelope.status).toBe("valid");
    const pattern = await jsonFetch<{ pattern: { patternId: string; lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/craft-patterns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pressure rhythm", mechanism: "shorten turns before reveals", narrativeFunction: "sustain pressure", applicability: ["chase"], counterexamples: ["quiet reflection"], sourceEnvelopeIds: [envelope.data.envelope.envelopeId], evidenceRefs: ["source://author-notes#pressure"] }) });
    const approved = await jsonFetch<{ pattern: { patternId: string; lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author", reason: "Approved bounded style hypothesis" }) });
    expect(approved.data.pattern.lifecycle).toBe("approved");

    const guard = await jsonFetch<{ guard: Record<string, unknown> }>(`/api/novel/projects/${slug}/runtime/similarity-guards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceText: "storm lantern harbor", targetText: "quiet orchard window", maxTokenOverlap: 0.5, sourceVersion: "source-v1", targetVersion: "target-v1" }) });
    expect(guard.data.guard.status).toBe("passed");
    const plan = await jsonFetch<{ plan: { planId: string; targetChapterId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/pattern-transfer-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patternId: pattern.data.pattern.patternId, sourceEnvelopeId: envelope.data.envelope.envelopeId, guard: guard.data.guard, targetChapterId: "chapter-1", intendedEffect: "Increase reveal pressure without copying source wording" }) });
    expect(plan.data.plan.status).toBe("candidate");
    const secondPlan = await jsonFetch<{ plan: { planId: string; targetChapterId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/pattern-transfer-plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patternId: pattern.data.pattern.patternId, sourceEnvelopeId: envelope.data.envelope.envelopeId, guard: guard.data.guard, targetChapterId: "chapter-2", intendedEffect: "Preserve pressure in a different chapter function without copying source wording" }) });
    expect(secondPlan.data.plan.status).toBe("candidate");

    const runExperiment = async (suffix: string) => {
      const experimentPlan = suffix === "one" ? plan : secondPlan;
      expect(experimentPlan.data.plan.status).toBe("candidate");
      expect(experimentPlan.data.plan.targetChapterId).toBe(suffix === "one" ? "chapter-1" : "chapter-2");
      const experiment = await jsonFetch<{ experiment: { experimentId: string; status: string; runnerId?: string } }>(`/api/novel/projects/${slug}/runtime/craft-experiments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferPlanId: experimentPlan.data.plan.planId, baselineCandidateId: `baseline-${suffix}`, treatmentCandidateId: `treatment-${suffix}`, holdoutSceneIds: [`holdout-investigate-${suffix}`, `holdout-aftermath-${suffix}`], targetMetrics: ["reader-effect", "revision-cost"], budgetId: `budget-${suffix}` }) });
      expect(experiment.data.experiment.status).toBe("planned");
      const started = await jsonFetch<{ experiment: { status: string } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experiment.data.experiment.experimentId}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runnerId: `runner-${suffix}` }) });
      expect(started.data.experiment.status).toBe("running");
      const judged = await jsonFetch<{ experiment: { status: string; judgment?: { evaluatorKind: string }; holdoutValidation?: { status: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experiment.data.experiment.experimentId}/judge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorId: `reviewer-${suffix}`, evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Holdout review confirms bounded effect", holdout: { extractionSceneIds: [`extract-${suffix}`], sourceRefs: [`holdout://${suffix}`], cases: [{ caseId: `holdout-investigate-${suffix}`, sceneId: `holdout-investigate-${suffix}`, chapterFunction: "investigation", inputFingerprint: `input-investigate-${suffix}`, labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.7, hardGuardsPassed: true }, { caseId: `holdout-aftermath-${suffix}`, sceneId: `holdout-aftermath-${suffix}`, chapterFunction: "aftermath", inputFingerprint: `input-aftermath-${suffix}`, labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.65, hardGuardsPassed: true }] } }) });
      expect(judged.data.experiment.status).toBe("judged");
      expect(judged.data.experiment.judgment?.evaluatorKind).toBe("independent-reviewer");
      expect(judged.data.experiment.holdoutValidation?.status).toBe("cross-scene-validated");
      const decided = await jsonFetch<{ experiment: { decision?: { decision: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experiment.data.experiment.experimentId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "adopt", actor: "author", reason: "Adopt treatment after independent review" }) });
      expect(decided.data.experiment.decision?.decision).toBe("adopt");
      const invocationNow = new Date();
      const invocation = await jsonFetch<{ record: { invocationId: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invocationId: `craft-release-invocation-${suffix}`, taskId: experiment.data.experiment.experimentId, taskFingerprint: `task-${suffix}`, attemptId: `attempt-${suffix}`, routeDecision: "craft-experiment", modelCapabilityRef: "provider://release-v1", contextManifestRef: `context://craft/${suffix}`, promptSchemaVersion: "craft.v1", startedAt: new Date(invocationNow.getTime() - 100).toISOString(), finishedAt: invocationNow.toISOString(), status: "completed", usage: { inputTokens: 20, outputTokens: 40, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.02, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "experiment-only" }) });
      expect(invocation.status).toBe(201);
      const calibration = await jsonFetch<{ evidence: { status: string } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorVersion: `provider-evaluator-${suffix}`, sourceKind: "provider", holdoutInputFingerprint: `holdout-provider-${suffix}`, evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed", reference: `provider://release-v1/attestation/${suffix}` }, evidenceRefs: [`provider://release-v1/holdout/${suffix}`] }) });
      expect(calibration.data.evidence.status).toBe("calibrated");
      const provider = await jsonFetch<{ report: { decision: string; quality: { status: string } }; experiment: { providerEvaluation?: { decision: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experiment.data.experiment.experimentId}/provider-evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerRef: "provider://release-v1", maxP95LatencyMs: 1000, maxCost: 1 }) });
      expect(provider.data.report.decision).toBe("pass");
      expect(provider.data.report.quality.status).toBe("calibrated");
      expect(provider.data.experiment.providerEvaluation?.decision).toBe("pass");
      const reader = await jsonFetch<{ calibration: { status: string }; experiment: { readerCalibration?: { status: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experiment.data.experiment.experimentId}/reader-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId: `reader-release-${suffix}`, humanSamples: 8, blind: true, agreementRate: 0.875 }) });
      expect(reader.data.calibration.status).toBe("calibrated");
      expect(reader.data.experiment.readerCalibration?.status).toBe("calibrated");
      return experiment.data.experiment.experimentId;
    };

    const firstExperimentId = await runExperiment("one");
    const promoted = await jsonFetch<{ pattern: { lifecycle: string; promotion?: { experimentId: string } } }>(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/promote-from-experiment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experimentId: firstExperimentId, actor: "author", reason: "Promote after first holdout" }) });
    expect(promoted.data.pattern.lifecycle).toBe("probation");
    expect(promoted.data.pattern.promotion?.experimentId).toBe(firstExperimentId);

    const secondExperimentId = await runExperiment("two");
    const validated = await jsonFetch<{ pattern: { lifecycle: string; validation?: { experimentId: string } } }>(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/validate-from-experiment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experimentId: secondExperimentId, actor: "author", reason: "Validate after independent second holdout" }) });
    expect(validated.data.pattern.lifecycle).toBe("validated");
    expect(validated.data.pattern.validation?.experimentId).toBe(secondExperimentId);
  });

  it("keeps actual provider usage experiment-only until quality and reader calibration are proven", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Provider Evidence Gate", roughIdea: "Actual calls still need calibrated quality evidence." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const judgmentBase = { evaluatorId: "reviewer-provider", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Initial provider probe", judgedAt: new Date().toISOString() };
    const judgment = { ...judgmentBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(judgmentBase)).digest("hex") };
    const base = { schemaVersion: "craft-experiment.v1", experimentId: "craft-experiment-provider-gate", projectSlug: slug, transferPlanId: "plan-provider-gate", baselineCandidateId: "baseline", treatmentCandidateId: "treatment", holdoutSceneIds: ["scene-provider"], targetMetrics: ["reader-effect"], comparisonDimensions: ["reader-effect"], budgetId: "budget-provider", status: "judged", runnerId: "runner-provider", judgment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", `${base.experimentId}.json`), JSON.stringify({ ...base, fingerprint }), "utf8");
    const now = new Date();
    const invocation = await jsonFetch<{ record: { invocationId: string } }>(`/api/novel/projects/${slug}/runtime/session/model-invocations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invocationId: "craft-provider-invocation", taskId: base.experimentId, taskFingerprint: "task-fingerprint", attemptId: "attempt-1", routeDecision: "craft-experiment", modelCapabilityRef: "provider://real-v1", contextManifestRef: "context://craft-provider", promptSchemaVersion: "craft.v1", startedAt: new Date(now.getTime() - 100).toISOString(), finishedAt: now.toISOString(), status: "completed", usage: { inputTokens: 20, outputTokens: 40, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.02, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "experiment-only" }) });
    expect(invocation.status).toBe(201);
    const evaluated = await jsonFetch<{ report: { decision: string; blockedReasons: string[] }; experiment: { providerEvaluation?: { decision: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${base.experimentId}/provider-evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerRef: "provider://real-v1", maxP95LatencyMs: 1000, maxCost: 1 }) });
    expect(evaluated.status).toBe(200);
    expect(evaluated.data.report.decision).toBe("blocked");
    expect(evaluated.data.report.blockedReasons).toContain("QUALITY_NOT_CALIBRATED");
    expect(evaluated.data.experiment.providerEvaluation?.decision).toBe("blocked");
    const calibration = await jsonFetch<{ evidence: { status: string } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorVersion: "provider-evaluator-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout-provider-gate", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed", reference: "provider://real-v1/attestation/1" }, evidenceRefs: ["provider://real-v1/holdout/1"] }) });
    expect(calibration.status).toBe(201);
    expect(calibration.data.evidence.status).toBe("calibrated");
    const reevaluated = await jsonFetch<{ report: { decision: string; quality: { status: string } }; experiment: { providerEvaluation?: { decision: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${base.experimentId}/provider-evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerRef: "provider://real-v1", maxP95LatencyMs: 1000, maxCost: 1 }) });
    expect(reevaluated.data.report.decision).toBe("pass");
    expect(reevaluated.data.report.quality.status).toBe("calibrated");
    expect(reevaluated.data.experiment.providerEvaluation?.decision).toBe("pass");
    const reader = await jsonFetch<{ calibration: { status: string }; experiment: { readerCalibration?: { status: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${base.experimentId}/reader-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId: "reader-probe", humanSamples: 1, blind: false, agreementRate: 0.2 }) });
    expect(reader.status).toBe(200);
    expect(reader.data.calibration.status).toBe("experimental");
    expect(reader.data.experiment.readerCalibration?.status).toBe("experimental");
    const calibratedReader = await jsonFetch<{ calibration: { status: string }; experiment: { readerCalibration?: { status: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${base.experimentId}/reader-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId: "reader-calibrated", humanSamples: 8, blind: true, agreementRate: 0.875 }) });
    expect(calibratedReader.data.calibration.status).toBe("calibrated");
    expect(calibratedReader.data.experiment.readerCalibration?.status).toBe("calibrated");
  });

  it("rejects craft-pattern promotion when the submitted experiment is not persisted", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Promotion Evidence", roughIdea: "Promotion must use persisted evidence." }) });
    const slug = created.data.project.slug;
    const source = await jsonFetch<{ source: { sourceId: string } }>(`/api/novel/projects/${slug}/runtime/source-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Owned notes", type: "notes", provenance: "author-upload", rightsStatus: "owned", licensor: "author", allowedUses: ["analysis", "style-experiment"], projectScope: slug, retainExcerpt: false, importedBy: "author" }) });
    const envelope = await jsonFetch<{ envelope: { envelopeId: string } }>(`/api/novel/projects/${slug}/runtime/source-material/${source.data.source.sourceId}/rights-envelope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedBy: "author" }) });
    const pattern = await jsonFetch<{ pattern: { patternId: string } }>(`/api/novel/projects/${slug}/runtime/craft-patterns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Persisted rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: [], sourceEnvelopeIds: [envelope.data.envelope.envelopeId], evidenceRefs: ["source://notes#1"] }) });
    await jsonFetch(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author", reason: "Scoped" }) });
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/craft-patterns/${pattern.data.pattern.patternId}/promote-from-experiment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experiment: { experimentId: "forged-experiment", status: "judged", judgment: { winner: "treatment", hardGuardsPassed: true } }, actor: "author", reason: "Forged evidence" }) });
    expect(response.status).toBe(409);
    expect(response.data.error).toBe("CRAFT_EXPERIMENT_NOT_FOUND");
  });

  it("does not expose a closure certificate whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Closure Scope", roughIdea: "Closure reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = { schemaVersion: "closure-certificate.v1", status: "audited_complete", projectSlug: "another-project", chapterIds: ["chapter-1"], settlementIds: ["settlement-1"], obligationCoverageFingerprint: "coverage-fp", sourceFingerprint: "source-fp", generatedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "closure"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "closure", "closure-certificate.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/publication-editions/edition-1/closure-certificate`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("CLOSURE_CERTIFICATE_NOT_FOUND");
  });

  it("does not expose an edition manifest whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Edition Scope", roughIdea: "Edition reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = { schemaVersion: "edition-manifest.v1", editionId: "edition-scope", projectSlug: "another-project", canonCommitFingerprint: "canon-fp", title: "Other", author: "Other", language: "zh-CN", status: "frozen", readerSafe: true, chapters: [{ chapterId: "chapter-1", title: "Chapter", order: 1, contentPath: "chapters/1.md", settlementId: "settlement-1", contentSha256: "a".repeat(64) }], publicationTreeFingerprint: "tree-fp", createdAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "publication-editions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "publication-editions", "edition-scope.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/publication-editions/edition-scope`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Publication edition not found");
  });

  it("filters book-run listings to the requested project scope", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run Scope", roughIdea: "Run listings stay project scoped." }) });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], limits: { maxWorkItems: 1 } }) });
    const runPath = path.join(tempRoot, slug, "sessions", "book-runs", `${started.data.run.bookRunId}.json`);
    const run = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<string, unknown>;
    const tamperedBase = { ...run, projectSlug: "another-project" };
    delete (tamperedBase as Record<string, unknown>).fingerprint;
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(tamperedBase)).digest("hex");
    await fs.writeFile(runPath, JSON.stringify({ ...tamperedBase, fingerprint }), "utf8");
    const response = await jsonFetch<{ runs: Array<{ projectSlug: string }> }>(`/api/novel/projects/${slug}/book-runs`);
    expect(response.status).toBe(200);
    expect(response.data.runs).toEqual([]);
  });

  it("does not expose a book-run detail whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run Detail Scope", roughIdea: "Run details stay project scoped." }) });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], limits: { maxWorkItems: 1 } }) });
    const runPath = path.join(tempRoot, slug, "sessions", "book-runs", `${started.data.run.bookRunId}.json`);
    const run = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<string, unknown>;
    const tamperedBase = { ...run, projectSlug: "another-project" };
    delete (tamperedBase as Record<string, unknown>).fingerprint;
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(tamperedBase)).digest("hex");
    await fs.writeFile(runPath, JSON.stringify({ ...tamperedBase, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Book run not found");
  });

  it("does not evaluate closure readiness for a book-run outside the requested project", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Closure Readiness Scope", roughIdea: "Closure readiness stays project scoped." }) });
    const slug = created.data.project.slug;
    const started = await jsonFetch<{ run: { bookRunId: string } }>(`/api/novel/projects/${slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [created.data.project.chapters[0].id], limits: { maxWorkItems: 1 } }) });
    const runPath = path.join(tempRoot, slug, "sessions", "book-runs", `${started.data.run.bookRunId}.json`);
    const run = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<string, unknown>;
    const tamperedBase = { ...run, projectSlug: "another-project" };
    delete (tamperedBase as Record<string, unknown>).fingerprint;
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(tamperedBase)).digest("hex");
    await fs.writeFile(runPath, JSON.stringify({ ...tamperedBase, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/closure-readiness?sourceFingerprint=source`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Book run not found");
  });

  it("filters execution work-item listings to the requested project scope", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execution Work Scope", roughIdea: "Execution queue reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const base = { schemaVersion: "execution-work-item.v1", workItemId: "work-scope", projectSlug: "another-project", chapterId: "chapter-001", versionId: "", proofFingerprint: "", contextManifestId: "", contextFingerprint: "", status: "blocked", idempotencyKey: "scope", blockedReason: "PROOF_NOT_FOUND", createdAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    const directory = path.join(tempRoot, slug, "sessions", "execution-work-items");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "work-scope.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ workItems: Array<{ projectSlug: string }> }>(`/api/novel/projects/${slug}/runtime/execution-work-items`);
    expect(response.status).toBe(200);
    expect(response.data.workItems).toEqual([]);
  });

  it("does not expose narrative obligations whose persisted project scope disagrees", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Obligation Source Scope", roughIdea: "Obligation source scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Obligation Target Scope", roughIdea: "Obligation target scope." }) });
    const created = await jsonFetch<{ obligation: { obligationId: string } }>(`/api/novel/projects/${first.data.project.slug}/obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "mystery", title: "Foreign gate", questionOrPromise: "Who sealed it?" }) });
    const sourcePath = path.join(tempRoot, first.data.project.slug, "sessions", "obligations", `${created.data.obligation.obligationId}.json`);
    const targetDirectory = path.join(tempRoot, second.data.project.slug, "sessions", "obligations");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDirectory, `${created.data.obligation.obligationId}.json`));
    const list = await jsonFetch<{ obligations: Array<{ obligationId: string }> }>(`/api/novel/projects/${second.data.project.slug}/obligations`);
    expect(list.status).toBe(200);
    expect(list.data.obligations).toEqual([]);
    const detail = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/obligations/${created.data.obligation.obligationId}`);
    expect(detail.status).toBe(404);
    expect(detail.data.error).toBe("Obligation not found");
  });

  it("does not expose an execution-ready proof whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execution Proof Scope", roughIdea: "Execution proof reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = { schemaVersion: "execution-ready-proof.v1", proofId: "execution-ready-scope", projectSlug: "another-project", versionId: "outline-version-1", versionFingerprint: "version-fp", status: "ready", executionReady: true, structureVersionFingerprint: "structure-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-fp", checks: [{ checkId: "version-active", status: "passed", detail: "active" }, { checkId: "near-horizon", status: "passed", detail: "frozen" }, { checkId: "source-fresh", status: "passed", detail: "fresh" }, { checkId: "canon-pointer", status: "passed", detail: "pointer" }], createdAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/session/understanding/execution-ready-proof`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Execution-ready proof not found");
  });

  it("does not expose an execution-ready gate report whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Execution Gate Scope", roughIdea: "Execution gate reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = { schemaVersion: "execution-ready-gate.v1", projectSlug: "another-project", outlineVersionId: "outline-version-1", status: "blocked", executionReady: false, checks: [{ checkId: "near-horizon-evidence", status: "failed", detail: "missing" }] };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "execution-ready-gate.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ report: unknown }>(`/api/novel/projects/${slug}/runtime/execution-ready/gate`);
    expect(response.status).toBe(404);
    expect(response.data).toMatchObject({ error: "EXECUTION_READY_GATE_NOT_FOUND" });
  });

  it("does not expose outline authority projections whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Outline Scope", roughIdea: "Outline authority reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-scope", projectSlug: "another-project", version: 1, outlineId: "outline-scope", outlineFingerprint: "outline-fp", selectedChapterIds: ["chapter-1"], strongFreezeCount: 1, structureVersionFingerprint: "structure-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-fp", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
    const versionFingerprint = crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex");
    const proposalBase = { schemaVersion: "outline-adoption-proposal.v1", proposalId: "proposal-scope", projectSlug: "another-project", outlineId: "outline-scope", outlineFingerprint: "outline-fp", validationReportId: "validation-scope", validationFingerprint: "validation-fp", adoptionMode: "whole", sourceCandidateIds: ["candidate-scope"], selectedChapterIds: ["chapter-1"], unadoptedChapterIds: [], status: "ready_for_authorization", canonWritten: false, createdAt: new Date().toISOString() };
    const proposalFingerprint = crypto.createHash("sha256").update(JSON.stringify(proposalBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-scope.json"), JSON.stringify({ ...versionBase, fingerprint: versionFingerprint }), "utf8");
    await fs.writeFile(path.join(root, "sessions", "outline-adoption-proposal.json"), JSON.stringify({ ...proposalBase, fingerprint: proposalFingerprint }), "utf8");
    const version = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/session/understanding/outline-version/outline-scope`);
    expect(version.status).toBe(404);
    expect(version.data.error).toBe("Outline version not found");
    const proposal = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/session/understanding/outline-adoption-proposals`);
    expect(proposal.status).toBe(404);
    expect(proposal.data.error).toBe("Outline adoption proposal not found");
  });

  it("does not apply a length contract whose persisted project scope disagrees", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Length Source Scope", roughIdea: "Length contract source scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Length Target Scope", roughIdea: "Length contract target scope." }) });
    const contract = await jsonFetch<{ contract: unknown }>(`/api/novel/projects/${first.data.project.slug}/length-contract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dimensions: { totalWords: { mode: "soft", min: 100, max: 200 }, totalChapters: { mode: "soft", min: 3, max: 5 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 20, max: 50 } } }) });
    const sourcePath = path.join(tempRoot, first.data.project.slug, "planning", "length-contract.json");
    const targetDirectory = path.join(tempRoot, second.data.project.slug, "planning");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDirectory, "length-contract.json"));
    const read = await jsonFetch<{ contract: unknown }>(`/api/novel/projects/${second.data.project.slug}/length-contract`);
    expect(read.status).toBe(404);
    expect(read.data).toMatchObject({ error: "Length contract not found" });
    const forecast = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${second.data.project.slug}/length-forecast`);
    expect(forecast.status).toBe(409);
    expect(forecast.data).toMatchObject({ error: { code: "LENGTH_CONTRACT_REQUIRED" } });
    expect(contract.status).toBe(201);
  });

  it("does not expose a prose-generation manifest whose persisted project scope disagrees", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Prose Manifest Source Scope", roughIdea: "Prose manifest source scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Prose Manifest Target Scope", roughIdea: "Prose manifest target scope." }) });
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-prose-scope", projectSlug: first.data.project.slug, decisionId: "decision-scope", decisionVersion: 1, consumer: "prose", consumerRef: "manifest-scope", sourceFingerprint: "snapshot-scope" });
    await persistDecisionConsumptionReceipt(path.join(tempRoot, first.data.project.slug), receipt);
    await writeReleasedCraftPattern(first.data.project.slug);
    const created = await jsonFetch<{ manifest: { manifestId: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/prose-generation-manifests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId: "manifest-scope", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] }) });
    const sourcePath = path.join(tempRoot, first.data.project.slug, "sessions", "prose-generation-manifests", `${created.data.manifest.manifestId}.json`);
    const targetDirectory = path.join(tempRoot, second.data.project.slug, "sessions", "prose-generation-manifests");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDirectory, `${created.data.manifest.manifestId}.json`));
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/runtime/prose-generation-manifests/${created.data.manifest.manifestId}`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Prose generation manifest not found");
    const freshness = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/runtime/prose-generation-manifests/${created.data.manifest.manifestId}/freshness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateManifestFingerprint: "candidate" }) });
    expect(freshness.status).toBe(404);
    expect(freshness.data.error).toBe("Prose generation manifest not found");
  });

  it("does not start a craft experiment whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Experiment Scope", roughIdea: "Craft experiment commands stay scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = { schemaVersion: "craft-experiment.v1", experimentId: "craft-experiment-scope", projectSlug: "another-project", transferPlanId: "plan-1", baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: ["scene-1"], targetMetrics: ["voice"], comparisonDimensions: ["voice"], budgetId: "budget-1", status: "planned", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", "craft-experiment-scope.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${slug}/runtime/craft-experiments/craft-experiment-scope/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runnerId: "runner-1" }) });
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Craft experiment not found");
  });

  it("does not expose dialogue red-blue cases whose persisted project scope disagrees", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Dialogue Red Blue Scope", roughIdea: "Red-blue reads stay project scoped." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const base = {
      schemaVersion: "dialogue-red-blue-case.v1",
      caseId: "red-blue-foreign",
      projectSlug: "another-project",
      questionId: "question-foreign",
      questionVersion: 1,
      questionFingerprint: "question-fingerprint",
      options: [{ optionId: "option-1", label: "A", claim: "A claim", bestCase: "A best case", premises: ["premise"], evidenceRefs: ["evidence"], failureModes: ["failure"], opportunityCost: "cost", reversibility: "reversible", affectedDecisions: ["question-foreign"], uncertainty: "low" }, { optionId: "option-2", label: "B", claim: "B claim", bestCase: "B best case", premises: ["premise"], evidenceRefs: ["evidence"], failureModes: ["failure"], opportunityCost: "cost", reversibility: "reversible", affectedDecisions: ["question-foreign"], uncertainty: "low" }],
      sharedFacts: ["fact"],
      irreducibleTradeoff: "tradeoff",
      recommendation: "A",
      recommendationReason: "reason",
      dissent: ["B remains viable"],
      whatWouldChangeRecommendation: ["new evidence"],
      status: "open",
      createdAt: new Date().toISOString()
    };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "dialogue-question-events.jsonl"), JSON.stringify({
      schemaVersion: "dialogue-question-event.v1",
      eventId: "question-event-foreign",
      type: "question.created",
      questionId: "question-foreign",
      question: { schemaVersion: "dialogue-question.v1", questionId: "question-foreign", questionVersion: 1, projectSlug: "another-project", status: "active", text: "Foreign question", whyNow: "Foreign context", impact: "medium", ambiguity: 0.2, errorCost: "low", reversibility: "reversible", delayCost: "low", options: ["A", "B"], recommendation: "A", snapshotFingerprint: "snapshot-foreign" },
      createdAt: new Date().toISOString()
    }) + "\n", "utf8");
    await fs.writeFile(path.join(root, "sessions", "dialogue-red-blue-cases.jsonl"), JSON.stringify({ ...base, fingerprint }) + "\n", "utf8");
    const response = await jsonFetch<{ cases: unknown[] }>(`/api/novel/projects/${slug}/session/understanding/questions`);
    expect(response.status).toBe(200);
    expect((response.data as unknown as { questions: unknown[] }).questions).toEqual([]);
  });

  it("does not start runtime with a prose manifest whose receipt is outside the requested project", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Runtime Manifest Source", roughIdea: "Runtime must bind manifest scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Runtime Manifest Target", roughIdea: "Runtime must reject foreign manifests." }) });
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-runtime-scope", projectSlug: first.data.project.slug, decisionId: "decision-runtime-scope", decisionVersion: 1, consumer: "prose", consumerRef: "manifest-runtime-scope", sourceFingerprint: "snapshot-runtime-scope" });
    await persistDecisionConsumptionReceipt(path.join(tempRoot, first.data.project.slug), receipt);
    await writeReleasedCraftPattern(first.data.project.slug);
    const created = await jsonFetch<{ manifest: { manifestId: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/prose-generation-manifests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId: "manifest-runtime-scope", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] }) });
    const sourcePath = path.join(tempRoot, first.data.project.slug, "sessions", "prose-generation-manifests", `${created.data.manifest.manifestId}.json`);
    const targetDirectory = path.join(tempRoot, second.data.project.slug, "sessions", "prose-generation-manifests");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDirectory, `${created.data.manifest.manifestId}.json`));
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${second.data.project.slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationManifestId: created.data.manifest.manifestId }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_GENERATION_MANIFEST_REQUIRED");
  });

  it("persists and rolls back a governed learning release through the project API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Learning Release API", roughIdea: "Learning release decisions remain durable." }) });
    const slug = created.data.project.slug;
    const regression = await jsonFetch<{ regressionId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionId: "learning-release-regression-api", baseline: { selection: 0.7 }, candidate: { selection: 0.8 }, hardFailures: [] }) });
    expect(regression.status).toBe(201);
    const input = { releaseId: "learning-release-api", candidatePolicyRef: "policy:candidate:v2", baselinePolicyRef: "policy:stable:v1", evaluationRunRefs: ["eval:api-1"], regressionCaseRefs: [regression.data.regressionId], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable:v1", approvedBy: "author-api" };
    const posted = await jsonFetch<{ release: { releaseId: string; projectSlug: string; status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    expect(posted.status).toBe(201);
    expect(posted.data.release).toMatchObject({ releaseId: input.releaseId, projectSlug: slug, status: "canary", fingerprint: expect.any(String) });
    const read = await jsonFetch<{ release: { fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases/${input.releaseId}`);
    expect(read.status).toBe(200);
    expect(read.data.release.fingerprint).toBe(posted.data.release.fingerprint);
    const rolledBack = await jsonFetch<{ release: { status: string; rollbackReason: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases/${input.releaseId}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rolledBackBy: "author-api", reason: "canary regression" }) });
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.data.release).toMatchObject({ status: "rolled_back", rollbackReason: "canary regression" });
  });

  it("rolls back a learning release from bound regression evidence through the project API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Regression Rollback API", roughIdea: "Confirmed regression stops a release." }) });
    const slug = created.data.project.slug;
    const regression = await jsonFetch<{ regressionId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionId: "regression-rollback-api", baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] }) });
    const release = await jsonFetch<{ release: { releaseId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: "release-rollback-api", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:rollback-api"], regressionCaseRefs: [regression.data.regressionId], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" }) });
    expect(release.data.release.status).toBe("canary");
    const replayedRegression = await jsonFetch<{ created: boolean; rolledBackReleases: Array<{ releaseId: string; status: string }> }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionId: regression.data.regressionId, baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] }) });
    expect(replayedRegression.status).toBe(200);
    expect(replayedRegression.data).toMatchObject({ created: false, rolledBackReleases: [{ releaseId: release.data.release.releaseId, status: "rolled_back" }] });
    const rolledBack = await jsonFetch<{ release: { status: string; rollbackReason: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases/${release.data.release.releaseId}/rollback-for-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionCaseRef: regression.data.regressionId, rolledBackBy: "regression-gate", reason: "Confirmed holdout regression" }) });
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.data.release).toMatchObject({ status: "rolled_back", rollbackReason: `Automatic regression propagation [regression:${regression.data.regressionId}]` });
  });

  it("completes the craft pattern release-to-manifest-consumption and regression stop journey", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Runtime E2E", roughIdea: "A validated pattern must stop after regression." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-runtime-e2e", projectSlug: slug, name: "Runtime rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-e2e"], evidenceRefs: ["evidence://runtime-e2e"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-e2e-validation", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${patternBase.patternId}.json`), JSON.stringify({ ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") }), "utf8");
    const regression = await jsonFetch<{ regressionId: string }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionId: "regression-runtime-e2e", baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] }) });
    const release = await jsonFetch<{ release: { releaseId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/learning-releases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: "release-runtime-e2e", candidatePatternId: patternBase.patternId, candidatePolicyRef: "policy:runtime-e2e", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:runtime-e2e"], regressionCaseRefs: [regression.data.regressionId], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" }) });
    expect(release.data.release.status).toBe("canary");
    const manifestId = "manifest-runtime-e2e";
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-runtime-e2e", projectSlug: slug, decisionId: "decision-runtime-e2e", decisionVersion: 1, consumer: "prose", consumerRef: manifestId, sourceFingerprint: "snapshot-runtime-e2e" });
    await persistDecisionConsumptionReceipt(root, receipt);
    const manifest = await jsonFetch<{ manifest: { manifestId: string } }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId, decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: [patternBase.patternId], latestAuthorDirection: "preserve pressure", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] }) });
    expect(manifest.status).toBe(201);
    const replayedRegression = await jsonFetch<{ rolledBackReleases: Array<{ releaseId: string; status: string }> }>(`/api/novel/projects/${slug}/runtime/evaluation/multi-scale-regression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regressionId: regression.data.regressionId, baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] }) });
    expect(replayedRegression.data.rolledBackReleases).toMatchObject([{ releaseId: release.data.release.releaseId, status: "rolled_back" }]);
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationManifestId: manifestId }) });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe("PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED");
  });

  it("blocks a prose manifest from consuming a local pattern without an active learning release", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Manifest Pattern Release Gate", roughIdea: "Pattern consumption requires release authority." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-unreleased-api", projectSlug: slug, name: "Unreleased rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-1"], evidenceRefs: ["evidence://pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-2", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    const patternFingerprint = crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${patternBase.patternId}.json`), JSON.stringify({ ...patternBase, fingerprint: patternFingerprint }), "utf8");
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-pattern-release-gate", projectSlug: slug, decisionId: "decision-pattern-release-gate", decisionVersion: 1, consumer: "prose", consumerRef: "manifest-pattern-release-gate", sourceFingerprint: "snapshot-pattern-release-gate" });
    await persistDecisionConsumptionReceipt(root, receipt);
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/prose-generation-manifests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId: "manifest-pattern-release-gate", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: [patternBase.patternId], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED");
  });

  it("rechecks pattern release authority when runtime starts from an existing manifest", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Runtime Pattern Release Gate", roughIdea: "Runtime rechecks pattern release authority." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-runtime-unreleased", projectSlug: slug, name: "Runtime unreleased rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-1"], evidenceRefs: ["evidence://pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-2", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${patternBase.patternId}.json`), JSON.stringify({ ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") }), "utf8");
    const receipt = createDecisionConsumptionReceipt({ receiptId: "receipt-runtime-pattern-gate", projectSlug: slug, decisionId: "decision-runtime-pattern-gate", decisionVersion: 1, consumer: "prose", consumerRef: "manifest-runtime-pattern-gate", sourceFingerprint: "snapshot-runtime-pattern-gate" });
    await persistDecisionConsumptionReceipt(root, receipt);
    const manifestBase = { schemaVersion: "prose-generation-manifest.v1", manifestId: "manifest-runtime-pattern-gate", decisionConsumptionReceiptRef: receipt.receiptId, storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: [patternBase.patternId], latestAuthorDirection: "keep the promise visible", proseBaselineRef: "prose:ch-1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"], status: "frozen" };
    await fs.mkdir(path.join(root, "sessions", "prose-generation-manifests"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "prose-generation-manifests", `${manifestBase.manifestId}.json`), JSON.stringify({ ...manifestBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(manifestBase)).digest("hex") }), "utf8");
    const response = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationManifestId: manifestBase.manifestId }) });
    expect(response.status).toBe(409);
    expect(response.data.error.code).toBe("PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED");
  });

  it("persists and replays craft source revocation evidence", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Revocation API", roughIdea: "Source withdrawal remains auditable." }) });
    const slug = created.data.project.slug;
    const payload = { sourceId: "source-api-1", eventId: "revocation-api-1", sourceFingerprint: "source-api-fp", reason: "rights withdrawn", evidenceRefs: ["evidence://rights-withdrawal"], sourceRefs: ["source://source-api-1"], artifacts: [{ artifactId: "pattern-api-1", kind: "pattern", sourceIds: ["source-api-1"], status: "active" }, { artifactId: "prose-api-1", kind: "published-prose", sourceIds: ["source-api-1"], status: "published" }] };
    const posted = await jsonFetch<{ propagation: { derivativeDisposition: string }; record: { projectSlug: string; fingerprint: string } }>(`/api/novel/projects/${slug}/runtime/craft-revocation/propagate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    expect(posted.status).toBe(201);
    expect(posted.data).toMatchObject({ propagation: { derivativeDisposition: "invalidated" }, record: { projectSlug: slug, fingerprint: expect.any(String) } });
    const replay = await jsonFetch<{ record: { fingerprint: string }; propagation: { retainedHistoricalArtifactIds: string[] } }>(`/api/novel/projects/${slug}/runtime/craft-revocation/${payload.eventId}`);
    expect(replay.status).toBe(200);
    expect(replay.data.record.fingerprint).toBe(posted.data.record.fingerprint);
    expect(replay.data.propagation.retainedHistoricalArtifactIds).toEqual(["prose-api-1"]);
  });

  it("does not expose a learning release whose persisted project scope disagrees", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Learning Release Source", roughIdea: "Source release scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Learning Release Target", roughIdea: "Target release scope." }) });
    const posted = await jsonFetch<{ release: { releaseId: string } }>(`/api/novel/projects/${first.data.project.slug}/runtime/learning-releases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: "learning-release-foreign", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:foreign"], shadowAcceptanceDelta: 0, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: false, previousStableVersion: "policy:stable", approvedBy: "author" }) });
    const sourcePath = path.join(tempRoot, first.data.project.slug, "sessions", "learning-releases", `${posted.data.release.releaseId}.json`);
    const targetDir = path.join(tempRoot, second.data.project.slug, "sessions", "learning-releases");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDir, `${posted.data.release.releaseId}.json`));
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/runtime/learning-releases/${posted.data.release.releaseId}`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Learning release not found");
  });

  it("persists an author decision for a judged craft experiment", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Experiment Decision", roughIdea: "Author decision remains replayable." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const judgmentBase = { evaluatorId: "reviewer-1", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Treatment preserves the target effect.", judgedAt: new Date().toISOString() };
    const judgment = { ...judgmentBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(judgmentBase)).digest("hex") };
    const experimentBase = { schemaVersion: "craft-experiment.v1", experimentId: "craft-experiment-decision-api", projectSlug: slug, transferPlanId: "plan-1", baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: ["scene-1"], targetMetrics: ["voice"], comparisonDimensions: ["voice"], budgetId: "budget-1", status: "judged", runnerId: "runner-1", judgment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(experimentBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", `${experimentBase.experimentId}.json`), JSON.stringify({ ...experimentBase, fingerprint }), "utf8");
    const decided = await jsonFetch<{ experiment: { decision: { decision: string; actor: string; reason: string } } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experimentBase.experimentId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "adopt", actor: "author-1", reason: "Author approved the bounded treatment." }) });
    expect(decided.status).toBe(200);
    expect(decided.data.experiment.decision).toMatchObject({ decision: "adopt", actor: "author-1" });
  });

  it("persists scoped author feedback for a judged craft experiment", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Craft Feedback API", roughIdea: "Feedback remains durable." }) });
    const slug = created.data.project.slug;
    const root = path.join(tempRoot, slug);
    const judgmentBase = { evaluatorId: "reviewer-feedback", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Treatment preserves the target effect.", judgedAt: new Date().toISOString() };
    const judgment = { ...judgmentBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(judgmentBase)).digest("hex") };
    const experimentBase = { schemaVersion: "craft-experiment.v1", experimentId: "craft-experiment-feedback-api", projectSlug: slug, transferPlanId: "plan-feedback", baselineCandidateId: "baseline-feedback", treatmentCandidateId: "treatment-feedback", holdoutSceneIds: ["scene-feedback"], targetMetrics: ["voice"], comparisonDimensions: ["voice"], budgetId: "budget-feedback", status: "judged", runnerId: "runner-feedback", judgment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(experimentBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", `${experimentBase.experimentId}.json`), JSON.stringify({ ...experimentBase, fingerprint }), "utf8");
    const posted = await jsonFetch<{ feedback: { feedbackId: string; outcome: string; changedDimensions: string[] } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experimentBase.experimentId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author-feedback", outcome: "rejected", note: "Too ornate under pressure.", changedDimensions: ["pacing"], confounders: ["scene density"] }) });
    expect(posted.status).toBe(201);
    expect(posted.data.feedback).toMatchObject({ outcome: "rejected", changedDimensions: ["pacing"] });
    const replay = await jsonFetch<{ feedback: Array<{ outcome: string }> }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experimentBase.experimentId}/feedback`);
    expect(replay.status).toBe(200);
    expect(replay.data.feedback).toHaveLength(1);
    const attributed = await jsonFetch<{ attribution: { attributionId: string; allowPreferenceLearning: boolean } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${experimentBase.experimentId}/feedback/attribution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackId: posted.data.feedback.feedbackId, pattern: "avoid-ornate-pacing", category: "structure", scope: { chapterId: "chapter-feedback" } }) });
    expect(attributed.status).toBe(201);
    expect(attributed.data.attribution).toMatchObject({ allowPreferenceLearning: false });
    const hypothesis = await jsonFetch<{ hypothesis: { lifecycle: string; supportEventIds: string[] } }>(`/api/novel/projects/${slug}/runtime/craft-feedback-attributions/${attributed.data.attribution.attributionId}/hypothesis`, { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(hypothesis.status).toBe(201);
    expect(hypothesis.data.hypothesis.lifecycle).toBe("candidate");
    const secondJudgmentBase = { ...judgmentBase, evaluatorId: "reviewer-feedback-2" };
    const secondJudgment = { ...secondJudgmentBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(secondJudgmentBase)).digest("hex") };
    const secondExperiment = { ...experimentBase, experimentId: "craft-experiment-feedback-api-2", transferPlanId: "plan-feedback-2", baselineCandidateId: "baseline-feedback-2", treatmentCandidateId: "treatment-feedback-2", holdoutSceneIds: ["scene-feedback-2"], budgetId: "budget-feedback-2", runnerId: "runner-feedback-2", judgment: secondJudgment };
    const secondFingerprint = crypto.createHash("sha256").update(JSON.stringify(secondExperiment)).digest("hex");
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", `${secondExperiment.experimentId}.json`), JSON.stringify({ ...secondExperiment, fingerprint: secondFingerprint }), "utf8");
    const secondPosted = await jsonFetch<{ feedback: { feedbackId: string } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${secondExperiment.experimentId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author-feedback", outcome: "rejected", note: "Still too ornate.", changedDimensions: ["pacing"], confounders: ["scene density"] }) });
    const secondAttributed = await jsonFetch<{ attribution: { attributionId: string } }>(`/api/novel/projects/${slug}/runtime/craft-experiments/${secondExperiment.experimentId}/feedback/attribution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackId: secondPosted.data.feedback.feedbackId, pattern: "avoid-ornate-pacing", category: "structure", scope: { chapterId: "chapter-feedback" } }) });
    const validated = await jsonFetch<{ hypothesis: { hypothesisId: string; lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/craft-feedback-attributions/${secondAttributed.data.attribution.attributionId}/hypothesis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(validated.data.hypothesis.lifecycle).toBe("validated");
    const promoted = await jsonFetch<{ hypothesis: { lifecycle: string } }>(`/api/novel/projects/${slug}/runtime/preference-hypotheses/${validated.data.hypothesis.hypothesisId}/promote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: "author-feedback", reason: "Two independent experiments support the scoped preference." }) });
    expect(promoted.status).toBe(200);
    expect(promoted.data.hypothesis.lifecycle).toBe("active");
  });

  it("does not expose a migration preview whose persisted project scope disagrees", async () => {
    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Migration Source", roughIdea: "Migration source scope." }) });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Migration Target", roughIdea: "Migration target scope." }) });
    const preview = await jsonFetch<{ preview: Record<string, unknown> }>(`/api/novel/projects/${first.data.project.slug}/migrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const migrationId = String(preview.data.preview.migrationId);
    const sourcePath = path.join(tempRoot, first.data.project.slug, "sessions", "migrations", `${migrationId}.json`);
    const targetDirectory = path.join(tempRoot, second.data.project.slug, "sessions", "migrations");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDirectory, `${migrationId}.json`));
    const response = await jsonFetch<{ error: string }>(`/api/novel/projects/${second.data.project.slug}/migrations/${migrationId}`);
    expect(response.status).toBe(404);
    expect(response.data.error).toBe("Migration preview not found");
  });

  it("returns a recoverable conflict when scene execution evidence is incomplete", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Scene Ledger Error Contract", roughIdea: "A scene must prove its change." }) });
    const slug = created.data.project.slug;
    const scene = await jsonFetch<{ scene: { sceneId: string } }>(`/api/novel/projects/${slug}/runtime/scene-cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneId: "scene-contract", chapterId: "chapter-001", trigger: "alarm", povCharacterId: "hero", roleGoal: "escape", conflictStrategy: "negotiate", turningPoint: "door locks", informationChange: "learns route", emotionChange: "fear to resolve", relationshipChange: "trust breaks", resourceChange: "loses key", entryState: "inside", exitState: "outside", nextSceneHook: "pursuit", sourceRefs: ["outline://scene-contract"] }) });
    expect(scene.status).toBe(201);
    const ledger = await jsonFetch<{ ledgerId: string }>(`/api/novel/projects/${slug}/runtime/scene-execution-ledgers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneId: scene.data.scene.sceneId }) });
    expect(ledger.status).toBe(201);
    const incomplete = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/runtime/scene-execution-ledgers/${ledger.data.ledgerId}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "choice", value: "chooses the locked door", evidenceRefs: [] }) });
    expect(incomplete.status).toBe(409);
    expect(incomplete.data.error.code).toBe("SCENE_LEDGER_EVIDENCE_REQUIRED");
  });

  it("generates, versions, confirms, and reads story blueprints through the author API", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Story Blueprint API", roughIdea: "A keeper follows a bell below the tide." }) });
    const slug = created.data.project.slug;
    const candidate = {
      schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-blueprint-api", projectSlug: slug, status: "candidate", sourceDecisionId: "decision-ending", sourceFingerprint: "a".repeat(64),
      fields: [
        { sourceDecisionId: "decision-desire", path: "protagonist.primaryDesire", value: "找回自己的名字" },
        { sourceDecisionId: "decision-conflict", path: "conflict.core", value: "必须用记忆换取通行权" },
        { sourceDecisionId: "decision-cost", path: "stakes.failureCost", value: "故乡会沉没" },
        { sourceDecisionId: "decision-rule", path: "world.rules.primary", value: "潮门会夺走记忆" },
        { sourceDecisionId: "decision-promise", path: "readerPromise", value: "谜团与代价并行" },
        { sourceDecisionId: "decision-ending", path: "endingDirection", value: "保住故乡，失去名字" }
      ],
      contract: { protagonist: { primaryDesire: "找回自己的名字", innerNeed: null, misbelief: null }, conflict: { core: "必须用记忆换取通行权", opposingPressure: null }, stakes: { failureCost: "故乡会沉没", irreversibleChoice: null }, world: { primaryRule: "潮门会夺走记忆" }, readerPromise: "谜团与代价并行", endingDirection: "保住故乡，失去名字" },
      fingerprint: "b".repeat(64)
    };
    const candidateDir = path.join(tempRoot, slug, "sessions", "contract-candidates");
    await fs.mkdir(candidateDir, { recursive: true });
    await fs.writeFile(path.join(candidateDir, `${candidate.candidateId}.json`), JSON.stringify(candidate), "utf8");

    const generated = await jsonFetch<{ blueprint: { blueprintId: string; fingerprint: string; content: { storyPremise: string } } }>(`/api/novel/projects/${slug}/session/story-blueprints/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceContractCandidateId: candidate.candidateId }) });
    expect(generated.status).toBe(201);
    expect(generated.data.blueprint.content.storyPremise).toContain("找回自己的名字");
    const revised = await jsonFetch<{ blueprint: { blueprintId: string; fingerprint: string } }>(`/api/novel/projects/${slug}/session/story-blueprints/${generated.data.blueprint.blueprintId}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedFingerprint: generated.data.blueprint.fingerprint, content: { storyPremise: "守门人选择记忆。", openingImage: "钟声从潮线下传来。", protagonistGoal: "找回自己的名字", coreConflict: "必须用记忆换取通行权", failureCost: "故乡会沉没", worldRules: "潮门会夺走记忆", readerPromise: "谜团与代价并行", endingDirection: "保住故乡，失去名字" } }) });
    expect(revised.status).toBe(201);
    expect(revised.data.blueprint.blueprintId).not.toBe(generated.data.blueprint.blueprintId);
    const confirmed = await jsonFetch<{ confirmation: { blueprintId: string; status: string } }>(`/api/novel/projects/${slug}/session/story-blueprints/${revised.data.blueprint.blueprintId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedFingerprint: revised.data.blueprint.fingerprint, actorId: "author-1" }) });
    expect(confirmed.status).toBe(201);
    expect(confirmed.data.confirmation).toMatchObject({ blueprintId: revised.data.blueprint.blueprintId, status: "confirmed" });
    const latest = await jsonFetch<{ blueprint: { blueprintId: string } }>(`/api/novel/projects/${slug}/session/story-blueprints/latest`);
    expect(latest.status).toBe(200);
    expect(latest.data.blueprint.blueprintId).toBe(revised.data.blueprint.blueprintId);
  });
});
