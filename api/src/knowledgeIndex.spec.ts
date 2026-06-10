import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { readKnowledgeIndex, rebuildKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { saveChapterSummary, saveLedgerEntries, saveStoryControl } from "./writingCockpit.js";

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
    expect(persisted.facts).toHaveLength(projection.facts.length);
    expect(persisted.triples).toHaveLength(projection.triples.length);
    await expect(fs.readFile(path.join(root, "knowledge", "facts.jsonl"), "utf8")).resolves.toContain("fact-gate-blood");
    await expect(fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")).resolves.toContain('"dimensions": 64');
    await expect(fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")).resolves.toContain('"provider": "local"');
    await expect(fs.readFile(path.join(root, "memory", "chapter-index.json"), "utf8")).resolves.toContain("chapter-001");
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

    await rebuildKnowledgeIndex(root, project);
    const vectors = JSON.parse(await fs.readFile(path.join(root, "knowledge", "vectors.json"), "utf8")) as {
      provider: string;
      model?: string;
      dimensions: number;
      entries: Array<{ vector: number[] }>;
    };
    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(requestInit?.body || "{}")) as { model: string; input: string[] };

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
  });
});
