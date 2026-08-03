import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { saveLedgerEntries, saveStoryControl } from "./writingCockpit.js";
import { createMemoryClaim, persistMemoryClaim, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";

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
          relationshipNotes: "Hero trusts Mentor but hides the blood mark.",
          powerLevel: "",
          status: "active",
          updatedAt: "2026-06-11T00:00:00.000Z"
        },
        {
          id: "mentor",
          name: "Mentor",
          role: "guide",
          goal: "Protect the gate secret.",
          currentState: "Watching Hero.",
          knownSecrets: "",
          relationshipNotes: "",
          powerLevel: "",
          status: "active",
          updatedAt: "2026-06-11T00:00:00.000Z"
        },
        {
          id: "shadow",
          name: "Shadow",
          role: "major support",
          goal: "Test the gate seekers.",
          currentState: "Waiting offscreen.",
          knownSecrets: "",
          relationshipNotes: "",
          powerLevel: "",
          status: "planned",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      events: [
        {
          id: "gate-opens",
          type: "reveal",
          title: "Gate opens",
          trigger: "Blood touches stone.",
          participants: ["Hero", "Mentor"],
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
    await fs.writeFile(
      path.join(root, "knowledge", "triples.jsonl"),
      `${JSON.stringify({
        id: "triple-gate-blood",
        subject: "Hero",
        predicate: "opens",
        object: "Sealed Gate",
        chapterIds: ["chapter-001"],
        sourceFactIds: ["fact-gate"],
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n${JSON.stringify({
        id: "triple-hero-mentor",
        subject: "Hero",
        predicate: "trusts",
        object: "Mentor",
        chapterIds: ["chapter-001"],
        sourceFactIds: ["fact-mentor"],
        updatedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const graph = await buildStoryGraphProjection(root, project);
    const saved = JSON.parse(await fs.readFile(path.join(root, "story-graph", "storyline.json"), "utf8"));

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "arc:arc-main", type: "arc" }),
      expect.objectContaining({ id: "character:hero", type: "character" }),
      expect.objectContaining({ id: "character:mentor", type: "character" }),
      expect.objectContaining({ id: "event:gate-opens", type: "event" }),
      expect.objectContaining({ id: "ledger:foreshadow-1", type: "ledger", sourceAuthority: "legacy-projection" }),
      expect.objectContaining({ id: "knowledge:hero", type: "knowledge" }),
      expect.objectContaining({ id: "knowledge:sealed-gate", type: "knowledge" })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "arc:arc-main", target: "chapter:chapter-001", type: "contains" }),
      expect.objectContaining({ source: "event:gate-opens", target: "character:hero", type: "involves" }),
      expect.objectContaining({ source: "event:gate-opens", target: "character:mentor", type: "involves" }),
      expect.objectContaining({ source: "ledger:foreshadow-1", target: "chapter:chapter-001", type: "tracks", sourceAuthority: "legacy-projection" }),
      expect.objectContaining({ source: "ledger:foreshadow-1", target: "character:hero", type: "references" }),
      expect.objectContaining({ source: "knowledge:hero", target: "knowledge:sealed-gate", type: "asserts", label: "opens", sourceAuthority: "unknown" }),
      expect.objectContaining({ source: "knowledge:hero", target: "chapter:chapter-001", type: "references", label: "knowledge" }),
      expect.objectContaining({ source: "character:hero", target: "character:mentor", type: "relationship", label: "trusts" }),
      expect.objectContaining({ source: "character:hero", target: "character:mentor", type: "relationship", label: "co-appears" }),
      expect.objectContaining({ source: "character:hero", target: "character:mentor", type: "relationship", label: "profile-note" })
    ]));
    expect(graph.characterRelations?.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceName: "Hero",
        targetName: "Mentor",
        label: "trusts",
        sourceTypes: ["knowledge"],
        chapterIds: ["chapter-001"]
      }),
      expect.objectContaining({
        sourceName: "Hero",
        targetName: "Mentor",
        label: "co-appears",
        sourceTypes: ["event"]
      })
    ]));
    expect(graph.characterRelations?.coverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Hero", relationshipCount: 3, isolated: false, hasProfileNote: true }),
      expect.objectContaining({ name: "Mentor", relationshipCount: 3, isolated: false }),
      expect.objectContaining({ name: "Shadow", relationshipCount: 0, isolated: true })
    ]));
    expect(graph.characterRelations?.appearanceSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Shadow",
        status: "should-appear",
        appearanceCount: 0,
        relationshipCount: 0
      })
    ]));
    expect(saved).toMatchObject({
      projectSlug: project.slug,
      nodes: expect.arrayContaining([expect.objectContaining({ id: "event:gate-opens" })]),
      edges: expect.arrayContaining([expect.objectContaining({ source: "event:gate-opens", target: "character:hero" })]),
      characterRelations: {
        relationships: expect.arrayContaining([expect.objectContaining({ label: "trusts" })]),
        appearanceSignals: expect.arrayContaining([expect.objectContaining({ name: "Shadow", status: "should-appear" })])
      }
    });
  });

  it("marks the graph stale when a canon claim has a pending replacement", async () => {
    const project = createProjectSkeleton({ title: "Graph Memory Gate", roughIdea: "Stale graph protection." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const settled = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "graph-claim", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const retcon = retconMemoryClaim({ claim: settled, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(root, settled, "settled", "original");
    await persistMemoryClaim(root, retcon.obsolete, "obsoleted", "retcon");
    await persistMemoryClaim(root, retcon.replacement, "created", "replacement");
    const graph = await buildStoryGraphProjection(root, project);
    expect(graph.memoryProjection).toMatchObject({ status: "replacement-pending", affectedClaimIds: ["graph-claim"] });
  });
});
