import fs from "node:fs/promises";
import path from "node:path";
import type { AiScenarioConfig, AiUsageScenarioKey, KnowledgeEmbeddingConfig, KnowledgeEmbeddingProvider, PlatformAiConfig } from "./types.js";
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

function embeddingEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function defaultKnowledgeEmbeddingConfig(): KnowledgeEmbeddingConfig {
  const providerEnv = embeddingEnv("KNOWLEDGE_EMBEDDING_PROVIDER").toLowerCase();
  const provider: KnowledgeEmbeddingProvider = providerEnv === "openai-compatible" || providerEnv === "openai" ? "openai-compatible" : "local";
  return {
    provider,
    baseUrl: embeddingEnv("KNOWLEDGE_EMBEDDING_BASE_URL") || "https://api.openai.com/v1",
    model: embeddingEnv("KNOWLEDGE_EMBEDDING_MODEL") || "text-embedding-3-small",
    apiKey: embeddingEnv("KNOWLEDGE_EMBEDDING_API_KEY") || embeddingEnv("OPENAI_API_KEY") || undefined
  };
}

function mergeKnowledgeEmbeddingConfig(input?: Partial<KnowledgeEmbeddingConfig>): KnowledgeEmbeddingConfig {
  const defaults = defaultKnowledgeEmbeddingConfig();
  const provider = input?.provider === "openai-compatible" ? "openai-compatible" : input?.provider === "local" ? "local" : defaults.provider;
  const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : defaults.apiKey;
  return {
    provider,
    baseUrl: typeof input?.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : defaults.baseUrl,
    model: typeof input?.model === "string" && input.model.trim() ? input.model.trim() : defaults.model,
    apiKey,
    apiKeyConfigured: Boolean(apiKey || input?.apiKeyConfigured)
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
    knowledgeEmbedding: mergeKnowledgeEmbeddingConfig(),
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
    knowledgeEmbedding: mergeKnowledgeEmbeddingConfig(input?.knowledgeEmbedding),
    updatedAt: input?.updatedAt || defaults.updatedAt
  };
}

export function publicPlatformAiConfig(config: PlatformAiConfig): PlatformAiConfig {
  const { apiKey: _apiKey, ...embedding } = config.knowledgeEmbedding;
  return {
    ...config,
    knowledgeEmbedding: {
      ...embedding,
      apiKeyConfigured: Boolean(config.knowledgeEmbedding.apiKey || config.knowledgeEmbedding.apiKeyConfigured)
    }
  };
}

async function readStoredPlatformAiConfig(): Promise<Partial<PlatformAiConfig> | null> {
  const raw = await fs.readFile(configPath(), "utf8").catch(() => "");
  return raw ? (JSON.parse(raw) as Partial<PlatformAiConfig>) : null;
}

export async function readPlatformAiConfig(): Promise<PlatformAiConfig> {
  const stored = await readStoredPlatformAiConfig();
  if (!stored) {
    const config = defaultPlatformAiConfig();
    await writePlatformAiConfig(config);
    return config;
  }
  return mergePlatformAiConfig(stored);
}

export async function writePlatformAiConfig(config: PlatformAiConfig): Promise<PlatformAiConfig> {
  const existing = await readStoredPlatformAiConfig();
  const existingKey = existing?.knowledgeEmbedding?.apiKey;
  const inputEmbedding = config.knowledgeEmbedding || { provider: "local" as const };
  const knowledgeEmbedding = {
    ...inputEmbedding,
    apiKey: typeof inputEmbedding.apiKey === "string" && inputEmbedding.apiKey.trim()
      ? inputEmbedding.apiKey.trim()
      : inputEmbedding.apiKeyConfigured && existingKey
        ? existingKey
        : undefined
  };
  const nextConfig = {
    ...mergePlatformAiConfig({ ...config, knowledgeEmbedding }),
    updatedAt: nowIso()
  };
  await fs.mkdir(getPlatformRoot(), { recursive: true });
  await fs.writeFile(configPath(), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

export function aiScenarioKeys(): AiUsageScenarioKey[] {
  return [...scenarioKeys];
}
