import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SceneCardPanel from "./SceneCardPanel.vue";
import type { SceneCard } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "loading"],
    emits: ["click"],
    template: `<button v-bind="$attrs" :disabled="disabled" @click="$emit('click')"><slot /></button>`
  },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-icon": { template: "<span><slot /></span>" }
};

function scene(overrides: Partial<SceneCard> = {}): SceneCard {
  return {
    id: "scene-1",
    chapterId: "chapter-001",
    order: 1,
    title: "Opening pressure",
    time: "night",
    location: "Gate",
    pov: "Hero",
    characters: ["Hero"],
    conflict: "Stay hidden.",
    turn: "A sound exposes him.",
    informationReleased: ["The gate reacts."],
    foreshadowingIds: [],
    powerProgression: "First controlled response.",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides
  };
}

describe("SceneCardPanel", () => {
  it("adds a scene and emits the updated list", async () => {
    const wrapper = mount(SceneCardPanel, {
      props: { cards: [], isSaving: false },
      global: { stubs }
    });

    await wrapper.find('[aria-label="新增场景"]').trigger("click");

    expect(wrapper.emitted("update:cards")?.[0][0]).toHaveLength(1);
    expect(wrapper.text()).toContain("场景 1");
  });

  it("edits scene fields and saves normalized cards", async () => {
    const wrapper = mount(SceneCardPanel, {
      props: { cards: [scene()], isSaving: false },
      global: { stubs }
    });

    await wrapper.findAll("input")[0].setValue("Sharper scene");
    await wrapper.find('[aria-label="保存场景卡"]').trigger("click");

    expect(wrapper.emitted("update:cards")?.[0][0]).toEqual([expect.objectContaining({ title: "Sharper scene" })]);
    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("moves and deletes scenes with confirmation", async () => {
    const confirmDelete = vi.fn(() => true);
    const wrapper = mount(SceneCardPanel, {
      props: {
        cards: [scene({ id: "scene-1", order: 1 }), scene({ id: "scene-2", order: 2, title: "Second scene" })],
        isSaving: false,
        confirmDelete
      },
      global: { stubs }
    });

    await wrapper.find('[aria-label="下移场景"]').trigger("click");
    expect((wrapper.emitted("update:cards")?.[0][0] as SceneCard[]).map((card) => card.id)).toEqual(["scene-2", "scene-1"]);

    await wrapper.find('[aria-label="删除场景"]').trigger("click");
    expect(confirmDelete).toHaveBeenCalled();
    expect((wrapper.emitted("update:cards")?.[1][0] as SceneCard[]).map((card) => card.id)).toEqual(["scene-1"]);
  });
});
