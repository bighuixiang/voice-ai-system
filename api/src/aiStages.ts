import type { AiStageDefinition, AiStageKey, CodexTaskType } from "./types.js";

export const aiStageDefinitions: AiStageDefinition[] = [
  { key: "pipeline.project.create", label: "Project creation", taskTypes: ["project.create"] },
  { key: "pipeline.outline.generate", label: "Outline generation", taskTypes: ["outline.generate"] },
  { key: "pipeline.structure.reverse", label: "Structure reverse engineering", taskTypes: ["structure.reverse"] },
  { key: "pipeline.chapter.plan", label: "Chapter planning", taskTypes: ["chapter.plan"] },
  { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] },
  { key: "pipeline.quality.review", label: "Chapter quality review", taskTypes: ["quality.review"] },
  { key: "pipeline.selection.polish", label: "Selection polishing", taskTypes: ["selection.polish"] },
  { key: "pipeline.quality.rewrite", label: "Quality-targeted rewrite", taskTypes: ["quality.rewrite"] },
  { key: "pipeline.chapter.validate", label: "Chapter validation", taskTypes: ["continuity.check"] },
  { key: "pipeline.idea.suggest", label: "Idea suggestion", taskTypes: ["idea.suggest"] },
  { key: "pipeline.writing.briefing", label: "Writing briefing", taskTypes: ["writing.briefing"] },
  { key: "autopilot.post_chapter.recap", label: "Post-chapter recap", taskTypes: ["writing.recap"] },
  { key: "assistant.free", label: "Free assistant command", taskTypes: ["assistant.free"] }
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
