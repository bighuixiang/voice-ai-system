import { describe, expect, it } from "vitest";
import { stageKeyForTask } from "./aiStages.js";
import type { CodexTaskType } from "./types.js";

describe("aiStages", () => {
  it("maps every task type to a stable AI stage key", () => {
    const taskTypes: CodexTaskType[] = [
      "project.create",
      "outline.generate",
      "structure.reverse",
      "chapter.plan",
      "chapter.draft",
      "selection.polish",
      "continuity.check",
      "idea.suggest",
      "writing.briefing",
      "writing.recap",
      "assistant.free"
    ];

    expect(taskTypes.map((type) => [type, stageKeyForTask(type)])).toEqual([
      ["project.create", "pipeline.project.create"],
      ["outline.generate", "pipeline.outline.generate"],
      ["structure.reverse", "pipeline.structure.reverse"],
      ["chapter.plan", "pipeline.chapter.plan"],
      ["chapter.draft", "pipeline.chapter.prose"],
      ["selection.polish", "pipeline.selection.polish"],
      ["continuity.check", "pipeline.chapter.validate"],
      ["idea.suggest", "pipeline.idea.suggest"],
      ["writing.briefing", "pipeline.writing.briefing"],
      ["writing.recap", "autopilot.post_chapter.recap"],
      ["assistant.free", "assistant.free"]
    ]);
  });
});
