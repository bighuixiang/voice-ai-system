import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ChapterMemoryIndex,
  ChapterSummary,
  KnowledgeFact,
  KnowledgeIndexProjection,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeSourceRef,
  KnowledgeTriple,
  KnowledgeVectorIndex,
  KnowledgeVectorSummary,
  LedgerEntry,
  NovelChapter,
  NovelProject
} from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { readPlatformAiConfig } from "./platformAiConfig.js";
import { readChapterSummary, readLedgerEntries, readStoryControl } from "./writingCockpit.js";
import { evaluateMemoryClaimTemporal, listMemoryClaims } from "./memoryClaim.js";
import { evaluateCharacterKnowledge, evaluateReaderKnowledge, listCharacterKnowledgeStates, listReaderKnowledgeStates } from "./memoryKnowledge.js";
import { evaluateMemoryVisibility, evaluateSourceVisibility } from "./memoryVisibility.js";
import { buildKnowledgeEvidenceProfile, evidenceQualityPriority } from "./knowledgeEvidence.js";
import { buildStoryTimeEventOrder, listStoryTimeEvents } from "./storyTime.js";

const ledgerKinds: LedgerEntry["kind"][] = ["foreshadowing", "continuity", "power", "character", "risk"];
const localVectorDimensions = 64;
const vectorMatchThreshold = 0.15;

interface EmbeddingProvider {
  name: KnowledgeVectorIndex["provider"];
  model?: string;
  embed(texts: string[]): Promise<number[][]>;
}

interface KnowledgeVectorEntryDraft extends Omit<KnowledgeVectorIndex["entries"][number], "vector"> {
  embeddingText: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableKey(input: string): string {
  return (
    input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "item"
  );
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function keywordsFrom(parts: string[], limit = 24): string[] {
  const text = parts.map(cleanText).filter(Boolean).join(" ");
  const ascii = text.match(/[a-z0-9][a-z0-9-]{2,}/gi) || [];
  const cjk = text.match(/[\u4e00-\u9fff]{2,12}/g) || [];
  return unique([...ascii, ...cjk].map((item) => item.toLowerCase())).slice(0, limit);
}

function searchTokens(input: string): string[] {
  return keywordsFrom([input], 32);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function vectorize(parts: string[]): number[] {
  const vector = Array.from({ length: localVectorDimensions }, () => 0);
  const tokens = keywordsFrom(parts, 96);
  for (const token of tokens) {
    const hash = hashString(token);
    const bucket = hash % localVectorDimensions;
    const sign = hash & 1 ? 1 : -1;
    const weight = 1 + Math.min(token.length, 16) / 16;
    vector[bucket] += sign * weight;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function normalizeVector(vector: number[]): number[] {
  const values = vector.map((value) => (Number.isFinite(value) ? value : 0));
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return values;
  return values.map((value) => Number((value / magnitude).toFixed(6)));
}

function localEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "local",
    embed: async (texts) => texts.map((text) => vectorize([text]))
  };
}

function embeddingEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function openAiCompatibleEmbeddingProvider(baseUrl: string, apiKey: string, model: string): EmbeddingProvider {
  return {
    name: "openai-compatible",
    model,
    embed: async (texts) => requestOpenAiCompatibleEmbeddings(baseUrl.replace(/\/+$/, ""), apiKey, model, texts)
  };
}

function getEnvEmbeddingProvider(): EmbeddingProvider {
  const providerName = embeddingEnv("KNOWLEDGE_EMBEDDING_PROVIDER").toLowerCase();
  if (providerName !== "openai-compatible" && providerName !== "openai") {
    return localEmbeddingProvider();
  }

  const apiKey = embeddingEnv("KNOWLEDGE_EMBEDDING_API_KEY") || embeddingEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return localEmbeddingProvider();
  }

  const baseUrl = (embeddingEnv("KNOWLEDGE_EMBEDDING_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = embeddingEnv("KNOWLEDGE_EMBEDDING_MODEL") || "text-embedding-3-small";
  return openAiCompatibleEmbeddingProvider(baseUrl, apiKey, model);
}

async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  try {
    const config = await readPlatformAiConfig();
    const embedding = config.knowledgeEmbedding;
    if (embedding.provider !== "openai-compatible") {
      return localEmbeddingProvider();
    }
    if (!embedding.apiKey) {
      return localEmbeddingProvider();
    }
    return openAiCompatibleEmbeddingProvider(
      embedding.baseUrl || "https://api.openai.com/v1",
      embedding.apiKey,
      embedding.model || "text-embedding-3-small"
    );
  } catch {
    return getEnvEmbeddingProvider();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Embedding provider failed";
}

async function requestOpenAiCompatibleEmbeddings(baseUrl: string, apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: texts })
  });
  if (!response.ok) {
    throw new Error(`Embedding provider failed with ${response.status}`);
  }
  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const vectors = payload.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item)) || [];
  if (vectors.length !== texts.length) {
    throw new Error(`Embedding provider returned ${vectors.length} vectors for ${texts.length} inputs`);
  }
  return vectors.map(normalizeVector);
}

function cosineScore(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) return 0;
  const score = left.reduce((sum, value, index) => sum + value * right[index], 0);
  return Math.max(0, Number(score.toFixed(6)));
}

function scoreText(tokens: string[], parts: string[], exactBoost = 0): number {
  const text = parts.map(cleanText).filter(Boolean).join(" ").toLowerCase();
  if (!text) return 0;
  return tokens.reduce((score, token) => {
    if (!token) return score;
    const tokenScore = text.includes(token) ? 1 : 0;
    return score + tokenScore;
  }, exactBoost);
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.floor(limit as number), 1), 50);
}

function chapterOrder(chapter: NovelChapter, index: number): number {
  return chapter.order ?? index + 1;
}

function hasSummarySignal(summary: ChapterSummary): boolean {
  return Boolean(
    summary.summary.trim() ||
      summary.keyEvents.length ||
      summary.newFacts.length ||
      summary.characterStateChanges.length ||
      summary.foreshadowingUpdates.length ||
      summary.continuityRisks.length ||
      summary.powerProgressionUpdates.length
  );
}

function addFact(facts: Map<string, KnowledgeFact>, fact: Omit<KnowledgeFact, "keywords" | "updatedAt">, updatedAt: string): string {
  const text = cleanText(fact.text);
  if (!text) return "";
  const normalized: KnowledgeFact = {
    ...fact,
    text,
    chapterIds: unique(fact.chapterIds).sort(),
    relatedEntities: unique(fact.relatedEntities.map(cleanText).filter(Boolean)).sort(),
    keywords: keywordsFrom([text, ...fact.relatedEntities, fact.source.label || ""]),
    updatedAt
  };
  facts.set(normalized.id, normalized);
  return normalized.id;
}

function addTriple(triples: Map<string, KnowledgeTriple>, triple: Omit<KnowledgeTriple, "updatedAt">, updatedAt: string): void {
  const subject = cleanText(triple.subject);
  const object = cleanText(triple.object);
  if (!subject || !object) return;
  triples.set(triple.id, {
    ...triple,
    subject,
    object,
    chapterIds: unique(triple.chapterIds).sort(),
    sourceFactIds: unique(triple.sourceFactIds).sort(),
    updatedAt
  });
}

function factSource(type: KnowledgeSourceRef["type"], id: string, label?: string): KnowledgeSourceRef {
  return { type, id, label };
}

function addSummaryFacts(
  facts: Map<string, KnowledgeFact>,
  triples: Map<string, KnowledgeTriple>,
  summary: ChapterSummary,
  updatedAt: string
): void {
  const source = factSource("chapter-summary", summary.chapterId, summary.chapterId);
  const summaryFactId = addFact(
    facts,
    {
      id: `summary:${summary.chapterId}`,
      text: summary.summary,
      chapterIds: [summary.chapterId],
      relatedEntities: [],
      source
    },
    updatedAt
  );

  summary.keyEvents.forEach((event, index) => {
    addFact(
      facts,
      {
        id: `summary-event:${summary.chapterId}:${index + 1}`,
        text: event,
        chapterIds: [summary.chapterId],
        relatedEntities: [],
        source
      },
      updatedAt
    );
  });

  for (const patch of summary.newFacts) {
    addFact(
      facts,
      {
        id: `fact:${patch.id}`,
        text: patch.fact,
        chapterIds: [patch.chapterId || summary.chapterId],
        relatedEntities: patch.relatedEntities || [],
        source: factSource("chapter-summary", patch.id, patch.sourceAnchor)
      },
      updatedAt
    );
  }

  for (const patch of summary.characterStateChanges) {
    const factId = addFact(
      facts,
      {
        id: `character-state:${patch.id}`,
        text: `${patch.characterName}: ${patch.after}`,
        chapterIds: [patch.chapterId || summary.chapterId],
        relatedEntities: unique([patch.characterName, ...(patch.relatedEntities || [])]),
        source: factSource("chapter-summary", patch.id, patch.cause)
      },
      updatedAt
    );
    addTriple(
      triples,
      {
        id: `triple:character-state:${patch.id}`,
        subject: patch.characterName,
        predicate: "state_after",
        object: patch.after,
        chapterIds: [patch.chapterId || summary.chapterId],
        sourceFactIds: unique([summaryFactId, factId].filter(Boolean))
      },
      updatedAt
    );
  }
}

function addLedgerFacts(facts: Map<string, KnowledgeFact>, triples: Map<string, KnowledgeTriple>, entries: LedgerEntry[], updatedAt: string): void {
  for (const entry of entries) {
    const factId = addFact(
      facts,
      {
        id: `ledger:${entry.kind}:${entry.id}`,
        text: `${entry.title}. ${entry.note || ""}`,
        chapterIds: entry.chapterIds || [],
        relatedEntities: entry.relatedEntities || [],
        source: factSource("ledger", entry.id, entry.kind)
      },
      updatedAt
    );
    for (const entity of entry.relatedEntities || []) {
      addTriple(
        triples,
        {
          id: `triple:ledger:${entry.kind}:${entry.id}:${stableKey(entity)}`,
          subject: entity,
          predicate: `tracks_${entry.kind}`,
          object: entry.title,
          chapterIds: entry.chapterIds || [],
          sourceFactIds: factId ? [factId] : []
        },
        updatedAt
      );
    }
  }
}

function addMemoryClaimFacts(facts: Map<string, KnowledgeFact>, claims: Awaited<ReturnType<typeof listMemoryClaims>>, updatedAt: string): void {
  for (const claim of claims) {
    if (claim.status !== "eligible") continue;
    addFact(facts, { id: `memory-claim:${claim.claimId}`, text: claim.proposition, chapterIds: [], relatedEntities: [], source: factSource("memory-claim", claim.claimId, `memory-claim:v${claim.version}`) }, updatedAt);
  }
}

async function addStoryControlFacts(
  root: string,
  facts: Map<string, KnowledgeFact>,
  triples: Map<string, KnowledgeTriple>,
  updatedAt: string
): Promise<void> {
  const storyControl = await readStoryControl(root);
  for (const character of storyControl.characters || []) {
    const factId = addFact(
      facts,
      {
        id: `story-character:${character.id}`,
        text: `${character.name}: ${character.currentState || character.goal || character.role || ""}`,
        chapterIds: [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[],
        relatedEntities: [character.name],
        source: factSource("story-control", character.id, character.role)
      },
      updatedAt
    );
    addTriple(
      triples,
      {
        id: `triple:story-character-role:${character.id}`,
        subject: character.name,
        predicate: "has_role",
        object: character.role,
        chapterIds: [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[],
        sourceFactIds: factId ? [factId] : []
      },
      updatedAt
    );
  }

  for (const event of storyControl.events || []) {
    const factId = addFact(
      facts,
      {
        id: `story-event:${event.id}`,
        text: `${event.title}: ${event.conflict || event.trigger || ""}`,
        chapterIds: [],
        relatedEntities: event.participants || [],
        source: factSource("story-control", event.id, event.type)
      },
      updatedAt
    );
    for (const participant of event.participants || []) {
      addTriple(
        triples,
        {
          id: `triple:story-event-participant:${event.id}:${stableKey(participant)}`,
          subject: participant,
          predicate: "participates_in",
          object: event.title,
          chapterIds: [],
          sourceFactIds: factId ? [factId] : []
        },
        updatedAt
      );
    }
  }
}

function buildChapterIndex(project: NovelProject, facts: KnowledgeFact[], triples: KnowledgeTriple[], updatedAt: string): ChapterMemoryIndex {
  const factsByChapter = new Map<string, KnowledgeFact[]>();
  const triplesByChapter = new Map<string, KnowledgeTriple[]>();
  for (const fact of facts) {
    for (const chapterId of fact.chapterIds) {
      factsByChapter.set(chapterId, [...(factsByChapter.get(chapterId) || []), fact]);
    }
  }
  for (const triple of triples) {
    for (const chapterId of triple.chapterIds) {
      triplesByChapter.set(chapterId, [...(triplesByChapter.get(chapterId) || []), triple]);
    }
  }

  const keywordMap: Record<string, string[]> = {};
  const chapters = project.chapters.map((chapter, index) => {
    const chapterFacts = factsByChapter.get(chapter.id) || [];
    const chapterTriples = triplesByChapter.get(chapter.id) || [];
    const keywords = unique(chapterFacts.flatMap((fact) => fact.keywords)).slice(0, 40);
    for (const keyword of keywords) {
      keywordMap[keyword] = unique([...(keywordMap[keyword] || []), chapter.id]).sort();
    }
    return {
      chapterId: chapter.id,
      title: chapter.title || chapter.id,
      order: chapterOrder(chapter, index),
      keywords,
      factIds: chapterFacts.map((fact) => fact.id).sort(),
      tripleIds: chapterTriples.map((triple) => triple.id).sort(),
      entityNames: unique(chapterFacts.flatMap((fact) => fact.relatedEntities)).sort(),
      updatedAt
    };
  });

  return {
    projectSlug: project.slug,
    chapters,
    keywords: keywordMap,
    updatedAt
  };
}

function buildKnowledgeVectorDrafts(
  project: NovelProject,
  facts: KnowledgeFact[],
  triples: KnowledgeTriple[],
  chapterIndex: ChapterMemoryIndex,
  updatedAt: string
): KnowledgeVectorEntryDraft[] {
  return [
    ...facts.map((fact) => ({
      id: fact.id,
      kind: "fact" as const,
      label: fact.source.label || fact.source.type,
      text: fact.text,
      chapterIds: fact.chapterIds,
      sourceIds: [fact.source.id],
      embeddingText: [fact.text, ...fact.keywords, ...fact.relatedEntities, fact.source.label || ""].join(" "),
      updatedAt
    })),
    ...triples.map((triple) => ({
      id: triple.id,
      kind: "triple" as const,
      label: triple.predicate,
      text: `${triple.subject} ${triple.predicate} ${triple.object}`,
      chapterIds: triple.chapterIds,
      sourceIds: triple.sourceFactIds,
      embeddingText: [triple.subject, triple.predicate, triple.object].join(" "),
      updatedAt
    })),
    ...chapterIndex.chapters.map((chapter) => ({
      id: chapter.chapterId,
      kind: "chapter" as const,
      label: chapter.title,
      text: [chapter.title, ...chapter.keywords, ...chapter.entityNames].join(" "),
      chapterIds: [chapter.chapterId],
      sourceIds: [...chapter.factIds, ...chapter.tripleIds],
      embeddingText: [chapter.title, ...chapter.keywords, ...chapter.entityNames].join(" "),
      updatedAt
    }))
  ];
}

async function buildKnowledgeVectorIndexWithProvider(
  project: NovelProject,
  facts: KnowledgeFact[],
  triples: KnowledgeTriple[],
  chapterIndex: ChapterMemoryIndex,
  updatedAt: string,
  provider: EmbeddingProvider
): Promise<KnowledgeVectorIndex> {
  const drafts = buildKnowledgeVectorDrafts(project, facts, triples, chapterIndex, updatedAt);
  const vectors = await provider.embed(drafts.map((entry) => entry.embeddingText));
  const dimensions = vectors[0]?.length || localVectorDimensions;
  return {
    projectSlug: project.slug,
    provider: provider.name,
    model: provider.model,
    dimensions,
    entries: drafts.map(({ embeddingText: _embeddingText, ...entry }, index) => ({
      ...entry,
      vector: vectors[index] || []
    })),
    updatedAt
  };
}

async function buildKnowledgeVectorIndex(
  project: NovelProject,
  facts: KnowledgeFact[],
  triples: KnowledgeTriple[],
  chapterIndex: ChapterMemoryIndex,
  updatedAt: string
): Promise<KnowledgeVectorIndex> {
  const provider = await getEmbeddingProvider();
  try {
    return await buildKnowledgeVectorIndexWithProvider(project, facts, triples, chapterIndex, updatedAt, provider);
  } catch (error) {
    if (provider.name === "local") {
      throw error;
    }
    const fallback = await buildKnowledgeVectorIndexWithProvider(project, facts, triples, chapterIndex, updatedAt, localEmbeddingProvider());
    return {
      ...fallback,
      fallbackFrom: provider.name,
      fallbackReason: errorMessage(error)
    };
  }
}

function summarizeVectorIndex(index: KnowledgeVectorIndex): KnowledgeVectorSummary {
  return {
    provider: index.provider,
    model: index.model,
    dimensions: index.dimensions,
    entryCount: index.entries.length,
    fallbackFrom: index.fallbackFrom,
    fallbackReason: index.fallbackReason,
    updatedAt: index.updatedAt
  };
}

function latestProjectionTimestamp(index: KnowledgeIndexProjection): number {
  const values = [index.chapterIndex.updatedAt, ...index.facts.map((fact) => fact.updatedAt), ...index.triples.map((triple) => triple.updatedAt)]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

async function vectorizeQueryForIndex(index: KnowledgeVectorIndex, query: string, tokens: string[]): Promise<{ vector: number[]; fallback?: NonNullable<KnowledgeSearchResult["queryEmbeddingFallback"]> }> {
  const localQueryVector = vectorize([query, ...tokens]);
  if (index.provider === "local") {
    return { vector: localQueryVector };
  }

  const provider = await getEmbeddingProvider();
  const providerMatchesIndex = provider.name === index.provider && (!index.model || provider.model === index.model);
  if (providerMatchesIndex) {
    try {
      const [queryVector] = await provider.embed([[query, ...tokens].join(" ")]);
      if (queryVector?.length === index.dimensions) {
        return { vector: queryVector };
      }
    } catch (error) {
      return {
        vector: index.dimensions === localQueryVector.length ? localQueryVector : [],
        fallback: { from: "openai-compatible", to: "local", reason: errorMessage(error) }
      };
    }
  }

  return { vector: index.dimensions === localQueryVector.length ? localQueryVector : [] };
}

async function writeJsonl(root: string, relativePath: string, items: unknown[]): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const content = items.map((item) => JSON.stringify(item)).join("\n");
  await fs.writeFile(target, content ? `${content}\n` : "", "utf8");
}

async function readJsonl<T>(root: string, relativePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(resolveInside(root, relativePath), "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

async function writeChapterIndex(root: string, index: ChapterMemoryIndex): Promise<void> {
  const target = resolveInside(root, "memory/chapter-index.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function writeKnowledgeVectorIndex(root: string, index: KnowledgeVectorIndex): Promise<void> {
  const target = resolveInside(root, "knowledge/vectors.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function readKnowledgeVectorIndex(root: string, project: NovelProject): Promise<KnowledgeVectorIndex> {
  try {
    const raw = await fs.readFile(resolveInside(root, "knowledge/vectors.json"), "utf8");
    const index = JSON.parse(raw) as KnowledgeVectorIndex;
    if (!index.dimensions) {
      return { projectSlug: project.slug, provider: "local", dimensions: localVectorDimensions, entries: [], updatedAt: nowIso() };
    }
    return { ...index, provider: index.provider || "local" };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return { projectSlug: project.slug, provider: "local", dimensions: localVectorDimensions, entries: [], updatedAt: nowIso() };
    }
    throw error;
  }
}

async function readChapterIndex(root: string, project: NovelProject): Promise<ChapterMemoryIndex> {
  try {
    const raw = await fs.readFile(resolveInside(root, "memory/chapter-index.json"), "utf8");
    return JSON.parse(raw) as ChapterMemoryIndex;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return { projectSlug: project.slug, chapters: [], keywords: {}, updatedAt: nowIso() };
    }
    throw error;
  }
}

export async function buildKnowledgeIndexProjection(root: string, project: NovelProject): Promise<KnowledgeIndexProjection> {
  const updatedAt = nowIso();
  const facts = new Map<string, KnowledgeFact>();
  const triples = new Map<string, KnowledgeTriple>();

  for (const chapter of project.chapters) {
    const summary = await readChapterSummary(root, chapter.id);
    if (hasSummarySignal(summary)) {
      addSummaryFacts(facts, triples, summary, updatedAt);
    }
  }

  const ledgers = (await Promise.all(ledgerKinds.map((kind) => readLedgerEntries(root, kind)))).flat();
  addLedgerFacts(facts, triples, ledgers, updatedAt);
  addMemoryClaimFacts(facts, await listMemoryClaims(root), updatedAt);
  await addStoryControlFacts(root, facts, triples, updatedAt);

  const factList = [...facts.values()].sort((left, right) => left.id.localeCompare(right.id));
  const tripleList = [...triples.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    projectSlug: project.slug,
    facts: factList,
    triples: tripleList,
    chapterIndex: buildChapterIndex(project, factList, tripleList, updatedAt),
    updatedAt
  };
}

export async function rebuildKnowledgeIndex(root: string, project: NovelProject): Promise<KnowledgeIndexProjection> {
  const projection = await buildKnowledgeIndexProjection(root, project);
  const vectorIndex = await buildKnowledgeVectorIndex(project, projection.facts, projection.triples, projection.chapterIndex, projection.updatedAt);
  await writeJsonl(root, "knowledge/facts.jsonl", projection.facts);
  await writeJsonl(root, "knowledge/triples.jsonl", projection.triples);
  await writeChapterIndex(root, projection.chapterIndex);
  await writeKnowledgeVectorIndex(root, vectorIndex);
  return { ...projection, vectorSummary: summarizeVectorIndex(vectorIndex) };
}

export async function readKnowledgeIndex(root: string, project: NovelProject): Promise<KnowledgeIndexProjection> {
  const [facts, triples, chapterIndex, vectorIndex] = await Promise.all([
    readJsonl<KnowledgeFact>(root, "knowledge/facts.jsonl"),
    readJsonl<KnowledgeTriple>(root, "knowledge/triples.jsonl"),
    readChapterIndex(root, project),
    readKnowledgeVectorIndex(root, project)
  ]);
  return {
    projectSlug: project.slug,
    facts,
    triples,
    chapterIndex,
    vectorSummary: summarizeVectorIndex(vectorIndex),
    updatedAt: chapterIndex.updatedAt
  };
}

export async function searchKnowledgeIndex(
  root: string,
  project: NovelProject,
  input: KnowledgeSearchQuery
): Promise<KnowledgeSearchResult> {
  const query = cleanText(input.query || "");
  const tokens = searchTokens(query);
  const limit = clampLimit(input.limit);
  if (!query || !tokens.length) {
    return { query, tokens: [], facts: [], triples: [], chapters: [] };
  }

  const index = await readKnowledgeIndex(root, project);
  const memoryClaims = await listMemoryClaims(root);
  const memoryClaimById = new Map(memoryClaims.map((claim) => [`memory-claim:${claim.claimId}`, claim]));
  const canonicalClaimIds = new Set(memoryClaims.filter((claim) => claim.status === "eligible" && claim.epistemicType === "canon_fact").map((claim) => claim.claimId));
  const factQuality = (fact: KnowledgeFact): "canon" | "derived" | "plan" | "unknown" => {
    if (fact.source.type === "memory-claim" && canonicalClaimIds.has(fact.source.id)) return "canon";
    if (fact.source.type === "story-control") return "plan";
    if (fact.source.type === "chapter-summary" || fact.source.type === "ledger") return "derived";
    return "unknown";
  };
  const factById = new Map(index.facts.map((fact) => [fact.id, fact]));
  const tripleQuality = (triple: KnowledgeTriple): number => Math.max(1, ...triple.sourceFactIds.map((id) => {
    const sourceFact = factById.get(id);
    return sourceFact ? evidenceQualityPriority(factQuality(sourceFact)) : 1;
  }));
  const characterKnowledge = input.audience === "character" ? await listCharacterKnowledgeStates(root) : [];
  const readerKnowledge = input.audience === "reader" ? await listReaderKnowledgeStates(root) : [];
  const authoritativeEventOrder = input.targetEvent ? buildStoryTimeEventOrder(await listStoryTimeEvents(root, project.slug)) : {};
  const excluded: Array<{ id: string; reason: string }> = [];
  const eligibleFacts = index.facts.filter((fact) => {
    if (fact.source.type !== "memory-claim") {
      const visibility = evaluateSourceVisibility({
        audience: input.audience || "author",
        sourceType: fact.source.type,
        sourceVisibility: fact.source.visibility || "author-only",
        secret: fact.source.secret,
        authorized: input.authorized !== false
      });
      if (!visibility.allowed) { excluded.push({ id: fact.id, reason: visibility.reason }); return false; }
      return true;
    }
    const claim = memoryClaimById.get(fact.id);
    if (!claim) { excluded.push({ id: fact.id, reason: "MEMORY_CLAIM_NOT_FOUND" }); return false; }
    if (claim.status !== "eligible") { excluded.push({ id: fact.id, reason: `MEMORY_CLAIM_STATUS_${claim.status.toUpperCase()}` }); return false; }
    const sourceVisibility = claim.epistemicType === "author_truth" ? "author-only" as const : claim.epistemicType === "reader_known" ? "reader-visible" as const : "public" as const;
    const visibility = evaluateMemoryVisibility({ audience: input.audience || "author", epistemicType: claim.epistemicType, sourceVisibility, authorized: input.authorized !== false });
    if (!visibility.allowed) { excluded.push({ id: fact.id, reason: visibility.reason }); return false; }
    if (input.targetEvent) {
      const temporal = evaluateMemoryClaimTemporal({ claim, targetEvent: input.targetEvent, eventOrder: authoritativeEventOrder });
      if (temporal.status !== "active") { excluded.push({ id: fact.id, reason: temporal.reason }); return false; }
    }
    if (input.audience === "reader") {
      if (!input.readerScope || !input.publicationVersion || !input.readerProgressCursor) { excluded.push({ id: fact.id, reason: "READER_QUERY_BOUNDARY_REQUIRED" }); return false; }
      const eligibility = evaluateReaderKnowledge({ states: readerKnowledge, readerScope: input.readerScope, claimId: claim.claimId, publicationVersion: input.publicationVersion, progressCursor: input.readerProgressCursor });
      if (!eligibility.eligible) { excluded.push({ id: fact.id, reason: "READER_KNOWLEDGE_REQUIRED" }); return false; }
    }
    if (input.audience === "character") {
      if (!input.characterId || !input.targetEvent) { excluded.push({ id: fact.id, reason: "CHARACTER_QUERY_BOUNDARY_REQUIRED" }); return false; }
      const eligibility = evaluateCharacterKnowledge({ states: characterKnowledge, characterId: input.characterId, claimId: claim.claimId, targetEvent: input.targetEvent, eventOrder: authoritativeEventOrder });
      if (!eligibility.eligible) { excluded.push({ id: fact.id, reason: "CHARACTER_KNOWLEDGE_REQUIRED" }); return false; }
    }
    return true;
  });
  const persistedVectorIndex = await readKnowledgeVectorIndex(root, project);
  if (persistedVectorIndex.entries.length) {
    const vectorUpdatedAt = Date.parse(persistedVectorIndex.updatedAt);
    if (!Number.isFinite(vectorUpdatedAt) || vectorUpdatedAt < latestProjectionTimestamp(index)) throw new Error("KNOWLEDGE_VECTOR_INDEX_STALE");
  }
  const vectorIndex = persistedVectorIndex.entries.length
    ? persistedVectorIndex
    : await buildKnowledgeVectorIndex(project, index.facts, index.triples, index.chapterIndex, index.updatedAt);
  const queryEmbedding = await vectorizeQueryForIndex(vectorIndex, query, tokens);
  const queryVector = queryEmbedding.vector;
  const vectorScores = vectorIndex.entries.reduce((scores, entry) => {
    scores.set(entry.id, cosineScore(queryVector, entry.vector));
    return scores;
  }, new Map<string, number>());
  const targetChapterId = cleanText(input.chapterId || "");
  const chapterScores = new Map<string, number>();
  const addChapterScore = (chapterIds: string[], score: number) => {
    for (const chapterId of chapterIds) {
      chapterScores.set(chapterId, (chapterScores.get(chapterId) || 0) + score);
    }
  };

  const facts = eligibleFacts
    .map((fact) => {
      const chapterBoost = targetChapterId && fact.chapterIds.includes(targetChapterId) ? 0.25 : 0;
      const vectorScore = vectorScores.get(fact.id) || 0;
      const score = scoreText(tokens, [fact.text, ...fact.keywords, ...fact.relatedEntities, fact.source.label || ""], chapterBoost) + vectorScore;
      if (score > 0) addChapterScore(fact.chapterIds, score);
      return { ...fact, score, vectorScore };
    })
    .filter((fact) => fact.score > 0 || (fact.vectorScore || 0) >= vectorMatchThreshold)
    .sort((left, right) => evidenceQualityPriority(factQuality(right)) - evidenceQualityPriority(factQuality(left)) || right.score - left.score || (right.vectorScore || 0) - (left.vectorScore || 0) || left.id.localeCompare(right.id))
    .slice(0, limit);

  const triples = index.triples
    .map((triple) => {
      const chapterBoost = targetChapterId && triple.chapterIds.includes(targetChapterId) ? 0.25 : 0;
      const vectorScore = vectorScores.get(triple.id) || 0;
      const score = scoreText(tokens, [triple.subject, triple.predicate, triple.object], chapterBoost) + vectorScore;
      if (score > 0) addChapterScore(triple.chapterIds, score);
      return { ...triple, score, vectorScore };
    })
    .filter((triple) => triple.score > 0 || (triple.vectorScore || 0) >= vectorMatchThreshold)
    .sort((left, right) => tripleQuality(right) - tripleQuality(left) || right.score - left.score || (right.vectorScore || 0) - (left.vectorScore || 0) || left.id.localeCompare(right.id))
    .slice(0, limit);

  const chapters = index.chapterIndex.chapters
    .map((chapter) => {
      const chapterBoost = targetChapterId && chapter.chapterId === targetChapterId ? 0.25 : 0;
      const vectorScore = vectorScores.get(chapter.chapterId) || 0;
      const score =
        (chapterScores.get(chapter.chapterId) || 0) +
        scoreText(tokens, [chapter.title, ...chapter.keywords, ...chapter.entityNames], chapterBoost) +
        vectorScore;
      return { ...chapter, score, vectorScore };
    })
    .filter((chapter) => chapter.score > 0 || (chapter.vectorScore || 0) >= vectorMatchThreshold)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.vectorScore || 0) - (left.vectorScore || 0) ||
        (left.order || 0) - (right.order || 0) ||
        left.chapterId.localeCompare(right.chapterId)
    )
    .slice(0, limit);

  const selectedIds = [
    ...facts.map((fact) => fact.id),
    ...triples.map((triple) => triple.id),
    ...chapters.map((chapter) => chapter.chapterId)
  ];
  const evidenceSourceIds = [...new Set([
    ...facts.map((fact) => fact.source.id),
    ...triples.flatMap((triple) => triple.sourceFactIds)
  ])].sort();
  const evidenceProfile = buildKnowledgeEvidenceProfile({
    facts: index.facts,
    triples: index.triples,
    selectedIds,
    excluded,
    canonicalSourceIds: [...canonicalClaimIds]
  });
  const retrievalAuditBase = {
    schemaVersion: "knowledge-retrieval-audit.v1" as const,
    boundary: {
      query,
      ...(input.task ? { task: input.task } : {}),
      ...(input.chapterId ? { chapterId: input.chapterId } : {}),
      ...(input.targetEvent ? { targetEvent: input.targetEvent } : {}),
      audience: input.audience || "author",
      ...(input.visibility ? { visibility: input.visibility } : {}),
      authorized: input.authorized !== false,
      ...(input.readerScope ? { readerScope: input.readerScope } : {}),
      ...(input.publicationVersion ? { publicationVersion: input.publicationVersion } : {}),
      ...(input.readerProgressCursor ? { readerProgressCursor: input.readerProgressCursor } : {}),
      ...(input.characterId ? { characterId: input.characterId } : {})
    },
    eligibleFactIds: eligibleFacts.map((fact) => fact.id),
    excluded,
    selectedIds,
    evidenceSourceIds,
    evidenceSourceCount: evidenceSourceIds.length,
    evidenceProfile,
    vectorSummary: summarizeVectorIndex(vectorIndex)
  };
  const retrievalAudit = {
    ...retrievalAuditBase,
    resultFingerprint: crypto.createHash("sha256").update(JSON.stringify(retrievalAuditBase)).digest("hex")
  };

  return {
    query,
    tokens,
    vectorSummary: summarizeVectorIndex(vectorIndex),
    queryEmbeddingFallback: queryEmbedding.fallback,
    retrievalAudit,
    facts,
    triples,
    chapters,
    excluded
  };
}
