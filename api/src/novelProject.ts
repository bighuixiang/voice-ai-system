import fs from "node:fs/promises";
import path from "node:path";
import type { ChapterDashboard, NovelChapter, NovelProject } from "./types.js";
import { getNovelsRoot } from "./workspace.js";
import { resolveInside } from "./pathSafety.js";
import { upsertProjectRecord } from "./database.js";

function nowIso(): string {
  return new Date().toISOString();
}

const importFileLimit = 120;
const importFileSizeLimit = 500 * 1024;
const importableExtensions = new Set([".md", ".txt"]);

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
  return JSON.parse(raw) as NovelProject;
}

export async function writeProject(project: NovelProject): Promise<void> {
  const root = projectRoot(project.slug);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  upsertProjectRecord(project, root);
}

export async function createProjectFiles(project: NovelProject): Promise<void> {
  const root = projectRoot(project.slug);
  for (const dir of [
    "bible",
    "outline",
    "chapters",
    "dashboard",
    "scenes",
    "ledger",
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
    "assets/README.md": "# Asset Management\n\nCharacters, props, scenes, frame references, and generated media will be managed here in later platform modules.\n",
    "scripts/README.md": "# Script Production\n\nScripts and shot plans will be managed here in later platform modules.\n",
    "relations/asset-links.json": `${JSON.stringify({ projectSlug: project.slug, links: [] }, null, 2)}\n`,
    "relations/story-asset-map.md": "# Story Asset Map\n\nTrack how characters, props, scenes, and generated media relate to chapters and plot beats.\n",
    "prompts/project-prompts.md": "# Project Prompts\n\nProject-specific prompt notes, expert role overrides, and reusable generation instructions.\n",
    "tasks/history.jsonl": "",
    "tasks/recaps.jsonl": ""
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
      if (entry.name === ".git" || entry.name === "node_modules") continue;

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
  if (files.length === 0) {
    throw new Error("Import source does not contain .md or .txt files");
  }

  const title = input.title?.trim() || path.basename(sourceRoot) || "Imported Novel";
  const project = await createUniqueProjectSkeleton({
    title,
    genre: input.genre,
    roughIdea: input.roughIdea || `Imported from local directory: ${sourceRoot}`
  });

  const chapterFiles: Array<{ relativePath: string; absolutePath: string; content: string }> = [];
  const supportFiles = new Map<string, Array<{ relativePath: string; content: string }>>();

  for (const absolutePath of files) {
    const fileStat = await fs.stat(absolutePath);
    if (fileStat.size > importFileSizeLimit) continue;

    const relativePath = path.relative(sourceRoot, absolutePath).replace(/\\/g, "/");
    const content = await fs.readFile(absolutePath, "utf8");
    if (isChapterCandidate(relativePath)) {
      chapterFiles.push({ relativePath, absolutePath, content });
      continue;
    }

    const target = classifySupportFile(relativePath);
    const items = supportFiles.get(target) || [];
    items.push({ relativePath, content });
    supportFiles.set(target, items);
  }

  if (chapterFiles.length > 0) {
    project.chapters = chapterFiles.map((file, index) => {
      const number = String(index + 1).padStart(3, "0");
      return {
        id: `chapter-${number}`,
        title: titleFromFile(file.relativePath, file.content, index + 1),
        outlinePath: `outline/chapter-${number}.md`,
        contentPath: `chapters/chapter-${number}.md`,
        status: "drafted"
      };
    });
    project.lastOpenedChapterId = project.chapters[0]?.id || "chapter-001";
  }

  await createProjectFiles(project);
  const root = projectRoot(project.slug);
  await fs.mkdir(path.join(root, "imports"), { recursive: true });

  for (const [index, file] of chapterFiles.entries()) {
    const chapter = project.chapters[index];
    await fs.writeFile(resolveInside(root, chapter.contentPath), file.content, "utf8");
    await fs.writeFile(
      resolveInside(root, chapter.outlinePath),
      `# ${chapter.title}\n\nImported source: ${file.relativePath}\n`,
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

  project.updatedAt = nowIso();
  await writeProject(project);
  return project;
}
