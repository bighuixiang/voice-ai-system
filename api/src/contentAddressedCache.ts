import crypto from "node:crypto";

export interface ContentAddressedCacheKeyInput {
  contentHash: string;
  schemaVersion: string;
  promptVersion: string;
  modelSemanticVersion: string;
  executorSemanticVersion: string;
  permissionScope: string;
}

export type CacheInvalidationReason = "SOURCE_CHANGED" | "PERMISSION_CHANGED" | "AUTHOR_DECISION_CHANGED" | "MODEL_VERSION_CHANGED" | "EXECUTOR_VERSION_CHANGED" | "SCHEMA_CHANGED";

export interface CacheLookup<T> {
  hit: boolean;
  value?: T;
  savedTokens: number;
  invalidationReason?: CacheInvalidationReason;
}

interface CacheEntry<T> { value: T; savedTokens: number; invalidationReason?: CacheInvalidationReason; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createContentAddressedCacheKey(input: ContentAddressedCacheKeyInput): string {
  if (!Object.values(input).every((value) => typeof value === "string" && value.trim())) throw new Error("CACHE_KEY_FIELDS_REQUIRED");
  return hash({ keySchemaVersion: "content-addressed-cache-key.v1", ...input });
}

export class ContentAddressedCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  put(key: string, value: T, metadata: { tokens: number }): void {
    if (!/^[a-f0-9]{64}$/i.test(key) || !Number.isInteger(metadata.tokens) || metadata.tokens < 0) throw new Error("CACHE_ENTRY_INVALID");
    this.entries.set(key, { value, savedTokens: metadata.tokens });
  }

  get(key: string): CacheLookup<T> {
    const entry = this.entries.get(key);
    if (!entry) return { hit: false, savedTokens: 0 };
    if (entry.invalidationReason) return { hit: false, savedTokens: 0, invalidationReason: entry.invalidationReason };
    return { hit: true, value: entry.value, savedTokens: entry.savedTokens };
  }

  invalidate(key: string, reason: CacheInvalidationReason): { key: string; reason: CacheInvalidationReason } {
    if (!/^[a-f0-9]{64}$/i.test(key) || !["SOURCE_CHANGED", "PERMISSION_CHANGED", "AUTHOR_DECISION_CHANGED", "MODEL_VERSION_CHANGED", "EXECUTOR_VERSION_CHANGED", "SCHEMA_CHANGED"].includes(reason)) throw new Error("CACHE_INVALIDATION_INVALID");
    if (!this.entries.has(key)) return { key, reason };
    this.entries.set(key, { ...this.entries.get(key)!, invalidationReason: reason });
    return { key, reason };
  }
}
