import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StoryControlPanel from "./StoryControlPanel.vue";
import type { StoryControl } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "loading"],
    emits: ["click"],
    template: `<button v-bind="$attrs" :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input v-bind="$attrs" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-select": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select v-bind="$attrs" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
  },
  "el-option": {
    props: ["label", "value"],
    template: `<option :value="value">{{ label }}</option>`
  },
  "el-icon": { template: "<span><slot /></span>" }
};

function storyControl(): StoryControl {
  return {
    version: 1,
    premise: "A reborn immortal starts from an office job.",
    currentArcId: "arc-1",
    arcs: [
      {
        id: "arc-1",
        title: "City start",
        chapterRange: "1-20",
        goal: "Rebuild the first resource loop.",
        stakes: "Exposure draws enemies.",
        payoff: "First credible breakthrough.",
        status: "active",
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    ],
    characters: [
      {
        id: "char-hero",
        name: "主角",
        role: "主角",
        goal: "重修登顶",
        currentState: "刚入局",
        knownSecrets: "只知道前世经验",
        relationshipNotes: "",
        powerLevel: "练气前",
        status: "active",
        updatedAt: "2026-06-05T00:00:00.000Z"
      },
      {
        id: "char-rival",
        name: "林师姐",
        role: "队友",
        goal: "查清公司秘境",
        currentState: "怀疑主角",
        knownSecrets: "不知道主角重生",
        relationshipNotes: "临时合作",
        powerLevel: "练气一层",
        status: "planned",
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    ],
    events: [],
    orchestrationNotes: "Keep events causal.",
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

describe("StoryControlPanel", () => {
  it("uses a searchable index instead of rendering every character as a full card", async () => {
    const wrapper = mount(StoryControlPanel, {
      props: { storyControl: storyControl(), canGenerate: true },
      global: { stubs }
    });

    await wrapper.findAll("button").find((button) => button.text().includes("角色"))?.trigger("click");
    await wrapper.find('input[placeholder="搜索角色、身份、目标"]').setValue("师姐");

    expect(wrapper.text()).toContain("林师姐");
    expect(wrapper.text()).not.toContain("重修登顶");

    await wrapper.findAll("button").find((button) => button.text().includes("林师姐"))?.trigger("click");
    const nameInput = wrapper.findAll("input").find((input) => (input.element as HTMLInputElement).value === "林师姐");
    await nameInput?.setValue("林青");

    expect(wrapper.emitted("update:story-control")?.at(-1)?.[0]).toMatchObject({
      characters: expect.arrayContaining([expect.objectContaining({ id: "char-rival", name: "林青" })])
    });
  });
});
