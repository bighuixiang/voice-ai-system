import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditNarrativeObligationCoverage } from "./obligationCoverage.js";
import { createNarrativeObligation } from "./narrativeObligation.js";

describe("narrative obligation source coverage", () => {
  it("reports planned scene ids as orphan markers and does not treat an empty ledger as complete", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-coverage-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.mkdir(path.join(root, "dashboard"), { recursive: true });
    await fs.mkdir(path.join(root, "ledger"), { recursive: true });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([
      { id: "scene-1", chapterId: "chapter-001", order: 1, title: "Gate", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-demo-001", "FS-demo-002"], powerProgression: "", updatedAt: new Date().toISOString() }
    ]));
    await fs.writeFile(path.join(root, "dashboard", "chapter-001.json"), JSON.stringify({ chapterId: "chapter-001", unresolvedForeshadowingIds: ["FS-demo-002"] }));
    await fs.writeFile(path.join(root, "ledger", "foreshadowing.json"), "[]\n");
    const report = await auditNarrativeObligationCoverage(root, ["chapter-001"]);
    expect(report.plannedIds).toEqual(["FS-demo-001", "FS-demo-002"]);
    expect(report.orphanPlannedIds).toEqual(["FS-demo-001", "FS-demo-002"]);
    expect(report.sourceCoverageStatus).toBe("empty-assets-coverage-unknown");
    expect(report.canClaimNoOpenObligations).toBe(false);
    expect(report.coverageMissing).toBe(true);
    expect(report.unconfirmedCandidates).toEqual(["FS-demo-001", "FS-demo-002"]);
  });

  it("recognizes a registered obligation without claiming payoff completion", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-coverage-registered-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([{ id: "scene-1", chapterId: "chapter-001", order: 1, title: "Gate", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-demo-001"], powerProgression: "", updatedAt: new Date().toISOString() }]));
    const obligation = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?", sourceRefs: ["scene://chapter-001#scene-1"] });
    const report = await auditNarrativeObligationCoverage(root, ["chapter-001"]);
    expect(report.registeredIds).toEqual([obligation.obligationId]);
    expect(report.orphanPlannedIds).toEqual(["FS-demo-001"]);
    expect(report.evidenceBackedPayoffTransitionExists).toBe(false);
  });

  it("includes StoryEvent and CraftBeat markers in the planned coverage set", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-coverage-story-assets-"));
    await fs.mkdir(path.join(root, "story-control"), { recursive: true });
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "story-control", "story-control.json"), JSON.stringify({ version: 1, premise: "", arcs: [], characters: [], events: [{ id: "event-1", type: "reveal", title: "Reveal", trigger: "", participants: [], location: "", conflict: "", reward: "", cost: "", foreshadowing: "FS-event-001", chapterRange: "1", status: "planned", updatedAt: new Date().toISOString(), craftBeats: [] }], orchestrationNotes: "", updatedAt: new Date().toISOString() }));
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([{ id: "scene-1", chapterId: "chapter-001", order: 1, title: "Setup", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: [], powerProgression: "", craftBeats: [{ id: "beat-1", type: "foreshadow_setup", label: "FS-craft-001", status: "planned" }], updatedAt: new Date().toISOString() }]));
    const report = await auditNarrativeObligationCoverage(root, ["chapter-001"]);
    expect(report.plannedIds).toEqual(["FS-craft-001", "FS-event-001"]);
    expect(report.orphanPlannedIds).toEqual(["FS-craft-001", "FS-event-001"]);
  });
});
