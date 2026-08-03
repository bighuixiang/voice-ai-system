import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { novelApi } from "./novelApi";

describe("novelApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockJson(data: unknown, ok = true, status = ok ? 200 : 500) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(data)
    } as Response);
  }

  it("lists projects through the novel endpoint", async () => {
    mockJson({ projects: [{ slug: "demo", chapters: [] }] });

    const projects = await novelApi.listProjects();

    expect(projects).toEqual([{ slug: "demo", chapters: [] }]);
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects", {});
  });

  it("creates a project from a rough idea", async () => {
    mockJson({
      project: {
        id: "demo",
        slug: "demo",
        title: "Demo",
        genre: "fantasy",
        roughIdea: "A sealed mountain gate.",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    const project = await novelApi.createProject({ title: "Demo", roughIdea: "A sealed mountain gate." });

    expect(project.slug).toBe("demo");
    const [, request] = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.at(-1)!;
    expect(request).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(request.body))).toMatchObject({ title: "Demo", roughIdea: "A sealed mountain gate.", idempotencyKey: expect.stringMatching(/^project-create-/) });
  });

  it("reads the server-authoritative creative journey projection", async () => {
    mockJson({
      journey: {
        schemaVersion: "creative-journey-projection.v1",
        projectSlug: "demo",
        stage: "understanding",
        primaryAsset: "understanding-preview",
        primaryAction: { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
        activeQuestion: { id: "question-primary-desire", text: "What must the protagonist want most?", status: "candidate", impact: "high", source: "deterministic-gap" },
        sourceMessageIds: ["message-1"],
        sessionFingerprint: "a".repeat(64)
      }
    });

    const journey = await novelApi.readCreativeJourney("demo");

    expect(journey.stage).toBe("understanding");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/journey", {});
  });

  it("starts and advances a governed book run through explicit API contracts", async () => {
    mockJson({ run: { bookRunId: "book-run-1", status: "ready" } });
    await expect(novelApi.startBookRun("demo", { chapterIds: ["chapter-001"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } })).resolves.toMatchObject({ bookRunId: "book-run-1" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/book-runs", expect.objectContaining({ method: "POST", body: JSON.stringify({ chapterIds: ["chapter-001"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } }) }));

    mockJson({ run: { bookRunId: "book-run-1", status: "running" }, graph: { workItems: [] }, scheduled: [], dispatched: [] });
    await expect(novelApi.advanceBookRun("demo", "book-run-1")).resolves.toMatchObject({ run: { status: "running" } });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/book-runs/book-run-1/advance", expect.objectContaining({ method: "POST" }));
  });

  it("passes the active book run when settling a chapter", async () => {
    mockJson({ settlement: { settlementId: "settle-1", chapterId: "chapter-001", status: "settled" } });
    await novelApi.settleChapter("demo", "chapter-001", "adopt-1", "book-run-1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/chapters/chapter-001/settle", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ adoptionTransactionId: "adopt-1", bookRunId: "book-run-1" })
    }));
  });

  it("keeps feedback attribution scoped and derives a hypothesis through explicit endpoints", async () => {
    mockJson({ attribution: { attributionId: "attr-1", lifecycle: "candidate", allowPreferenceLearning: false } });
    await novelApi.createFeedbackAttribution("demo", "event-1", { category: "structure", pattern: "prefer-compact-dialogue", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.3, upper: 0.6 } });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/prose-feedback/event-1/attribution", expect.objectContaining({ method: "POST" }));
    mockJson({ hypothesis: { hypothesisId: "hyp-1", lifecycle: "candidate" } });
    await novelApi.derivePreferenceHypothesis("demo", "attr-1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/prose-feedback-attributions/attr-1/hypothesis", expect.objectContaining({ method: "POST" }));
  });

  it("reads, revokes, and records opposition without changing the evidence endpoint", async () => {
    mockJson({ hypothesis: { hypothesisId: "hyp-1", lifecycle: "validated", supportEventIds: ["event-1"] } });
    await novelApi.readPreferenceHypothesis("demo", "hyp-1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/preference-hypotheses/hyp-1", {});
    mockJson({ hypothesis: { hypothesisId: "hyp-1", lifecycle: "retired", supportEventIds: ["event-1"], revokeReason: "temporary" } });
    await novelApi.revokePreferenceHypothesis("demo", "hyp-1", { actor: "author", reason: "temporary" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/preference-hypotheses/hyp-1/revoke", expect.objectContaining({ method: "POST" }));
    mockJson({ hypothesis: { hypothesisId: "hyp-1", lifecycle: "weakened", oppositionEventIds: ["event-opposition"] } });
    await novelApi.recordPreferenceOpposition("demo", "hyp-1", { oppositionEventId: "event-opposition", reason: "counterexample" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/preference-hypotheses/hyp-1/oppositions", expect.objectContaining({ method: "POST" }));
  });

  it("uses bounded learning-policy and exploration-budget endpoints", async () => {
    mockJson({ policy: { policyId: "policy-demo", rollbackVersion: "v1" } });
    await novelApi.createLearningPolicy("demo", "v1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/learning-policy", expect.objectContaining({ method: "POST" }));
    mockJson({ budget: { budgetId: "budget-1", status: "active" } });
    await novelApi.createExplorationBudget("demo", { scope: "chapter-1", maxProbes: 2, maxCost: 10, maxImpact: "chapter-1", stopConditions: [] });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/exploration-budgets", expect.objectContaining({ method: "POST" }));
    mockJson({ budget: { budgetId: "budget-1", status: "active", usedProbes: 1 } });
    await novelApi.consumeExplorationBudget("demo", "budget-1", { operationId: "probe-1", probes: 1, cost: 2, impact: "chapter-1" });
    mockJson({ budget: { budgetId: "budget-1", status: "paused" } });
    await novelApi.pauseExplorationBudget("demo", "budget-1", "review");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/exploration-budgets/budget-1/pause", expect.objectContaining({ method: "POST" }));
  });

  it("reads learning governance state for the author workspace", async () => {
    mockJson({ policy: { policyId: "policy-demo" } });
    await novelApi.readLearningPolicy("demo");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/learning-policy", {});
    mockJson({ budget: { budgetId: "budget-1", status: "active" } });
    await novelApi.readExplorationBudget("demo", "budget-1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/exploration-budgets/budget-1", {});
  });

  it("keeps source material rights operations explicit", async () => {
    mockJson({ source: { sourceId: "source-1", rightsStatus: "unknown" } });
    const source = await novelApi.createSourceMaterial("demo", { title: "Reference", type: "sample", provenance: "upload", rightsStatus: "unknown", licensor: "", allowedUses: ["analysis"], projectScope: "demo", retainExcerpt: false, importedBy: "author" });
    expect(source.sourceId).toBe("source-1");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/source-material", expect.objectContaining({ method: "POST" }));
    mockJson({ envelope: { envelopeId: "rights-1", status: "restricted", analysisOnly: true } });
    await novelApi.createRightsEnvelope("demo", "source-1", "author");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/source-material/source-1/rights-envelope", expect.objectContaining({ method: "POST" }));
  });

  it("keeps craft pattern creation and approval behind explicit endpoints", async () => {
    mockJson({ pattern: { patternId: "pattern-1", lifecycle: "candidate" } });
    await novelApi.createCraftPattern("demo", { name: "Scoped rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: [], sourceEnvelopeIds: ["rights-1"], evidenceRefs: ["source://one"] });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-patterns", expect.objectContaining({ method: "POST" }));
    mockJson({ pattern: { patternId: "pattern-1", lifecycle: "approved" } });
    await novelApi.approveCraftPattern("demo", "pattern-1", { actor: "author", reason: "Scoped" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-patterns/pattern-1/approve", expect.objectContaining({ method: "POST" }));
  });

  it("requires an explicit similarity guard before creating a transfer plan", async () => {
    mockJson({ guard: { guardId: "guard-1", status: "passed", risk: "low" } });
    const guard = await novelApi.evaluateSimilarityGuard("demo", { sourceText: "source", targetText: "transformed", maxTokenOverlap: 0.35, sourceVersion: "s1", targetVersion: "t1" });
    expect(guard.status).toBe("passed");
    mockJson({ plan: { planId: "plan-1", status: "candidate", canonWriteAllowed: false } });
    await novelApi.createPatternTransferPlan("demo", { patternId: "pattern-1", sourceEnvelopeId: "rights-1", guard, targetChapterId: "chapter-1", intendedEffect: "preserve pressure" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/pattern-transfer-plans", expect.objectContaining({ method: "POST" }));
  });

  it("keeps craft experiments and independent judgments explicit", async () => {
    mockJson({ experiment: { experimentId: "experiment-1", status: "planned" } });
    await novelApi.createCraftExperiment("demo", { transferPlanId: "plan-1", baselineCandidateId: "base", treatmentCandidateId: "treatment", holdoutSceneIds: ["scene-1"], targetMetrics: ["pressure"], budgetId: "budget-1" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-experiments", expect.objectContaining({ method: "POST" }));
    mockJson({ experiment: { experimentId: "experiment-1", status: "running" } });
    await novelApi.startCraftExperiment("demo", "experiment-1", "runner");
    mockJson({ experiment: { experimentId: "experiment-1", status: "judged" } });
    await novelApi.judgeCraftExperiment("demo", "experiment-1", { evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "holdout improved" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-experiments/experiment-1/judge", expect.objectContaining({ method: "POST" }));
  });

  it("keeps pattern promotion behind the judged experiment result", async () => {
    mockJson({ pattern: { patternId: "pattern-1", lifecycle: "probation" } });
    await novelApi.promoteCraftPatternFromExperiment("demo", "pattern-1", { experiment: { experimentId: "experiment-1", status: "judged", judgment: { winner: "treatment", hardGuardsPassed: true } } as never, actor: "author", reason: "holdout" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-patterns/pattern-1/promote-from-experiment", expect.objectContaining({ method: "POST" }));
  });

  it("requires a second experiment before validating a craft pattern", async () => {
    mockJson({ pattern: { patternId: "pattern-1", lifecycle: "validated" } });
    await novelApi.validateCraftPatternFromExperiment("demo", "pattern-1", { experiment: { experimentId: "experiment-2", status: "judged", judgment: { winner: "treatment", hardGuardsPassed: true } } as never, actor: "author", reason: "second holdout" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/craft-patterns/pattern-1/validate-from-experiment", expect.objectContaining({ method: "POST" }));
  });

  it("runs a completion audit with an explicit closure source fingerprint", async () => {
    mockJson({ audit: { status: "audited_complete", bookRunId: "book-run-1" } });
    await expect(novelApi.runBookCompletionAudit("demo", "book-run-1", "closure-source-1")).resolves.toMatchObject({ status: "audited_complete" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/book-runs/book-run-1/completion-audits", expect.objectContaining({ method: "POST", body: JSON.stringify({ sourceFingerprint: "closure-source-1" }) }));
  });

  it("reads and explicitly activates release only through the release endpoints", async () => {
    mockJson({ activation: null });
    await expect(novelApi.readReleaseActivation()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/novel/release-activation", {});
    mockJson({ activation: { status: "active", fingerprint: "activation-1" } });
    await expect(novelApi.activateRelease()).resolves.toMatchObject({ status: "active" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/release-activation", expect.objectContaining({ method: "POST" }));
  });

  it("imports a local folder as a managed project", async () => {
    mockJson({
      project: {
        id: "imported",
        slug: "imported",
        title: "Imported",
        genre: "fantasy",
        roughIdea: "Imported source",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    const project = await novelApi.importProject({ sourcePath: "D:\\novels\\old-story", title: "Imported" });

    expect(project.slug).toBe("imported");
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/import",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: "D:\\novels\\old-story", title: "Imported" })
      })
    );
  });

  it("imports browser selected directory files", async () => {
    mockJson({
      project: {
        id: "uploaded",
        slug: "uploaded",
        title: "Uploaded",
        genre: "fantasy",
        roughIdea: "Uploaded source",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    await novelApi.importProject({
      sourcePath: "uploaded-story",
      title: "Uploaded",
      files: [{ relativePath: "uploaded-story/chapter-001.md", content: "# Uploaded" }]
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/import",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: "uploaded-story",
          title: "Uploaded",
          files: [{ relativePath: "uploaded-story/chapter-001.md", content: "# Uploaded" }]
        })
      })
    );
  });

  it("reads the platform library and manages shared asset links", async () => {
    mockJson({ library: { version: 1, assets: [], prompts: [], roles: [], skills: [], updatedAt: "now" } });
    mockJson({ asset: { id: "asset-1", name: "Shared Sword", type: "prop", linkedProjects: ["demo"] } });
    mockJson({ asset: { id: "asset-1", name: "Shared Sword", type: "prop", linkedProjects: ["demo", "other"] } });

    await expect(novelApi.readPlatformLibrary()).resolves.toMatchObject({ version: 1 });
    await expect(
      novelApi.createPlatformAsset({ name: "Shared Sword", type: "prop", projectSlug: "demo" })
    ).resolves.toMatchObject({ id: "asset-1" });
    await expect(novelApi.linkPlatformAsset("asset-1", "other")).resolves.toMatchObject({
      linkedProjects: ["demo", "other"]
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/platform/library", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/platform/assets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Shared Sword", type: "prop", projectSlug: "demo" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/platform/assets/asset-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ projectSlug: "other" })
      })
    );
  });

  it("reads, checks, and saves AI agent configuration", async () => {
    mockJson({
      defaultProfileId: "codex-cli",
      profiles: [{ id: "codex-cli", label: "Codex CLI", provider: "codex", command: "codex", models: [] }],
      checks: []
    });
    mockJson({
      stages: [{ key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }]
    });
    mockJson({ available: true, profileId: "codex-cli", provider: "codex", label: "Codex CLI", command: "codex" });
    mockJson({
      config: {
        version: 1,
        defaultScenario: "novel",
        scenarios: {
          novel: { profileId: "codex-cli", modelId: "gpt-5" },
          assets: { profileId: "codex-cli" },
          script: { profileId: "codex-cli" },
          "image-generation": { profileId: "codex-cli" },
          "video-generation": { profileId: "codex-cli" }
        },
        knowledgeEmbedding: {
          provider: "local",
          baseUrl: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          apiKeyConfigured: false
        },
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    });
    mockJson({
      config: {
        version: 1,
        defaultScenario: "novel",
        scenarios: {
          novel: { profileId: "codex-cli", modelId: "gpt-5" },
          assets: { profileId: "codex-cli" },
          script: { profileId: "codex-cli" },
          "image-generation": { profileId: "codex-cli" },
          "video-generation": { profileId: "codex-cli" }
        },
        knowledgeEmbedding: {
          provider: "local",
          baseUrl: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          apiKeyConfigured: false
        },
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    });
    mockJson({ project: { slug: "demo", ai: { profileId: "codex-cli", modelId: "gpt-5" } } });

    await expect(novelApi.readAgentProfiles()).resolves.toMatchObject({ defaultProfileId: "codex-cli" });
    await expect(novelApi.readAiStages()).resolves.toEqual([
      { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }
    ]);
    await expect(novelApi.checkAgentProfile("codex-cli", "gpt-5")).resolves.toMatchObject({ available: true });
    const platformConfig = await novelApi.readPlatformAiConfig();
    await expect(novelApi.savePlatformAiConfig(platformConfig)).resolves.toMatchObject({
      scenarios: { novel: { modelId: "gpt-5" } }
    });
    await expect(novelApi.updateProjectAiConfig("demo", { profileId: "codex-cli", modelId: "gpt-5" })).resolves.toMatchObject({
      ai: { modelId: "gpt-5" }
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/agents", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/ai-stages",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/agents/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/platform/ai-config",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/platform/ai-config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ config: platformConfig })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/novel/projects/demo/ai",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5" })
      })
    );
  });

  it("reads and saves project files", async () => {
    mockJson({ content: "# Chapter 1\n" });
    mockJson({ saved: true });

    await expect(novelApi.readFile("demo", "chapters/chapter-001.md")).resolves.toBe("# Chapter 1\n");
    await novelApi.saveFile("demo", "chapters/chapter-001.md", "new draft");

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/files/chapters/chapter-001.md", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/files/chapters/chapter-001.md",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "new draft" })
      })
    );
  });

  it("reads the global migration cutover readiness report", async () => {
    mockJson({ report: { schemaVersion: "project-migration-cutover.v1", status: "blocked", projectCount: 1, projects: [], blockers: ["demo:legacy-governance"], evaluatedAt: "now", fingerprint: "f".repeat(64) } });

    const report = await novelApi.readMigrationCutoverReadiness();

    expect(report.status).toBe("blocked");
    expect(fetch).toHaveBeenCalledWith("/api/novel/migrations/cutover-readiness", {});
  });

  it("runs global migration validation without activation", async () => {
    mockJson({ report: { schemaVersion: "project-migration-batch-validation.v1", status: "blocked", projectCount: 1, projects: [], blockers: ["demo:outline-version-missing"], generatedAt: "now", fingerprint: "f".repeat(64) } });
    const report = await novelApi.validateAllProjectMigrations();
    expect(report.status).toBe("blocked");
    expect(fetch).toHaveBeenCalledWith("/api/novel/migrations/validate-all", expect.objectContaining({ method: "POST", body: "{}" }));
  });

  it("drives migration validation, conflict resolution and activation", async () => {
    mockJson({ validation: { status: "validated", conflicts: ["outline-authority-active-and-archived"], resolvedConflicts: [] } });
    const validation = await novelApi.validateProjectMigration("demo", "migration-1");
    expect(validation.status).toBe("validated");
    mockJson({ resolution: { status: "resolved", selectedOutlineAuthority: "active", resolvedConflicts: ["outline-authority-active-and-archived"] } });
    const resolution = await novelApi.resolveProjectMigrationConflicts("demo", "migration-1", "active");
    expect(resolution.selectedOutlineAuthority).toBe("active");
    mockJson({ activation: { status: "activated", writeAuthority: "prose-adoption" } });
    const activationInput = { idempotencyKey: "activate-1", expectedValidationFingerprint: "a".repeat(64) };
    const activation = await novelApi.activateProjectMigration("demo", "migration-1", activationInput);
    expect(activation.status).toBe("activated");
    mockJson({ rollback: { status: "rolled_back", migrationId: "migration-1" } });
    const rollback = await novelApi.rollbackProjectMigration("demo", "migration-1");
    expect(rollback.status).toBe("rolled_back");
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/migrations/migration-1/validate", expect.objectContaining({ method: "POST", body: "{}" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/migrations/migration-1/resolve-conflicts", expect.objectContaining({ method: "POST", body: JSON.stringify({ selectedOutlineAuthority: "active" }) }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/migrations/migration-1/activate", expect.objectContaining({ method: "POST", body: JSON.stringify(activationInput) }));
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/novel/projects/demo/migrations/migration-1/rollback", expect.objectContaining({ method: "POST", body: "{}" }));
  });

  it("reads the local backup catalog without implying disaster recovery", async () => {
    mockJson({ backups: [{ backupId: "backup-1", projectSlug: "demo", status: "verified", faultDomain: "same-workspace", objectCount: 2 }] });
    const backups = await novelApi.listProjectBackups("demo");
    expect(backups[0]).toMatchObject({ backupId: "backup-1", faultDomain: "same-workspace" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/backups", {});
  });

  it("uses append-only obligation commands instead of a direct status update", async () => {
    mockJson({ obligations: [{ obligationId: "obligation-1", status: "proposed", version: 0 }] });
    const obligations = await novelApi.listNarrativeObligations("demo");
    expect(obligations[0].obligationId).toBe("obligation-1");
    mockJson({ obligation: { obligationId: "obligation-2", status: "proposed", version: 0 } });
    await novelApi.createNarrativeObligation("demo", { type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?" });
    mockJson({ obligation: { obligationId: "obligation-2", status: "confirmed", version: 1 }, event: { toStatus: "confirmed" } });
    const result = await novelApi.appendNarrativeObligationEvent("demo", "obligation-2", { toStatus: "confirmed", reason: "author confirmed", actor: "author", expectedVersion: 0 });
    expect(result.obligation.status).toBe("confirmed");
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/obligations", {});
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/obligations", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/obligations/obligation-2/events", expect.objectContaining({ method: "POST", body: JSON.stringify({ toStatus: "confirmed", reason: "author confirmed", actor: "author", expectedVersion: 0 }) }));
  });

  it("reads honest obligation source coverage", async () => {
    mockJson({ report: { sourceCoverageStatus: "empty-assets-coverage-unknown", canClaimNoOpenObligations: false, plannedIds: ["FS-demo-001"] } });
    const report = await novelApi.readNarrativeObligationCoverage("demo");
    expect(report.sourceCoverageStatus).toBe("empty-assets-coverage-unknown");
    expect(report.canClaimNoOpenObligations).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/obligation-coverage", {});
  });

  it("previews obligation candidates without an adoption command", async () => {
    mockJson({ candidates: [{ candidateId: "candidate-1", markerId: "FS-demo-001", status: "candidate", chapterIds: ["chapter-001"], sourceRefs: ["scene://chapter-001#scene-1"], existingObligationId: null }] });
    const candidates = await novelApi.previewNarrativeObligationCandidates("demo");
    expect(candidates[0].status).toBe("candidate");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/obligation-candidates/preview", {});
  });

  it("requests a coverage certificate with an explicit frozen source fingerprint", async () => {
    mockJson({ certificate: { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "publication-1" } });
    const certificate = await novelApi.issueObligationCoverageCertificate("demo", "publication-1");
    expect(certificate.status).toBe("issued");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/obligation-coverage/certificate", expect.objectContaining({ method: "POST", body: JSON.stringify({ sourceFingerprint: "publication-1" }) }));
  });

  it("validates and invalidates coverage certificates by source fingerprint", async () => {
    mockJson({ valid: true, certificate: { status: "issued" } });
    await expect(novelApi.validateObligationCoverageCertificate("demo", "publication-1")).resolves.toMatchObject({ valid: true });
    mockJson({ invalidation: { status: "stale", currentSourceFingerprint: "publication-2" } });
    await expect(novelApi.invalidateObligationCoverageCertificate("demo", "publication-2")).resolves.toMatchObject({ status: "stale" });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/obligation-coverage/certificate/invalidate", expect.objectContaining({ method: "POST", body: JSON.stringify({ sourceFingerprint: "publication-2" }) }));
  });

  it("creates and lists author revision intents", async () => {
    mockJson({ intent: { intentId: "revision-1", status: "proposed", mode: "branch_candidate", maturity: "settled" } });
    const intent = await novelApi.createRevisionIntent("demo", { authorText: "保留第三段", type: "style_edit", maturity: "settled", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["local repair"], protectedItems: ["chapter-001.paragraph-3"], mode: "branch_candidate", actor: "author" });
    expect(intent.mode).toBe("branch_candidate");
    mockJson({ intents: [intent] });
    await expect(novelApi.listRevisionIntents("demo")).resolves.toHaveLength(1);
    mockJson({ report: { intentId: "revision-1", status: "needs_review", directChapterIds: ["chapter-001"], transitiveChapterIds: ["chapter-001"], unknownDependencies: ["dependency-graph-missing"] } });
    await expect(novelApi.readRevisionImpactReport("demo", "revision-1")).resolves.toMatchObject({ status: "needs_review", unknownDependencies: ["dependency-graph-missing"] });
    mockJson({ changeSet: { status: "candidate", operations: [{ targetId: "chapter-001.paragraph-1" }] } });
    await expect(novelApi.createRevisionChangeSet("demo", "revision-1", "fp-1", [{ kind: "update", targetKind: "text-span", targetId: "chapter-001.paragraph-1", chapterId: "chapter-001", rationale: "local repair" }])).resolves.toMatchObject({ status: "candidate" });
    mockJson({ review: { status: "approved_for_adoption", canonWritten: false } });
    await expect(novelApi.reviewRevisionChangeSet("demo", "changeset-1", "fp-1", { decision: "accepted", note: "Proceed", actor: "author" })).resolves.toMatchObject({ status: "approved_for_adoption", canonWritten: false });
    mockJson({ proposal: { status: "ready_for_author_adoption", canonWritten: false, baseCanonFingerprint: "canon-1" } });
    await expect(novelApi.createRevisionAdoptionProposal("demo", "changeset-1", "fp-1", "review-1", "canon-1")).resolves.toMatchObject({ status: "ready_for_author_adoption", canonWritten: false });
    mockJson({ receipt: { status: "committed", canonWritten: true, proseAdoptionTransactionId: "adopt-1" } });
    await expect(novelApi.recordRevisionAdoptionReceipt("demo", "proposal-1", "fp-1", "adopt-1")).resolves.toMatchObject({ status: "committed", canonWritten: true });
    mockJson({ settlement: { status: "settled", chapterSettlementIds: ["settle-008"] } });
    await expect(novelApi.settleRevision("demo", "receipt-1", "fp-1", ["settle-008"])).resolves.toMatchObject({ status: "settled", chapterSettlementIds: ["settle-008"] });
    mockJson({ manifest: { status: "frozen", editionId: "edition-1", readerSafe: true } });
    await expect(novelApi.createEditionManifest("demo", { canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", chapters: [{ chapterId: "chapter-001", title: "第一章", order: 1, contentPath: "chapters/chapter-001.md", settlementId: "settle-008" }] })).resolves.toMatchObject({ status: "frozen", editionId: "edition-1" });
    mockJson({ manifest: { status: "frozen", editionId: "edition-1" } });
    await expect(novelApi.readEditionManifest("demo", "edition-1")).resolves.toMatchObject({ editionId: "edition-1" });
    mockJson({ tree: { schemaVersion: "publication-tree.v1", editionId: "edition-1", readerSafe: true } });
    await expect(novelApi.compilePublicationTree("demo", "edition-1")).resolves.toMatchObject({ schemaVersion: "publication-tree.v1", readerSafe: true });
    mockJson({ tree: { schemaVersion: "publication-tree.v1", editionId: "edition-1", readerSafe: true } });
    await expect(novelApi.readPublicationTree("demo", "edition-1")).resolves.toMatchObject({ editionId: "edition-1" });
    mockJson({ artifacts: { schemaVersion: "publication-artifact-set.v1", status: "validated", artifacts: [{ format: "markdown", sha256: "a" }] } });
    await expect(novelApi.renderPublicationArtifacts("demo", "edition-1", ["markdown", "txt"])).resolves.toMatchObject({ status: "validated" });
    mockJson({ artifacts: { schemaVersion: "publication-artifact-set.v1", status: "validated" } });
    await expect(novelApi.readPublicationArtifacts("demo", "edition-1")).resolves.toMatchObject({ status: "validated" });
    mockJson({ proof: { schemaVersion: "delivery-proof.v1", status: "issued", approvalId: "author-release-1" } });
    await expect(novelApi.issueDeliveryProof("demo", "edition-1", "author-release-1", "artifact-fp")).resolves.toMatchObject({ status: "issued", approvalId: "author-release-1" });
    mockJson({ verification: { valid: true, reasons: [], proof: { status: "issued" } } });
    await expect(novelApi.verifyDeliveryProof("demo", "edition-1")).resolves.toMatchObject({ valid: true });
    mockJson({ event: { status: "revoked", reason: "withdrawn" } });
    await expect(novelApi.revokeDeliveryProof("demo", "edition-1", "withdrawn")).resolves.toMatchObject({ status: "revoked" });
    mockJson({ event: { status: "superseded", replacementEditionId: "edition-2" } });
    await expect(novelApi.supersedeDeliveryProof("demo", "edition-1", "new edition", "edition-2")).resolves.toMatchObject({ status: "superseded", replacementEditionId: "edition-2" });
    mockJson({ grant: { schemaVersion: "delivery-access-grant.v1", status: "active", scope: "reader", recipientId: "reader-1" } });
    await expect(novelApi.issueDeliveryAccessGrant("demo", "edition-1", "reader-1", "reader", "2099-01-01T00:00:00.000Z")).resolves.toMatchObject({ status: "active", scope: "reader" });
    mockJson({ verification: { valid: true, reasons: [], grant: { status: "active" } } });
    await expect(novelApi.verifyDeliveryAccessGrant("demo", "edition-1", "grant-1")).resolves.toMatchObject({ valid: true });
    mockJson({ event: { status: "revoked", grantId: "grant-1" } });
    await expect(novelApi.revokeDeliveryAccessGrant("demo", "edition-1", "grant-1", "reader request")).resolves.toMatchObject({ status: "revoked", grantId: "grant-1" });
    mockJson({ report: { schemaVersion: "release-preflight.v1", status: "blocked", findings: [{ code: "delivery-proof-missing" }] } });
    await expect(novelApi.preflightPublicationEdition("demo", "edition-1")).resolves.toMatchObject({ status: "blocked", findings: [{ code: "delivery-proof-missing" }] });
  });

  it("reads quality calibration evidence without exposing holdout labels", async () => {
    mockJson({ evidence: { schemaVersion: "quality-calibration-evidence.v1", status: "blocked", canonGateEligible: false } });
    const evidence = await novelApi.readQualityCalibrationEvidence("demo");
    expect(evidence.status).toBe("blocked");
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/understanding/quality-calibration", {});
    mockJson({ evidence: [{ schemaVersion: "quality-calibration-evidence.v1", status: "blocked" }] });
    await expect(novelApi.readQualityCalibrationEvidenceHistory("demo")).resolves.toHaveLength(1);
  });

  it("submits only externally attested calibration evidence", async () => {
    mockJson({ evidence: { schemaVersion: "quality-calibration-evidence.v1", status: "calibrated", sourceKind: "human", caseIds: [], canonGateEligible: false } });
    const input = { evaluatorVersion: "human-v1", sourceKind: "human" as const, holdoutInputFingerprint: "sealed-human-v1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "human-reviewed" as const, reference: "human://review/v1" }, evidenceRefs: ["audit://human/v1"] };
    await expect(novelApi.submitQualityCalibrationEvidence("demo", input)).resolves.toMatchObject({ status: "calibrated", sourceKind: "human" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/understanding/quality-calibration", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
  });

  it("reads the global release acceptance decision as a read-only gate", async () => {
    mockJson({ decision: { schemaVersion: "release-acceptance.v1", status: "do-not-activate", checks: [] } });
    await expect(novelApi.readReleaseAcceptance()).resolves.toMatchObject({ status: "do-not-activate" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/release-acceptance", {});
  });

  it("submits an externally attested understanding review with all gates", async () => {
    mockJson({ review: { schemaVersion: "understanding-review.v1", status: "passed", canonWritten: false, reviewer: { kind: "human" } } });
    const input = { reviewerKind: "human" as const, reviewerId: "reviewer-1", attestationReference: "human://review/1", snapshotFingerprint: "a".repeat(64), checks: ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"].map((checkId) => ({ checkId: checkId as any, detail: "passed" })), evidenceRefs: ["audit://review/1"] };
    await expect(novelApi.submitExternalUnderstandingReview("demo", input)).resolves.toMatchObject({ status: "passed" });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/understanding/review/external", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
  });

  it("compiles an outline candidate from a contract candidate", async () => {
    mockJson({ outline: { outlineId: "outline-candidate-contract-1", canonWritten: false }, created: true });
    const result = await novelApi.compileOutlineCandidate("demo", "contract-1", { strongFreezeCount: 3, totalChapterCount: 5 });
    expect(result.created).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/outline-candidates",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ sourceCandidateId: "contract-1", strongFreezeCount: 3, totalChapterCount: 5 }) })
    );
  });

  it("validates an outline candidate through the safety gate", async () => {
    mockJson({ report: { reportId: "outline-validation-1", status: "passed", executionReady: false } });
    const report = await novelApi.validateOutlineCandidate("demo", "outline-1");
    expect(report.executionReady).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/outline-candidates/outline-1/validate",
      expect.objectContaining({ method: "POST", body: "{}" })
    );
  });

  it("creates an outline adoption proposal without writing canon", async () => {
    mockJson({ proposal: { proposalId: "outline-adoption-1", status: "ready_for_authorization", canonWritten: false } });
    const proposal = await novelApi.createOutlineAdoptionProposal("demo", { outlineId: "outline-1", expectedOutlineFingerprint: "fp-1", selectedChapterIds: ["chapter-001"] });
    expect(proposal.canonWritten).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/outline-adoption-proposals",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("commits only an authorized outline proposal and returns its proof", async () => {
    mockJson({ status: "committed", canonWritten: true, proof: { executionReady: true } });
    const result = await novelApi.commitOutlineAdoption("demo", "proposal-fingerprint");
    expect(result.canonWritten).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/outline-adoption",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedProposalFingerprint: "proposal-fingerprint" }) })
    );
  });

  it("checks execution readiness for a chapter before runtime start", async () => {
    mockJson({ readiness: { allowed: false, reason: "CHAPTER_OUTSIDE_WINDOW", checks: [] } });
    const readiness = await novelApi.checkExecutionReadiness("demo", "chapter-009");
    expect(readiness.allowed).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/runtime/execution-readiness/chapter-009", {});
  });

  it("compiles an attributed interpretation candidate without losing the branch id", async () => {
    mockJson({ candidate: { candidateId: "candidate-branch-revenge" }, created: true });

    await novelApi.compileContractCandidate("demo", "decision-1", "branch-revenge");

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/contract-candidates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decisionId: "decision-1", interpretationId: "branch-revenge" })
      })
    );
  });

  it("lists contract candidates for comparison", async () => {
    mockJson({ candidates: [{ candidateId: "candidate-1" }] });

    const candidates = await novelApi.listContractCandidates("demo");

    expect(candidates).toEqual([{ candidateId: "candidate-1" }]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/contract-candidates",
      {}
    );
  });

  it("creates a scoped non-canon world rule contract", async () => {
    mockJson({ contract: { ruleId: "world-rule-1", status: "candidate", canonWritten: false } });

    await novelApi.createWorldRuleContract("demo", {
      sourceCandidateId: "candidate-1",
      sourceFingerprint: "a".repeat(64),
      proposition: { condition: "anchor", mechanism: "fold", result: "cross", cost: "lifespan", limit: "once", failure: "pain" },
      scope: { subjects: ["caster"], regions: ["nine-lotus-mountain"] },
      disclosure: { objectiveStatus: "unknown", domains: [{ domainId: "church", kind: "institution_belief", claim: "divine" }] },
      evidenceRefs: [{ kind: "dialogue-question", refId: "question-world-rule" }]
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/session/understanding/world-rule-contracts",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reads and captures a durable creative session", async () => {
    const session = {
      schemaVersion: "creative-session.v1",
      sessionId: "session-demo",
      projectSlug: "demo",
      status: "capturing" as const,
      messages: [],
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z"
    };
    mockJson({ session });
    mockJson({ session: { ...session, messages: [{ id: "message-1", clientMessageId: "client-1", role: "author", text: "A seed", source: { kind: "author" }, createdAt: "now" }] }, created: true });

    await expect(novelApi.readCreativeSession("demo")).resolves.toEqual(session);
    await expect(novelApi.captureAuthorMessage("demo", { clientMessageId: "client-1", text: "A seed" })).resolves.toMatchObject({ created: true });
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/session", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/session/messages",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: "client-1", text: "A seed" })
      })
    );
  });

  it("reads the non-authoritative understanding preview", async () => {
    mockJson({
      preview: {
        schemaVersion: "understanding-preview.v1",
        projectSlug: "demo",
        inputFingerprint: "a".repeat(64),
        sourceMessageIds: ["message-1"],
        coreExplicit: [],
        inferred: [],
        unknowns: [],
        nextAction: "await-safe-understanding-dependencies",
        modelCallIssued: false,
        canonWritten: false
      }
    });

    await expect(novelApi.readUnderstandingPreview("demo")).resolves.toMatchObject({
      schemaVersion: "understanding-preview.v1",
      modelCallIssued: false
    });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/understanding-preview", {});
  });

  it("freezes the session input as a T0 context manifest", async () => {
    mockJson({
      manifest: {
        schemaVersion: "context-manifest.v1",
        manifestId: "context-1",
        projectSlug: "demo",
        purpose: "understanding",
        sourceSessionId: "session-demo",
        sourceFingerprint: "b".repeat(64),
        sourceMessages: [],
        frozenAt: "2026-07-29T00:00:00.000Z"
      },
      created: true
    }, true, 201);

    await expect(novelApi.freezeContextManifest("demo")).resolves.toMatchObject({ created: true });
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/session/context-manifest", { method: "POST" });
  });

  it("starts and controls a persisted understanding task", async () => {
    const task = {
      schemaVersion: "understanding-task.v1",
      taskId: "understanding-task-1",
      projectSlug: "demo",
      status: "queued" as const,
      sourceFingerprint: "a".repeat(64),
      sourceMessageIds: ["message-1"],
      modelCallIssued: false,
      canonWritten: false as const,
      startedAt: "now",
      updatedAt: "now"
    };
    mockJson({ task }, true, 202);
    mockJson({ task: { ...task, status: "cancelled" } });
    mockJson({ task: { ...task, status: "queued" } }, true, 202);

    await expect(novelApi.startUnderstanding("demo", "model")).resolves.toMatchObject({ task: { taskId: task.taskId, status: "queued" } });
    await expect(novelApi.cancelUnderstandingTask("demo", task.taskId)).resolves.toMatchObject({ status: "cancelled" });
    await expect(novelApi.resumeUnderstandingTask("demo", task.taskId)).resolves.toMatchObject({ status: "queued" });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/novel/projects/demo/session/understanding",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ mode: "model" }) })
    );
  });

  it("lists, creates, and answers a versioned dialogue question", async () => {
    const question = {
      schemaVersion: "dialogue-question.v1",
      questionId: "question-primary-desire",
      questionVersion: 1,
      projectSlug: "demo",
      status: "active" as const,
      text: "What does the protagonist want?",
      whyNow: "It changes the opening.",
      impact: "high" as const,
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Ask once",
      snapshotFingerprint: "a".repeat(64)
    };
    mockJson({ questions: [question] });
    mockJson({ created: false, question });
    mockJson({ question: { ...question, status: "answered", answerStatus: "confirmed" }, replayed: false }, true, 201);

    await expect(novelApi.listDialogueQuestions("demo")).resolves.toEqual([question]);
    await expect(novelApi.ensurePrimaryDialogueQuestion("demo")).resolves.toMatchObject({ created: false });
    await expect(novelApi.answerDialogueQuestion("demo", question.questionId, {
      questionVersion: 1,
      expectedSnapshotFingerprint: question.snapshotFingerprint,
      idempotencyKey: "answer-1",
      answerText: "Truth",
      answerStatus: "confirmed"
    })).resolves.toMatchObject({ question: { status: "answered" } });
  });

  it("reads file versions, diffs, and editor suggestions", async () => {
    mockJson({ versions: [{ id: "v1", filePath: "chapters/chapter-001.md", versionPath: "versions/chapter/v1.md", createdAt: "2026-06-12T00:00:00.000Z", size: 12 }] });
    mockJson({
      diff: {
        filePath: "chapters/chapter-001.md",
        fromVersion: { id: "v1", filePath: "chapters/chapter-001.md", versionPath: "versions/chapter/v1.md", createdAt: "2026-06-12T00:00:00.000Z", size: 12 },
        toVersion: { id: "current", label: "当前文件", createdAt: "2026-06-12T00:01:00.000Z" },
        original: "old",
        modified: "new"
      }
    });
    mockJson({ suggestion: { id: "s1", text: "继续推进。", summary: "local", source: "local", createdAt: "2026-06-12T00:00:00.000Z" } });

    await expect(novelApi.readFileVersions("demo", "chapters/chapter-001.md")).resolves.toHaveLength(1);
    await expect(novelApi.readFileDiff("demo", "chapters/chapter-001.md", "v1")).resolves.toMatchObject({ modified: "new" });
    await expect(
      novelApi.requestEditorSuggestion("demo", {
        filePath: "chapters/chapter-001.md",
        chapterId: "chapter-001",
        documentKind: "content",
        beforeText: "他推开门",
        afterText: ""
      })
    ).resolves.toMatchObject({ text: "继续推进。" });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/file-versions/chapters/chapter-001.md", {});
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/file-diff/chapters/chapter-001.md?from=v1", {});
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/projects/demo/editor/suggestion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          filePath: "chapters/chapter-001.md",
          chapterId: "chapter-001",
          documentKind: "content",
          beforeText: "他推开门",
          afterText: ""
        })
      })
    );
  });

  it("reads and saves writing cockpit resources", async () => {
    const dashboard = {
      chapterId: "chapter-001",
      goal: "Make the choice unavoidable.",
      pov: "Hero",
      mainConflict: "Stay hidden or act.",
      endingHook: "The seal answers.",
      wordCount: 1200,
      status: "drafting",
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const scenes = [
      {
        id: "scene-1",
        chapterId: "chapter-001",
        order: 1,
        title: "Pressure",
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
    ];
    const storyControl = {
      version: 1 as const,
      premise: "A careful hero opens a sealed gate.",
      currentArcId: "arc-1",
      arcs: [],
      characters: [],
      events: [],
      orchestrationNotes: "Keep upgrades causal.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const runtimeSnapshot = {
      projectSlug: "demo",
      chapterId: "chapter-001",
      chapterTitle: "Chapter 1",
      activeStepId: "review",
      fingerprint: "abcdef1234567890",
      steps: [{ id: "draft", label: "正文", status: "done", detail: "Saved.", metric: "1200 字" }],
      signals: {
        wordCount: 1200,
        sceneCount: 1,
        hasDashboard: true,
        hasChapterSummary: false,
        hasQualityReport: false,
        hasWritingRecap: false,
        acceptedLedgerCount: 0
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const qualityReport = {
      chapterId: "chapter-001",
      overallScore: 82,
      summary: "Readable pressure.",
      metrics: [{ key: "conflict" as const, label: "Conflict", score: 82, note: "Clear enough." }],
      strengths: ["Clear pressure"],
      fixes: ["Sharpen the hook"],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const seriesMetrics = {
      projectSlug: "demo",
      chapterCount: 2,
      reportCount: 1,
      averageOverallScore: 82,
      metricAverages: [{ key: "conflict" as const, label: "Conflict", averageScore: 82, reportCount: 1 }],
      weakestChapters: [
        {
          chapterId: "chapter-001",
          chapterTitle: "Chapter 1",
          overallScore: 82,
          weakestMetricKey: "conflict" as const,
          weakestMetricLabel: "Conflict",
          weakestMetricScore: 82,
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const graph = {
      projectSlug: "demo",
      nodes: [{ id: "chapter:chapter-001", type: "chapter", label: "Chapter 1" }],
      edges: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const knowledgeIndex = {
      projectSlug: "demo",
      facts: [{ id: "fact:gate", text: "The gate opens.", chapterIds: ["chapter-001"], relatedEntities: ["Hero"], keywords: ["gate"], source: { type: "chapter-summary" as const, id: "fact-1" }, updatedAt: "2026-06-11T00:00:00.000Z" }],
      triples: [],
      chapterIndex: {
        projectSlug: "demo",
        chapters: [{ chapterId: "chapter-001", title: "Chapter 1", keywords: ["gate"], factIds: ["fact:gate"], tripleIds: [], entityNames: ["Hero"], updatedAt: "2026-06-11T00:00:00.000Z" }],
        keywords: { gate: ["chapter-001"] },
        updatedAt: "2026-06-11T00:00:00.000Z"
      },
      vectorSummary: {
        provider: "local" as const,
        dimensions: 64,
        entryCount: 1,
        updatedAt: "2026-06-11T00:00:00.000Z"
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const knowledgeSearch = {
      query: "Hero gate",
      tokens: ["hero", "gate"],
      facts: [{ ...knowledgeIndex.facts[0], score: 2 }],
      triples: [],
      chapters: [{ ...knowledgeIndex.chapterIndex.chapters[0], score: 2 }]
    };
    const entries = [
      {
        id: "risk-1",
        kind: "risk",
        title: "Information boundary",
        status: "open",
        severity: "medium",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero"],
        note: "Avoid omniscient labels.",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ];
    const auditReport = {
      projectSlug: "demo",
      projectTitle: "Demo",
      generatedAt: "2026-06-11T00:00:00.000Z",
      chapters: [{ id: "chapter-001", title: "Chapter 1", status: "drafting", contentPath: "content/chapter-001.md" }],
      quality: seriesMetrics,
      taskSummary: {
        total: 1,
        byStatus: { pending: 0, running: 0, success: 1, error: 0, cancelled: 0 },
        byType: { "chapter.draft": 1 },
        latestTasks: []
      },
      aiInvocationSummary: {
        total: 1,
        byDecision: { pending: 0, accepted: 1, rejected: 0, "not-required": 0 },
        proposedPatchCount: 1,
        acceptedPatchCount: 1,
        promptVersions: {},
        preCallWarnings: {},
        contextTierTotals: {},
        truncatedContextBlocks: []
      },
      knowledgeSummary: {
        factCount: 1,
        tripleCount: 0,
        indexedChapterCount: 1,
        keywordCount: 1,
        vectorSummary: knowledgeIndex.vectorSummary
      },
      runtimeSummary: {
        chapterCount: 1,
        byActiveStep: { structure: 0, draft: 0, review: 1, recap: 0, ledger: 0, next: 0, none: 0 },
        blockedStepCount: 0,
        snapshots: [
          {
            chapterId: "chapter-001",
            chapterTitle: "Chapter 1",
            activeStepId: "review",
            fingerprint: "abcdef1234567890",
            signals: runtimeSnapshot.signals,
            steps: [{ id: "review", status: "active", metric: "待体检" }],
            updatedAt: "2026-06-11T00:00:00.000Z"
          }
        ]
      },
      backgroundJobSummary: {
        total: 1,
        byStatus: { pending: 0, running: 0, success: 1, error: 0, cancelled: 0 },
        latestJobs: [
          {
            id: "job-1",
            type: "knowledge.index.rebuild",
            status: "success",
            inputSummary: "{}",
            outputSummary: "1 facts / 0 relations",
            startedAt: "2026-06-11T00:00:00.000Z",
            finishedAt: "2026-06-11T00:00:01.000Z",
            durationMs: 1000,
            updatedAt: "2026-06-11T00:00:01.000Z"
          }
        ]
      },
      aiInvocations: []
    };
    mockJson({ dashboard });
    mockJson({ snapshot: runtimeSnapshot });
    mockJson({ dashboard });
    mockJson({ scenes });
    mockJson({ scenes });
    mockJson({ storyControl });
    mockJson({ storyControl });
    mockJson({ graph });
    mockJson({ index: knowledgeIndex });
    mockJson({ index: knowledgeIndex });
    mockJson({ result: knowledgeSearch });
    mockJson({ report: qualityReport });
    mockJson({ seriesMetrics });
    mockJson({ report: qualityReport, seriesMetrics });
    mockJson({ entries });
    mockJson({ entries });
    mockJson({ report: auditReport });

    await expect(novelApi.readChapterDashboard("demo", "chapter-001")).resolves.toEqual(dashboard);
    await expect(novelApi.readCreationRuntimeSnapshot("demo", "chapter-001")).resolves.toEqual(runtimeSnapshot);
    await expect(novelApi.saveChapterDashboard("demo", dashboard)).resolves.toEqual(dashboard);
    await expect(novelApi.readSceneCards("demo", "chapter-001")).resolves.toEqual(scenes);
    await expect(novelApi.saveSceneCards("demo", "chapter-001", scenes)).resolves.toEqual(scenes);
    await expect(novelApi.readStoryControl("demo")).resolves.toEqual(storyControl);
    await expect(novelApi.saveStoryControl("demo", storyControl)).resolves.toEqual(storyControl);
    await expect(novelApi.readStoryGraph("demo")).resolves.toEqual(graph);
    await expect(novelApi.readKnowledgeIndex("demo")).resolves.toEqual(knowledgeIndex);
    await expect(novelApi.rebuildKnowledgeIndex("demo")).resolves.toEqual(knowledgeIndex);
    await expect(novelApi.searchKnowledgeIndex("demo", { query: "Hero gate", chapterId: "chapter-001" })).resolves.toEqual(
      knowledgeSearch
    );
    await expect(novelApi.readChapterQualityReport("demo", "chapter-001")).resolves.toEqual(qualityReport);
    await expect(novelApi.readSeriesQualityMetrics("demo")).resolves.toEqual(seriesMetrics);
    await expect(novelApi.saveChapterQualityReport("demo", qualityReport)).resolves.toEqual({ report: qualityReport, seriesMetrics });
    await expect(novelApi.readLedgerEntries("demo", "risk")).resolves.toEqual(entries);
    await expect(novelApi.saveLedgerEntries("demo", "risk", entries)).resolves.toEqual(entries);
    await expect(novelApi.readProjectAuditReport("demo")).resolves.toEqual(auditReport);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/dashboard/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/runtime/chapter-001",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/projects/demo/dashboard/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ dashboard }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/novel/projects/demo/scenes/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/novel/projects/demo/scenes/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ scenes }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(6, "/api/novel/projects/demo/story-control", {});
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/novel/projects/demo/story-control",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ storyControl }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(8, "/api/novel/projects/demo/story-graph", {});
    expect(fetch).toHaveBeenNthCalledWith(9, "/api/novel/projects/demo/knowledge/index", {});
    expect(fetch).toHaveBeenNthCalledWith(10, "/api/novel/projects/demo/knowledge/index/rebuild", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(
      11,
      "/api/novel/projects/demo/knowledge/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "Hero gate", chapterId: "chapter-001" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(12, "/api/novel/projects/demo/quality/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      13,
      "/api/novel/projects/demo/quality/series-metrics",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      14,
      "/api/novel/projects/demo/quality/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ report: qualityReport }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(15, "/api/novel/projects/demo/ledger/risk", {});
    expect(fetch).toHaveBeenNthCalledWith(
      16,
      "/api/novel/projects/demo/ledger/risk",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ entries }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(17, "/api/novel/projects/demo/audit-report", {});
  });

  it("reads, saves, and accepts chapter memory recap patches", async () => {
    const summary = {
      chapterId: "chapter-001",
      summary: "A cost was paid for the clue.",
      keyEvents: ["The gate answered blood."],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-10T00:00:00.000Z"
    };
    const recap = {
      chapterId: "chapter-001",
      summary: "A cost was paid for the clue.",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-10T00:00:00.000Z",
      summaryPatch: { summary: "A cost was paid for the clue." }
    };
    mockJson({ summary });
    mockJson({ summary });
    mockJson({ summary });

    await expect(novelApi.readChapterSummary("demo", "chapter-001")).resolves.toEqual(summary);
    await expect(novelApi.saveChapterSummary("demo", "chapter-001", summary)).resolves.toEqual(summary);
    await expect(novelApi.acceptWritingRecap("demo", recap)).resolves.toEqual({ summary });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/memory/chapter-summaries/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/memory/chapter-summaries/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ summary }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/projects/demo/recaps/accept",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ recap }) })
    );
  });

  it("runs Codex tasks and selection polish requests", async () => {
    mockJson({ task: { id: "task-1", type: "idea.suggest", status: "success" } });
    mockJson({ task: { id: "task-2", type: "selection.polish", status: "success" } });

    await expect(novelApi.runTask("demo", "idea.suggest", { chapterId: "chapter-001" })).resolves.toMatchObject({
      id: "task-1"
    });
    await expect(
      novelApi.polishSelection("demo", {
        chapterId: "chapter-001",
        filePath: "chapters/chapter-001.md",
        selectedText: "plain line",
        beforeText: "",
        afterText: "",
        start: 0,
        end: 10,
        mode: "polish"
      })
    ).resolves.toMatchObject({ id: "task-2" });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/novel/projects/demo/tasks",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/selection/polish",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("starts, lists, reads, and cancels async Codex tasks", async () => {
    mockJson({ task: { id: "task-async", type: "idea.suggest", status: "running" } });
    mockJson({ tasks: [{ id: "task-async", type: "idea.suggest", status: "running" }] });
    mockJson({ task: { id: "task-async", type: "idea.suggest", status: "success" } });
    mockJson({ task: { id: "task-async", type: "idea.suggest", status: "cancelled" } });

    await expect(novelApi.startTask("demo", "idea.suggest", { chapterId: "chapter-001" })).resolves.toMatchObject({
      id: "task-async",
      status: "running"
    });
    await expect(novelApi.listTasks("demo")).resolves.toHaveLength(1);
    await expect(novelApi.readTask("demo", "task-async")).resolves.toMatchObject({ status: "success" });
    await expect(novelApi.cancelTask("demo", "task-async")).resolves.toMatchObject({ status: "cancelled" });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/novel/projects/demo/tasks/async",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/tasks", {});
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/tasks/task-async", {});
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/novel/projects/demo/tasks/task-async/cancel",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reads AI invocation audit sessions", async () => {
    mockJson({
      invocations: [
        {
          id: "invocation-1",
          taskId: "task-1",
          taskType: "idea.suggest",
          stageKey: "pipeline.idea.suggest",
          status: "success",
          promptSnapshot: { length: 100, preview: "prompt", contextTitles: [] },
          contextSnapshot: { blockCount: 0, totalChars: 0, blocks: [] },
          attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z" },
          adoptionDecision: "not-required",
          proposedPatchTargets: [],
          acceptedPatchTargets: [],
          commitResult: { historyAppended: true, invocationAppended: true },
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ]
    });

    await expect(novelApi.readAiInvocations("demo")).resolves.toEqual([
      expect.objectContaining({ id: "invocation-1", taskId: "task-1" })
    ]);

    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/tasks/invocations", {});
  });

  it("starts and reads project background jobs", async () => {
    const job = {
      id: "job-1",
      projectId: "demo",
      type: "knowledge.index.rebuild",
      status: "success",
      inputSummary: "{}",
      outputSummary: "1 facts / 0 relations",
      resultRef: "/api/novel/projects/demo/knowledge/index",
      startedAt: "2026-06-11T00:00:00.000Z",
      finishedAt: "2026-06-11T00:00:01.000Z",
      updatedAt: "2026-06-11T00:00:01.000Z"
    };
    mockJson({ job });
    mockJson({ job });
    mockJson({ jobs: [job] });
    mockJson({ job: { ...job, status: "cancelled", cancelRequestedAt: "2026-06-11T00:00:02.000Z" } });
    mockJson({ job: { ...job, id: "job-2", status: "pending", retryOf: "job-1" } });

    await expect(novelApi.startBackgroundJob("demo", "knowledge.index.rebuild", { reason: "manual" })).resolves.toEqual(job);
    await expect(novelApi.readBackgroundJob("demo", "job-1")).resolves.toEqual(job);
    await expect(novelApi.listBackgroundJobs("demo")).resolves.toEqual([job]);
    await expect(novelApi.cancelBackgroundJob("demo", "job-1")).resolves.toMatchObject({ status: "cancelled" });
    await expect(novelApi.retryBackgroundJob("demo", "job-1")).resolves.toMatchObject({ id: "job-2", retryOf: "job-1" });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/novel/projects/demo/jobs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "knowledge.index.rebuild", payload: { reason: "manual" } })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/jobs/job-1", {});
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/jobs", {});
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/novel/projects/demo/jobs/job-1/cancel", { method: "POST" });
    expect(fetch).toHaveBeenNthCalledWith(5, "/api/novel/projects/demo/jobs/job-1/retry", { method: "POST" });
  });

  it("applies file patches after user confirmation", async () => {
    mockJson({ applied: 1 });

    await novelApi.applyPatches("demo", [
      {
        target: "chapters/chapter-001.md",
        mode: "replace-file",
        content: "accepted draft"
      }
    ], "task-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/patches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          patches: [
            {
              target: "chapters/chapter-001.md",
              mode: "replace-file",
              content: "accepted draft"
            }
          ],
          taskId: "task-1"
        })
      })
    );
  });

  it("merges a runtime derivative branch with review metadata", async () => {
    mockJson({
      merged: true,
      chapterId: "derivative-branch-1",
      branch: { id: "branch-1", status: "merged" },
      run: { id: "run-1", status: "completed" }
    });

    await expect(
      novelApi.mergeRuntimeDerivative("demo", "branch-1", {
        note: "Accepted after review.",
        mode: "new_chapter"
      })
    ).resolves.toMatchObject({ merged: true, chapterId: "derivative-branch-1" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/runtime/derivatives/branch-1/merge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ note: "Accepted after review.", mode: "new_chapter" })
      })
    );
  });

  it("creates and reads memory retrieval previews", async () => {
    const preview = { schemaVersion: "memory-retrieval-preview.v1", retrievalId: "retrieval-abcdef0123456789abcdef01", projectSlug: "demo", query: "gate", boundary: { query: "gate", audience: "author", authorized: true }, eligibleFactIds: [], excluded: [], selectedIds: [], truncatedIds: [], evidenceSourceIds: [], evidenceSourceCount: 0, budget: { maxResults: 5 }, sourceResultFingerprint: "a".repeat(64), resultFingerprint: "b".repeat(64) };
    mockJson({ preview });
    mockJson({ preview });

    await expect(novelApi.createMemoryRetrievalPreview("demo", { query: "gate", maxResults: 5 })).resolves.toEqual(preview);
    await expect(novelApi.readMemoryRetrievalPreview("demo", preview.retrievalId)).resolves.toEqual(preview);
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/memory/retrieval-previews", expect.objectContaining({ method: "POST", body: JSON.stringify({ query: "gate", maxResults: 5 }) }));
    expect(fetch).toHaveBeenNthCalledWith(2, `/api/novel/projects/demo/memory/retrievals/${preview.retrievalId}`, {});
  });

  it("creates memory governance evidence through the authoritative endpoints", async () => {
    const health = { schemaVersion: "memory-health-report.v1", reportId: "memory-health-aaaaaaaaaaaaaaaaaaaaaaaa", status: "degraded" };
    const proof = { schemaVersion: "memory-ready-proof.v1", proofId: "memory-ready-bbbbbbbbbbbbbbbbbbbbbbbb", status: "blocked", blockers: ["MEMORY_HEALTH_DEGRADED"] };
    const audit = { schemaVersion: "long-continuity-audit.v1", auditId: "continuity-audit-cccccccccccccccccccccccc", status: "blocked", issues: ["SETTLED_CHAPTER_COVERAGE_INCOMPLETE"] };
    mockJson({ report: health });
    mockJson({ proof });
    mockJson({ audit });

    await expect(novelApi.createMemoryHealthReport("demo")).resolves.toEqual(health);
    await expect(novelApi.createMemoryReadyProof("demo", { healthReportId: health.reportId, retrievalId: "retrieval-dddddddddddddddddddddddd", targetChapterId: "chapter-1" })).resolves.toEqual(proof);
    await expect(novelApi.createMemoryContinuityAudit("demo", { healthReportId: health.reportId })).resolves.toEqual(audit);
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/memory/health-reports", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/novel/projects/demo/memory/ready-proofs", expect.objectContaining({ method: "POST", body: JSON.stringify({ healthReportId: health.reportId, retrievalId: "retrieval-dddddddddddddddddddddddd", targetChapterId: "chapter-1" }) }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/memory/continuity-audits", expect.objectContaining({ method: "POST", body: JSON.stringify({ healthReportId: health.reportId }) }));
  });

  it("reads persisted memory governance evidence by project-scoped IDs", async () => {
    const health = { reportId: "memory-health-aaaaaaaaaaaaaaaaaaaaaaaa", status: "healthy" };
    const proof = { proofId: "memory-ready-bbbbbbbbbbbbbbbbbbbbbbbb", status: "ready" };
    const audit = { auditId: "continuity-audit-cccccccccccccccccccccccc", status: "audited-consistent" };
    mockJson({ report: health });
    mockJson({ proof });
    mockJson({ audit });

    await expect(novelApi.readMemoryHealthReport("demo", health.reportId)).resolves.toEqual(health);
    await expect(novelApi.readMemoryReadyProof("demo", proof.proofId)).resolves.toEqual(proof);
    await expect(novelApi.readMemoryContinuityAudit("demo", audit.auditId)).resolves.toEqual(audit);
    expect(fetch).toHaveBeenNthCalledWith(1, `/api/novel/projects/demo/memory/health-reports/${health.reportId}`, {});
    expect(fetch).toHaveBeenNthCalledWith(2, `/api/novel/projects/demo/memory/ready-proofs/${proof.proofId}`, {});
    expect(fetch).toHaveBeenNthCalledWith(3, `/api/novel/projects/demo/memory/continuity-audits/${audit.auditId}`, {});
  });

  it("throws the API error message when a request fails", async () => {
    mockJson({ error: "Unsafe file path" }, false, 400);

    await expect(novelApi.readFile("demo", "../secret.md")).rejects.toThrow("Unsafe file path");
  });
});
