import { describe, expect, it } from "vitest";
import { buildSceneCardsFromIdea, parseReverseStructureResult } from "./structure";

describe("novel structure helpers", () => {
  it("builds default scene cards from a rough idea", () => {
    const cards = buildSceneCardsFromIdea("主角在雨夜发现师门旧符，想追查又怕暴露身份。", "chapter-001");

    expect(cards.map((scene) => scene.title)).toEqual(["开场抓手", "冲突升级", "钩子落点"]);
    expect(cards.every((scene) => scene.chapterId === "chapter-001")).toBe(true);
  });

  it("parses reverse-structure payloads into dashboard and scene cards", () => {
    const result = parseReverseStructureResult(
      JSON.stringify({
        dashboard: {
          goal: "让主角做出选择",
          pov: "第一人称视角",
          mainConflict: "主角必须判断封印是否可信",
          endingHook: "封印回应了他的血",
          status: "drafted"
        },
        scenes: [
          {
            title: "月食压城",
            conflict: "饥饿与封印牵引同时压来",
            turn: "封印主动回应",
            informationReleased: ["旧封印仍在运转"]
          }
        ]
      }),
      "chapter-001",
      "主角发现封印回应了他的血。"
    );

    expect(result).toMatchObject({
      dashboardPatch: {
        goal: "让主角做出选择",
        pov: "第一人称视角",
        mainConflict: "主角必须判断封印是否可信",
        status: "drafted"
      },
      cards: [
        {
          chapterId: "chapter-001",
          order: 1,
          title: "月食压城",
          conflict: "饥饿与封印牵引同时压来",
          informationReleased: ["旧封印仍在运转"]
        }
      ]
    });
  });
});
