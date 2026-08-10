import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("test temporary-directory isolation", () => {
  it("runs with a dedicated temporary root", () => {
    expect(path.basename(os.tmpdir())).toMatch(/^voice-ai-system-vitest-/);
  });
});
