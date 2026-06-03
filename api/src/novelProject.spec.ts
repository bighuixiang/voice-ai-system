import { describe, expect, it } from "vitest";
import { createProjectSkeleton, slugify } from "./novelProject.js";

describe("novelProject", () => {
  it("creates a project skeleton from a rough idea", () => {
    const project = createProjectSkeleton({
      title: "九连山",
      genre: "玄幻",
      roughIdea: "底层少年卷入封印。"
    });

    expect(project.title).toBe("九连山");
    expect(project.chapters).toHaveLength(3);
    expect(project.chapters[0].contentPath).toBe("chapters/chapter-001.md");
  });

  it("falls back to a generated slug for non-ascii titles", () => {
    expect(slugify("九连山")).toMatch(/^novel-/);
  });
});
