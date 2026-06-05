import { spawn } from "node:child_process";
import type { AiAgentProfile, AiAgentProvider } from "./types.js";

export interface AgentResolveInput {
  profileId?: string;
  modelId?: string;
}

export interface AgentCheckResult {
  available: boolean;
  profileId: string;
  provider: AiAgentProvider;
  label: string;
  command: string;
  version?: string;
  error?: string;
}

const modelIdPattern = /^[A-Za-z0-9._:/@-]{1,120}$/;

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function normalizeAgentModelId(value: string | undefined): string | undefined {
  const modelId = value?.trim();
  if (!modelId || modelId === "default") return undefined;
  if (!modelIdPattern.test(modelId)) {
    throw new Error("Model id can only contain letters, numbers, dots, dashes, underscores, colons, slashes, and @");
  }
  return modelId;
}

function defaultProfiles(): AiAgentProfile[] {
  const codexModel = process.env.CODEX_MODEL;
  const claudeModel = process.env.CLAUDE_CODE_MODEL;

  return [
    {
      id: "codex-cli",
      label: "Codex CLI",
      provider: "codex",
      command: process.env.CODEX_COMMAND || "codex",
      model: codexModel,
      allowCustomModel: true,
      enabled: boolFromEnv(process.env.CODEX_ENABLED, true),
      versionArgs: ["--version"],
      models: [
        { id: codexModel || "default", label: codexModel || "Codex 默认模型", provider: "codex" },
        { id: "gpt-5", label: "GPT-5", provider: "codex", tags: ["写作", "推理", "长上下文"] },
        { id: "gpt-5.4", label: "GPT-5.4", provider: "codex", tags: ["写作", "长上下文"] },
        { id: "gpt-5.5", label: "GPT-5.5", provider: "codex", tags: ["写作", "深度"] },
        { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "codex", tags: ["快速", "低成本"] }
      ]
    },
    {
      id: "claude-code",
      label: "Claude Code CLI",
      provider: "claude-code",
      command: process.env.CLAUDE_CODE_COMMAND || "claude",
      model: claudeModel,
      allowCustomModel: true,
      enabled: boolFromEnv(process.env.CLAUDE_CODE_ENABLED, true),
      versionArgs: ["--version"],
      models: [
        { id: claudeModel || "default", label: claudeModel || "Claude 默认模型", provider: "claude-code", tags: ["文笔", "长篇"] },
        { id: "opus", label: "Claude Opus", provider: "claude-code", tags: ["深度", "审稿"] },
        { id: "sonnet", label: "Claude Sonnet", provider: "claude-code", tags: ["均衡", "写作"] },
        { id: "haiku", label: "Claude Haiku", provider: "claude-code", tags: ["快速", "灵感"] }
      ]
    }
  ];
}

function mergeProfile(base: AiAgentProfile, patch: Partial<AiAgentProfile>): AiAgentProfile {
  return {
    ...base,
    ...patch,
    allowCustomModel: patch.allowCustomModel ?? base.allowCustomModel,
    models: patch.models || base.models,
    versionArgs: patch.versionArgs || base.versionArgs
  };
}

function configuredProfiles(): AiAgentProfile[] {
  const profiles = defaultProfiles();
  const rawConfig = process.env.AI_AGENT_PROFILES_JSON;
  if (!rawConfig) return profiles;

  const parsed = JSON.parse(rawConfig) as Array<Partial<AiAgentProfile> & { id: string }>;
  for (const patch of parsed) {
    const index = profiles.findIndex((profile) => profile.id === patch.id);
    if (index >= 0) {
      profiles[index] = mergeProfile(profiles[index], patch);
    } else {
      profiles.push({
        label: patch.id,
        provider: "codex",
        command: "codex",
        allowCustomModel: true,
        enabled: true,
        versionArgs: ["--version"],
        models: [],
        ...patch
      });
    }
  }
  return profiles;
}

export function listAgentProfiles(): AiAgentProfile[] {
  return configuredProfiles().filter((profile) => profile.enabled);
}

export function resolveAgentProfile(input: AgentResolveInput = {}): AiAgentProfile {
  const profiles = listAgentProfiles();
  const requestedId = input.profileId || process.env.AI_AGENT_PROFILE_ID || "codex-cli";
  const profile = profiles.find((item) => item.id === requestedId) || profiles.find((item) => item.id === "codex-cli") || profiles[0];
  if (!profile) {
    throw new Error("No AI agent profiles are enabled");
  }

  const model = normalizeAgentModelId(input.modelId || profile.model);
  return { ...profile, model };
}

export function checkAgentAvailability(input: AgentResolveInput = {}): Promise<AgentCheckResult> {
  const profile = resolveAgentProfile(input);
  return new Promise((resolve) => {
    const child = spawn(profile.command, profile.versionArgs || ["--version"], { shell: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({
        available: false,
        profileId: profile.id,
        provider: profile.provider,
        label: profile.label,
        command: profile.command,
        error: error.message
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          available: true,
          profileId: profile.id,
          provider: profile.provider,
          label: profile.label,
          command: profile.command,
          version: stdout.trim() || stderr.trim()
        });
        return;
      }

      resolve({
        available: false,
        profileId: profile.id,
        provider: profile.provider,
        label: profile.label,
        command: profile.command,
        error: stderr.trim() || `Exit code ${code}`
      });
    });
  });
}

export async function checkAllAgentAvailability(): Promise<AgentCheckResult[]> {
  return Promise.all(listAgentProfiles().map((profile) => checkAgentAvailability({ profileId: profile.id })));
}
