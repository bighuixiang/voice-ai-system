import { describe, expect, it } from "vitest";
import { evaluateMemoryVisibility, evaluateSourceVisibility } from "./memoryVisibility.js";

describe("memory visibility policy", () => {
  it("keeps author-only truth out of reader and character contexts", () => {
    expect(evaluateMemoryVisibility({ audience: "author", epistemicType: "author_truth", sourceVisibility: "author-only", authorized: true })).toMatchObject({ allowed: true });
    expect(evaluateMemoryVisibility({ audience: "reader", epistemicType: "author_truth", sourceVisibility: "author-only", authorized: true })).toMatchObject({ allowed: false, reason: "AUTHOR_ONLY_MEMORY" });
    expect(evaluateMemoryVisibility({ audience: "character", epistemicType: "author_truth", sourceVisibility: "author-only", authorized: true })).toMatchObject({ allowed: false, reason: "AUTHOR_ONLY_MEMORY" });
  });

  it("blocks unauthorized or secret-bearing memory regardless of relevance", () => {
    expect(evaluateMemoryVisibility({ audience: "author", epistemicType: "canon_fact", sourceVisibility: "reader-visible", authorized: false })).toMatchObject({ allowed: false, reason: "MEMORY_PERMISSION_REQUIRED" });
    expect(evaluateMemoryVisibility({ audience: "reader", epistemicType: "reader_known", sourceVisibility: "reader-visible", authorized: true, secret: true })).toMatchObject({ allowed: false, reason: "MEMORY_SECRET_BOUNDARY" });
  });

  it("applies the same firewall to non-memory sources and model-task contexts", () => {
    expect(evaluateSourceVisibility({ audience: "model-task", sourceType: "chapter-summary", sourceVisibility: "author-only", authorized: true })).toMatchObject({ allowed: false, reason: "MODEL_TASK_SOURCE_VISIBILITY_REQUIRED" });
    expect(evaluateSourceVisibility({ audience: "model-task", sourceType: "chapter-summary", sourceVisibility: "public", authorized: true })).toMatchObject({ allowed: true });
    expect(evaluateSourceVisibility({ audience: "reader", sourceType: "ledger", sourceVisibility: "author-only", authorized: true })).toMatchObject({ allowed: false, reason: "AUTHOR_ONLY_SOURCE" });
  });
});
