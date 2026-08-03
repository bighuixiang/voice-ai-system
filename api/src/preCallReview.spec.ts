import { describe, expect, it } from "vitest";
import { preCallReview } from "./taskService.js";

describe("pre-call context review", () => {
  it("blocks missing required context before an executor can run", () => {
    const result = preCallReview("write", { blockCount: 0, totalChars: 0, blocks: [] });
    expect(result).toMatchObject({ status: "block", warnings: ["missing-context", "missing-critical-context"] });
  });

  it("warns on optional compression pressure without weakening hard gates", () => {
    const result = preCallReview("write", { blockCount: 2, totalChars: 10, tierCounts: { T0: 1 }, truncatedBlocks: ["a", "b", "c", "d"], blocks: [] });
    expect(result).toMatchObject({ status: "warn", warnings: ["multiple-context-blocks-truncated"] });
  });
});
