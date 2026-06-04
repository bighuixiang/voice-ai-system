import fs from "node:fs/promises";
import path from "node:path";
import type { CodexTaskType, NovelProject, SelectionPayload } from "./types.js";
import { resolveInside } from "./pathSafety.js";

async function readOptional(root: string, relativePath: string): Promise<string> {
  try {
    return await fs.readFile(resolveInside(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

function trimContext(content: string, limit = 6000): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, Math.floor(limit / 2))}\n\n[...中间内容已压缩...]\n\n${content.slice(-Math.floor(limit / 2))}`;
}

const broadContextTypes: CodexTaskType[] = [
  "outline.generate",
  "chapter.plan",
  "chapter.draft",
  "continuity.check",
  "idea.suggest",
  "assistant.free"
];

const targetChapterTypes: CodexTaskType[] = ["chapter.plan", "chapter.draft", "continuity.check", "idea.suggest", "assistant.free"];
const cockpitContextTypes: CodexTaskType[] = ["chapter.plan", "chapter.draft", "continuity.check", "idea.suggest", "assistant.free"];

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
    { title: "力量体系", content: await readOptional(root, "bible/power-system.md") }
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
