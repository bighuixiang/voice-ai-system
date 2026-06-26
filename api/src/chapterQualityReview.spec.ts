import { describe, expect, it } from "vitest";
import { reviewChapterQuality } from "./chapterQualityReview.js";

describe("chapterQualityReview", () => {
  it("parses the outer AI review JSON when nested markdown fences appear inside a string field", () => {
    const reviewed = reviewChapterQuality({
      chapterId: "chapter-001",
      content: [
        "Boom. Nine Lotus Mountain dropped half a foot in the dark, and the seal formation lit the cliff face with blood-red cracks.",
        "",
        "Lin Xuan pressed the jade pendant against his chest and tasted blood while the altar and cliff answered the impact.",
        "",
        "The chapter closed on a real aftershock instead of an empty tease."
      ].join("\n"),
      aiReviewContent: JSON.stringify({
        report: {
          chapterId: "chapter-001",
          overallScore: 91,
          summary: "Strong pressure with clear consequence.",
          metrics: [
            { key: "rhythm", label: "Rhythm", score: 90, note: "Good pace." },
            { key: "conflict", label: "Conflict", score: 91, note: "Conflict escalates." },
            { key: "emotion", label: "Emotion", score: 89, note: "Embodied reaction works." },
            { key: "information", label: "Information", score: 90, note: "Concrete reveal lands." },
            {
              key: "prose",
              label: "Prose",
              score: 92,
              note: 'Keep the sample as-is: ```json\n{"topIssues":["wrong inner fence payload"]}\n```'
            },
            { key: "hook", label: "Hook", score: 90, note: "The ending has consequence." },
            { key: "tension", label: "Tension", score: 91, note: "Pressure stays active." }
          ],
          strengths: ["Pressure lands early."],
          fixes: ["Trim one explanatory beat."],
          updatedAt: "2026-06-26T00:00:00.000Z"
        },
        topIssues: ["Tighten one explanatory sentence."],
        antiPatternsHit: [],
        openingVerdict: "The first screen lands pressure quickly.",
        endingVerdict: "The ending lands consequence.",
        rulesBasedSignals: ["nested fence should not break parsing"]
      })
    });

    expect(reviewed.report.summary).toBe("Strong pressure with clear consequence.");
    expect(reviewed.topIssues).toContain("Tighten one explanatory sentence.");
    expect(reviewed.topIssues).not.toContain("wrong inner fence payload");
    expect(reviewed.rulesBasedSignals).toContain("nested fence should not break parsing");
  });

  it("keeps AI critique metadata when the AI report metrics are malformed", () => {
    const reviewed = reviewChapterQuality({
      chapterId: "chapter-001",
      content: [
        "Lin Xuan felt that fate had started moving.",
        "",
        "He spent a long time thinking about what tomorrow might mean.",
        "",
        "And this was only the beginning."
      ].join("\n"),
      aiReviewContent: JSON.stringify({
        report: {
          chapterId: "chapter-001",
          overallScore: 87,
          summary: "The chapter needs stronger consequence.",
          metrics: [
            { key: "rhythm", label: "Rhythm", score: 85, note: "Mostly fine." }
          ],
          strengths: ["The scene frame is usable."],
          fixes: ["Sharpen the ending."]
        },
        topIssues: ["Sharpen the ending into consequence instead of teaser copy."],
        antiPatternsHit: ["fake_suspense_ending"],
        openingVerdict: "The opening needs pressure sooner.",
        endingVerdict: "The ending is still a teaser, not an aftermath.",
        rulesBasedSignals: ["ai critique survived malformed metrics"]
      })
    });

    expect(reviewed.topIssues).toContain("Sharpen the ending into consequence instead of teaser copy.");
    expect(reviewed.antiPatternsHit).toContain("fake_suspense_ending");
    expect(reviewed.openingVerdict).toBe("The opening needs pressure sooner.");
    expect(reviewed.endingVerdict).toBe("The ending is still a teaser, not an aftermath.");
    expect(reviewed.rulesBasedSignals).toContain("ai critique survived malformed metrics");
  });

  it("scores vague, explanatory, flat-ending chapters lower on prose, hook, and tension", () => {
    const weak = reviewChapterQuality({
      chapterId: "chapter-001",
      content: [
        "Lin Xuan felt that everything was profound because fate had clearly started moving. It was a grand age and a legendary beginning.",
        "",
        "He felt a heavy responsibility, and in his heart he could not stay calm. In other words, the path of strength was about endless growth.",
        "",
        "He spent a long time thinking about what tomorrow might mean and how his journey might continue in a vague way.",
        "",
        "And this was only the beginning."
      ].join("\n")
    });

    const prose = weak.report.metrics.find((metric) => metric.key === "prose");
    const hook = weak.report.metrics.find((metric) => metric.key === "hook");
    const tension = weak.report.metrics.find((metric) => metric.key === "tension");

    expect(prose?.score).toBeLessThan(75);
    expect(hook?.score).toBeLessThan(75);
    expect(tension?.score).toBeLessThan(78);
    expect(weak.antiPatternsHit).toEqual(expect.arrayContaining(["summary_style_emotion", "fake_suspense_ending"]));
  });

  it("scores pressure-first, concrete, consequence-driven chapters higher", () => {
    const strong = reviewChapterQuality({
      chapterId: "chapter-001",
      dashboard: { mainConflict: "The seal holding the corpse king is breaking under Nine Lotus Mountain." },
      scenes: [
        {
          id: "scene-1",
          chapterId: "chapter-001",
          order: 1,
          title: "Nine Lotus Mountain shakes",
          time: "night",
          location: "Nine Lotus Mountain",
          pov: "Lin Xuan",
          characters: ["Lin Xuan", "elders", "corpse king"],
          conflict: "The formation is failing while the enemy presses from inside the seal.",
          turn: "Lin Xuan is forced to use the jade pendant.",
          informationReleased: ["The pendant shares the same origin mark as the master's seal."],
          foreshadowingIds: ["jade-origin"],
          powerProgression: "Lin Xuan uses the pendant backlash to force his way into the formation eye.",
          updatedAt: new Date().toISOString()
        }
      ],
      content: [
        "Boom. Nine Lotus Mountain dropped half a foot in the dark, and the seal formation lit the cliff face with blood-red cracks.",
        "",
        "The lead elder raised one sleeve to hold the array, and the fabric burst apart under the pressure. Lin Xuan tasted blood in his throat. Even his breathing felt nailed in place as the mountain wind carried ruin and omen straight at the disciples behind him.",
        "",
        "The corpse king did not rush to break free. It only opened its eyes inside the fissure, and that glance moved like frost through bone. The altar, the broken ridge, and the sky above the summit answered at once. Shockwaves rolled through the formation and split loose stone into dust.",
        "",
        "Lin Xuan pressed the jade pendant against his chest. Old wounds tore open. Blood ran through his fingers. Only then did he see the lock pattern on the pendant's back, the same trace his master once hid beneath a sleeve oath, while the senior brother below lost half his armor to the collapse.",
        "",
        "He did not retreat. He drove himself into the formation eye, broke the drifting chain with one strike, and paid for it with his knees and another mouthful of blood. The mountain held, but three side peaks collapsed into the valley, and the disciples spent the rest of the night dragging survivors from the ruin.",
        "",
        "When the pressure finally thinned, the pendant was still burning in his palm. The seal had held for one more night, but the cost, the broken peaks, and the old mark on the pendant made one thing clear: the greater debt had only just stepped back into the light."
      ].join("\n")
    });

    const prose = strong.report.metrics.find((metric) => metric.key === "prose");
    const hook = strong.report.metrics.find((metric) => metric.key === "hook");
    const tension = strong.report.metrics.find((metric) => metric.key === "tension");

    expect(prose?.score).toBeGreaterThanOrEqual(80);
    expect(hook?.score).toBeGreaterThanOrEqual(80);
    expect(tension?.score).toBeGreaterThanOrEqual(84);
    expect(strong.openingVerdict).toContain("pressure");
    expect(strong.endingVerdict).toContain("aftershock");
  });
});
