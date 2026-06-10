import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { saveLedgerEntries, saveStoryControl } from "./writingCockpit.js";

let tempRoot = "";

describe("storyGraph", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "story-graph-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("projects story control and ledger state into graph nodes and edges", async () => {
    const project = createProjectSkeleton({ title: "Graph Demo", roughIdea: "Track story state." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    await saveStoryControl(root, {
      version: 1,
      premise: "A sealed gate creates a cost.",
      currentArcId: "arc-main",
      arcs: [
        {
          id: "arc-main",
          title: "Opening arc",
          chapterRange: "1-2",
          goal: "Open the gate.",
          stakes: "Exposure.",
          payoff: "A clue.",
          status: "active",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      characters: [
        {
          id: "hero",
          name: "Hero",
          role: "protagonist",
          goal: "Survive.",
          currentState: "Hiding.",
          knownSecrets: "",
          relationshipNotes: "",
          powerLevel: "",
          status: "active",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      events: [
        {
          id: "gate-opens",
          type: "reveal",
          title: "Gate opens",
          trigger: "Blood touches stone.",
          participants: ["Hero"],
          location: "Gate",
          conflict: "Hide or act.",
          reward: "A clue.",
          cost: "Exposure.",
          foreshadowing: "Blood mark.",
          chapterRange: "1",
          status: "planned",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      orchestrationNotes: "",
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await saveLedgerEntries(root, "foreshadowing", [
      {
        id: "foreshadow-1",
        kind: "foreshadowing",
        title: "Blood mark",
        status: "open",
        severity: "medium",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero"],
        note: "Pay this off later.",
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    ]);

    const graph = await buildStoryGraphProjection(root, project);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "arc:arc-main", type: "arc" }),
      expect.objectContaining({ id: "character:hero", type: "character" }),
      expect.objectContaining({ id: "event:gate-opens", type: "event" }),
      expect.objectContaining({ id: "ledger:foreshadow-1", type: "ledger" })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "arc:arc-main", target: "chapter:chapter-001", type: "contains" }),
      expect.objectContaining({ source: "event:gate-opens", target: "character:hero", type: "involves" }),
      expect.objectContaining({ source: "ledger:foreshadow-1", target: "chapter:chapter-001", type: "tracks" }),
      expect.objectContaining({ source: "ledger:foreshadow-1", target: "character:hero", type: "references" })
    ]));
  });
});
