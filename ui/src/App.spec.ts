import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";

describe("App.vue", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ projects: [] })
        })
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ library: { version: 1, assets: [], prompts: [], roles: [], skills: [], updatedAt: "now" } })
        })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the creative platform project hub", async () => {
    await router.push("/");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router]
      }
    });

    expect(wrapper.text()).toContain("创作生产平台");
    expect(wrapper.text()).toContain("先选项目，再进入工作台");
  });
});
