import { afterEach, describe, expect, it } from "vitest";
import { listAgentProfiles, normalizeAgentModelId, resolveAgentProfile } from "./agentConfig.js";

describe("agentConfig", () => {
  afterEach(() => {
    delete process.env.AI_AGENT_PROFILE_ID;
    delete process.env.AI_AGENT_PROFILES_JSON;
    delete process.env.CODEX_COMMAND;
    delete process.env.CODEX_MODEL;
    delete process.env.CLAUDE_CODE_COMMAND;
    delete process.env.CLAUDE_CODE_MODEL;
  });

  it("defaults to the trusted Codex CLI profile", () => {
    const profile = resolveAgentProfile();

    expect(profile.id).toBe("codex-cli");
    expect(profile.provider).toBe("codex");
    expect(profile.command).toBe("codex");
    expect(profile.allowCustomModel).toBe(true);
    expect(profile.models.map((model) => model.id)).toEqual(expect.arrayContaining(["gpt-5", "gpt-5.4", "gpt-5.5"]));
  });

  it("accepts future model ids without requiring a code-defined option", () => {
    expect(resolveAgentProfile({ modelId: "gpt-5.9" }).model).toBe("gpt-5.9");
    expect(normalizeAgentModelId("default")).toBeUndefined();
    expect(() => normalizeAgentModelId("gpt-5.5 && rm")).toThrow("Model id can only contain");
  });

  it("resolves Claude Code from a trusted profile id without reading project commands", () => {
    process.env.CLAUDE_CODE_COMMAND = "claude-custom";
    process.env.CLAUDE_CODE_MODEL = "sonnet";

    const profile = resolveAgentProfile({ profileId: "claude-code" });

    expect(profile.provider).toBe("claude-code");
    expect(profile.command).toBe("claude-custom");
    expect(profile.model).toBe("sonnet");
  });

  it("accepts server-side JSON profile overrides", () => {
    process.env.AI_AGENT_PROFILES_JSON = JSON.stringify([
      {
        id: "codex-cli",
        command: "codex-managed",
        model: "gpt-managed"
      },
      {
        id: "local-test-agent",
        label: "Local Test Agent",
        provider: "codex",
        command: "local-agent",
        model: "local-model",
        enabled: true,
        versionArgs: ["--version"],
        models: []
      }
    ]);

    expect(resolveAgentProfile({ profileId: "codex-cli" })).toMatchObject({
      command: "codex-managed",
      model: "gpt-managed"
    });
    expect(listAgentProfiles().map((profile) => profile.id)).toContain("local-test-agent");
  });
});
