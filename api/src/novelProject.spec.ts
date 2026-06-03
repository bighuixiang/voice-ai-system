import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, slugify } from "./novelProject.js";

let tempRoot = "";

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
  delete process.env.NOVELS_ROOT;
  delete process.env.NOVEL_DB_PATH;
});

describe("novelProject", () => {
  it("creates a project skeleton from a rough idea", () => {
    const project = createProjectSkeleton({
      title: "Nine Gates",
      genre: "fantasy",
      roughIdea: "A grounded progression story."
    });

    expect(project.title).toBe("Nine Gates");
    expect(project.chapters).toHaveLength(3);
    expect(project.chapters[0].contentPath).toBe("chapters/chapter-001.md");
    expect(project.modules?.map((module) => module.key)).toEqual([
      "novel",
      "assets",
      "script",
      "image-generation",
      "video-generation"
    ]);
  });

  it("falls back to a generated slug for non-ascii titles", () => {
    expect(slugify("九连山")).toMatch(/^novel-/);
  });

  it("creates future platform asset and script folders", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-project-platform-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({
      title: "Platform Demo",
      genre: "fantasy",
      roughIdea: "A story that will later become video."
    });

    await createProjectFiles(project);

    const charactersDir = await fs.stat(path.join(tempRoot, "platform-demo", "assets", "characters"));
    expect(charactersDir.isDirectory()).toBe(true);
    await expect(fs.readFile(path.join(tempRoot, "platform-demo", "assets", "README.md"), "utf8")).resolves.toContain(
      "Asset Management"
    );
    await expect(fs.readFile(path.join(tempRoot, "platform-demo", "scripts", "README.md"), "utf8")).resolves.toContain(
      "Script Production"
    );
  });
});
