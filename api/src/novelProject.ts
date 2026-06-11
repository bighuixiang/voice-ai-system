import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterDashboard,
  ChapterSummary,
  NovelChapter,
  NovelProject,
  StoryArc,
  StoryCharacterProfile,
  StoryControl,
  StoryEventCard,
  StoryEventType
} from "./types.js";
import { getNovelsRoot } from "./workspace.js";
import { resolveInside } from "./pathSafety.js";
import { deleteProjectRecord, upsertProjectRecord } from "./database.js";
import { defaultStoryControl } from "./writingCockpit.js";

function nowIso(): string {
  return new Date().toISOString();
}

const importFileLimit = 500;
const importFileSizeLimit = 500 * 1024;
const importableExtensions = new Set([".md", ".txt"]);
const ignoredImportDirectories = new Set([
  ".git",
  ".claude",
  ".codex",
  ".kiro",
  ".playwright-mcp",
  ".tmp",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "docs",
  "企业文化日"
]);

interface ImportableFile {
  relativePath: string;
  absolutePath?: string;
  content: string;
}

export interface UploadedImportFile {
  relativePath: string;
  content: string;
}

interface ImportedChapterFile extends ImportableFile {
  chapterNumber: number;
  order: number;
  volumeId?: string;
  volumeTitle?: string;
  volumeOrder?: number;
}

interface ImportedPlannedChapter {
  chapterNumber: number;
  order: number;
  title: string;
  outlineContent: string;
  sourcePath: string;
  volumeId?: string;
  volumeTitle?: string;
  volumeOrder?: number;
}

type ImportedChapterSource =
  | { kind: "drafted"; file: ImportedChapterFile }
  | { kind: "planned"; plan: ImportedPlannedChapter };

export function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return ascii || `novel-${Date.now()}`;
}

export function createDefaultChapters(count = 3): NovelChapter[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return {
      id: `chapter-${number}`,
      title: `第 ${index + 1} 章`,
      outlinePath: `outline/chapter-${number}.md`,
      contentPath: `chapters/chapter-${number}.md`,
      status: "empty"
    };
  });
}

export function createDefaultModules() {
  return [
    { key: "novel" as const, label: "Novel Writing", status: "active" as const },
    { key: "assets" as const, label: "Asset Management", status: "planned" as const },
    { key: "script" as const, label: "Script Production", status: "planned" as const },
    { key: "image-generation" as const, label: "Image Generation", status: "planned" as const },
    { key: "video-generation" as const, label: "Video Generation", status: "planned" as const }
  ];
}

function createDefaultChapterDashboard(chapterId: string): ChapterDashboard {
  return {
    chapterId,
    goal: "",
    pov: "",
    mainConflict: "",
    endingHook: "",
    wordCount: 0,
    status: "empty",
    unresolvedForeshadowingIds: [],
    continuityRiskIds: [],
    updatedAt: nowIso()
  };
}

function createDefaultChapterSummary(chapterId: string): ChapterSummary {
  return {
    chapterId,
    summary: "",
    keyEvents: [],
    newFacts: [],
    characterStateChanges: [],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    acceptedRecapIds: [],
    updatedAt: nowIso()
  };
}

export function createProjectSkeleton(input: { title?: string; roughIdea: string; genre?: string }): NovelProject {
  const title = input.title?.trim() || "未命名小说";
  const timestamp = nowIso();
  const slug = slugify(title);
  return {
    id: slug,
    slug,
    title,
    genre: input.genre?.trim() || "未定",
    roughIdea: input.roughIdea.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedChapterId: "chapter-001",
    codex: {
      command: process.env.CODEX_COMMAND || "codex",
      model: process.env.CODEX_MODEL
    },
    ai: {
      profileId: process.env.AI_AGENT_PROFILE_ID || "codex-cli",
      modelId: process.env.CODEX_MODEL
    },
    modules: createDefaultModules(),
    chapters: createDefaultChapters()
  };
}

export async function createUniqueProjectSkeleton(input: {
  title?: string;
  roughIdea: string;
  genre?: string;
}): Promise<NovelProject> {
  const project = createProjectSkeleton(input);
  const baseSlug = project.slug;
  let candidateSlug = baseSlug;
  let suffix = 2;

  while (
    await fs
      .access(path.join(getNovelsRoot(), candidateSlug, "project.json"))
      .then(() => true)
      .catch(() => false)
  ) {
    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return {
    ...project,
    id: candidateSlug,
    slug: candidateSlug
  };
}

export function projectRoot(projectId: string): string {
  return path.join(getNovelsRoot(), slugify(projectId));
}

export async function readProject(projectId: string): Promise<NovelProject> {
  const root = projectRoot(projectId);
  const raw = await fs.readFile(path.join(root, "project.json"), "utf8");
  const project = JSON.parse(raw) as NovelProject;
  project.codex ||= {
    command: process.env.CODEX_COMMAND || "codex",
    model: process.env.CODEX_MODEL
  };
  project.ai ||= {
    profileId: process.env.AI_AGENT_PROFILE_ID || "codex-cli",
    modelId: project.codex.model
  };
  return project;
}

export async function writeProject(project: NovelProject): Promise<void> {
  const root = projectRoot(project.slug);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  upsertProjectRecord(project, root);
}

export async function deleteProject(projectId: string): Promise<string> {
  const slug = slugify(projectId);
  const root = projectRoot(slug);
  try {
    await fs.access(path.join(root, "project.json"));
  } catch {
    throw new Error(`Project not found: ${projectId}`);
  }

  await fs.rm(root, { recursive: true, force: true });
  deleteProjectRecord(slug);
  return slug;
}

export async function createProjectFiles(project: NovelProject): Promise<void> {
  const root = projectRoot(project.slug);
  for (const dir of [
    "bible",
    "story-control",
    "outline",
    "chapters",
    "dashboard",
    "scenes",
    "ledger",
    "memory/chapter-summaries",
    "knowledge",
    "quality",
    "story-graph",
    "style",
    "tasks",
    "assets/characters",
    "assets/props",
    "assets/scenes",
    "assets/frames",
    "assets/videos",
    "scripts",
    "relations",
    "prompts"
  ]) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
  }

  await writeProject(project);
  const defaults: Record<string, string> = {
    "style/style-guide.md": "# 文风规则\n\n- 逻辑因果优先于辞藻。\n- POV 诚实，角色不能知道当前视角外的信息。\n- 升级必须有触发、代价、限制或后果。\n",
    "bible/characters.md": "# 角色档案\n\n## 主角\n\n- 初始状态：待补充\n- 当前认知：只知道亲历和被告知的事实\n",
    "bible/world.md": "# 世界观\n\n待补充。\n",
    "bible/power-system.md": "# 力量体系\n\n- 当前能力：无\n- 下一阶段：待规划\n",
    "bible/locations.md": "# 重要地点\n\n待补充。\n",
    "outline/volume-01.md": "# 第一卷大纲\n\n待生成。\n",
    "ledger/foreshadowing.md": "# 伏笔账本\n\n| 伏笔 | 埋设章节 | 回收章节 | 状态 |\n| --- | --- | --- | --- |\n",
    "ledger/continuity.md": "# 连续性检查\n\n暂无记录。\n",
    "ledger/power-progression.md": "# 升级节奏账本\n\n| 阶段 | 能力 | 触发 | 代价 | 限制 |\n| --- | --- | --- | --- | --- |\n",
    "ledger/foreshadowing.json": "[]\n",
    "ledger/continuity.json": "[]\n",
    "ledger/power-progression.json": "[]\n",
    "ledger/character-state.json": "[]\n",
    "ledger/risks.json": "[]\n",
    "knowledge/facts.jsonl": "",
    "knowledge/triples.jsonl": "",
    "memory/chapter-index.json": `${JSON.stringify({ projectSlug: project.slug, chapters: [], keywords: {}, updatedAt: nowIso() }, null, 2)}\n`,
    "story-graph/storyline.json": `${JSON.stringify({ projectSlug: project.slug, nodes: [], edges: [], updatedAt: nowIso() }, null, 2)}\n`,
    "assets/README.md": "# Asset Management\n\nCharacters, props, scenes, frame references, and generated media will be managed here in later platform modules.\n",
    "scripts/README.md": "# Script Production\n\nScripts and shot plans will be managed here in later platform modules.\n",
    "relations/asset-links.json": `${JSON.stringify({ projectSlug: project.slug, links: [] }, null, 2)}\n`,
    "relations/story-asset-map.md": "# Story Asset Map\n\nTrack how characters, props, scenes, and generated media relate to chapters and plot beats.\n",
    "prompts/project-prompts.md": "# Project Prompts\n\nProject-specific prompt notes, expert role overrides, and reusable generation instructions.\n",
    "tasks/history.jsonl": "",
    "tasks/invocations.jsonl": "",
    "tasks/recaps.jsonl": "",
    "tasks/background-jobs.jsonl": "",
    "story-control/story-control.json": `${JSON.stringify(defaultStoryControl(), null, 2)}\n`
  };

  for (const [relativePath, content] of Object.entries(defaults)) {
    await fs.writeFile(resolveInside(root, relativePath), content, "utf8");
  }

  for (const chapter of project.chapters) {
    await fs.writeFile(resolveInside(root, chapter.outlinePath), `# ${chapter.title}章纲\n\n待规划。\n`, "utf8");
    await fs.writeFile(resolveInside(root, chapter.contentPath), `# ${chapter.title}\n\n`, "utf8");
    await fs.writeFile(
      resolveInside(root, `dashboard/${chapter.id}.json`),
      `${JSON.stringify(createDefaultChapterDashboard(chapter.id), null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(resolveInside(root, `scenes/${chapter.id}.json`), "[]\n", "utf8");
    await fs.writeFile(
      resolveInside(root, `memory/chapter-summaries/${chapter.id}.json`),
      `${JSON.stringify(createDefaultChapterSummary(chapter.id), null, 2)}\n`,
      "utf8"
    );
  }
}

function sanitizeImportedSegment(input: string): string {
  return (
    input
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "imported-file"
  );
}

function importedPathFor(relativePath: string): string {
  const parsed = path.parse(relativePath.replace(/\\/g, "/"));
  const dir = parsed.dir
    .split("/")
    .filter(Boolean)
    .map(sanitizeImportedSegment)
    .join("/");
  const fileName = `${sanitizeImportedSegment(parsed.name)}.md`;
  return dir ? `imports/${dir}/${fileName}` : `imports/${fileName}`;
}

function normalizedImportPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function pathSegments(relativePath: string): string[] {
  return normalizedImportPath(relativePath).split("/").filter(Boolean);
}

function shouldSkipImportPath(relativePath: string): boolean {
  return pathSegments(relativePath).some((segment) => ignoredImportDirectories.has(segment));
}

function isChapterCardCandidateV2(relativePath: string): boolean {
  const text = normalizedImportPath(relativePath).toLowerCase();
  return /章节卡|分章卡|逐章|蓝图|质检|验收|复盘|改稿|重构分章卡|chapter-card|beat-sheet/.test(text);
}

function isProductionScriptOrMediaFile(relativePath: string): boolean {
  const text = normalizedImportPath(relativePath);
  return /(^|\/)(04-剧本|剧本|scripts?|video|视频|分镜|镜头)(\/|$)|剧本|即梦|提示词|统一画风|文生图|AI视频|视频生成|分镜|镜头/.test(text);
}

function parseArabicNumber(input: string): number | null {
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : null;
}

function parseChineseNumber(input: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (/^\d+$/.test(input)) return parseArabicNumber(input);
  if (!/^[零一二两三四五六七八九十百]+$/.test(input)) return null;
  if (input === "十") return 10;

  let total = 0;
  const hundredIndex = input.indexOf("百");
  let rest = input;
  if (hundredIndex >= 0) {
    const hundredText = input.slice(0, hundredIndex);
    total += (digits[hundredText] || 1) * 100;
    rest = input.slice(hundredIndex + 1);
  }

  const tenIndex = rest.indexOf("十");
  if (tenIndex >= 0) {
    const tenText = rest.slice(0, tenIndex);
    total += (digits[tenText] || 1) * 10;
    const onesText = rest.slice(tenIndex + 1);
    if (onesText) total += digits[onesText] || 0;
    return total || null;
  }

  if (rest.length > 1) {
    return [...rest].reduce((value, char) => value * 10 + (digits[char] || 0), 0) || null;
  }
  return total + (digits[rest] || 0) || null;
}

function parseNumberToken(token?: string): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return parseArabicNumber(token);
  return parseChineseNumber(token);
}

function chapterNumberFromPath(relativePath: string): number | null {
  const text = normalizedImportPath(relativePath);
  const titleMatch = text.match(/第\s*([0-9零一二两三四五六七八九十百]+)\s*[章节]/);
  if (titleMatch) return parseNumberToken(titleMatch[1]);

  const parsed = path.parse(text);
  const leadingNumber = parsed.name.match(/(^|[-_\s])(\d{1,4})(?=[-_\s.、]|$)/);
  return parseNumberToken(leadingNumber?.[2]);
}

function isChapterBodyCandidateV2(relativePath: string): boolean {
  if (isChapterCardCandidateV2(relativePath)) return false;
  if (isProductionScriptOrMediaFile(relativePath)) return false;
  const text = normalizedImportPath(relativePath).toLowerCase();
  const hasChapterNumber = chapterNumberFromPath(relativePath) !== null;
  const inChapterFolder = /(^|\/)(03-章节正文|章节正文|正文|chapters?)(\/|$)/i.test(text);
  if (inChapterFolder && hasChapterNumber) return true;
  return /(^|\/)chapter[-_\s]*\d{1,4}/i.test(text);
}

function volumeMetaFromPath(relativePath: string, chapterNumber: number) {
  const segments = pathSegments(relativePath);
  const volumeSegment = segments.find((segment) => /卷|volume/i.test(segment));
  if (!volumeSegment) {
    const inferredStart = Math.floor((Math.max(1, chapterNumber) - 1) / 50) * 50 + 1;
    const inferredEnd = inferredStart + 49;
    return {
      volumeId: `volume-${String(inferredStart).padStart(3, "0")}`,
      volumeTitle: `第${inferredStart}-${inferredEnd}章`,
      volumeOrder: inferredStart
    };
  }

  const token = volumeSegment.match(/第\s*([0-9零一二两三四五六七八九十百]+)\s*卷/)?.[1];
  const volumeOrder = parseNumberToken(token) || chapterNumber;
  return {
    volumeId: sanitizeImportedSegment(volumeSegment),
    volumeTitle: volumeSegment,
    volumeOrder
  };
}

function volumeMetaFromPlanPath(relativePath: string, chapterNumber: number) {
  const range = rangeFromText(relativePath);
  if (range) {
    return {
      volumeId: sanitizeImportedSegment(range),
      volumeTitle: range,
      volumeOrder: rangeStart(range, chapterNumber)
    };
  }
  return volumeMetaFromPath(relativePath, chapterNumber);
}

function titleFromChapterPlanBlock(block: string, chapterNumber: number): string {
  const explicit = block.match(/章节号与标题[：:]\s*第\s*[0-9零一二两三四五六七八九十百]+\s*章[《「“"]?([^》」”"\r\n]+)/);
  if (explicit?.[1]) return `第${chapterNumber}章 ${explicit[1].trim()}`.slice(0, 80);

  const heading = block.match(/^\s*#+\s*(第\s*[0-9零一二两三四五六七八九十百]+\s*章[^\r\n]*)/m);
  if (heading?.[1]) {
    return heading[1]
      .replace(/章节卡|分章卡|蓝图/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  return `第${chapterNumber}章`;
}

function extractPlannedChaptersFromFile(file: ImportableFile): ImportedPlannedChapter[] {
  const text = file.content;
  if (!isChapterCardCandidateV2(file.relativePath) && !/第\s*[0-9零一二两三四五六七八九十百]+\s*章章节卡/.test(text)) {
    return [];
  }

  const plans: ImportedPlannedChapter[] = [];
  const blockPattern =
    /(?:^|\n)(#{1,4}\s*第\s*([0-9零一二两三四五六七八九十百]+)\s*章[^\n]*(?:章节卡|分章卡|蓝图)?[\s\S]*?)(?=\n#{1,4}\s*第\s*[0-9零一二两三四五六七八九十百]+\s*章|$)/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text))) {
    const chapterNumber = parseNumberToken(match[2]);
    if (!chapterNumber) continue;
    const block = match[1].trim();
    const headingLine = block.split(/\r?\n/, 1)[0] || "";
    if (/第\s*[0-9零一二两三四五六七八九十百]+\s*[-－~至到]\s*[0-9零一二两三四五六七八九十百]+\s*章/.test(headingLine)) {
      continue;
    }
    const volumeMeta = volumeMetaFromPlanPath(file.relativePath, chapterNumber);
    const title = titleFromChapterPlanBlock(block, chapterNumber);
    plans.push({
      chapterNumber,
      order: chapterNumber,
      title,
      outlineContent: `# ${title}\n\nImported planning source: ${file.relativePath}\n\n${block}\n`,
      sourcePath: file.relativePath,
      ...volumeMeta
    });
  }
  return plans;
}

function dedupeChapterFiles(files: ImportedChapterFile[]): ImportedChapterFile[] {
  const byNumber = new Map<number, ImportedChapterFile>();
  for (const file of files) {
    if (!byNumber.has(file.chapterNumber)) {
      byNumber.set(file.chapterNumber, file);
    }
  }
  return [...byNumber.values()];
}

function dedupePlannedChapters(plans: ImportedPlannedChapter[], draftedNumbers: Set<number>): ImportedPlannedChapter[] {
  const byNumber = new Map<number, ImportedPlannedChapter>();
  for (const plan of plans) {
    if (draftedNumbers.has(plan.chapterNumber) || byNumber.has(plan.chapterNumber)) continue;
    byNumber.set(plan.chapterNumber, plan);
  }
  return [...byNumber.values()];
}

function chapterSourceOrder(source: ImportedChapterSource): number {
  return source.kind === "drafted" ? source.file.order : source.plan.order;
}

function chapterSourceNumber(source: ImportedChapterSource): number {
  return source.kind === "drafted" ? source.file.chapterNumber : source.plan.chapterNumber;
}

function classifySupportFileV2(relativePath: string): string {
  const normalized = normalizedImportPath(relativePath).toLowerCase();
  if (normalized.includes("character") || /角色|人物|双女主|反派|小伙伴|魔兽/.test(relativePath)) {
    return "bible/characters.md";
  }
  if (normalized.includes("world") || /世界观|世界|设定|种族|宗门|学院/.test(relativePath)) {
    return "bible/world.md";
  }
  if (normalized.includes("power") || /力量|修炼|升级|境界|道法|密语/.test(relativePath)) {
    return "bible/power-system.md";
  }
  if (normalized.includes("location") || /地点|地图|地理|秘境|场景/.test(relativePath)) {
    return "bible/locations.md";
  }
  if (normalized.includes("style") || /文风|口吻|语气|写作规范/.test(relativePath)) {
    return "style/style-guide.md";
  }
  if (normalized.includes("foreshadow") || /伏笔|线索/.test(relativePath)) {
    return "ledger/foreshadowing.md";
  }
  if (normalized.includes("continuity") || /连续|校对|事件年表|时间线|年表/.test(relativePath)) {
    return "ledger/continuity.md";
  }
  if (normalized.includes("outline") || /大纲|规划|主线|章节卡|分章卡|蓝图|ACTIVE|入口|README/.test(relativePath)) {
    return "outline/volume-01.md";
  }
  return importedPathFor(relativePath);
}

function titleFromImportedFile(relativePath: string, content: string, index: number): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line && line !== "---" && !/^\w+:\s*/.test(line));
  if (heading) return heading.slice(0, 60);

  const baseName = path.basename(relativePath, path.extname(relativePath)).trim();
  return baseName || `Chapter ${index}`;
}

function makeImportId(prefix: string, seed: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, "0")}-${sanitizeImportedSegment(seed).slice(0, 32)}`;
}

function meaningfulLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter((line) => line && line !== "---" && !/^\w+:\s*/.test(line));
}

function summarizeContent(content: string, maxLength = 180): string {
  const summary = meaningfulLines(content).slice(0, 5).join(" ");
  return summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary;
}

function titleFromPathOrContent(file: ImportableFile, index: number): string {
  return titleFromImportedFile(file.relativePath, file.content, index + 1);
}

function rangeFromText(text: string): string {
  const rangeMatch = text.match(/第\s*([0-9零一二两三四五六七八九十百]+)\s*[-至到~－]\s*([0-9零一二两三四五六七八九十百]+)\s*章/);
  if (rangeMatch) return `第${rangeMatch[1]}-${rangeMatch[2]}章`;

  const singleMatch = text.match(/第\s*([0-9零一二两三四五六七八九十百]+)\s*章/);
  if (singleMatch) return `第${singleMatch[1]}章`;

  return "";
}

function rangeStart(range: string, fallback: number): number {
  const match = range.match(/第\s*([0-9零一二两三四五六七八九十百]+)\s*/);
  return parseNumberToken(match?.[1]) || fallback;
}

function isCharacterProfileFile(file: ImportableFile): boolean {
  const relativePath = normalizedImportPath(file.relativePath);
  if (!/(^|\/)01-角色设定(\/|$)|角色|人物|双女主|反派|小伙伴|魔兽/.test(relativePath)) return false;
  return !/关系图|外貌|AI绘画|图片|参考|总览|README|SKILL/i.test(relativePath);
}

function roleFromPath(relativePath: string): string {
  const segments = pathSegments(relativePath);
  const roleRootIndex = segments.findIndex((segment) => segment.includes("角色设定"));
  if (roleRootIndex >= 0 && segments[roleRootIndex + 1]) return segments[roleRootIndex + 1];
  return segments.length > 1 ? segments.at(-2) || "角色" : "角色";
}

function characterNameFromFile(file: ImportableFile, index: number): string {
  const title = titleFromPathOrContent(file, index);
  const fallback = path.basename(file.relativePath, path.extname(file.relativePath));
  return (title || fallback)
    .replace(/^第\s*[0-9零一二两三四五六七八九十百]+\s*[章节]\s*/, "")
    .replace(/[-_](完整版|设定|人物卡|角色卡).*$/i, "")
    .trim()
    .slice(0, 40) || fallback;
}

function outlinePriority(file: ImportableFile): number {
  const relativePath = normalizedImportPath(file.relativePath);
  if (/ACTIVE|入口/i.test(relativePath)) return 0;
  if (/整体重构|整体规划|全文|总纲/.test(relativePath)) return 1;
  if (/第\s*[0-9零一二两三四五六七八九十百]+\s*[-至到~－]\s*[0-9零一二两三四五六七八九十百]+\s*章/.test(relativePath)) return 2;
  if (/章节卡|分章卡|蓝图|主线|大纲|规划/.test(relativePath)) return 3;
  return 9;
}

function isOutlineControlFile(file: ImportableFile): boolean {
  const relativePath = normalizedImportPath(file.relativePath);
  return /(^|\/)02-故事大纲(\/|$)|大纲|规划|主线|章节卡|分章卡|蓝图|ACTIVE|入口/.test(relativePath);
}

function eventTypeFromFile(file: ImportableFile): StoryEventType {
  const text = `${file.relativePath}\n${file.content.slice(0, 1200)}`;
  if (/秘境|副本|试炼/.test(text)) return "dungeon";
  if (/团战|大战|战役|围攻/.test(text)) return "team-fight";
  if (/修炼|训练|突破|升级/.test(text)) return "training";
  if (/揭露|真相|秘密|身份/.test(text)) return "reveal";
  return "event";
}

function isEventControlFile(file: ImportableFile): boolean {
  const relativePath = normalizedImportPath(file.relativePath);
  return /(^|\/)05-事件年表(\/|$)|事件|年表|时间线|秘境|副本|团战|试炼/.test(relativePath);
}

function buildImportedStoryControl(files: ImportableFile[], chapters: ImportedChapterFile[]): StoryControl {
  const now = nowIso();
  const defaults = defaultStoryControl();
  const outlineFiles = files
    .filter(isOutlineControlFile)
    .sort((left, right) => outlinePriority(left) - outlinePriority(right) || left.relativePath.localeCompare(right.relativePath, "zh-Hans-CN"))
    .slice(0, 24);
  const characterFiles = files.filter(isCharacterProfileFile).slice(0, 80);
  const eventFiles = files.filter(isEventControlFile).slice(0, 40);

  const arcs: StoryArc[] = outlineFiles.map((file, index) => {
    const title = titleFromPathOrContent(file, index);
    const chapterRange = rangeFromText(`${file.relativePath}\n${file.content}`) || (chapters.length ? `第${chapters[0].chapterNumber}-${chapters.at(-1)?.chapterNumber || chapters[0].chapterNumber}章` : "");
    return {
      id: makeImportId("arc", file.relativePath, index),
      title,
      chapterRange,
      goal: summarizeContent(file.content, 220),
      stakes: "",
      payoff: "",
      status: index === 0 ? "active" : "planned",
      updatedAt: now
    };
  });

  arcs.sort((left, right) => rangeStart(left.chapterRange, 9999) - rangeStart(right.chapterRange, 9999));

  const characters: StoryCharacterProfile[] = characterFiles.map((file, index) => ({
    id: makeImportId("char", file.relativePath, index),
    name: characterNameFromFile(file, index),
    role: roleFromPath(file.relativePath),
    goal: summarizeContent(file.content, 160),
    currentState: summarizeContent(file.content, 220),
    knownSecrets: "",
    relationshipNotes: "",
    powerLevel: /修为|境界|实力|战力|魔兽/.test(file.content) ? summarizeContent(file.content, 120) : "",
    status: "planned",
    updatedAt: now
  }));

  const events: StoryEventCard[] = eventFiles.map((file, index) => ({
    id: makeImportId("event", file.relativePath, index),
    type: eventTypeFromFile(file),
    title: titleFromPathOrContent(file, index),
    trigger: summarizeContent(file.content, 160),
    participants: [],
    location: "",
    conflict: summarizeContent(file.content, 180),
    reward: "",
    cost: "",
    foreshadowing: "",
    chapterRange: rangeFromText(`${file.relativePath}\n${file.content}`),
    status: "planned",
    updatedAt: now
  }));

  const premiseSource = outlineFiles.find((file) => /ACTIVE|入口|整体|总纲|规划/.test(file.relativePath)) || outlineFiles[0];
  return {
    version: 1,
    premise: premiseSource ? summarizeContent(premiseSource.content, 260) : defaults.premise,
    currentArcId: arcs[0]?.id || defaults.currentArcId,
    arcs: arcs.length ? arcs : defaults.arcs,
    characters: characters.length ? characters : defaults.characters,
    events: events.length ? events : defaults.events,
    orchestrationNotes: "Imported project structure was inferred from outline, character, event, and timeline files. Review uncertain items before long-running AI orchestration.",
    updatedAt: now
  };
}

function isChapterCandidate(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return (
    normalized.includes("chapter") ||
    normalized.includes("chapters") ||
    /(^|[\\/])\d{1,4}[^\\/]*\.(md|txt)$/i.test(relativePath) ||
    /第\s*\d+\s*[章节章]/.test(relativePath)
  );
}

function classifySupportFile(relativePath: string): string {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes("character") || relativePath.includes("人物") || relativePath.includes("角色")) {
    return "bible/characters.md";
  }
  if (normalized.includes("world") || relativePath.includes("世界") || relativePath.includes("设定")) {
    return "bible/world.md";
  }
  if (normalized.includes("power") || relativePath.includes("力量") || relativePath.includes("升级")) {
    return "bible/power-system.md";
  }
  if (normalized.includes("location") || relativePath.includes("地点") || relativePath.includes("地图")) {
    return "bible/locations.md";
  }
  if (normalized.includes("style") || relativePath.includes("文风")) {
    return "style/style-guide.md";
  }
  if (normalized.includes("foreshadow") || relativePath.includes("伏笔")) {
    return "ledger/foreshadowing.md";
  }
  if (normalized.includes("continuity") || relativePath.includes("连续") || relativePath.includes("校对")) {
    return "ledger/continuity.md";
  }
  if (normalized.includes("outline") || relativePath.includes("大纲") || relativePath.includes("纲")) {
    return "outline/volume-01.md";
  }
  return importedPathFor(relativePath);
}

function titleFromFile(relativePath: string, content: string, index: number): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (heading) return heading.slice(0, 60);

  const baseName = path.basename(relativePath, path.extname(relativePath)).trim();
  return baseName || `Chapter ${index}`;
}

async function collectImportableFiles(sourceRoot: string): Promise<string[]> {
  const result: string[] = [];

  async function visit(directory: string): Promise<void> {
    if (result.length >= importFileLimit) return;

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= importFileLimit) break;
      if (ignoredImportDirectories.has(entry.name)) continue;

      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (entry.isFile() && importableExtensions.has(path.extname(entry.name).toLowerCase())) {
        result.push(absolutePath);
      }
    }
  }

  await visit(sourceRoot);
  return result.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function normalizeUploadedRelativePath(relativePath: string): string {
  return normalizedImportPath(relativePath).replace(/^\/+/, "");
}

function stripCommonUploadRoot(files: ImportableFile[]): { files: ImportableFile[]; commonRoot?: string } {
  const firstSegments = files
    .map((file) => pathSegments(file.relativePath))
    .filter((segments) => segments.length > 1)
    .map((segments) => segments[0]);
  const commonRoot = firstSegments[0];
  if (!commonRoot || !firstSegments.every((segment) => segment === commonRoot)) {
    return { files };
  }

  return {
    commonRoot,
    files: files.map((file) => ({
      ...file,
      relativePath: pathSegments(file.relativePath).slice(1).join("/")
    }))
  };
}

async function importProjectFromImportableFiles(input: {
  files: ImportableFile[];
  sourceRoot: string;
  title?: string;
  genre?: string;
  roughIdea?: string;
}): Promise<NovelProject> {
  if (input.files.length === 0) {
    throw new Error("Import source does not contain .md or .txt files");
  }

  const sourceRoot = input.sourceRoot;
  const title = input.title?.trim() || path.basename(sourceRoot) || "Imported Novel";
  const project = await createUniqueProjectSkeleton({
    title,
    genre: input.genre,
    roughIdea: input.roughIdea || `Imported from local directory: ${sourceRoot}`
  });

  const allImportedFiles: ImportableFile[] = [];
  const chapterFiles: ImportedChapterFile[] = [];
  const plannedChapterFiles: ImportedPlannedChapter[] = [];
  const supportFiles = new Map<string, Array<{ relativePath: string; content: string }>>();

  for (const importedFile of input.files) {
    const { relativePath, content } = importedFile;
    if (shouldSkipImportPath(relativePath)) continue;
    allImportedFiles.push(importedFile);
    plannedChapterFiles.push(...extractPlannedChaptersFromFile(importedFile));

    if (isChapterBodyCandidateV2(relativePath)) {
      const chapterNumber = chapterNumberFromPath(relativePath) || chapterFiles.length + 1;
      const volumeMeta = volumeMetaFromPath(relativePath, chapterNumber);
      chapterFiles.push({
        ...importedFile,
        chapterNumber,
        order: chapterNumber,
        ...volumeMeta
      });
      continue;
    }

    const target = classifySupportFileV2(relativePath);
    const items = supportFiles.get(target) || [];
    items.push({ relativePath, content });
    supportFiles.set(target, items);
  }

  chapterFiles.sort((left, right) => left.order - right.order || left.relativePath.localeCompare(right.relativePath, "zh-Hans-CN"));
  const draftedChapterFiles = dedupeChapterFiles(chapterFiles);
  const plannedChapters = dedupePlannedChapters(
    plannedChapterFiles,
    new Set(draftedChapterFiles.map((file) => file.chapterNumber))
  );
  const importedChapters: ImportedChapterSource[] = [
    ...draftedChapterFiles.map((file) => ({ kind: "drafted" as const, file })),
    ...plannedChapters.map((plan) => ({ kind: "planned" as const, plan }))
  ].sort((left, right) => chapterSourceOrder(left) - chapterSourceOrder(right));

  if (importedChapters.length > 0) {
    project.chapters = importedChapters.map((source, index) => {
      const chapterNumber = chapterSourceNumber(source) || index + 1;
      const number = String(chapterNumber).padStart(3, "0");
      const meta = source.kind === "drafted" ? source.file : source.plan;
      return {
        id: `chapter-${number}`,
        title: source.kind === "drafted" ? titleFromImportedFile(source.file.relativePath, source.file.content, index + 1) : source.plan.title,
        outlinePath: `outline/chapter-${number}.md`,
        contentPath: `chapters/chapter-${number}.md`,
        status: source.kind,
        order: meta.order,
        volumeId: meta.volumeId,
        volumeTitle: meta.volumeTitle,
        volumeOrder: meta.volumeOrder
      };
    });
    project.lastOpenedChapterId = project.chapters[0]?.id || "chapter-001";
  }

  const importedStoryControl = buildImportedStoryControl(allImportedFiles, draftedChapterFiles);
  await createProjectFiles(project);
  const root = projectRoot(project.slug);
  await fs.mkdir(path.join(root, "imports"), { recursive: true });

  for (const source of importedChapters) {
    const chapter = project.chapters.find((item) => item.id === `chapter-${String(chapterSourceNumber(source)).padStart(3, "0")}`);
    if (!chapter) continue;
    if (source.kind === "planned") {
      await fs.writeFile(resolveInside(root, chapter.outlinePath), source.plan.outlineContent, "utf8");
      continue;
    }
    await fs.writeFile(resolveInside(root, chapter.contentPath), source.file.content, "utf8");
    await fs.writeFile(
      resolveInside(root, chapter.outlinePath),
      `# ${chapter.title}\n\nImported source: ${source.file.relativePath}\n`,
      "utf8"
    );
  }

  for (const [target, items] of supportFiles.entries()) {
    const content = items
      .map((item) => `## Imported: ${item.relativePath}\n\n${item.content.trim()}`)
      .join("\n\n");
    const fullTarget = resolveInside(root, target);
    await fs.mkdir(path.dirname(fullTarget), { recursive: true });
    await fs.writeFile(fullTarget, `${content}\n`, "utf8");
  }

  await fs.writeFile(
    resolveInside(root, "story-control/story-control.json"),
    `${JSON.stringify(importedStoryControl, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    resolveInside(root, "imports/import-report.json"),
    `${JSON.stringify(
      {
        sourceRoot,
        importedAt: nowIso(),
        files: allImportedFiles.length,
        chapters: importedChapters.length,
        draftedChapters: draftedChapterFiles.length,
        plannedChapters: plannedChapters.length,
        supportTargets: [...supportFiles.keys()].sort(),
        storyControl: {
          arcs: importedStoryControl.arcs.length,
          characters: importedStoryControl.characters.length,
          events: importedStoryControl.events.length
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  project.updatedAt = nowIso();
  await writeProject(project);
  return project;
}

export async function importLocalProject(input: {
  sourcePath: string;
  title?: string;
  genre?: string;
  roughIdea?: string;
}): Promise<NovelProject> {
  const sourcePath = input.sourcePath?.trim();
  if (!sourcePath) {
    throw new Error("sourcePath is required");
  }

  const sourceRoot = path.resolve(sourcePath);
  const stat = await fs.stat(sourceRoot).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Import source is not a directory: ${sourcePath}`);
  }

  const files = await collectImportableFiles(sourceRoot);
  const importableFiles: ImportableFile[] = [];
  for (const absolutePath of files) {
    const fileStat = await fs.stat(absolutePath);
    if (fileStat.size > importFileSizeLimit) continue;

    const relativePath = path.relative(sourceRoot, absolutePath).replace(/\\/g, "/");
    if (shouldSkipImportPath(relativePath)) continue;

    const content = await fs.readFile(absolutePath, "utf8");
    importableFiles.push({ relativePath, absolutePath, content });
  }

  return importProjectFromImportableFiles({
    files: importableFiles,
    sourceRoot,
    title: input.title,
    genre: input.genre,
    roughIdea: input.roughIdea
  });
}

export async function importUploadedProject(input: {
  files: UploadedImportFile[];
  sourceLabel?: string;
  title?: string;
  genre?: string;
  roughIdea?: string;
}): Promise<NovelProject> {
  const files = input.files
    .map((file) => ({
      relativePath: normalizeUploadedRelativePath(file.relativePath || ""),
      content: typeof file.content === "string" ? file.content : ""
    }))
    .filter((file) => {
      if (!file.relativePath || shouldSkipImportPath(file.relativePath)) return false;
      if (!importableExtensions.has(path.extname(file.relativePath).toLowerCase())) return false;
      return Buffer.byteLength(file.content, "utf8") <= importFileSizeLimit;
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-Hans-CN"));
  const stripped = stripCommonUploadRoot(files);
  const sourceRoot = input.sourceLabel?.trim() || stripped.commonRoot || "browser-directory-upload";

  return importProjectFromImportableFiles({
    files: stripped.files,
    sourceRoot,
    title: input.title || stripped.commonRoot,
    genre: input.genre,
    roughIdea: input.roughIdea || `Imported from browser directory upload: ${sourceRoot}`
  });
}
