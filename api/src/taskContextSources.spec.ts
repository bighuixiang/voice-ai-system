import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTaskContextSources } from "./taskContextSources.js";

describe("task context source mapping", () => {
  it("maps exact and boundary-trimmed blocks to real files and versions", async () => {
    const root = path.join(process.cwd(), ".tmp-task-context-sources");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(path.join(root, "bible"), { recursive: true });
    const world = `BEGIN-${"world-rule-".repeat(30)}END`;
    await fs.writeFile(path.join(root, "project.json"), "{\"title\":\"Demo\"}", "utf8");
    await fs.writeFile(path.join(root, "bible", "world.md"), world, "utf8");
    const trimmed = `${world.slice(0, 30)}\n\n[...middle... ]\n\n${world.slice(-30)}`;
    const result = await resolveTaskContextSources(root, [
      { title: "Project", content: "{\"title\":\"Demo\"}" },
      { title: "World", content: trimmed },
      { title: "Generated", content: "not from a file" }
    ], ["project.json", "bible/world.md"]);

    expect(result.Project).toMatchObject({ refs: ["project.json"], version: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.World).toMatchObject({ refs: ["bible/world.md"], version: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.Generated).toBeUndefined();
    await fs.rm(root, { recursive: true, force: true });
  });
});
