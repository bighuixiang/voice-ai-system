import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import App from "./App.vue";

describe("App.vue", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ projects: [] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the novel workbench entry", () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(wrapper.text()).toContain("小说 Codex 创作工作台");
    expect(wrapper.text()).toContain("从一个粗略想法开始");
  });
});
