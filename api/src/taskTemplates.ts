import type { CodexTaskType } from "./types.js";

export interface PromptContext {
  projectTitle?: string;
  target?: string;
  authorInput?: string;
  contextBlocks: Array<{ title: string; content: string }>;
  payload?: unknown;
}

const taskGoals: Record<CodexTaskType, string> = {
  "project.create": "从作者粗略想法创建小说项目骨架、故事圣经、大纲草案和第一章入口。",
  "outline.generate": "基于故事圣经生成或重写卷纲、章纲、情节因果链和伏笔安排。",
  "chapter.plan": "为指定章节生成本章目标、场景卡、冲突、转折和结尾钩子。",
  "chapter.draft": "基于章纲和上下文起草章节正文，并标出风险和修改建议。",
  "selection.polish": "只改写选区文本，保持剧情事实，优先修复 POV、因果和可读性。",
  "continuity.check": "检查章节与故事圣经、伏笔、升级节奏和相邻章节的连续性风险。",
  "idea.suggest": "在作者卡住时给出符合当前剧情状态的下一步灵感候选。"
};

export function buildTaskPrompt(type: CodexTaskType, context: PromptContext): string {
  const blocks = context.contextBlocks
    .map((block) => `## ${block.title}\n${block.content || "(empty)"}`)
    .join("\n\n");

  return [
    "你是小说创作工作台里的 Codex 写作代理。",
    "必须遵守：逻辑因果优先，POV 诚实，人物动机可信，伏笔可追踪，升级一步一步来，不浮夸。",
    `任务类型：${type}`,
    `任务目标：${taskGoals[type]}`,
    context.projectTitle ? `项目：${context.projectTitle}` : "",
    context.target ? `目标：${context.target}` : "",
    context.authorInput ? `作者输入：${context.authorInput}` : "",
    blocks,
    "## 输入载荷",
    JSON.stringify(context.payload || {}, null, 2),
    "## 输出要求",
    "只输出 JSON，不要输出 Markdown 解释。JSON 结构必须为：",
    JSON.stringify(
      {
        summary: "本次结果摘要",
        content: "正文或主要结果",
        changes: ["变更点"],
        risks: ["潜在风险"],
        questions: ["需要作者确认的问题"],
        patches: [
          {
            target: "chapters/chapter-001.md",
            mode: "replace-file",
            content: "可应用内容"
          }
        ]
      },
      null,
      2
    )
  ]
    .filter(Boolean)
    .join("\n\n");
}
