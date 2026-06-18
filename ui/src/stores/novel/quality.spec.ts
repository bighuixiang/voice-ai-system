import { describe, expect, it } from "vitest";
import { analyzeChapterQuality, chapterOrdinal } from "./quality";

describe("novel quality helpers", () => {
  it("detects macro pacing over-reveal in early chapters", () => {
    const report = analyzeChapterQuality({
      chapterId: "chapter-001",
      ordinal: 1,
      content: "他终于明白真相：尸王的身份、封印规则、幕后秘密、全部来历和答案都已经彻底揭开。敌人退去，没有代价，所有问题彻底解决，尘埃落定。"
    });

    expect(report.fixes).toEqual(expect.arrayContaining([expect.stringContaining("宏观节奏")]));
    expect(report.metrics.find((metric) => metric.key === "information")?.note).toContain("宏观节奏风险");
  });

  it("infers chapter ordinal from project chapter ordering", () => {
    expect(
      chapterOrdinal(
        {
          id: "demo",
          slug: "demo",
          title: "Demo",
          roughIdea: "",
          chapters: [
            { id: "chapter-001", title: "Chapter 1", outlinePath: "", contentPath: "", status: "empty" },
            { id: "chapter-002", title: "Chapter 2", outlinePath: "", contentPath: "", status: "empty" }
          ],
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z"
        },
        { id: "chapter-002", title: "Chapter 2", outlinePath: "", contentPath: "", status: "empty" }
      )
    ).toBe(2);
  });
});
