import fs from "node:fs/promises";
import path from "node:path";
import type { NovelChapter, NovelProject } from "./types.js";
import { getNovelsRoot } from "./workspace.js";
import { resolveInside } from "./pathSafety.js";

function nowIso(): string {
  return new Date().toISOString();
}

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
    chapters: createDefaultChapters()
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
}

export async function createProjectFiles(project: NovelProject): Promise<void> {
  const root = projectRoot(project.slug);
  for (const dir of ["bible", "outline", "chapters", "ledger", "style", "tasks"]) {
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
    "tasks/history.jsonl": ""
  };

  for (const [relativePath, content] of Object.entries(defaults)) {
    await fs.writeFile(resolveInside(root, relativePath), content, "utf8");
  }

  for (const chapter of project.chapters) {
    await fs.writeFile(resolveInside(root, chapter.outlinePath), `# ${chapter.title}章纲\n\n待规划。\n`, "utf8");
    await fs.writeFile(resolveInside(root, chapter.contentPath), `# ${chapter.title}\n\n`, "utf8");
  }
}
