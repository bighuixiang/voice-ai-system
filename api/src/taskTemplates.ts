import type { CodexTaskType } from "./types.js";

export interface PromptContext {
  projectTitle?: string;
  target?: string;
  authorInput?: string;
  contextBlocks: Array<{ title: string; content: string }>;
  payload?: unknown;
}

const taskGoals: Partial<Record<CodexTaskType, string>> = {
  "project.create": "从作者粗略想法创建小说项目骨架、故事圣经、大纲草案和第一章入口。",
  "outline.generate": "基于故事圣经生成或重写卷纲、章纲、情节因果链和伏笔安排。",
  "structure.reverse": "调用 AI 阅读当前章节正文，反向提炼章节仪表盘和多张场景卡，过滤标题、写作日期、版本号等非叙事元信息。",
  "chapter.plan": "为指定章节生成章纲设定，包含章节目标、场景卡、冲突、转折、伏笔、POV 限制和结尾钩子。",
  "chapter.draft": "基于章纲和上下文起草章节正文，并标出风险和修改建议。",
  "selection.polish": "只改写选区文本，保持剧情事实，优先修复 POV、因果和可读性。",
  "continuity.check": "检查章节与故事圣经、伏笔、升级节奏和相邻章节的连续性风险。",
  "idea.suggest": "在作者卡住时给出符合当前剧情状态的下一步灵感候选。",
  "assistant.free": "根据作者随时交代的临时指令，在当前小说上下文中给出分析、建议、改写或安全补丁。"
};

function buildTaskContract(type: CodexTaskType) {
  if (type === "writing.briefing") {
    return [
      {
        title: "Prewriting Briefing Contract",
        content:
          "Return a WritingBriefing JSON. It must cover previous chapter ending, current chapter goal, POV limits, must remember, must not reveal, unresolved foreshadowing, and risks."
      }
    ];
  }

  if (type === "writing.recap") {
    return [
      {
        title: "Post-save Recap Contract",
        content: [
          "Return a WritingRecapCandidate JSON with reviewable state patches for author approval before merge.",
          "Include `chapterId`, `summary`, `newFacts`, `characterStateChanges`, `foreshadowingUpdates`, `continuityRisks`, `powerProgressionUpdates`, and `createdAt` for backward compatibility.",
          "Also include these patch fields when applicable:",
          JSON.stringify(
            {
              summaryPatch: {
                summary: "Concise chapter memory summary.",
                keyEvents: ["Major irreversible events from the saved chapter."]
              },
              factPatches: [
                {
                  id: "fact-chapter-001-001",
                  chapterId: "chapter-001",
                  fact: "A durable story fact introduced or confirmed in this chapter.",
                  relatedEntities: ["character/location/item/faction"],
                  sourceAnchor: "Short quote or scene anchor.",
                  status: "pending",
                  createdAt: "ISO timestamp",
                  updatedAt: "ISO timestamp"
                }
              ],
              characterStatePatches: [
                {
                  id: "char-state-chapter-001-001",
                  chapterId: "chapter-001",
                  characterName: "Character name",
                  before: "Known prior state if context provides it.",
                  after: "New observable state after this chapter.",
                  cause: "Concrete event that changed the state.",
                  relatedEntities: ["character/location/item/faction"],
                  status: "pending",
                  createdAt: "ISO timestamp",
                  updatedAt: "ISO timestamp"
                }
              ],
              ledgerPatches: [
                {
                  id: "foreshadowing-chapter-001-001",
                  kind: "foreshadowing",
                  title: "Trackable setup/payoff/risk",
                  status: "open",
                  severity: "medium",
                  chapterIds: ["chapter-001"],
                  relatedEntities: ["entity"],
                  note: "Why this belongs in the ledger.",
                  updatedAt: "ISO timestamp"
                }
              ],
              riskPatches: [
                {
                  id: "risk-chapter-001-001",
                  kind: "risk",
                  title: "Continuity or POV risk needing review",
                  status: "watch",
                  severity: "medium",
                  chapterIds: ["chapter-001"],
                  relatedEntities: ["entity"],
                  note: "Specific risk and suggested follow-up.",
                  updatedAt: "ISO timestamp"
                }
              ]
            },
            null,
            2
          ),
          "Patch ids must be stable, specific, and scoped to the chapter. Patch statuses must start as `pending`.",
          "Do not auto-apply ledger updates. The application will merge accepted patches only after author approval before merge."
        ].join("\n")
      }
    ];
  }

  if (type === "structure.reverse") {
    return [
      {
        title: "Reverse Structure Contract",
        content: [
          "Return a CodexTaskResult JSON. Its `content` field must be a stringified JSON object with this shape:",
          JSON.stringify(
            {
              dashboard: {
                goal: "ChapterDashboard.goal，说明本章真实叙事目标",
                pov: "ChapterDashboard.pov，必须从正文判断",
                mainConflict: "ChapterDashboard.mainConflict，提炼核心阻力和代价",
                endingHook: "ChapterDashboard.endingHook，提炼结尾钩子或下一步牵引",
                status: "drafting | drafted | reviewing"
              },
              scenes: [
                {
                  title: "SceneCard.title，具体场景名，不要用章节标题或日期",
                  time: "SceneCard.time，可空",
                  location: "SceneCard.location，可空但要尽量从正文提取",
                  pov: "SceneCard.pov",
                  characters: ["出场角色"],
                  conflict: "SceneCard.conflict，必须是具体冲突/阻力/代价",
                  turn: "SceneCard.turn，必须是该场景的转折或信息变化",
                  informationReleased: ["释放给读者的关键信息"],
                  foreshadowingIds: ["可追踪伏笔 ID，可空"],
                  powerProgression: "能力/修行/资源推进，可空",
                  draftAnchor: "正文中对应的短锚点"
                }
              ]
            },
            null,
            2
          ),
          "Analyze the current draft deeply and produce enough SceneCard items for real beats, usually 4-8 when the chapter supports it.",
          "过滤标题、写作日期、版本号、章节编号、Markdown 标记、导入噪声和说明文字；不要把这些内容当成场景。",
          "Do not return shallow snippets. Each scene needs concrete conflict, turn, informationReleased, and draftAnchor."
        ].join("\n")
      }
    ];
  }

  return [];
}

export function buildTaskPrompt(type: CodexTaskType, context: PromptContext): string {
  const cockpitInstruction = ["structure.reverse", "chapter.plan", "chapter.draft", "continuity.check", "idea.suggest", "writing.briefing", "writing.recap"].includes(type)
    ? [
        {
          title: "Cockpit Boundaries",
          content:
            "Respect the Chapter Dashboard, Scene Cards, and structured ledgers before proposing prose, structure, continuity risks, or next moves."
        }
      ]
    : [];
  const blocks = [...cockpitInstruction, ...buildTaskContract(type), ...context.contextBlocks]
    .map((block) => `## ${block.title}\n${block.content || "(empty)"}`)
    .join("\n\n");
  const taskGoal = taskGoals[type] || taskGoals["assistant.free"]!;

  return [
    "你是小说创作工作台里的 Codex 写作代理。",
    "必须遵守：逻辑因果优先，POV 诚实，人物动机可信，伏笔可追踪，升级一步一步来，不浮夸。",
    "章节文件规则：chapter.plan 优先产出章纲设定，补丁目标默认使用 outline/chapter-xxx.md；chapter.draft 优先产出正文，补丁目标默认使用 chapters/chapter-xxx.md。",
    `任务类型：${type}`,
    `任务目标：${taskGoal}`,
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
        content: "正文、章纲设定或主要结果",
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
