import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlatformLibraryPanel from "./PlatformLibraryPanel.vue";
import type { PlatformLibrary } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["loading", "disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-icon": { template: "<span><slot /></span>" },
  "el-tabs": { template: "<div><slot /></div>" },
  "el-tab-pane": { template: "<section><slot /></section>" },
  "el-tag": { template: "<span><slot /></span>" },
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
  "el-option": {
    props: ["label", "value"],
    template: `<option :value="value">{{ label }}</option>`
  },
  Connection: true,
  Plus: true,
  Refresh: true
};

const library: PlatformLibrary = {
  version: 1,
  assets: [
    {
      id: "asset-1",
      name: "Shared Sword",
      type: "prop",
      scope: "shared",
      tags: [],
      linkedProjects: ["other"],
      relatedNovelItems: [],
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z"
    }
  ],
  prompts: [
    {
      id: "prompt-1",
      title: "Character Image Prompt",
      category: "image",
      roleId: "role-1",
      prompt: "Build a reusable character image prompt.",
      tags: [],
      isSystem: true
    }
  ],
  roles: [
    {
      id: "role-1",
      name: "Image Director",
      domain: "image",
      systemPrompt: "Optimize visual consistency.",
      defaultPromptIds: ["prompt-1"]
    }
  ],
  skills: [
    {
      id: "skill-1",
      name: "image-prompt-optimizer",
      scope: "system",
      description: "Optimizes image prompts.",
      tags: [],
      enabled: true
    }
  ],
  updatedAt: "2026-06-03T00:00:00.000Z"
};

describe("PlatformLibraryPanel", () => {
  it("renders platform assets, prompts, roles, and skills", () => {
    const wrapper = mount(PlatformLibraryPanel, {
      props: { library, projectSlug: "demo" },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("Shared Sword");
    expect(wrapper.text()).toContain("Character Image Prompt");
    expect(wrapper.text()).toContain("Image Director");
    expect(wrapper.text()).toContain("image-prompt-optimizer");
  });

  it("emits a link event for assets not yet attached to the current project", async () => {
    const wrapper = mount(PlatformLibraryPanel, {
      props: { library, projectSlug: "demo" },
      global: { stubs }
    });

    await wrapper.find("button[aria-label='关联素材 Shared Sword']").trigger("click");

    expect(wrapper.emitted("link-asset")?.[0]).toEqual([library.assets[0]]);
  });

  it("renders the platform library copy returned by the API", () => {
    const wrapper = mount(PlatformLibraryPanel, {
      props: {
        library: {
          ...library,
          prompts: [
            {
              id: "prompt-long-novel-writer",
              title: "Longform Chapter Drafting",
              category: "novel",
              roleId: "role-long-novel-writer",
              prompt: "Define the irreversible chapter change and the price attached to it before drafting scenes.",
              tags: [],
              isSystem: true
            }
          ],
          roles: [
            {
              id: "role-long-novel-writer",
              name: "Long Novel Writer",
              domain: "novel",
              systemPrompt: "Turn outlines and chapter plans into publishable longform prose.",
              defaultPromptIds: ["prompt-long-novel-writer"]
            }
          ],
          skills: [
            {
              id: "skill-long-novel-writer",
              name: "long-novel-writer",
              scope: "system",
              description:
                "Quality-first longform drafting: design scene goals, escalate pressure, then pay off with consequence and a forward hook.",
              tags: ["novel"],
              enabled: true
            }
          ]
        },
        projectSlug: "demo"
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("Longform Chapter Drafting");
    expect(wrapper.text()).toContain("Long Novel Writer");
    expect(wrapper.text()).toContain("Quality-first longform drafting:");
  });
});
