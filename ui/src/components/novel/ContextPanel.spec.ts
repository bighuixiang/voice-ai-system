import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ContextPanel from "./ContextPanel.vue";

describe("ContextPanel", () => {
  it("shows quality priorities and active creative skills", () => {
    const wrapper = mount(ContextPanel, {
      props: {
        project: {
          id: "demo",
          slug: "demo",
          title: "Demo Novel",
          genre: "fantasy",
          roughIdea: "",
          chapters: [],
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z"
        },
        chapter: {
          id: "chapter-001",
          title: "Chapter 1",
          outlinePath: "outline/chapter-001.md",
          contentPath: "chapters/chapter-001.md",
          status: "drafted"
        },
        aiSummary: "Codex CLI / default",
        activeSkills: [
          {
            id: "skill-long-novel-writer",
            name: "long-novel-writer",
            scope: "system",
            description:
              "Quality-first longform drafting: design scene goals, escalate pressure, then pay off with consequence and a forward hook.",
            tags: ["novel", "quality"],
            enabled: true
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("long-novel-writer");
    expect(wrapper.text()).toContain("Quality-first longform drafting:");
  });
});
