import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildNarrativeObligationCandidates } from "./obligationCandidates.js";
import { createNarrativeObligation, listNarrativeObligations } from "./narrativeObligation.js";

describe("narrative obligation candidate projection", () => {
  it("deduplicates a planned marker across scenes and preserves source references without admitting it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-candidates-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    const card = (chapterId: string, sceneId: string) => ({ id: sceneId, chapterId, order: 1, title: sceneId, time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-demo-001"], powerProgression: "", updatedAt: new Date().toISOString() });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([card("chapter-001", "scene-1")]));
    await fs.writeFile(path.join(root, "scenes", "chapter-002.json"), JSON.stringify([card("chapter-002", "scene-2")]));
    const candidates = await buildNarrativeObligationCandidates(root, ["chapter-002", "chapter-001"]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ markerId: "FS-demo-001", status: "candidate", chapterIds: ["chapter-001", "chapter-002"], existingObligationId: null });
    expect(candidates[0].sourceRefs).toEqual(["scene://chapter-001#scene-1", "scene://chapter-002#scene-2"]);
  });

  it("links an existing obligation by marker source but does not change its status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-candidates-linked-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([{ id: "scene-1", chapterId: "chapter-001", order: 1, title: "Gate", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-demo-001"], powerProgression: "", updatedAt: new Date().toISOString() }]));
    const existing = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?", sourceRefs: ["FS-demo-001"] });
    const candidates = await buildNarrativeObligationCandidates(root, ["chapter-001"]);
    expect(candidates[0].existingObligationId).toBe(existing.obligationId);
    expect(candidates[0].status).toBe("candidate");
    expect((await fs.readFile(path.join(root, "sessions", "obligations", `${existing.obligationId}.json`), "utf8"))).toContain('"status": "proposed"');
  });

  it("extracts candidates from dashboard and legacy ledger assets when no scene marker exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-candidates-assets-"));
    await fs.mkdir(path.join(root, "dashboard"), { recursive: true });
    await fs.mkdir(path.join(root, "ledger"), { recursive: true });
    await fs.writeFile(path.join(root, "dashboard", "chapter-001.json"), JSON.stringify({ unresolvedForeshadowingIds: ["FS-dashboard-001"] }));
    await fs.writeFile(path.join(root, "ledger", "foreshadowing.json"), JSON.stringify([{ id: "FS-ledger-001", kind: "foreshadowing", status: "open", description: "legacy marker" }]));
    const candidates = await buildNarrativeObligationCandidates(root, ["chapter-001"]);
    expect(candidates.map((candidate) => candidate.markerId)).toEqual(["FS-dashboard-001", "FS-ledger-001"]);
    expect(candidates.find((candidate) => candidate.markerId === "FS-dashboard-001")?.sourceRefs).toEqual(["dashboard://chapter-001"]);
    expect(candidates.find((candidate) => candidate.markerId === "FS-ledger-001")?.sourceRefs).toEqual(["ledger://foreshadowing#FS-ledger-001"]);
    expect(await listNarrativeObligations(root)).toEqual([]);
  });

  it("unifies StoryEvent foreshadowing and CraftBeat setup references into the same candidate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-candidates-story-assets-"));
    await fs.mkdir(path.join(root, "story-control"), { recursive: true });
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "story-control", "story-control.json"), JSON.stringify({ version: 1, premise: "", currentArcId: "", arcs: [], characters: [], events: [{ id: "event-001", type: "reveal", title: "Reveal", trigger: "", participants: [], location: "", conflict: "", reward: "", cost: "", foreshadowing: "FS-shared-001", chapterRange: "1-3", status: "planned", updatedAt: new Date().toISOString(), craftBeats: [] }], orchestrationNotes: "", updatedAt: new Date().toISOString() }));
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([{ id: "scene-1", chapterId: "chapter-001", order: 1, title: "Setup", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: [], powerProgression: "", craftBeats: [{ id: "beat-1", type: "foreshadow_setup", label: "FS-shared-001", setup: "plant clue", status: "planned" }], updatedAt: new Date().toISOString() }]));
    const candidates = await buildNarrativeObligationCandidates(root, ["chapter-001"]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ markerId: "FS-shared-001", sourceRefs: ["craft://chapter-001#beat-1", "story-event://event-001"] });
  });
});
