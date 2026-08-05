import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AuthorJourneyProgress from "./AuthorJourneyProgress.vue";

describe("AuthorJourneyProgress", () => {
  it("shows the current progress and the next author action in Chinese", () => {
    const wrapper = mount(AuthorJourneyProgress, {
      props: {
        journey: {
          schemaVersion: "creative-journey-projection.v1",
          projectSlug: "demo",
          stage: "understanding",
          primaryAsset: "understanding-preview",
          primaryAction: { id: "answer-question-primary-desire", label: "回答当前问题", kind: "answer", status: "available" },
          activeQuestion: { id: "question-primary-desire", text: "在开头部分，主人公最想要的是什么？", status: "active", impact: "high", source: "deterministic-gap" },
          progress: { completed: 3, total: 10, current: 4 },
          nextInstruction: "回答当前问题后，系统会自动准备下一题。",
          sourceMessageIds: ["m1"],
          sessionFingerprint: "a".repeat(64),
          sourceFingerprint: "a".repeat(64),
          projectionVersion: "1",
          freshness: "current",
          unsavedState: { hasDraft: false },
          pendingRefs: [],
          fingerprint: "b".repeat(64)
        }
      }
    });

    expect(wrapper.text()).toContain("已完成 3/10 项");
    expect(wrapper.text()).toContain("记录想法");
    expect(wrapper.text()).toContain("故事蓝图");
    expect(wrapper.text()).toContain("回答当前问题后，系统会自动准备下一题。");
  });
});
