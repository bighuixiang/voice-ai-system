import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  databaseInfo,
  deleteProjectRecord,
  listProjectRecords,
  readPlatformLibraryFromDatabase,
  replacePlatformLibrary,
  upsertProjectRecord
} from "./database.js";
import type { NovelProject, PlatformLibrary } from "./types.js";

let tempRoot = "";

const project: NovelProject = {
  id: "demo",
  slug: "demo",
  title: "Demo",
  genre: "fantasy",
  roughIdea: "A sealed gate.",
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
  lastOpenedChapterId: "chapter-001",
  codex: { command: "codex" },
  chapters: [
    {
      id: "chapter-001",
      title: "Chapter 1",
      outlinePath: "outline/chapter-001.md",
      contentPath: "chapters/chapter-001.md",
      status: "empty"
    }
  ]
};

const library: PlatformLibrary = {
  version: 1,
  assets: [
    {
      id: "asset-1",
      name: "Shared Sword",
      type: "prop",
      scope: "shared",
      tags: ["weapon"],
      linkedProjects: ["demo"],
      relatedNovelItems: [],
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z"
    }
  ],
  prompts: [],
  roles: [],
  skills: [],
  updatedAt: "2026-06-03T00:00:00.000Z"
};

describe("SQLite database", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-sqlite-"));
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
  });

  afterEach(async () => {
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("persists project index and platform library metadata in SQLite", () => {
    upsertProjectRecord(project, path.join(tempRoot, "novels", "demo"));
    replacePlatformLibrary(library);

    expect(databaseInfo().exists).toBe(true);
    expect(listProjectRecords().map((item) => item.slug)).toEqual(["demo"]);
    expect(readPlatformLibraryFromDatabase({ ...library, assets: [] }).assets).toEqual([
      expect.objectContaining({ id: "asset-1", linkedProjects: ["demo"] })
    ]);
  });

  it("deletes a project index record", () => {
    upsertProjectRecord(project, path.join(tempRoot, "novels", "demo"));

    deleteProjectRecord(project.slug);

    expect(listProjectRecords()).toEqual([]);
  });
});
