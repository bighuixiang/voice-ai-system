import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChapterDashboardPanel from "./ChapterDashboardPanel.vue";
import type { ChapterDashboard } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "loading"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-select": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
  },
  "el-option": { props: ["label", "value"], template: `<option :value="value">{{ label }}</option>` },
  "el-tag": { template: "<span><slot /></span>" },
  "el-icon": { template: "<span><slot /></span>" }
};

const dashboard: ChapterDashboard = {
  chapterId: "chapter-001",
  goal: "Make the clue visible.",
  pov: "Hero",
  mainConflict: "Stay hidden or act.",
  endingHook: "The seal answers.",
  wordCount: 1200,
  status: "drafting",
  unresolvedForeshadowingIds: ["f-1", "f-2"],
  continuityRiskIds: ["r-1"],
  updatedAt: "2026-06-04T00:00:00.000Z"
};

describe("ChapterDashboardPanel", () => {
  it("renders the current chapter dashboard summary", () => {
    const wrapper = mount(ChapterDashboardPanel, {
      props: { dashboard, isSaving: false },
      global: { stubs }
    });

    const values = wrapper.findAll("input").map((input) => (input.element as HTMLInputElement).value);

    expect(values).toContain("Make the clue visible.");
    expect(values).toContain("Hero");
    expect(values).toContain("Stay hidden or act.");
    expect(values).toContain("The seal answers.");
    expect(wrapper.text()).toContain("1200");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("1");
  });

  it("emits dashboard updates and enables saving only after edits", async () => {
    const wrapper = mount(ChapterDashboardPanel, {
      props: { dashboard, isSaving: false },
      global: { stubs }
    });

    expect(wrapper.find("button").attributes("disabled")).toBeDefined();

    await wrapper.findAll("input")[0].setValue("Make the cost visible.");

    expect(wrapper.emitted("update:dashboard")?.[0][0]).toMatchObject({
      chapterId: "chapter-001",
      goal: "Make the cost visible."
    });
    expect(wrapper.find("button").attributes("disabled")).toBeUndefined();

    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("keeps save disabled when there is no dashboard", async () => {
    const onSave = vi.fn();
    const wrapper = mount(ChapterDashboardPanel, {
      props: { dashboard: null, isSaving: false, onSave },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("未载入章节仪表盘");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
