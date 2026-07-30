import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createSemanticNode } from "./semanticNodes.js";
import { createCausalityEdge } from "./causalityGraph.js";
import { createImpactAnalysis, readImpactAnalysis } from "./impactAnalysis.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "impact-analysis-")); }
async function node(r: string, id: string) { return createSemanticNode({ root: r, projectSlug: "demo", semanticId: id, kind: "chapter", label: id, displayChapter: id, sourceRefs: [`source://${id}`] }); }
describe("minimum impact replanning", () => {
  it("computes downstream affected closure while protecting canon nodes", async () => { const r = await root(); await node(r, "a"); await node(r, "b"); await node(r, "c"); await createCausalityEdge({ root: r, projectSlug: "demo", edgeId: "e1", sourceNodeId: "a", targetNodeId: "b", relation: "enables", trigger: "t", consequence: "c", delayedConsequence: "d", evidenceRefs: ["source://e1"] }); await createCausalityEdge({ root: r, projectSlug: "demo", edgeId: "e2", sourceNodeId: "b", targetNodeId: "c", relation: "enables", trigger: "t", consequence: "c", delayedConsequence: "d", evidenceRefs: ["source://e2"] }); const result = await createImpactAnalysis({ root: r, projectSlug: "demo", rootNodeIds: ["a"], protectedNodeIds: ["a"], reason: "author correction", sourceRefs: ["source://correction"] }); expect(result.status).toBe("blocked"); expect(result.affectedNodeIds).toEqual(["a", "b", "c"]); expect(result.protectedNodeIds).toEqual(["a"]); expect(result.blockers).toContain("PROTECTED_NODE_AFFECTED"); });
  it("is idempotent and persists a rollback point", async () => { const r = await root(); await node(r, "a"); const input = { root: r, projectSlug: "demo", rootNodeIds: ["a"], protectedNodeIds: [], reason: "new evidence", sourceRefs: ["source://evidence"] }; const one = await createImpactAnalysis(input); const two = await createImpactAnalysis(input); expect(two.fingerprint).toBe(one.fingerprint); expect(one.rollbackPoint).toMatch(/^rollback-/); expect(await readImpactAnalysis(r, one.analysisId)).toEqual(one); });
  it("rejects analyses without evidence", async () => { const r = await root(); await expect(createImpactAnalysis({ root: r, projectSlug: "demo", rootNodeIds: ["a"], protectedNodeIds: [], reason: "reason", sourceRefs: [] })).rejects.toThrow("IMPACT_SOURCE_REQUIRED"); });
});
