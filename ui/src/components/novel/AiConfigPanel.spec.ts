import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AiConfigPanel from "./AiConfigPanel.vue";
import type { AiAgentProfile, PlatformAiConfig } from "@/types/novel";

const stubs = {
  "el-button": {
    props: ["disabled", "loading", "type"],
    emits: ["click"],
    template: `<button :data-type="type" :disabled="disabled" @click="$emit('click')"><slot /></button>`
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
  "el-input": {
    props: ["modelValue", "disabled", "type", "placeholder"],
    emits: ["update:modelValue"],
    template: `<input :type="type || 'text'" :value="modelValue" :disabled="disabled" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  "el-icon": { template: "<span><slot /></span>" }
};

const config: PlatformAiConfig = {
  version: 1,
  defaultScenario: "novel",
  scenarios: {
    novel: { profileId: "codex-cli" },
    assets: { profileId: "codex-cli" },
    script: { profileId: "codex-cli" },
    "image-generation": { profileId: "codex-cli" },
    "video-generation": { profileId: "codex-cli" }
  },
  knowledgeEmbedding: {
    provider: "local",
    baseUrl: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    apiKeyConfigured: false
  },
  updatedAt: "2026-06-05T00:00:00.000Z"
};

const profiles: AiAgentProfile[] = [
  {
    id: "codex-cli",
    label: "Codex CLI",
    provider: "codex",
    models: [{ id: "gpt-5", label: "GPT-5" }],
    defaultModel: "gpt-5",
    allowCustomModel: true
  },
  {
    id: "claude-code",
    label: "Claude Code CLI",
    provider: "claude-code",
    models: [{ id: "sonnet", label: "Sonnet" }],
    defaultModel: "sonnet",
    allowCustomModel: true
  }
];

describe("AiConfigPanel", () => {
  it("saves executor and model by usage scenario", async () => {
    const wrapper = mount(AiConfigPanel, {
      props: { config, profiles, checks: [] },
      global: { stubs }
    });

    await wrapper.findAll(".scenario-pane button")[1].trigger("click");
    const selects = wrapper.findAll("select");
    await selects[0].setValue("claude-code");
    await selects[1].setValue("sonnet");
    await wrapper.find('.panel-actions button[data-type="primary"]').trigger("click");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      scenarios: {
        assets: { profileId: "claude-code", modelId: "sonnet" },
        novel: { profileId: "codex-cli" }
      },
      knowledgeEmbedding: {
        provider: "local"
      }
    });
  });

  it("saves knowledge embedding provider settings", async () => {
    const wrapper = mount(AiConfigPanel, {
      props: { config, profiles, checks: [] },
      global: { stubs }
    });

    const selects = wrapper.findAll("select");
    await selects[2].setValue("openai-compatible");
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("https://embeddings.example/v1");
    await inputs[1].setValue("embedding-test");
    await inputs[2].setValue("secret-key");
    await wrapper.find('.panel-actions button[data-type="primary"]').trigger("click");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      knowledgeEmbedding: {
        provider: "openai-compatible",
        baseUrl: "https://embeddings.example/v1",
        model: "embedding-test",
        apiKey: "secret-key"
      }
    });
  });

  it("does not render an existing raw embedding API key from props", () => {
    const wrapper = mount(AiConfigPanel, {
      props: {
        config: {
          ...config,
          knowledgeEmbedding: {
            provider: "openai-compatible",
            baseUrl: "https://embeddings.example/v1",
            model: "embedding-test",
            apiKeyConfigured: true,
            apiKey: "raw-secret"
          }
        },
        profiles,
        checks: []
      },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("接口密钥已配置");
    expect(wrapper.html()).not.toContain("raw-secret");
  });
});
