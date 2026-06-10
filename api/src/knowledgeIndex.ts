import fs from "node:fs/promises";
import path from "node:path";
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
  LedgerEntry,
  NovelChapter,
  NovelProject
} from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { readChapterSummary, readLedgerEntries, readStoryControl } from "./writingCockpit.js";

const ledgerKinds: LedgerEntry["kind"][] = ["foreshadowing", "continuity", "power", "character", "risk"];
const vectorDimensions = 64;
const vectorMatchThreshold = 0.15;

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
  const vector = Array.from({ length: vectorDimensions }, () => 0);
  const tokens = keywordsFrom(parts, 96);
  for (const token of tokens) {
    const hash = hashString(token);
    const bucket = hash % vectorDimensions;
    const sign = hash & 1 ? 1 : -1;
    const weight = 1 + Math.min(token.length, 16) / 16;
    vector[bucket] += sign * weight;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
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

function buildKnowledgeVectorIndex(
  project: NovelProject,
  facts: KnowledgeFact[],
  triples: KnowledgeTriple[],
  chapterIndex: ChapterMemoryIndex,
  updatedAt: string
): KnowledgeVectorIndex {
  return {
    projectSlug: project.slug,
    dimensions: vectorDimensions,
    entries: [
      ...facts.map((fact) => ({
        id: fact.id,
        kind: "fact" as const,
        label: fact.source.label || fact.source.type,
        text: fact.text,
        chapterIds: fact.chapterIds,
        sourceIds: [fact.source.id],
        vector: vectorize([fact.text, ...fact.keywords, ...fact.relatedEntities, fact.source.label || ""]),
        updatedAt
      })),
      ...triples.map((triple) => ({
        id: triple.id,
        kind: "triple" as const,
        label: triple.predicate,
        text: `${triple.subject} ${triple.predicate} ${triple.object}`,
        chapterIds: triple.chapterIds,
        sourceIds: triple.sourceFactIds,
        vector: vectorize([triple.subject, triple.predicate, triple.object]),
        updatedAt
      })),
      ...chapterIndex.chapters.map((chapter) => ({
        id: chapter.chapterId,
        kind: "chapter" as const,
        label: chapter.title,
        text: [chapter.title, ...chapter.keywords, ...chapter.entityNames].join(" "),
        chapterIds: [chapter.chapterId],
        sourceIds: [...chapter.factIds, ...chapter.tripleIds],
        vector: vectorize([chapter.title, ...chapter.keywords, ...chapter.entityNames]),
        updatedAt
      }))
    ],
    updatedAt
  };
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
    if (index.dimensions !== vectorDimensions) {
      return { projectSlug: project.slug, dimensions: vectorDimensions, entries: [], updatedAt: nowIso() };
    }
    return index;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return { projectSlug: project.slug, dimensions: vectorDimensions, entries: [], updatedAt: nowIso() };
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
  const vectorIndex = buildKnowledgeVectorIndex(project, projection.facts, projection.triples, projection.chapterIndex, projection.updatedAt);
  await writeJsonl(root, "knowledge/facts.jsonl", projection.facts);
  await writeJsonl(root, "knowledge/triples.jsonl", projection.triples);
  await writeChapterIndex(root, projection.chapterIndex);
  await writeKnowledgeVectorIndex(root, vectorIndex);
  return projection;
}

export async function readKnowledgeIndex(root: string, project: NovelProject): Promise<KnowledgeIndexProjection> {
  const [facts, triples, chapterIndex] = await Promise.all([
    readJsonl<KnowledgeFact>(root, "knowledge/facts.jsonl"),
    readJsonl<KnowledgeTriple>(root, "knowledge/triples.jsonl"),
    readChapterIndex(root, project)
  ]);
  return {
    projectSlug: project.slug,
    facts,
    triples,
    chapterIndex,
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
  const persistedVectorIndex = await readKnowledgeVectorIndex(root, project);
  const vectorIndex = persistedVectorIndex.entries.length
    ? persistedVectorIndex
    : buildKnowledgeVectorIndex(project, index.facts, index.triples, index.chapterIndex, index.updatedAt);
  const queryVector = vectorize([query, ...tokens]);
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

  const facts = index.facts
    .map((fact) => {
      const chapterBoost = targetChapterId && fact.chapterIds.includes(targetChapterId) ? 0.25 : 0;
      const vectorScore = vectorScores.get(fact.id) || 0;
      const score = scoreText(tokens, [fact.text, ...fact.keywords, ...fact.relatedEntities, fact.source.label || ""], chapterBoost) + vectorScore;
      if (score > 0) addChapterScore(fact.chapterIds, score);
      return { ...fact, score, vectorScore };
    })
    .filter((fact) => fact.score > 0 || (fact.vectorScore || 0) >= vectorMatchThreshold)
    .sort((left, right) => right.score - left.score || (right.vectorScore || 0) - (left.vectorScore || 0) || left.id.localeCompare(right.id))
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
    .sort((left, right) => right.score - left.score || (right.vectorScore || 0) - (left.vectorScore || 0) || left.id.localeCompare(right.id))
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

  return { query, tokens, facts, triples, chapters };
}
