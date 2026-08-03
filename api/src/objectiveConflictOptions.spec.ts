import { describe, expect, it } from "vitest";
import { buildObjectiveConflictOptions } from "./objectiveConflictOptions.js";

describe("objective conflict options", () => {
  it("offers distinct red-blue paths instead of a mechanical average", () => {
    const options = buildObjectiveConflictOptions({ left: "关系慢热", right: "前三章有明确情感吸引" });
    expect(options.map((option) => option.strategy)).toEqual(["暗线吸引", "外部合作", "推迟承诺"]);
    expect(new Set(options.map((option) => option.impact)).size).toBe(3);
  });
});
