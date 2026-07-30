import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCausalityEdge, listCausalityEdges, readCausalityEdge, validateCausalityGraph } from "./causalityGraph.js";

const input = (root: string, edgeId = "e1") => ({ root, projectSlug: "demo", edgeId, sourceNodeId: "setup-1", targetNodeId: "payoff-1", relation: "pays_off" as const, trigger: "secret planted", consequence: "secret revealed", delayedConsequence: "trust changes", evidenceRefs: ["chapter://1#setup"] });

describe("narrative causality graph", () => {
  it("stores typed causal edges with evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "causality-"));
    const edge = await createCausalityEdge(input(root));
    expect(edge.status).toBe("candidate");
    expect(edge.relation).toBe("pays_off");
    expect(await readCausalityEdge(root, edge.edgeId)).toEqual(edge);
  });

  it("validates a graph and reports isolated or cyclic edges", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "causality-"));
    const first = await createCausalityEdge(input(root));
    const second = await createCausalityEdge({ ...input(root, "e2"), sourceNodeId: "payoff-1", targetNodeId: "setup-1", relation: "conflicts_with" });
    const report = await validateCausalityGraph(root, "demo");
    expect(report.edgeCount).toBe(2);
    expect(report.status).toBe("blocked");
    expect(report.issues.some((issue) => issue.kind === "cycle")).toBe(true);
    expect(await listCausalityEdges(root, "demo")).toHaveLength(2);
    expect(first.edgeId).not.toBe(second.edgeId);
  });

  it("rejects self loops and unsupported evidence-free edges", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "causality-"));
    await expect(createCausalityEdge({ ...input(root), sourceNodeId: "same", targetNodeId: "same" })).rejects.toThrow("CAUSALITY_SELF_LOOP");
    await expect(createCausalityEdge({ ...input(root), evidenceRefs: [] })).rejects.toThrow("CAUSALITY_EVIDENCE_REQUIRED");
  });
});
