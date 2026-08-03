import { describe, expect, it } from "vitest";
import { assertRuntimeControlFreshness } from "./runtimeControlFence.js";

describe("runtime control freshness", () => {
  it("allows an omitted expectation for backward-compatible callers", () => {
    expect(() => assertRuntimeControlFreshness("2026-07-31T00:00:00.000Z", undefined)).not.toThrow();
  });
  it("accepts the matching run timestamp and rejects stale control", () => {
    expect(() => assertRuntimeControlFreshness("2026-07-31T00:00:00.000Z", "2026-07-31T00:00:00.000Z")).not.toThrow();
    expect(() => assertRuntimeControlFreshness("2026-07-31T00:00:00.000Z", "2026-07-31T00:01:00.000Z")).toThrow("RUNTIME_CONTROL_STALE");
  });
});
