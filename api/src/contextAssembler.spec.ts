import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleContext } from "./contextAssembler.js";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";

let tempRoot = "";

describe("contextAssembler", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-context-"));
    process.env.NOVELS_ROOT = tempRoot;
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("injects project, bible, outline, ledger, and target chapter context for draft tasks", async () => {
    const project = createProjectSkeleton({ title: "Context Demo", roughIdea: "Context matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await fs.writeFile(path.join(root, "bible", "characters.md"), "Hero knows only local facts.", "utf8");
    await fs.writeFile(path.join(root, "outline", "volume-01.md"), "Volume plan with causal steps.", "utf8");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });

    expect(blocks.length).toBeGreaterThanOrEqual(9);
    expect(blocks.some((block) => block.content.includes('"slug": "context-demo"'))).toBe(true);
    expect(blocks.some((block) => block.content.includes("Hero knows only local facts."))).toBe(true);
    expect(blocks.some((block) => block.content.includes("Volume plan with causal steps."))).toBe(true);
  });

  it("limits selection polish context to the selected range and nearby text", async () => {
    const project = createProjectSkeleton({ title: "Selection Demo", roughIdea: "Selection matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    const blocks = await assembleContext("selection.polish", root, project, {
      selection: {
        mode: "polish",
        beforeText: "before",
        selectedText: "plain line",
        afterText: "after"
      }
    });

    const selectionBlock = blocks.find((block) => block.content.includes("plain line"));
    expect(selectionBlock?.content).toContain("polish");
    expect(selectionBlock?.content).toContain("before");
    expect(selectionBlock?.content).toContain("after");
  });
});
