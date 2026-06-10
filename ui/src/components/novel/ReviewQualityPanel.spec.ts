import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ReviewQualityPanel from "./ReviewQualityPanel.vue";
import type { ChapterQualityReport, SeriesQualityMetrics } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "type"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-select": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
  },
  "el-option": { props: ["label", "value"], template: `<option :value="value">{{ label }}</option>` },
  "el-icon": { template: "<span><slot /></span>" }
};

const report: ChapterQualityReport = {
  chapterId: "chapter-001",
  overallScore: 78,
  summary: "这一章的基础驱动力已经成立。",
  metrics: [
    { key: "rhythm", label: "节奏", score: 80, note: "推进感较稳。" },
    { key: "conflict", label: "冲突", score: 76, note: "阻力已经进入文本。" },
    { key: "emotion", label: "情绪", score: 72, note: "情绪能支撑场面。" },
    { key: "information", label: "信息", score: 70, note: "有信息释放。" },
    { key: "prose", label: "文笔", score: 82, note: "有具体画面。" },
    { key: "hook", label: "钩子", score: 68, note: "结尾还可更锋利。" }
  ],
  strengths: ["文笔：有具体画面。"],
  fixes: ["钩子：结尾还可更锋利。"],
  updatedAt: "2026-06-04T00:00:00.000Z"
};

const seriesMetrics: SeriesQualityMetrics = {
  projectSlug: "demo",
  chapterCount: 2,
  reportCount: 1,
  averageOverallScore: 78,
  metricAverages: [
    { key: "hook", label: "钩子", averageScore: 68, reportCount: 1 },
    { key: "information", label: "信息", averageScore: 70, reportCount: 1 },
    { key: "emotion", label: "情绪", averageScore: 72, reportCount: 1 }
  ],
  weakestChapters: [
    {
      chapterId: "chapter-001",
      chapterTitle: "Chapter 1",
      overallScore: 78,
      weakestMetricKey: "hook",
      weakestMetricLabel: "钩子",
      weakestMetricScore: 68,
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  qualityTrends: [
    {
      key: "overall",
      label: "Overall",
      averageScore: 74,
      latestScore: 78,
      previousScore: 70,
      delta: 8,
      points: [
        { chapterId: "chapter-000", chapterTitle: "Chapter 0", score: 70, updatedAt: "2026-06-03T00:00:00.000Z" },
        { chapterId: "chapter-001", chapterTitle: "Chapter 1", score: 78, updatedAt: "2026-06-04T00:00:00.000Z" }
      ]
    },
    {
      key: "hook",
      label: "钩子",
      averageScore: 68,
      latestScore: 68,
      points: [{ chapterId: "chapter-001", chapterTitle: "Chapter 1", score: 68, updatedAt: "2026-06-04T00:00:00.000Z" }]
    }
  ],
  rhythmSignals: [
    {
      chapterId: "chapter-001",
      chapterTitle: "Chapter 1",
      rhythmScore: 80,
      overallScore: 78,
      wordCount: 2400,
      sceneCount: 3,
      beatCount: 5,
      note: "推进感较稳。",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  characterArcSignals: [
    {
      characterName: "林澈",
      changeCount: 2,
      chapterIds: ["chapter-001", "chapter-002"],
      firstChapterId: "chapter-001",
      lastChapterId: "chapter-002",
      latestState: "更谨慎地处理血符。",
      latestCause: "第二次代价验证成立。",
      updatedAt: "2026-06-04T00:00:00.000Z"
    }
  ],
  updatedAt: "2026-06-04T00:00:00.000Z"
};

describe("ReviewQualityPanel", () => {
  it("renders a quality report, series overview, and emits diagnose", async () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report,
        seriesMetrics,
        selectedTone: "elegant",
        canDiagnose: true,
        canTuneSelection: false
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("78");
    expect(wrapper.text()).toContain("钩子：结尾还可更锋利。");
    expect(wrapper.text()).toContain("项目质量概览");
    expect(wrapper.text()).toContain("1 / 2 章已体检");
    expect(wrapper.text()).toContain("最弱章节：Chapter 1 · 78 分");
    expect(wrapper.text()).toContain("钩子");
    expect(wrapper.text()).toContain("质量趋势");
    expect(wrapper.text()).toContain("Overall");
    expect(wrapper.text()).toContain("+8");
    expect(wrapper.text()).toContain("章节节奏");
    expect(wrapper.text()).toContain("80 分 · 2400 字 · 3 场 · 5 事件");
    expect(wrapper.text()).toContain("角色弧");
    expect(wrapper.text()).toContain("林澈");
    expect(wrapper.text()).toContain("2 次 · 更谨慎地处理血符。");

    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.emitted("diagnose")).toHaveLength(1);
  });

  it("updates tone and emits tune action for selected text", async () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report: null,
        selectedTone: "elegant",
        canDiagnose: false,
        canTuneSelection: true
      },
      global: { stubs }
    });

    await wrapper.find("select").setValue("tense");
    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("update:tone")?.[0][0]).toBe("tense");
    expect(wrapper.emitted("tune-selection")).toHaveLength(1);
  });

  it("disables actions when there is no draft or selected text", () => {
    const wrapper = mount(ReviewQualityPanel, {
      props: {
        report: null,
        selectedTone: "elegant",
        canDiagnose: false,
        canTuneSelection: false
      },
      global: { stubs }
    });

    const buttons = wrapper.findAll("button");
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
  });
});
