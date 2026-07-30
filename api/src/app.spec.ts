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
import { createRuntimeCheckpoint } from "./runtimeFiles.js";

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

describe("novel API routes", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-routes-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    delete process.env.CODEX_COMMAND;
    delete process.env.MOCK_CODEX_DELAY_MS;
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
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
  });

  it("starts and controls a bounded BookRun without equating pause with completion", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Book Run API", roughIdea: "A bounded continuous run." })
    });
    const project = created.data.project;
    const started = await jsonFetch<{ run: { bookRunId: string; status: string; version: number; progress: { denominator: string } } }>(`/api/novel/projects/${project.slug}/book-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: [project.chapters[0].id], autonomyLevel: "L1", limits: { maxWorkItems: 1 } })
    });
    expect(started.status).toBe(201);
    expect(started.data.run).toMatchObject({ status: "ready", progress: { denominator: "frozen-work-graph" } });
    const advanced = await jsonFetch<{ run: { status: string; version: number }; scheduled: Array<{ status: string }> }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/advance`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(advanced.status).toBe(201);
    expect(advanced.data.run.status).toBe("gate_required");
    const audit = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/completion-audits`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "missing" })
    });
    expect(audit.status).toBe(409);
    expect(audit.data.error.code).toBe("COMPLETION_SCOPE_REQUIRED");
    const paused = await jsonFetch<{ run: { status: string; version: number } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/pause`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: advanced.data.run.version })
    });
    expect(paused.status).toBe(201);
    expect(paused.data.run.status).toBe("paused");
    const resumed = await jsonFetch<{ run: { status: string } }>(`/api/novel/projects/${project.slug}/book-runs/${started.data.run.bookRunId}/resume`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: paused.data.run.version })
    });
    expect(resumed.data.run.status).toBe("ready");
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
    await fs.writeFile(path.join(tempRoot, created.data.project.slug, 'sessions', 'understanding-snapshot.json'), JSON.stringify({
      schemaVersion: 'understanding-snapshot.v1', snapshotId: 'snapshot-external-001', projectSlug: created.data.project.slug,
      mode: 'shadow', sourceFingerprint: 'c'.repeat(64), sourceMessageIds: [], coreExplicit: [], inferred: [], unknowns: [],
      question: { id: 'question-primary-desire', text: 'Question', status: 'candidate', impact: 'high', source: 'deterministic-gap' },
      modelCallIssued: false, canonWritten: false, createdAt: new Date().toISOString()
    }), 'utf8');
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
    const blocked = await jsonFetch<{ error: { code: string } }>(`/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStatus: "paid", reason: "done", actor: "author", expectedVersion: 0 })
    });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toContain("OBLIGATION_INVALID_TRANSITION");
    const confirmed = await jsonFetch<{ obligation: { status: string; version: number } }>(`/api/novel/projects/${slug}/obligations/${obligation.data.obligation.obligationId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStatus: "confirmed", reason: "author confirmed", actor: "author", expectedVersion: 0 })
    });
    expect(confirmed.data.obligation).toMatchObject({ status: "confirmed", version: 1 });
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

  it("routes high-impact work above the author fast preference floor", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Model Route", roughIdea: "A governed route." })
    });
    const route = await jsonFetch<{ decision: { status: string; capabilityId: string; preferenceApplied: boolean } }>(`/api/novel/projects/${created.data.project.slug}/runtime/session/model-route`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskType: "creative-understanding", impact: "high", requiredCapabilityTier: "high", authorPreference: "fast", estimatedCost: 1, remainingBudget: 10, capabilities: [{ capabilityId: "deep", modelId: "deep-1", capabilityTier: "high", contextLimit: 32000, outputLimit: 4000, structuredOutput: true, verifiedTaskTypes: ["creative-understanding"], status: "active" }] })
    });
    expect(route.data.decision).toMatchObject({ status: "selected", capabilityId: "deep", preferenceApplied: false });
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
    const response = await jsonFetch<{ run: { status: string; interpretationComplete: boolean; canonWritten: boolean } }>(`/api/novel/projects/${slug}/runtime/story-seeds/runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "seed-1", inputFingerprint: "input-1", compilerVersion: "compiler-1", sourceMessageIds: ["m-1"] })
    });
    expect(response.data.run).toMatchObject({ status: "captured", interpretationComplete: false, canonWritten: false });
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

      const question = await jsonFetch<{ question: { questionId: string; questionVersion: number; snapshotFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
      );
      expect(question.status).toBe(201);
      const answered = await jsonFetch<{ decision: { decisionId: string; sourceFingerprint: string } }>(
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

      const conflictQuestion = await jsonFetch<{ created: boolean; question: { questionId: string; questionVersion: number; snapshotFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
      );
      expect(conflictQuestion.status).toBe(201);
      expect(conflictQuestion.data).toMatchObject({ created: true, question: { questionId: "question-core-conflict" } });
      const conflictAnswer = await jsonFetch<{ decision: { decisionId: string; sourceFingerprint: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/${conflictQuestion.data.question.questionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionVersion: conflictQuestion.data.question.questionVersion,
            expectedSnapshotFingerprint: conflictQuestion.data.question.snapshotFingerprint,
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
      expect(failureCostQuestion.status).toBe(201);
      expect(failureCostQuestion.data).toMatchObject({ created: true, question: { questionId: "question-failure-cost" } });
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
      const exhaustedQuestions = await jsonFetch<{ error: { code: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions`, { method: "POST" }
      );
      expect(exhaustedQuestions.status).toBe(409);
      expect(exhaustedQuestions.data.error.code).toBe("UNDERSTANDING_QUESTIONS_EXHAUSTED");

      const candidate = await jsonFetch<{ candidate: { candidateId: string; fingerprint: string; status: string; canonWritten: boolean; fields: Array<{ path: string; value: string }> } }>(
        `/api/novel/projects/${slug}/session/understanding/contract-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisionId: conflictAnswer.data.decision.decisionId })
        }
      );
      expect(candidate.status).toBe(201);
      expect(candidate.data.candidate).toMatchObject({ status: "candidate", canonWritten: false });
      expect(candidate.data.candidate.fields).toEqual([
        expect.objectContaining({ path: "protagonist.primaryDesire", value: "The keeper wants to prove the drowned city is still alive." }),
        expect.objectContaining({ path: "conflict.core", value: "The drowned city will erase the keeper's memories if he exposes it." }),
        expect.objectContaining({ path: "stakes.failureCost", value: "If he fails, the city will surface and erase every coastal memory." })
      ]);

      const outline = await jsonFetch<{ outline: { outlineId: string; sourceCandidateFingerprint: string; status: string; canonWritten: boolean; horizon: { strongFreezeCount: number; totalChapterCount: number }; chapters: Array<{ chapterId: string; order: number; freeze: string }> } }>(
        `/api/novel/projects/${slug}/session/understanding/outline-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCandidateId: candidate.data.candidate.candidateId, strongFreezeCount: 3, totalChapterCount: 3 })
        }
      );
      expect(outline.status).toBe(201);
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
        unknowns: Array<{ status: string }>;
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
    expect(preview.data.preview.unknowns).toEqual([expect.objectContaining({ status: "unknown" })]);
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

      const asyncShadow = await jsonFetch<{
        job: { id: string; type: string; status: string };
        modelCallIssued: boolean;
        understandingWritten: boolean;
      }>(`/api/novel/projects/${slug}/session/understanding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "shadow-async" })
      });
      expect(asyncShadow.status).toBe(202);
      expect(asyncShadow.data).toMatchObject({ modelCallIssued: false, understandingWritten: false });
      expect(asyncShadow.data.job).toMatchObject({ type: "understanding.shadow", status: "pending" });
      const asyncFinished = await waitForJob(slug, asyncShadow.data.job.id);
      expect(asyncFinished.job).toMatchObject({
        status: "success",
        resultRef: `/api/novel/projects/${slug}/session/understanding/snapshot`
      });

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
      const answeredQuestion = await jsonFetch<{ question: { status: string; answerStatus: string } }>(
        `/api/novel/projects/${slug}/session/understanding/questions/question-primary-desire/answers`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answerBody) }
      );
      const replayedAnswer = await jsonFetch<{ question: { status: string }; replayed?: boolean }>(
        `/api/novel/projects/${slug}/session/understanding/questions/question-primary-desire/answers`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answerBody) }
      );
      expect(answeredQuestion.status).toBe(201);
      expect(answeredQuestion.data.question).toMatchObject({ status: "answered", answerStatus: "confirmed" });
      expect(replayedAnswer.status).toBe(200);
      expect(replayedAnswer.data).toMatchObject({ replayed: true, question: { status: "answered" } });

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
      };
    }>(`/api/novel/projects/${slug}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Hero blood gate", chapterId: "chapter-001" })
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

    const summaryBefore = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/memory/chapter-summaries/chapter-001"
    );
    expect(summaryBefore.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "",
      keyEvents: []
    });

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
    const started = await jsonFetch<{ run: { id: string } }>(`/api/novel/projects/${slug}/runtime/start`, {
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
    const settled = await jsonFetch<{ settlement: { settlementId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/chapters/${chapter.id}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionTransactionId: adopted.data.transaction.transactionId })
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
    const chapter = project.chapters[0];
    const content = await fs.readFile(path.join(tempRoot, project.slug, chapter.contentPath), "utf8");
    const contentSha256 = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-edition-1", projectSlug: project.slug, chapterId: chapter.id, adoptionTransactionId: "adopt-edition-1", adoptedContentSha256: contentSha256, status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: "2026-07-30T00:00:00.000Z" };
    const settlement = { ...settlementBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(settlementBase)).digest("hex") };
    await fs.mkdir(path.join(tempRoot, project.slug, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, project.slug, "sessions", "chapter-settlements", `${settlement.settlementId}.json`), JSON.stringify(settlement));
    const coverageBase = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-edition-1", chapterIds: [chapter.id], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-30T00:00:00.000Z" };
    await fs.mkdir(path.join(tempRoot, project.slug, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, project.slug, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...coverageBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(coverageBase)).digest("hex") }));
    const frozen = await jsonFetch<{ manifest: { status: string; editionId: string; readerSafe: boolean } }>(`/api/novel/projects/${project.slug}/publication-editions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canonCommitFingerprint: "canon-edition-1", author: "Author", language: "zh-CN", chapters: [{ chapterId: chapter.id, title: chapter.title, order: 1, contentPath: chapter.contentPath, settlementId: settlement.settlementId }] })
    });
    expect(frozen.status).toBe(201);
    expect(frozen.data.manifest).toMatchObject({ status: "frozen", readerSafe: true });
    const readBack = await jsonFetch<{ manifest: { editionId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}`);
    expect(readBack.status).toBe(200);
    expect(readBack.data.manifest.editionId).toBe(frozen.data.manifest.editionId);
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
    const proof = await jsonFetch<{ proof: { status: string; approvalId: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: "author-edition-release", approverKind: "author", expectedArtifactSetFingerprint: artifacts.data.artifacts.fingerprint }) });
    expect(proof.status).toBe(201);
    expect(proof.data.proof).toMatchObject({ status: "issued", approvalId: "author-edition-release" });
    const proofReadBack = await jsonFetch<{ verification: { valid: boolean } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/delivery-proof`);
    expect(proofReadBack.status).toBe(200);
    expect(proofReadBack.data.verification.valid).toBe(true);
    const closure = await jsonFetch<{ certificate: { status: string; fingerprint: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/closure-certificate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(closure.status).toBe(201);
    expect(closure.data.certificate).toMatchObject({ status: "audited_complete" });
    const preflight = await jsonFetch<{ report: { status: string; findings: unknown[] } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(preflight.status).toBe(200);
    expect(preflight.data.report).toMatchObject({ status: "ready", findings: [] });
    const grant = await jsonFetch<{ grant: { grantId: string; scope: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: "reader-1", scope: "reader", expiresAt: "2099-01-01T00:00:00.000Z" }) });
    expect(grant.status).toBe(201);
    expect(grant.data.grant).toMatchObject({ scope: "reader" });
    const grantVerification = await jsonFetch<{ verification: { valid: boolean } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/verify`);
    expect(grantVerification.data.verification.valid).toBe(true);
    const grantRevoked = await jsonFetch<{ event: { status: string } }>(`/api/novel/projects/${project.slug}/publication-editions/${frozen.data.manifest.editionId}/access-grants/${grant.data.grant.grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "reader request" }) });
    expect(grantRevoked.status).toBe(201);
    expect(grantRevoked.data.event.status).toBe("revoked");
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
    const history = await jsonFetch<{ tasks: Array<{ id: string; status: string }> }>(
      "/api/novel/projects/async-task-demo/tasks"
    );

    expect(started.status).toBe(202);
    expect(started.data.task).toMatchObject({ status: "running", timeoutMs: 600000 });
    expect(finished.task).toMatchObject({ status: "success", outputSummary: "mock task complete" });
    expect(history.data.tasks.filter((task) => task.id === started.data.task.id)).toEqual([
      expect.objectContaining({ status: "success" })
    ]);
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

  it("keeps unknown source rights analysis-only through API routes", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Source Rights API", roughIdea: "Rights must be explicit." }) });
    const slug = created.data.project.slug;
    const source = await jsonFetch<{ source: { sourceId: string; rightsStatus: string } }>(`/api/novel/projects/${slug}/runtime/source-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Unknown reference", type: "web", provenance: "import", rightsStatus: "unknown", licensor: "", allowedUses: ["analysis", "generation"], projectScope: slug, retainExcerpt: true, importedBy: "system" }) });
    expect(source.status).toBe(201);
    const envelope = await jsonFetch<{ envelope: { status: string; analysisOnly: boolean; allowedUses: string[] } }>(`/api/novel/projects/${slug}/runtime/source-material/${source.data.source.sourceId}/rights-envelope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedBy: "system" }) });
    expect(envelope.status).toBe(201);
    expect(envelope.data.envelope).toMatchObject({ status: "restricted", analysisOnly: true, allowedUses: ["analysis"] });
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
});
