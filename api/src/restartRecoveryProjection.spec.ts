import { describe, expect, it } from "vitest";
import { rebuildAfterRestart } from "./restartRecoveryProjection.js";

describe("restart recovery projection", () => {
  it("rebuilds one answer and current understanding after a crash before projection", () => {
    const result = rebuildAfterRestart([{ type: "answer", id: "a-1", questionId: "q-1", status: "confirmed", value: "A" }, { type: "answer", id: "a-duplicate", questionId: "q-1", status: "confirmed", value: "A" }, { type: "understanding", id: "u-1", status: "current", value: "facts-v1" }, { type: "understanding", id: "u-2", status: "current", value: "facts-v2" }, { type: "task", id: "t-1", status: "running" }, { type: "candidate", id: "c-isolated", status: "isolated", canonWritten: true }, { type: "candidate", id: "c-canon", status: "adopted", canonWritten: true }]);
    expect(result.answers).toHaveLength(1);
    expect(result.understanding?.value).toBe("facts-v2");
    expect(result.tasks).toHaveLength(1);
    expect(result.canonCandidates.map((candidate) => candidate.id)).toEqual(["c-canon"]);
  });
});
