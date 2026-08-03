import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { readKnowledgeIndex, rebuildKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { saveChapterSummary, saveLedgerEntries, saveStoryControl } from "./writingCockpit.js";
import { defaultPlatformAiConfig, writePlatformAiConfig } from "./platformAiConfig.js";
import { createMemoryClaim, persistMemoryClaim, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";
import { createCharacterKnowledgeState, createReaderKnowledgeState, persistCharacterKnowledgeState, persistReaderKnowledgeState } from "./memoryKnowledge.js";
import { createStoryTimeEvent } from "./storyTime.js";

let tempRoot = "";

describe("knowledgeIndex", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-index-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DB_PATH;
    delete process.env.KNOWLEDGE_EMBEDDING_PROVIDER;
    delete process.env.KNOWLEDGE_EMBEDDING_API_KEY;
    delete process.env.KNOWLEDGE_EMBEDDING_BASE_URL;
    delete process.env.KNOWLEDGE_EMBEDDING_MODEL;
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("rebuilds persisted facts, triples, and chapter index from project memory", async () => {
    const project = createProjectSkeleton({ title: "Knowledge Demo", roughIdea: "Build a searchable memory layer." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The sealed gate responds to blood.",
      keyEvents: ["The talisman burns before the gate opens."],
      newFacts: [
        {
          id: "fact-gate-blood",
          chapterId: "chapter-001",
          fact: "The gate responds to blood.",
          relatedEntities: ["Hero", "sealed gate"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      characterStateChanges: [
        {
          id: "hero-wounded",
          chapterId: "chapter-001",
          characterName: "Hero",
          after: "Wounded but aware the gate is alive.",
          cause: "Paid blood to test the clue.",
          relatedEntities: ["sealed gate"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: ["chapter-001:2026-06-11T00:00:00.000Z"],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await saveLedgerEntries(root, "foreshadowing", [
      {
        id: "blood-mark",
        kind: "foreshadowing",
        title: "Blood mark",
        status: "open",
        severity: "medium",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero"],
        note: "Pay off the mark in a later gate scene.",
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    ]);
    await saveStoryControl(root, {
      version: 1,
      premise: "Blood opens sealed gates.",
      arcs: [],
      characters: [
        {
          id: "hero",
          name: "Hero",
          role: "protagonist",
          goal: "Survive the gate.",
          currentState: "Testing dangerous clues.",
          knownSecrets: "",
          relationshipNotes: "",
          powerLevel: "",
          status: "active",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      events: [
        {
          id: "gate-opens",
          type: "reveal",
          title: "Gate opens",
          trigger: "Blood touches stone.",
          participants: ["Hero"],
          location: "Gate",
          conflict: "Act or hide.",
          reward: "A clue.",
          cost: "Exposure.",
          foreshadowing: "Blood mark.",
          chapterRange: "1",
          status: "planned",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      orchestrationNotes: "",
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    const projection = await rebuildKnowledgeIndex(root, project);
    const persisted = await readKnowledgeIndex(root, project);

    expect(projection.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fact:fact-gate-blood", source: expect.objectContaining({ type: "chapter-summary" }) }),
      expect.objectContaining({ id: "ledger:foreshadowing:blood-mark", source: expect.objectContaining({ type: "ledger" }) }),
      expect.objectContaining({ id: "story-character:hero", source: expect.objectContaining({ type: "story-control" }) })
    ]));
    expect(projection.triples).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: "Hero", predicate: "state_after" }),
      expect.objectContaining({ subject: "Hero", predicate: "tracks_foreshadowing" }),
      expect.objectContaining({ subject: "Hero", predicate: "participates_in", object: "Gate opens" })
    ]));
    expect(projection.chapterIndex.chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chapterId: "chapter-001",
        factIds: expect.arrayContaining(["fact:fact-gate-blood", "ledger:foreshadowing:blood-mark"]),
        entityNames: expect.arrayContaining(["Hero"])
      })
    ]));
    expect(projection.chapterIndex.keywords.blood).toContain("chapter-001");
    expect(projection.vectorSummary).toMatchObject({ provider: "local", dimensions: 64 });
    expect(projection.vectorSummary?.entryCount).toBeGreaterThan(0);
    expect(persisted.facts).toHaveLength(projection.facts.length);
    expect(persisted.triples).toHaveLength(projection.triples.length);
    expect(persisted.vectorSummary).toMatchObject({ provider: "local", dimensions: 64 });
    expect(persisted.vectorSummary?.entryCount).toBe(projection.vectorSummary?.entryCount);
    await expect(fs.readFile(path.join(root, "knowledge", "facts.jsonl"), "utf8")).resolves.toContain("fact-gate-blood");
    await expect(fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")).resolves.toContain('"dimensions": 64');
    await expect(fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")).resolves.toContain('"provider": "local"');
    await expect(fs.readFile(path.join(root, "memory", "chapter-index.json"), "utf8")).resolves.toContain("chapter-001");
  });

  it("projects only eligible MemoryClaims into the searchable index", async () => {
    const project = createProjectSkeleton({ title: "Memory Authority Demo", roughIdea: "Claims must settle before search." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const candidate = createMemoryClaim({ claimId: "claim-candidate", proposition: "Candidate plan is not canon", epistemicType: "plan", sourceRefs: ["outline://candidate"], evidenceAnchors: ["outline#1"], producedBy: "author", temporalScope: { asOfVersion: "outline:v1" }, confidence: 0.8 });
    const fact = createMemoryClaim({ claimId: "claim-eligible", proposition: "The gate requires blood", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#span-1"], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.9 });
    const settled = settleMemoryClaim({ claim: fact, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    await persistMemoryClaim(root, candidate, "created", "candidate");
    await persistMemoryClaim(root, fact, "created", "candidate");
    await persistMemoryClaim(root, settled, "settled", "settled");
    const projection = await rebuildKnowledgeIndex(root, project);
    expect(projection.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "memory-claim:claim-eligible", source: expect.objectContaining({ type: "memory-claim" }) })]));
    expect(projection.facts.some((entry) => entry.id === "memory-claim:claim-candidate")).toBe(false);
  });

  it("blocks retrieval when the persisted vector index predates the source projection", async () => {
    const project = createProjectSkeleton({ title: "Stale Vector Demo", roughIdea: "Stale vectors must not hide new facts." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The gate responds to blood.",
      keyEvents: [],
      newFacts: [{ id: "fact-stale-vector", chapterId: "chapter-001", fact: "The gate responds to blood.", relatedEntities: ["gate"], status: "accepted", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" }],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await rebuildKnowledgeIndex(root, project);
    const vectorPath = path.join(root, "knowledge", "vectors.json");
    const vectors = JSON.parse(await fs.readFile(vectorPath, "utf8")) as Record<string, unknown>;
    vectors.updatedAt = "2000-01-01T00:00:00.000Z";
    await fs.writeFile(vectorPath, JSON.stringify(vectors), "utf8");

    await expect(searchKnowledgeIndex(root, project, { query: "gate blood" })).rejects.toThrow("KNOWLEDGE_VECTOR_INDEX_STALE");
  });

  it("removes a retconned claim from the canon projection until its replacement settles", async () => {
    const project = createProjectSkeleton({ title: "Retcon Projection Demo", roughIdea: "Stale claims must not leak." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const settled = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "claim-retcon-index", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const retcon = retconMemoryClaim({ claim: settled, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(root, settled, "settled", "original");
    await persistMemoryClaim(root, retcon.obsolete, "obsoleted", "retcon");
    await persistMemoryClaim(root, retcon.replacement, "created", "replacement");
    const projection = await rebuildKnowledgeIndex(root, project);
    expect(projection.facts.some((entry) => entry.id === "memory-claim:claim-retcon-index")).toBe(false);
  });

  it("filters memory claims by target story time before relevance ranking", async () => {
    const project = createProjectSkeleton({ title: "Eligibility Search Demo", roughIdea: "Time eligibility precedes similarity." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-time-search", proposition: "The bridge is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { startEvent: "bridge-open", asOfVersion: "v1" }, confidence: 0.9 });
    const settled = settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    await persistMemoryClaim(root, claim, "created", "candidate");
    await persistMemoryClaim(root, settled, "settled", "settled");
    await rebuildKnowledgeIndex(root, project);
    await createStoryTimeEvent({ root, projectSlug: project.slug, eventId: "before-bridge", label: "before bridge", timelineId: "main", start: "001", end: "001", duration: "1 beat", uncertainty: "exact", parallelLine: "main", sourceRefs: ["chapter://1#before"] });
    await createStoryTimeEvent({ root, projectSlug: project.slug, eventId: "bridge-open", label: "bridge open", timelineId: "main", start: "002", end: "002", duration: "1 beat", uncertainty: "exact", parallelLine: "main", sourceRefs: ["chapter://1#bridge"] });
    const result = await searchKnowledgeIndex(root, project, { query: "bridge open", targetEvent: "before-bridge", eventOrder: { "before-bridge": 1, "bridge-open": 2 } });
    expect(result.facts.some((fact) => fact.id === "memory-claim:claim-time-search")).toBe(false);
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ id: "memory-claim:claim-time-search", reason: "BEFORE_START_EVENT" })]));
  });

  it("ignores forged event ordering when no persisted story-time event exists", async () => {
    const project = createProjectSkeleton({ title: "Authoritative Time Search", roughIdea: "Caller ordering cannot grant eligibility." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-forged-time-search", proposition: "The bridge is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { startEvent: "bridge-open", asOfVersion: "v1" }, confidence: 0.9 });
    await persistMemoryClaim(root, settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" }), "settled", "settled");
    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "bridge open", task: "chapter-context", targetEvent: "before-bridge", eventOrder: { "before-bridge": 1, "bridge-open": 2 } });
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ id: "memory-claim:claim-forged-time-search", reason: "TARGET_EVENT_UNORDERED" })]));
    expect(result.retrievalAudit?.boundary.task).toBe("chapter-context");
  });

  it("requires reader or character knowledge evidence before cross-POV retrieval", async () => {
    const project = createProjectSkeleton({ title: "POV Eligibility Demo", roughIdea: "Secrets stay scoped." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-secret-search", proposition: "The vault contains the crown", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#secret"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.95 });
    const settled = settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    await persistMemoryClaim(root, claim, "created", "candidate");
    await persistMemoryClaim(root, settled, "settled", "settled");
    await rebuildKnowledgeIndex(root, project);
    const hiddenForReader = await searchKnowledgeIndex(root, project, { query: "vault crown", audience: "reader", readerScope: "default", publicationVersion: "pub-1", readerProgressCursor: "chapter-1" });
    expect(hiddenForReader.facts.some((fact) => fact.id === "memory-claim:claim-secret-search")).toBe(false);
    expect(hiddenForReader.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "READER_KNOWLEDGE_REQUIRED" })]));
    await persistReaderKnowledgeState(root, createReaderKnowledgeState({ readerScope: "default", claimId: "claim-secret-search", state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-1", evidenceRefs: ["pub-1#chapter-1"] }));
    const visibleForReader = await searchKnowledgeIndex(root, project, { query: "vault crown", audience: "reader", readerScope: "default", publicationVersion: "pub-1", readerProgressCursor: "chapter-1" });
    expect(visibleForReader.facts.some((fact) => fact.id === "memory-claim:claim-secret-search")).toBe(true);
  });

  it("does not let a character query forge story-time ordering", async () => {
    const project = createProjectSkeleton({ title: "Character Time Authority", roughIdea: "Knowledge acquisition follows persisted time." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-character-time", proposition: "The scout knows the gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 });
    await persistMemoryClaim(root, settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author", reason: "settled" }), "settled", "settled");
    await persistCharacterKnowledgeState(root, createCharacterKnowledgeState({ characterId: "scout", claimId: claim.claimId, state: "learned", asOfEvent: "learned-event", evidenceRefs: ["chapter://1#learned"] }));
    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "scout gate open", audience: "character", characterId: "scout", targetEvent: "target-event", eventOrder: { "learned-event": 1, "target-event": 2 } });
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ id: "memory-claim:claim-character-time", reason: "TARGET_EVENT_UNORDERED" })]));
  });

  it("does not expose author truth to a reader even when it is highly relevant", async () => {
    const project = createProjectSkeleton({ title: "Author Truth Visibility", roughIdea: "Private truth stays private." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-author-truth", proposition: "The narrator is the hidden heir", epistemicType: "author_truth", sourceRefs: ["chapter://1"], evidenceAnchors: ["author-notes#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 1 });
    const settled = settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    await persistMemoryClaim(root, claim, "created", "candidate");
    await persistMemoryClaim(root, settled, "settled", "settled");
    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "hidden heir", audience: "reader", readerScope: "default", publicationVersion: "pub-1", readerProgressCursor: "chapter-9" });
    expect(result.facts.some((fact) => fact.id === "memory-claim:claim-author-truth")).toBe(false);
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "AUTHOR_ONLY_MEMORY" })]));
  });

  it("does not let a retrieval caller downgrade author truth visibility", async () => {
    const project = createProjectSkeleton({ title: "Author Truth Override", roughIdea: "Caller visibility cannot rewrite memory authority." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const claim = createMemoryClaim({ claimId: "claim-author-truth-override", proposition: "The narrator is the hidden heir", epistemicType: "author_truth", sourceRefs: ["chapter://1"], evidenceAnchors: ["author-notes#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 1 });
    await persistMemoryClaim(root, settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" }), "settled", "settled");
    await persistReaderKnowledgeState(root, createReaderKnowledgeState({ readerScope: "default", claimId: claim.claimId, state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-9", evidenceRefs: ["pub-1#chapter-9"] }));
    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "hidden heir", audience: "reader", visibility: "public", readerScope: "default", publicationVersion: "pub-1", readerProgressCursor: "chapter-9" });
    expect(result.facts.some((fact) => fact.id === "memory-claim:claim-author-truth-override")).toBe(false);
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "AUTHOR_ONLY_MEMORY" })]));
  });

  it("does not expose legacy summary facts to a model task without an explicit public visibility", async () => {
    const project = createProjectSkeleton({ title: "Model Task Visibility", roughIdea: "Legacy projections require an explicit visibility envelope." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The private ledger reveals the hidden gate.",
      keyEvents: [],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "private ledger hidden gate", audience: "model-task" });
    expect(result.facts.some((fact) => fact.source.type === "chapter-summary")).toBe(false);
    expect(result.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "MODEL_TASK_SOURCE_VISIBILITY_REQUIRED" })]));
  });

  it("uses an openai-compatible embedding provider when configured", async () => {
    process.env.KNOWLEDGE_EMBEDDING_PROVIDER = "openai-compatible";
    process.env.KNOWLEDGE_EMBEDDING_API_KEY = "test-key";
    process.env.KNOWLEDGE_EMBEDDING_BASE_URL = "https://embeddings.example/v1";
    process.env.KNOWLEDGE_EMBEDDING_MODEL = "embedding-test";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { input: string[] };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: body.input.map((_, index) => ({ embedding: [index + 1, 1, 0] }))
        })
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const project = createProjectSkeleton({ title: "External Embedding Demo", roughIdea: "Use configured semantic recall." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The archive remembers every opened gate.",
      keyEvents: [],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    const projection = await rebuildKnowledgeIndex(root, project);
    const vectors = JSON.parse(await fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")) as {
      provider: string;
      model?: string;
      dimensions: number;
      entries: Array<{ vector: number[] }>;
    };
    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(requestInit?.body || "{}")) as { model: string; input: string[] };

    expect(projection.vectorSummary).toMatchObject({ provider: "openai-compatible", model: "embedding-test", dimensions: 3 });
    expect(projection.vectorSummary?.entryCount).toBe(vectors.entries.length);
    expect(vectors).toMatchObject({ provider: "openai-compatible", model: "embedding-test", dimensions: 3 });
    expect(vectors.entries.every((entry) => entry.vector.length === 3)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://embeddings.example/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
    expect(requestBody.model).toBe("embedding-test");
    expect(requestBody.input.length).toBe(vectors.entries.length);
  });

  it("uses saved embedding config before environment variables", async () => {
    process.env.KNOWLEDGE_EMBEDDING_PROVIDER = "openai-compatible";
    process.env.KNOWLEDGE_EMBEDDING_API_KEY = "env-key";
    process.env.KNOWLEDGE_EMBEDDING_BASE_URL = "https://env-embeddings.example/v1";
    process.env.KNOWLEDGE_EMBEDDING_MODEL = "env-model";
    await writePlatformAiConfig({
      ...defaultPlatformAiConfig(),
      knowledgeEmbedding: {
        provider: "openai-compatible",
        baseUrl: "https://saved-embeddings.example/v1",
        model: "saved-model",
        apiKey: "saved-key"
      }
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { input: string[] };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: body.input.map((_, index) => ({ embedding: [index + 1, 1, 0, 0] }))
        })
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const project = createProjectSkeleton({ title: "Saved Embedding Demo", roughIdea: "Use saved semantic recall." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The saved provider indexes the archive.",
      keyEvents: [],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    const projection = await rebuildKnowledgeIndex(root, project);
    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(requestInit?.body || "{}")) as { model: string; input: string[] };

    expect(projection.vectorSummary).toMatchObject({ provider: "openai-compatible", model: "saved-model", dimensions: 4 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://saved-embeddings.example/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer saved-key" })
      })
    );
    expect(requestBody.model).toBe("saved-model");
  });

  it("records external embedding fallback details when the provider fails", async () => {
    process.env.KNOWLEDGE_EMBEDDING_PROVIDER = "openai-compatible";
    process.env.KNOWLEDGE_EMBEDDING_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const project = createProjectSkeleton({ title: "Embedding Fallback Demo", roughIdea: "Fallback to local vectors." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The local index remains usable after provider errors.",
      keyEvents: [],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    const projection = await rebuildKnowledgeIndex(root, project);
    const persisted = await readKnowledgeIndex(root, project);
    const vectors = JSON.parse(await fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")) as {
      provider: string;
      fallbackFrom?: string;
      fallbackReason?: string;
      entries: Array<{ vector: number[] }>;
    };

    expect(fetchMock).toHaveBeenCalled();
    expect(vectors).toMatchObject({
      provider: "local",
      fallbackFrom: "openai-compatible",
      fallbackReason: "Embedding provider failed with 503"
    });
    expect(projection.vectorSummary).toMatchObject({
      provider: "local",
      fallbackFrom: "openai-compatible",
      fallbackReason: "Embedding provider failed with 503"
    });
    expect(persisted.vectorSummary).toMatchObject(projection.vectorSummary);
    expect(vectors.entries.length).toBeGreaterThan(0);
  });

  it("audits query embedding fallback without changing the eligible fact set", async () => {
    process.env.KNOWLEDGE_EMBEDDING_PROVIDER = "openai-compatible";
    process.env.KNOWLEDGE_EMBEDDING_API_KEY = "test-key";
    await writePlatformAiConfig({
      ...defaultPlatformAiConfig(),
      knowledgeEmbedding: {
        provider: "openai-compatible",
        baseUrl: "https://embeddings.example/v1",
        model: "embedding-test",
        apiKey: "test-key"
      }
    });
    const externalVector = Array.from({ length: 64 }, (_, index) => (index === 0 ? 1 : 0));
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as { input?: string[] };
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: (body.input || []).map(() => ({ embedding: externalVector })) })
        } as Response;
      })
      .mockRejectedValueOnce(new Error("query embedding unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const project = createProjectSkeleton({ title: "Query Fallback Audit", roughIdea: "Keep eligibility stable during embedding fallback." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The eligible gate fact remains searchable.",
      keyEvents: [],
      newFacts: [{
        id: "fact-eligible-gate",
        chapterId: "chapter-001",
        fact: "The eligible gate remains open.",
        relatedEntities: ["gate"],
        status: "accepted",
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z"
      }],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });

    await rebuildKnowledgeIndex(root, project);
    const result = await searchKnowledgeIndex(root, project, { query: "eligible gate", limit: 5 });

    expect(result.queryEmbeddingFallback).toEqual({
      from: "openai-compatible",
      to: "local",
      reason: "query embedding unavailable"
    });
    expect(result.facts.map((fact) => fact.id)).toContain("fact:fact-eligible-gate");
    expect(result.excluded).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fact:fact-eligible-gate" })
    ]));
  });

  it("keeps eligibility and exclusions identical when the embedding provider changes", async () => {
    const project = createProjectSkeleton({ title: "Provider Invariance", roughIdea: "Eligibility is not a vector truth." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The canon gate remains open.",
      keyEvents: [],
      newFacts: [{ id: "fact-canon-gate", chapterId: "chapter-001", fact: "The canon gate remains open.", relatedEntities: ["gate"], status: "accepted", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" }],
      characterStateChanges: [], foreshadowingUpdates: [], continuityRisks: [], powerProgressionUpdates: [], acceptedRecapIds: [], updatedAt: "2026-06-11T00:00:00.000Z"
    });

    await rebuildKnowledgeIndex(root, project);
    const local = await searchKnowledgeIndex(root, project, { query: "canon gate", limit: 5 });
    await fs.rm(path.join(root, "knowledge", "vectors.json"));
    await writePlatformAiConfig({ ...defaultPlatformAiConfig(), knowledgeEmbedding: { provider: "openai-compatible", baseUrl: "https://embedding.example/v1", model: "provider-b", apiKey: "test-key" } });
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { input?: string[] };
      return { ok: true, status: 200, json: async () => ({ data: (body.input || []).map(() => ({ embedding: [1, 0, 0] })) }) } as Response;
    }));
    await rebuildKnowledgeIndex(root, project);
    const external = await searchKnowledgeIndex(root, project, { query: "canon gate", limit: 5 });

    expect(external.retrievalAudit?.eligibleFactIds).toEqual(local.retrievalAudit?.eligibleFactIds);
    expect(external.retrievalAudit?.excluded).toEqual(local.retrievalAudit?.excluded);
  });

  it("searches persisted knowledge by keyword and entity", async () => {
    const project = createProjectSkeleton({ title: "Knowledge Search", roughIdea: "Search memory by entities." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveChapterSummary(root, {
      chapterId: "chapter-001",
      summary: "The sealed gate responds to blood.",
      keyEvents: ["The talisman burns before the gate opens."],
      newFacts: [
        {
          id: "fact-gate-blood",
          chapterId: "chapter-001",
          fact: "The sealed gate responds to blood.",
          relatedEntities: ["Hero", "sealed gate"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      characterStateChanges: [
        {
          id: "hero-wounded",
          chapterId: "chapter-001",
          characterName: "Hero",
          after: "Wounded but aware the gate is alive.",
          cause: "Paid blood to test the clue.",
          relatedEntities: ["sealed gate"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await rebuildKnowledgeIndex(root, project);

    const result = await searchKnowledgeIndex(root, project, { query: "Hero blood gate", chapterId: "chapter-001", limit: 5 });

    expect(result.tokens).toEqual(expect.arrayContaining(["hero", "blood", "gate"]));
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fact:fact-gate-blood", score: expect.any(Number), vectorScore: expect.any(Number) })
    ]));
    expect(result.triples).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: "Hero", predicate: "state_after", score: expect.any(Number), vectorScore: expect.any(Number) })
    ]));
    expect(result.chapters[0]).toEqual(expect.objectContaining({ chapterId: "chapter-001", score: expect.any(Number), vectorScore: expect.any(Number) }));
    expect(result.retrievalAudit).toEqual(expect.objectContaining({
      schemaVersion: "knowledge-retrieval-audit.v1",
      boundary: expect.objectContaining({ query: "Hero blood gate", chapterId: "chapter-001", audience: "author" }),
      eligibleFactIds: expect.arrayContaining(["fact:fact-gate-blood"]),
      selectedIds: expect.arrayContaining(["fact:fact-gate-blood"]),
      evidenceSourceIds: expect.arrayContaining(["fact-gate-blood"]),
      evidenceSourceCount: expect.any(Number),
      evidenceProfile: expect.objectContaining({
        independentSourceCount: expect.any(Number),
        familyCount: expect.any(Number),
        duplicateDerivedGroupCount: expect.any(Number),
        gaps: expect.any(Array),
        saysNoContradiction: expect.any(Boolean)
      }),
      resultFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
  });
});
