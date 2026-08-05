import type { AiStageDefinition, AiStageKey, CodexTaskType } from "./types.js";

export const aiStageDefinitions: AiStageDefinition[] = [
  { key: "pipeline.project.create", label: "创建项目", taskTypes: ["project.create"] },
  { key: "pipeline.outline.generate", label: "生成大纲", taskTypes: ["outline.generate"] },
  { key: "pipeline.structure.reverse", label: "反推结构", taskTypes: ["structure.reverse"] },
  { key: "pipeline.chapter.plan", label: "规划章节", taskTypes: ["chapter.plan"] },
  { key: "pipeline.chapter.prose", label: "起草正文", taskTypes: ["chapter.draft"] },
  { key: "pipeline.quality.review", label: "质量评审", taskTypes: ["quality.review"] },
  { key: "pipeline.selection.polish", label: "选区润色", taskTypes: ["selection.polish"] },
  { key: "pipeline.quality.rewrite", label: "质量改造", taskTypes: ["quality.rewrite"] },
  { key: "pipeline.chapter.validate", label: "章节验证", taskTypes: ["continuity.check"] },
  { key: "pipeline.idea.suggest", label: "创意建议", taskTypes: ["idea.suggest"] },
  { key: "pipeline.writing.briefing", label: "写前简报", taskTypes: ["writing.briefing"] },
  { key: "autopilot.post_chapter.recap", label: "章后复盘", taskTypes: ["writing.recap"] },
  { key: "assistant.free", label: "自由指令", taskTypes: ["assistant.free"] }
];

const taskStageKeys = aiStageDefinitions.reduce(
  (mapping, definition) => {
    for (const taskType of definition.taskTypes) {
      mapping[taskType] = definition.key;
    }
    return mapping;
  },
  {} as Record<CodexTaskType, AiStageKey>
);

export function stageKeyForTask(type: CodexTaskType): AiStageKey {
  return taskStageKeys[type];
}
