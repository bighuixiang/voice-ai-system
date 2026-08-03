import { describe, expect, it } from "vitest";
import { ContentAddressedCache, createContentAddressedCacheKey } from "./contentAddressedCache.js";

const keyInput = {
  contentHash: "content-1",
  schemaVersion: "story-contract.v1",
  promptVersion: "prompt.v3",
  modelSemanticVersion: "model-x.v2",
  executorSemanticVersion: "executor.v1",
  permissionScope: "project:private",
};

describe("content addressed cache", () => {
  it("binds keys to content, schema, model, executor and permission semantics", () => {
    const first = createContentAddressedCacheKey(keyInput);
    expect(first).toHaveLength(64);
    expect(createContentAddressedCacheKey({ ...keyInput, permissionScope: "project:public" })).not.toBe(first);
    expect(createContentAddressedCacheKey({ ...keyInput, modelSemanticVersion: "model-x.v3" })).not.toBe(first);
  });

  it("returns deterministic hits with token savings", () => {
    const cache = new ContentAddressedCache<string>();
    const key = createContentAddressedCacheKey(keyInput);
    cache.put(key, "draft", { tokens: 42 });
    expect(cache.get(key)).toMatchObject({ hit: true, value: "draft", savedTokens: 42 });
    expect(cache.get("missing")).toMatchObject({ hit: false, savedTokens: 0 });
  });

  it("records explicit invalidation reasons and prevents stale reads", () => {
    const cache = new ContentAddressedCache<string>();
    const key = createContentAddressedCacheKey(keyInput);
    cache.put(key, "draft", { tokens: 10 });
    expect(cache.invalidate(key, "MODEL_VERSION_CHANGED")).toMatchObject({ key, reason: "MODEL_VERSION_CHANGED" });
    expect(cache.get(key)).toMatchObject({ hit: false, invalidationReason: "MODEL_VERSION_CHANGED" });
  });

  it("rejects incomplete semantic key inputs", () => {
    expect(() => createContentAddressedCacheKey({ ...keyInput, permissionScope: "" })).toThrow("CACHE_KEY_FIELDS_REQUIRED");
  });
  it("rejects malformed cache entries and invalidation reasons", () => { const cache = new ContentAddressedCache<string>(); const key = createContentAddressedCacheKey(keyInput); expect(() => cache.put("short", "draft", { tokens: 1 })).toThrow("CACHE_ENTRY_INVALID"); expect(() => cache.put(key, "draft", { tokens: 1.5 })).toThrow("CACHE_ENTRY_INVALID"); expect(() => cache.invalidate(key, "UNKNOWN" as never)).toThrow("CACHE_INVALIDATION_INVALID"); });
});
