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
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
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

  it("injects dashboard, scene cards, and structured ledgers before target draft text", async () => {
    const project = createProjectSkeleton({ title: "Cockpit Context", roughIdea: "Structure matters." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);

    await fs.writeFile(
      path.join(root, "dashboard", "chapter-001.json"),
      JSON.stringify(
        {
          chapterId: "chapter-001",
          goal: "Make the price of the clue visible.",
          pov: "Hero",
          mainConflict: "Stay hidden or act.",
          endingHook: "The seal answers.",
          wordCount: 900,
          status: "drafting",
          unresolvedForeshadowingIds: ["f-1"],
          continuityRiskIds: ["risk-1"],
          updatedAt: "2026-06-04T00:00:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "scenes", "chapter-001.json"),
      JSON.stringify([{ id: "scene-1", title: "Pressure before action", order: 1 }], null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "ledger", "risks.json"),
      JSON.stringify([{ id: "risk-1", kind: "risk", title: "POV boundary" }], null, 2),
      "utf8"
    );
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "TARGET DRAFT MARKER", "utf8");

    const blocks = await assembleContext("chapter.draft", root, project, { chapterId: "chapter-001" });
    const joined = blocks.map((block) => `${block.title}\n${block.content}`).join("\n\n");
    const sceneIndex = joined.indexOf("Pressure before action");
    const targetDraftIndex = joined.indexOf("TARGET DRAFT MARKER");

    expect(joined).toContain("Make the price of the clue visible.");
    expect(joined).toContain("Pressure before action");
    expect(joined).toContain("POV boundary");
    expect(sceneIndex).toBeGreaterThan(-1);
    expect(targetDraftIndex).toBeGreaterThan(-1);
    expect(sceneIndex).toBeLessThan(targetDraftIndex);
  });
});
