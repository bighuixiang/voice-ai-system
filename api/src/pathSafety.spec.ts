import { describe, expect, it } from "vitest";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";

describe("pathSafety", () => {
  it("accepts safe project-relative paths", () => {
    expect(assertSafeNovelPath("chapters/chapter-001.md")).toBe("chapters/chapter-001.md");
  });

  it("rejects traversal and absolute paths", () => {
    expect(() => assertSafeNovelPath("../secret")).toThrow("Unsafe");
    expect(() => assertSafeNovelPath("chapters\\..\\secret")).toThrow("Unsafe");
    expect(() => assertSafeNovelPath("C:\\secret.txt")).toThrow("Unsafe");
  });

  it("keeps resolved paths inside the root", () => {
    const resolved = resolveInside("C:\\repo\\novels\\demo", "bible/world.md");
    expect(resolved).toContain("bible");
    expect(() => resolveInside("C:\\repo\\novels\\demo", "../outside.md")).toThrow();
  });
});
