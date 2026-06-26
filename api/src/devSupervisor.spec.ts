import { describe, expect, it } from "vitest";

import { createDevWatchSpecs } from "./devSupervisor.js";

describe("createDevWatchSpecs", () => {
  it("includes both the api server and runtime worker", () => {
    expect(createDevWatchSpecs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "api-server",
          entry: "src/server.ts",
          watch: true
        }),
        expect.objectContaining({
          name: "runtime-worker",
          entry: "src/runtimeWorker.ts",
          watch: true
        })
      ])
    );
  });
});
