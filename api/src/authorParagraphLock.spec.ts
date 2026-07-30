import { describe, expect, it } from "vitest";
import { evaluateAuthorParagraphLocks } from "./authorParagraphLock.js";

const valid = { lockSetId: "locks-1", paragraphId: "p-1", authorText: "The gate stayed shut, and Mara kept the key.", candidateText: "The gate opened, and Mara dropped the key.", locks: [{ lockId: "l1", mode: "preserve_exact" as const, text: "The gate stayed shut" }, { lockId: "l2", mode: "preserve_function" as const, text: "Mara kept the key" }], authorEditedAt: "2026-07-30T00:00:00Z", sourceRefs: ["author://p-1"] };

describe("author paragraph lock", () => {
  it("gives author text precedence and reports each lock outcome", () => {
    const result = evaluateAuthorParagraphLocks(valid);
    expect(result.status).toBe("ready");
    expect(result.lockResults.find((item) => item.lockId === "l1")?.status).toBe("preserved");
    expect(result.appliedText).toContain("gate stayed shut");
  });

  it("allows meaning/function locks only when their contract remains", () => {
    const result = evaluateAuthorParagraphLocks({ ...valid, candidateText: "The gate stayed shut, and Mara guarded the key." });
    expect(result.lockResults.find((item) => item.lockId === "l2")?.status).toBe("preserved");
  });

  it("requires evidence and rejects unknown lock modes", () => {
    expect(() => evaluateAuthorParagraphLocks({ ...valid, sourceRefs: [] })).toThrow("AUTHOR_LOCK_EVIDENCE_REQUIRED");
    expect(() => evaluateAuthorParagraphLocks({ ...valid, locks: [{ ...valid.locks[0], mode: "freeform" as never }] })).toThrow("AUTHOR_LOCK_MODE_INVALID");
  });
});
