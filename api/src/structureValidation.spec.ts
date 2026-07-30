import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createChapterFunctionContract } from "./chapterFunction.js";
import { createSceneCardContract } from "./sceneCard.js";
import { createCausalityEdge } from "./causalityGraph.js";
import { validateNarrativeStructure } from "./structureValidation.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "structure-validation-")); }
const chapter = (root: string, id: string) => createChapterFunctionContract({ root, projectSlug: "demo", chapterId: id, primaryFunction: "turn", secondaryFunctions: [], sceneState: "state", localGoal: "goal", obstacle: "obstacle", choice: "choice", observableChange: "change", readerPayoff: "payoff", mustRemember: ["setup"], mustNotReveal: ["secret"], sourceRefs: ["source://chapter"] });
const scene = (root: string, id: string, chapterId: string, entryState = "before", exitState = "after") => createSceneCardContract({ root, projectSlug: "demo", sceneId: id, chapterId, trigger: "trigger", povCharacterId: "hero", roleGoal: "goal", conflictStrategy: "strategy", turningPoint: "turn", informationChange: "info", emotionChange: "emotion", relationshipChange: "relationship", resourceChange: "resource", entryState, exitState, nextSceneHook: "hook", sourceRefs: ["source://scene"] });

describe("narrative structure validation", () => {
  it("passes a connected chapter/scene/causal structure", async () => {
    const r = await root(); await chapter(r, "ch-1"); await scene(r, "sc-1", "ch-1");
    await createCausalityEdge({ root: r, projectSlug: "demo", edgeId: "edge-1", sourceNodeId: "sc-1", targetNodeId: "ch-1", relation: "enables", trigger: "trigger", consequence: "consequence", delayedConsequence: "later", evidenceRefs: ["source://edge"] });
    const report = await validateNarrativeStructure(r, "demo"); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]);
  });
  it("blocks orphan chapters, unchanged scene state, and dangling causal nodes", async () => {
    const r = await root(); await chapter(r, "ch-orphan"); await chapter(r, "ch-1"); await scene(r, "sc-1", "ch-1", "same", "same");
    await createCausalityEdge({ root: r, projectSlug: "demo", edgeId: "edge-1", sourceNodeId: "missing", targetNodeId: "sc-1", relation: "requires", trigger: "trigger", consequence: "consequence", delayedConsequence: "later", evidenceRefs: ["source://edge"] });
    const report = await validateNarrativeStructure(r, "demo"); expect(report.status).toBe("blocked"); expect(report.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["orphan-chapter", "unchanged-scene-state", "dangling-causal-node"]));
  });
  it("is deterministic and project isolated", async () => { const r = await root(); await chapter(r, "ch-1"); const first = await validateNarrativeStructure(r, "demo"); const second = await validateNarrativeStructure(r, "other"); expect(first.fingerprint).toBe((await validateNarrativeStructure(r, "demo")).fingerprint); expect(second.edgeCount).toBe(0); });
});
