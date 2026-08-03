import { describe, expect, it } from "vitest";
import { propagateMemoryForget } from "./memoryForgetPropagation.js";

describe("memory forget propagation", () => {
  it("removes a scoped preference from future retrieval while preserving published history", () => {
    const result = propagateMemoryForget({ memory: { memoryId: "m-1", scope: "scene", scopeId: "villain-pov", content: "少用比喻", status: "effective" }, reason: "author forgot this preference", indexContains: true, cacheContains: true, publishedVersionRefs: ["publication://v1"] });
    expect(result).toMatchObject({ memory: { status: "forgotten" }, indexAction: "remove", cacheAction: "invalidate", futureContextAction: "exclude", historyAction: "preserve", tombstone: { contentIncluded: false } });
  });

  it("does not silently repeat propagation", () => {
    expect(() => propagateMemoryForget({ memory: { memoryId: "m-1", scope: "project", scopeId: "demo", content: "x", status: "forgotten" }, reason: "repeat", indexContains: false, cacheContains: false, publishedVersionRefs: [] })).toThrow("MEMORY_ALREADY_FORGOTTEN");
  });
});
