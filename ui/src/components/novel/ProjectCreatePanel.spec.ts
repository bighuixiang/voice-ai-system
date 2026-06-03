import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectCreatePanel from "./ProjectCreatePanel.vue";
import { ElMessage } from "element-plus";

const mockStore = vi.hoisted(() => ({
  createProject: vi.fn()
}));

vi.mock("@/stores/novel", () => ({
  useNovelStore: () => mockStore
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn()
  }
}));

const stubs = {
  "el-form": { template: `<form @submit.prevent="$emit('submit')"><slot /></form>` },
  "el-form-item": { template: `<label><slot /></label>` },
  "el-input": {
    props: ["modelValue", "type"],
    emits: ["update:modelValue"],
    template: `
      <textarea
        v-if="type === 'textarea'"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <input
        v-else
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    `
  },
  "el-button": {
    props: ["loading"],
    emits: ["click"],
    template: `<button type="button" :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  Plus: true
};

describe("ProjectCreatePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.createProject.mockResolvedValue(undefined);
  });

  it("warns instead of creating a project without a rough idea", async () => {
    const wrapper = mount(ProjectCreatePanel, { global: { stubs } });

    await wrapper.find("button").trigger("click");

    expect(ElMessage.warning).toHaveBeenCalled();
    expect(mockStore.createProject).not.toHaveBeenCalled();
  });

  it("submits title, genre, and rough idea to the store", async () => {
    const wrapper = mount(ProjectCreatePanel, { global: { stubs } });
    const fields = wrapper.findAll("input, textarea");

    await fields[0].setValue("Demo Novel");
    await fields[1].setValue("fantasy");
    await fields[2].setValue("A grounded progression story.");
    await wrapper.find("button").trigger("click");

    expect(mockStore.createProject).toHaveBeenCalledWith({
      title: "Demo Novel",
      genre: "fantasy",
      roughIdea: "A grounded progression story."
    });
    expect(ElMessage.success).toHaveBeenCalled();
  });
});
