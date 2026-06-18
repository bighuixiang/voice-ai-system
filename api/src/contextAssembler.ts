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
import { buildCraftProfileBlock } from "./craftProfile.js";
import {
  buildContinuityReviewSkillBlock,
  buildLongNovelWriterContextBlock,
  describeNovelSkill,
  displayNovelPromptTitle,
  displayNovelRoleName,
  longNovelWriterPrompt,
  longNovelWriterRole,
  longNovelWriterSkill
} from "./novelSystemSkills.js";
import { readPlatformLibrarySnapshot } from "./platformLibrary.js";

type ContextTier = "T0" | "T1" | "T2" | "T3";

interface ContextBlock {
  title: string;
  content: string;
  tier?: ContextTier;
}

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

function contextTierForTitle(title: string): ContextTier {
  if (title === "Craft Profile") return "T0";
  if (["项目配置", "叙事承诺锁"].includes(title) || title.endsWith("题材 Profile")) return "T0";
  if (["文风规则", "角色档案", "世界观", "力量体系", "故事总控台", "章节仪表盘", "场景卡", "相邻章节摘要"].includes(title)) {
    return "T1";
  }
  if (
    [
      "卷纲",
      "伏笔账本",
      "升级节奏账本",
      "结构化伏笔账本",
      "结构化连续性风险",
      "结构化升级节奏",
      "结构化角色状态",
      "结构化风险账本",
      "相关远章摘要",
      "Knowledge Memory Index",
      "目标章纲"
    ].includes(title)
  ) {
    return "T2";
  }
  return "T3";
}

function contextLimitForTier(tier: ContextTier): number {
  const limits: Record<ContextTier, number> = {
    T0: 9000,
    T1: 5000,
    T2: 3600,
    T3: 2000
  };
  return limits[tier];
}

const broadContextTypes: CodexTaskType[] = [
  "outline.generate",
  "structure.reverse",
  "chapter.plan",
  "chapter.draft",
  "quality.rewrite",
  "continuity.check",
  "idea.suggest",
  "assistant.free"
];

const targetChapterTypes: CodexTaskType[] = ["structure.reverse", "chapter.plan", "chapter.draft", "quality.rewrite", "continuity.check", "idea.suggest", "assistant.free"];
const cockpitContextTypes: CodexTaskType[] = ["structure.reverse", "chapter.plan", "chapter.draft", "quality.rewrite", "continuity.check", "idea.suggest", "assistant.free"];
const memoryContextTypes: CodexTaskType[] = ["chapter.plan", "chapter.draft", "quality.rewrite", "writing.briefing", "writing.recap", "continuity.check", "idea.suggest"];

function orderedChapters(project: NovelProject): NovelChapter[] {
  return [...project.chapters].sort((a, b) => {
    const volumeOrderA = a.volumeOrder ?? 0;
    const volumeOrderB = b.volumeOrder ?? 0;
    if (volumeOrderA !== volumeOrderB) return volumeOrderA - volumeOrderB;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

const narrativePromiseKeywords = [
  "复仇",
  "封印",
  "尸王",
  "天狗食月",
  "穿越",
  "升级",
  "宗门",
  "血脉",
  "契约",
  "诡异",
  "悬疑",
  "成长",
  "救赎",
  "权谋",
  "末世",
  "系统"
];

function extractLabelValue(content: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = content.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:：]\\s*([^\\n]+)`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function sentencePreview(content: string, limit = 80): string {
  return content
    .replace(/\s+/g, " ")
    .replace(/^[-*#\s]+/, "")
    .slice(0, limit)
    .trim();
}

function chapterNumber(project: NovelProject, chapter?: NovelChapter): number | undefined {
  if (!chapter) return undefined;
  if (typeof chapter.order === "number" && chapter.order > 0) return chapter.order;
  const index = orderedChapters(project).findIndex((item) => item.id === chapter.id);
  if (index >= 0) return index + 1;
  const digitMatch = `${chapter.id} ${chapter.title}`.match(/(\d+)/);
  return digitMatch ? Number(digitMatch[1]) : undefined;
}

function buildNarrativePromiseBlock(project: NovelProject, chapter?: NovelChapter): { title: string; content: string } | undefined {
  const roughIdea = project.roughIdea?.trim() || "";
  const title = project.title?.trim() || "";
  if (!title && !project.genre?.trim() && !roughIdea) return undefined;

  const genreSignal = extractLabelValue(roughIdea, ["类型", "题材", "Genre"]) || project.genre?.trim() || "未指定";
  const coreConflict =
    extractLabelValue(roughIdea, ["核心冲突", "主线冲突", "核心矛盾", "故事冲突"]) || sentencePreview(roughIdea, 120) || "未提取";
  const openingHook = extractLabelValue(roughIdea, ["开篇钩子", "开场钩子", "开篇卖点", "Opening Hook"]) || sentencePreview(roughIdea, 80);
  const keywordSource = `${title} ${project.genre || ""} ${roughIdea}`;
  const keywords = narrativePromiseKeywords.filter((keyword) => keywordSource.includes(keyword)).slice(0, 8);
  const number = chapterNumber(project, chapter);
  const earlyStage = !number || number <= 12;

  const lines = [
    `书名承诺：${title || "未命名项目"}`,
    `类型信号：${genreSignal}`,
    `核心冲突：${coreConflict}`
  ];
  if (openingHook) lines.push(`开篇钩子：${openingHook}`);
  if (keywords.length) lines.push(`关键词锚点：${keywords.join("、")}`);
  lines.push(
    earlyStage
      ? "节奏约束：前 12 章只加压、揭一角、留代价；不要彻底平反、彻底解谜或让核心敌人无代价退场。"
      : "节奏约束：每章推进一个核心变化，其余悬念只推进半步，避免一次性消耗主线筹码。"
  );
  lines.push("写作约束：正文必须服务上述承诺；新增设定要回扣类型信号、核心冲突或开篇钩子。");

  return { title: "叙事承诺锁", content: lines.join("\n") };
}

interface GenreProfile {
  patterns?: string[];
  title: string;
  directives: string[];
  risks: string[];
}

const genreProfiles: GenreProfile[] = [
  {
    patterns: ["玄幻", "xuanhuan", "fantasy"],
    title: "玄幻题材 Profile",
    directives: ["升级必须有代价和前置条件。", "强者、宗门、血脉、封印等设定要落到具体冲突。", "每章至少推动目标、代价、情报或关系中的一项。"],
    risks: ["避免无成本顿悟。", "避免用大设定替代人物选择。", "避免开局过早解释终极世界观。"]
  },
  {
    patterns: ["悬疑", "suspense", "mystery"],
    title: "悬疑题材 Profile",
    directives: ["线索必须可追踪，但答案不能一次放完。", "每次揭示都要制造新的误判或更高代价。", "角色知道的信息不得超过其现场经验。"],
    risks: ["避免作者视角提前剧透。", "避免靠巧合推进调查。", "避免反派无痕退场。"]
  },
  {
    patterns: ["仙侠", "xianxia"],
    title: "仙侠题材 Profile",
    directives: ["道法、因果、宗门秩序要影响人物选择。", "突破要对应心境、资源、风险三者之一。", "奇观服务困境，不单独堆设定。"],
    risks: ["避免境界跳跃无铺垫。", "避免法宝万能。", "避免师门关系只做背景板。"]
  },
  {
    patterns: ["武侠", "wuxia"],
    title: "武侠题材 Profile",
    directives: ["江湖规则、门派恩怨、名声代价要进入场景。", "打斗必须改变关系或局势。", "侠义选择要有现实损失。"],
    risks: ["避免招式清单化。", "避免胜负没有后果。", "避免人物只按阵营行动。"]
  },
  {
    patterns: ["言情", "romance"],
    title: "言情题材 Profile",
    directives: ["关系推进要有误解、试探、退让或承认。", "外部事件必须折射情感位置变化。", "亲密感来自具体行动，不来自抽象表白。"],
    risks: ["避免强行撒糖。", "避免情绪反复无新信息。", "避免用误会替代真实价值冲突。"]
  },
  {
    patterns: ["科幻", "scifi", "科幻"],
    title: "科幻题材 Profile",
    directives: ["技术设定必须带来选择限制。", "每个新规则都要影响社会、身体或资源。", "奇观要落到人物当前困境。"],
    risks: ["避免概念解释过长。", "避免科技万能解法。", "避免忽略规则后果。"]
  }
];

function validGenreProfile(profile?: Partial<GenreProfile>): profile is GenreProfile {
  return Boolean(
    profile?.title?.trim() &&
      Array.isArray(profile.directives) &&
      profile.directives.some((item) => item.trim()) &&
      Array.isArray(profile.risks) &&
      profile.risks.some((item) => item.trim())
  );
}

function genreProfileBlock(profile: GenreProfile, source: string): { title: string; content: string } {
  return {
    title: profile.title,
    content: [
      `来源：${source}`,
      "题材执行指令：",
      ...profile.directives.filter((item) => item.trim()).map((item) => `- ${item.trim()}`),
      "题材风险：",
      ...profile.risks.filter((item) => item.trim()).map((item) => `- ${item.trim()}`)
    ].join("\n")
  };
}

async function buildGenreProfileBlock(root: string, project: NovelProject): Promise<{ title: string; content: string } | undefined> {
  const override = await readOptionalJson<Partial<GenreProfile>>(root, "bible/genre-profile.json");
  if (validGenreProfile(override)) {
    return genreProfileBlock(override, "项目题材 Profile");
  }

  const source = `${project.genre || ""} ${project.roughIdea || ""}`.toLowerCase();
  const profile = genreProfiles.find((item) => item.patterns?.some((pattern) => source.includes(pattern.toLowerCase())));
  return profile ? genreProfileBlock(profile, "内置题材 Profile") : undefined;
}

const novelSkillContextTypes: CodexTaskType[] = [
  "outline.generate",
  "structure.reverse",
  "chapter.plan",
  "chapter.draft",
  "writing.briefing",
  "writing.recap",
  "quality.rewrite",
  "continuity.check",
  "idea.suggest",
  "assistant.free"
];

const continuitySkillContextTypes: CodexTaskType[] = [
  "chapter.plan",
  "chapter.draft",
  "writing.briefing",
  "writing.recap",
  "quality.rewrite",
  "continuity.check",
  "assistant.free"
];

async function buildPlatformSkillBlocks(type: CodexTaskType): Promise<ContextBlock[]> {
  if (!novelSkillContextTypes.includes(type)) return [];

  const library = await readPlatformLibrarySnapshot().catch(() => undefined);
  if (!library) return [];

  const activeNovelSkills = library.skills.filter((skill) => skill.enabled && skill.tags.includes("novel"));
  if (!activeNovelSkills.length) return [];

  const blocks: ContextBlock[] = [
    {
      title: "Active Novel Skills",
      tier: "T1",
      content: activeNovelSkills.map((skill) => `- ${skill.name}: ${describeNovelSkill(skill.id, skill.description)}`).join("\n")
    }
  ];

  if (activeNovelSkills.some((skill) => skill.id === longNovelWriterSkill.id)) {
    const activeRole = library.roles.find((role) => role.id === longNovelWriterRole.id);
    const activePrompt = library.prompts.find((prompt) => prompt.id === longNovelWriterPrompt.id);
    blocks.unshift(
      buildLongNovelWriterContextBlock(
        displayNovelRoleName(activeRole?.id || "", activeRole?.name || longNovelWriterRole.name),
        displayNovelPromptTitle(activePrompt?.id || "", activePrompt?.title || longNovelWriterPrompt.title)
      )
    );
  }

  if (activeNovelSkills.some((skill) => skill.id === "skill-novel-continuity-check") && continuitySkillContextTypes.includes(type)) {
    blocks.push(buildContinuityReviewSkillBlock());
  }

  return blocks;
}

function emptyTierStats() {
  return {
    blockCount: 0,
    originalChars: 0,
    finalChars: 0,
    truncatedBlocks: [] as string[]
  };
}

function finalizeContextBlocks(blocks: ContextBlock[]): Array<{ title: string; content: string }> {
  const prepared = blocks.map((block) => {
    const tier = block.tier || contextTierForTitle(block.title);
    const limit = contextLimitForTier(tier);
    const originalLength = block.content.length;
    const content = trimContext(block.content, limit);
    return {
      title: block.title,
      content,
      tier,
      limit,
      originalLength,
      finalLength: content.length,
      truncated: content.length < originalLength
    };
  });
  const tiers: Record<ContextTier, ReturnType<typeof emptyTierStats>> = {
    T0: emptyTierStats(),
    T1: emptyTierStats(),
    T2: emptyTierStats(),
    T3: emptyTierStats()
  };
  for (const block of prepared) {
    const stats = tiers[block.tier];
    stats.blockCount += 1;
    stats.originalChars += block.originalLength;
    stats.finalChars += block.finalLength;
    if (block.truncated) stats.truncatedBlocks.push(block.title);
  }
  const budgetLog = {
    version: "context-budget:v2",
    blockCount: prepared.length,
    totalOriginalChars: prepared.reduce((sum, block) => sum + block.originalLength, 0),
    totalFinalChars: prepared.reduce((sum, block) => sum + block.finalLength, 0),
    tiers,
    blockPlan: prepared.map((block) => ({
      title: block.title,
      tier: block.tier,
      limit: block.limit,
      originalLength: block.originalLength,
      finalLength: block.finalLength,
      truncated: block.truncated
    })),
    truncatedBlocks: prepared
      .filter((block) => block.truncated)
      .map((block) => ({
        title: block.title,
        tier: block.tier,
        originalLength: block.originalLength,
        finalLength: block.finalLength,
        limit: block.limit
      })),
    allocationPolicy:
      "T0 critical 保留项目承诺和题材约束；T1 compressible 保留角色/世界/章节记忆；T2 dynamic 保留检索、账本和章纲；T3 sacrificial 压缩长正文和选区材料。",
    priorityHint: "T0: 项目配置/叙事承诺锁/题材 Profile；T1: 角色、世界观、故事总控台、章节记忆；T2: 检索事实、账本、目标章纲；T3: 目标正文、选区材料。"
  };
  return [
    ...prepared.map((block) => ({ title: block.title, content: block.content })),
    { title: "上下文预算日志", content: JSON.stringify(budgetLog, null, 2) }
  ];
}

function hasSummarySignal(summary: Partial<ChapterSummary>): boolean {
  return Boolean(
    summary.summary?.trim() ||
      summary.keyEvents?.length ||
      summary.newFacts?.length ||
      summary.characterStateChanges?.length ||
      summary.emotionLedger?.wounds?.length ||
      summary.emotionLedger?.boons?.length ||
      summary.emotionLedger?.powerShifts?.length ||
      summary.emotionLedger?.openLoops?.length ||
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
    emotionLedger: summary.emotionLedger
      ? {
          wounds: summary.emotionLedger.wounds?.map((item) => ({
            characterName: item.characterName,
            description: item.description,
            status: item.status
          })),
          boons: summary.emotionLedger.boons?.map((item) => ({
            characterName: item.characterName,
            description: item.description,
            status: item.status
          })),
          powerShifts: summary.emotionLedger.powerShifts?.map((item) => ({
            characterName: item.characterName,
            description: item.description,
            status: item.status
          })),
          openLoops: summary.emotionLedger.openLoops?.map((item) => ({
            characterName: item.characterName,
            description: item.description,
            status: item.status
          }))
        }
      : undefined,
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

  const chapterId = String(payload.chapterId || project.lastOpenedChapterId || "chapter-001");
  const chapter = project.chapters.find((item) => item.id === chapterId);
  const narrativePromiseBlock = buildNarrativePromiseBlock(project, chapter);
  const genreProfileBlock = await buildGenreProfileBlock(root, project);
  const craftProfileBlock = await buildCraftProfileBlock(root, project);
  const platformSkillBlocks = await buildPlatformSkillBlocks(type);
  const blocks = [
    { title: "项目配置", content: JSON.stringify(project, null, 2) },
    ...(narrativePromiseBlock ? [narrativePromiseBlock] : []),
    ...(genreProfileBlock ? [genreProfileBlock] : []),
    craftProfileBlock,
    ...platformSkillBlocks,
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

  if (type === "quality.rewrite" && chapter) {
    blocks.push({
      title: "Quality Rewrite Targets",
      content: JSON.stringify(
        {
          targetScore: payload.targetScore,
          maxScore: payload.maxScore,
          targetMetrics: payload.targetMetrics,
          mode: payload.mode,
          qualityReport: payload.currentQualityReport || (await readOptionalJson(root, `quality/${chapter.id}.json`))
        },
        null,
        2
      )
    });
  }

  return finalizeContextBlocks(blocks);
}

export function relativeTargetForChapter(project: NovelProject, chapterId?: string): string {
  const chapter = project.chapters.find((item) => item.id === chapterId);
  return chapter ? path.basename(chapter.contentPath) : "project";
}
