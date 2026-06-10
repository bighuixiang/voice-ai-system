import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterMemoryIndex,
  ChapterSummary,
  CodexTaskType,
  KnowledgeFact,
  KnowledgeTriple,
  LedgerEntry,
  NovelChapter,
  NovelProject,
  SelectionPayload
} from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { searchKnowledgeIndex } from "./knowledgeIndex.js";

async function readOptional(root: string, relativePath: string): Promise<string> {
  try {
    return await fs.readFile(resolveInside(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

async function readOptionalJson<T>(root: string, relativePath: string): Promise<T | undefined> {
  const content = await readOptional(root, relativePath);
  if (!content.trim()) return undefined;
  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

async function readOptionalJsonl<T>(root: string, relativePath: string): Promise<T[]> {
  const content = await readOptional(root, relativePath);
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

function trimContext(content: string, limit = 6000): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, Math.floor(limit / 2))}\n\n[...中间内容已压缩...]\n\n${content.slice(-Math.floor(limit / 2))}`;
}

const broadContextTypes: CodexTaskType[] = [
  "outline.generate",
  "structure.reverse",
  "chapter.plan",
  "chapter.draft",
  "continuity.check",
  "idea.suggest",
  "assistant.free"
];

const targetChapterTypes: CodexTaskType[] = ["structure.reverse", "chapter.plan", "chapter.draft", "continuity.check", "idea.suggest", "assistant.free"];
const cockpitContextTypes: CodexTaskType[] = ["structure.reverse", "chapter.plan", "chapter.draft", "continuity.check", "idea.suggest", "assistant.free"];
const memoryContextTypes: CodexTaskType[] = ["chapter.plan", "chapter.draft", "writing.briefing", "writing.recap", "continuity.check", "idea.suggest"];

function orderedChapters(project: NovelProject): NovelChapter[] {
  return [...project.chapters].sort((a, b) => {
    const volumeOrderA = a.volumeOrder ?? 0;
    const volumeOrderB = b.volumeOrder ?? 0;
    if (volumeOrderA !== volumeOrderB) return volumeOrderA - volumeOrderB;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

function hasSummarySignal(summary: Partial<ChapterSummary>): boolean {
  return Boolean(
    summary.summary?.trim() ||
      summary.keyEvents?.length ||
      summary.newFacts?.length ||
      summary.characterStateChanges?.length ||
      summary.foreshadowingUpdates?.length ||
      summary.continuityRisks?.length ||
      summary.powerProgressionUpdates?.length
  );
}

function compactSummary(summary: Partial<ChapterSummary>): Record<string, unknown> {
  return {
    chapterId: summary.chapterId,
    summary: summary.summary || "",
    keyEvents: summary.keyEvents || [],
    newFacts: (summary.newFacts || []).map((item) => item.fact),
    characterStateChanges: (summary.characterStateChanges || []).map((item) => ({
      characterName: item.characterName,
      after: item.after,
      cause: item.cause
    })),
    ledgerUpdateIds: [
      ...(summary.foreshadowingUpdates || []),
      ...(summary.continuityRisks || []),
      ...(summary.powerProgressionUpdates || [])
    ].map((item) => item.id)
  };
}

async function readChapterSummary(root: string, chapterId: string): Promise<Partial<ChapterSummary> | undefined> {
  const summary = await readOptionalJson<Partial<ChapterSummary>>(root, `memory/chapter-summaries/${chapterId}.json`);
  if (!summary || !hasSummarySignal(summary)) return undefined;
  return { ...summary, chapterId: summary.chapterId || chapterId };
}

async function readLedgerEntries(root: string): Promise<LedgerEntry[]> {
  const ledgers = await Promise.all(
    ["foreshadowing", "continuity", "power-progression", "character-state", "risks"].map((name) =>
      readOptionalJson<LedgerEntry[]>(root, `ledger/${name}.json`)
    )
  );
  return ledgers.flatMap((items) => (Array.isArray(items) ? items : []));
}

async function buildChapterMemoryBlocks(
  root: string,
  project: NovelProject,
  chapterId: string
): Promise<Array<{ title: string; content: string }>> {
  const chapters = orderedChapters(project);
  const targetIndex = chapters.findIndex((item) => item.id === chapterId);
  if (targetIndex === -1) return [];

  const adjacentChapters = [...chapters.slice(Math.max(0, targetIndex - 2), targetIndex), ...chapters.slice(targetIndex + 1, targetIndex + 2)];
  const adjacentIds = new Set(adjacentChapters.map((item) => item.id));
  const adjacentSummaries = (
    await Promise.all(adjacentChapters.map((chapter) => readChapterSummary(root, chapter.id)))
  ).filter((summary): summary is Partial<ChapterSummary> => Boolean(summary));

  const relatedChapterIds = new Set<string>();
  for (const entry of await readLedgerEntries(root)) {
    if (!entry.chapterIds?.includes(chapterId)) continue;
    for (const relatedId of entry.chapterIds) {
      if (relatedId !== chapterId && !adjacentIds.has(relatedId)) {
        relatedChapterIds.add(relatedId);
      }
    }
  }
  const relatedSummaries = (
    await Promise.all([...relatedChapterIds].slice(0, 6).map((relatedId) => readChapterSummary(root, relatedId)))
  ).filter((summary): summary is Partial<ChapterSummary> => Boolean(summary));

  const blocks: Array<{ title: string; content: string }> = [];
  if (adjacentSummaries.length) {
    blocks.push({ title: "相邻章节摘要", content: JSON.stringify(adjacentSummaries.map(compactSummary), null, 2) });
  }
  if (relatedSummaries.length) {
    blocks.push({ title: "相关远章摘要", content: JSON.stringify(relatedSummaries.map(compactSummary), null, 2) });
  }
  return blocks;
}

async function buildKnowledgeMemoryBlocks(
  root: string,
  project: NovelProject,
  chapterId: string
): Promise<Array<{ title: string; content: string }>> {
  const chapterIndex = await readOptionalJson<ChapterMemoryIndex>(root, "memory/chapter-index.json");
  const indexEntry = chapterIndex?.chapters.find((entry) => entry.chapterId === chapterId);
  if (!indexEntry || (!indexEntry.factIds.length && !indexEntry.tripleIds.length)) return [];

  const [facts, triples] = await Promise.all([
    readOptionalJsonl<KnowledgeFact>(root, "knowledge/facts.jsonl"),
    readOptionalJsonl<KnowledgeTriple>(root, "knowledge/triples.jsonl")
  ]);
  const factIds = new Set(indexEntry.factIds);
  const tripleIds = new Set(indexEntry.tripleIds);
  const selectedFacts = facts
    .filter((fact) => factIds.has(fact.id))
    .slice(0, 24)
    .map((fact) => ({
      id: fact.id,
      text: fact.text,
      chapterIds: fact.chapterIds,
      relatedEntities: fact.relatedEntities,
      keywords: fact.keywords.slice(0, 8),
      source: fact.source
    }));
  const selectedTriples = triples
    .filter((triple) => tripleIds.has(triple.id))
    .slice(0, 16)
    .map((triple) => ({
      id: triple.id,
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      chapterIds: triple.chapterIds
    }));
  const relatedQuery = [...indexEntry.entityNames, ...indexEntry.keywords].join(" ");
  const related = relatedQuery.trim()
    ? await searchKnowledgeIndex(root, project, { query: relatedQuery, chapterId, limit: 24 })
    : { facts: [], triples: [] };
  const relatedFacts = related.facts
    .filter((fact) => !factIds.has(fact.id))
    .slice(0, 12)
    .map((fact) => ({
      id: fact.id,
      text: fact.text,
      chapterIds: fact.chapterIds,
      relatedEntities: fact.relatedEntities,
      keywords: fact.keywords.slice(0, 8),
      source: fact.source,
      score: fact.score
    }));
  const relatedTriples = related.triples
    .filter((triple) => !tripleIds.has(triple.id))
    .slice(0, 8)
    .map((triple) => ({
      id: triple.id,
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      chapterIds: triple.chapterIds,
      score: triple.score
    }));

  if (!selectedFacts.length && !selectedTriples.length && !relatedFacts.length && !relatedTriples.length) return [];
  return [
    {
      title: "Knowledge Memory Index",
      content: JSON.stringify(
        {
          chapterId,
          keywords: indexEntry.keywords.slice(0, 24),
          entityNames: indexEntry.entityNames.slice(0, 24),
          facts: selectedFacts,
          triples: selectedTriples,
          relatedFacts,
          relatedTriples
        },
        null,
        2
      )
    }
  ];
}

export async function assembleContext(
  type: CodexTaskType,
  root: string,
  project: NovelProject,
  payload: Record<string, unknown>
): Promise<Array<{ title: string; content: string }>> {
  if (type === "project.create") {
    return [{ title: "默认小说约束", content: "长篇小说需要维护故事圣经、章纲、伏笔账本、升级节奏和 POV 边界。" }];
  }

  const blocks = [
    { title: "项目配置", content: JSON.stringify(project, null, 2) },
    { title: "文风规则", content: await readOptional(root, "style/style-guide.md") },
    { title: "角色档案", content: await readOptional(root, "bible/characters.md") },
    { title: "世界观", content: await readOptional(root, "bible/world.md") },
    { title: "力量体系", content: await readOptional(root, "bible/power-system.md") },
    { title: "故事总控台", content: await readOptional(root, "story-control/story-control.json") }
  ];

  if (broadContextTypes.includes(type)) {
    blocks.push(
      { title: "卷纲", content: await readOptional(root, "outline/volume-01.md") },
      { title: "伏笔账本", content: await readOptional(root, "ledger/foreshadowing.md") },
      { title: "升级节奏账本", content: await readOptional(root, "ledger/power-progression.md") }
    );
  }

  const chapterId = String(payload.chapterId || project.lastOpenedChapterId || "chapter-001");
  const chapter = project.chapters.find((item) => item.id === chapterId);
  if (chapter && cockpitContextTypes.includes(type)) {
    blocks.push(
      { title: "章节仪表盘", content: await readOptional(root, `dashboard/${chapter.id}.json`) },
      { title: "场景卡", content: await readOptional(root, `scenes/${chapter.id}.json`) },
      { title: "结构化伏笔账本", content: await readOptional(root, "ledger/foreshadowing.json") },
      { title: "结构化连续性风险", content: await readOptional(root, "ledger/continuity.json") },
      { title: "结构化升级节奏", content: await readOptional(root, "ledger/power-progression.json") },
      { title: "结构化角色状态", content: await readOptional(root, "ledger/character-state.json") },
      { title: "结构化风险账本", content: await readOptional(root, "ledger/risks.json") }
    );
  }

  if (chapter && memoryContextTypes.includes(type)) {
    blocks.push(...(await buildChapterMemoryBlocks(root, project, chapter.id)));
    blocks.push(...(await buildKnowledgeMemoryBlocks(root, project, chapter.id)));
  }

  if (chapter && targetChapterTypes.includes(type)) {
    blocks.push(
      { title: "目标章纲", content: await readOptional(root, chapter.outlinePath) },
      { title: "目标正文", content: await readOptional(root, chapter.contentPath) }
    );
  }

  if (type === "selection.polish") {
    const selection = payload.selection as SelectionPayload | undefined;
    blocks.push({
      title: "选区上下文",
      content: JSON.stringify(
        {
          mode: selection?.mode,
          beforeText: selection?.beforeText,
          selectedText: selection?.selectedText,
          afterText: selection?.afterText
        },
        null,
        2
      )
    });
  }

  return blocks.map((block) => ({ ...block, content: trimContext(block.content) }));
}

export function relativeTargetForChapter(project: NovelProject, chapterId?: string): string {
  const chapter = project.chapters.find((item) => item.id === chapterId);
  return chapter ? path.basename(chapter.contentPath) : "project";
}
