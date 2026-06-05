import fs from "node:fs/promises";
import path from "node:path";
import type { AiScenarioConfig, AiUsageScenarioKey, PlatformAiConfig } from "./types.js";
import { getPlatformRoot } from "./workspace.js";

const configFileName = "ai-config.json";
const scenarioKeys: AiUsageScenarioKey[] = ["novel", "assets", "script", "image-generation", "video-generation"];

function nowIso(): string {
  return new Date().toISOString();
}

function configPath(): string {
  return path.join(getPlatformRoot(), configFileName);
}

function defaultScenarioConfig(): AiScenarioConfig {
  return {
    profileId: process.env.AI_AGENT_PROFILE_ID || "codex-cli",
    modelId: process.env.CODEX_MODEL
  };
}

export function defaultPlatformAiConfig(): PlatformAiConfig {
  const scenarioConfig = defaultScenarioConfig();
  return {
    version: 1,
    defaultScenario: "novel",
    scenarios: scenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: { ...scenarioConfig }
      }),
      {} as Record<AiUsageScenarioKey, AiScenarioConfig>
    ),
    updatedAt: nowIso()
  };
}

export function mergePlatformAiConfig(input: Partial<PlatformAiConfig> | null | undefined): PlatformAiConfig {
  const defaults = defaultPlatformAiConfig();
  const inputScenarios = input?.scenarios || {};
  return {
    version: 1,
    defaultScenario: scenarioKeys.includes(input?.defaultScenario as AiUsageScenarioKey)
      ? (input?.defaultScenario as AiUsageScenarioKey)
      : defaults.defaultScenario,
    scenarios: scenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: {
          ...defaults.scenarios[key],
          ...(inputScenarios as Partial<Record<AiUsageScenarioKey, Partial<AiScenarioConfig>>>)[key]
        }
      }),
      {} as Record<AiUsageScenarioKey, AiScenarioConfig>
    ),
    updatedAt: input?.updatedAt || defaults.updatedAt
  };
}

export async function readPlatformAiConfig(): Promise<PlatformAiConfig> {
  const raw = await fs.readFile(configPath(), "utf8").catch(() => "");
  if (!raw) {
    const config = defaultPlatformAiConfig();
    await writePlatformAiConfig(config);
    return config;
  }
  return mergePlatformAiConfig(JSON.parse(raw) as Partial<PlatformAiConfig>);
}

export async function writePlatformAiConfig(config: PlatformAiConfig): Promise<PlatformAiConfig> {
  const nextConfig = {
    ...mergePlatformAiConfig(config),
    updatedAt: nowIso()
  };
  await fs.mkdir(getPlatformRoot(), { recursive: true });
  await fs.writeFile(configPath(), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

export function aiScenarioKeys(): AiUsageScenarioKey[] {
  return [...scenarioKeys];
}
