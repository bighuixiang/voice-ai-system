import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPlanningNode, readPlanningNode, transitionPlanningNode } from "./planningNode.js";

const input = (root: string) => ({ root, projectSlug: "demo", nodeId: "outline-1", layer: "volume", title: "Volume direction", status: "tentative" as const, commitments: ["protect core promise"], sourceRefs: ["outline://volume-1"] });

describe("planning node", () => {
  it("preserves confidence state and explicit commitments", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-node-"));
    const node = await createPlanningNode(input(root));
    expect(node.status).toBe("tentative");
    expect(node.autoEvolutionAllowed).toBe(true);
    expect(await readPlanningNode(root, node.nodeId)).toEqual(node);
  });

  it("requires author decision to commit exploratory planning", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-node-"));
    const node = await createPlanningNode({ ...input(root), status: "exploratory" });
    await expect(transitionPlanningNode({ root, nodeId: node.nodeId, toStatus: "committed", actor: "system", reason: "looks good" })).rejects.toThrow("PLANNING_AUTHOR_DECISION_REQUIRED");
    const committed = await transitionPlanningNode({ root, nodeId: node.nodeId, toStatus: "committed", actor: "author", reason: "I confirm this direction" });
    expect(committed.status).toBe("committed");
    expect(committed.autoEvolutionAllowed).toBe(false);
  });

  it("rejects missing sources and invalid transitions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-node-"));
    await expect(createPlanningNode({ ...input(root), sourceRefs: [] })).rejects.toThrow("PLANNING_NODE_SOURCE_REQUIRED");
    const node = await createPlanningNode(input(root));
    await expect(transitionPlanningNode({ root, nodeId: node.nodeId, toStatus: "exploratory", actor: "author", reason: "backward" })).rejects.toThrow("PLANNING_TRANSITION_INVALID");
  });

  it("fails closed when a planning node is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-node-"));
    const node = await createPlanningNode(input(root));
    const target = path.join(root, "sessions", "planning-nodes", `${node.nodeId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    await fs.writeFile(target, JSON.stringify({ ...persisted, title: "tampered" }), "utf8");
    await expect(readPlanningNode(root, node.nodeId)).rejects.toThrow("PLANNING_NODE_INTEGRITY_FAILED");
  });
});
