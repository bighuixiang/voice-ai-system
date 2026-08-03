import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFrozenPublicationScope } from "./frozenPublicationScope.js";
import { createPublicationDependencyGraph, readPublicationDependencyGraph } from "./publicationDependencyGraph.js";
import { createCausalityEdge } from "./causalityGraph.js";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("publication dependency graph", () => {
  it("materializes contract, outline, volume milestone, chapter, and obligation ownership edges", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-graph-"));
    const proposalBase = { schemaVersion: "story-contract-adoption-proposal.v1", status: "committed", canonWritten: true, projectSlug: "demo" };
    await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "volume-contracts"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify({ ...proposalBase, fingerprint: hash(proposalBase) }));
    const outlineBase = { schemaVersion: "outline-version.v1", versionId: "outline-1", projectSlug: "demo", status: "active", canonWritten: true, selectedChapterIds: ["c1", "c2"] };
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-1.json"), JSON.stringify({ ...outlineBase, fingerprint: hash(outlineBase) }));
    const volumeBase = { schemaVersion: "volume-contract.v1", volumeId: "volume-1", projectSlug: "demo", title: "Volume", openingState: "open", stageGoals: ["milestone:turn"], primaryConflict: "trust", rolePositions: ["hero"], irreversibleDuties: ["protect"], climaxChoice: "choose", stagePayoffs: ["milestone:payoff"], endPressure: "pressure", capacityBudget: { chapters: 10, words: 30000 }, sourceRefs: ["outline://volume-1"], status: "confirmed", createdAt: "2026-07-31T00:00:00Z", updatedAt: "2026-07-31T00:00:00Z" };
    await fs.writeFile(path.join(root, "sessions", "volume-contracts", "volume-1.json"), JSON.stringify({ ...volumeBase, fingerprint: hash(volumeBase) }));
    const obligationBase = { schemaVersion: "narrative-obligation.v1", obligationId: "obl-1", projectSlug: "demo", type: "mystery", title: "promise", questionOrPromise: "answer", importance: "high", status: "planned", sourceRefs: ["chapter://c1"], entityRefs: ["c1"], version: 0, updatedAt: "2026-07-31T00:00:00Z" };
    await fs.writeFile(path.join(root, "sessions", "obligations", "obl-1.json"), JSON.stringify({ ...obligationBase, fingerprint: hash(obligationBase) }));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1", "c2"], scopeFingerprint: "a".repeat(64), evidence: {
      storyContract: { status: "bound", ref: "sessions/story-contract-adoption-proposal.json", fingerprint: hash(proposalBase) },
      outlineVersion: { status: "bound", ref: "sessions/outline-versions/outline-1.json", fingerprint: hash(outlineBase) },
      obligationCoverage: { status: "unbound", ref: "obligation-coverage:unbound", reason: "ARTIFACT_NOT_FOUND" }
    } });
    const graph = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    expect(graph.status).toBe("blocked");
    expect(graph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(["story-contract", "outline-version", "volume", "milestone", "chapter", "obligation"]));
    expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ relation: "owns", sourceNodeId: "chapter:c1", targetNodeId: "obligation:obl-1" })]));
    expect(graph.issues).toContainEqual(expect.objectContaining({ code: "OBLIGATION_COVERAGE_UNBOUND" }));
    expect(await readPublicationDependencyGraph(root, graph.graphId)).toEqual(graph);
  });

  it("records unresolved obligation ownership instead of guessing a chapter", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-graph-owner-"));
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    const obligationBase = { schemaVersion: "narrative-obligation.v1", obligationId: "obl-2", projectSlug: "demo", type: "mystery", title: "promise", questionOrPromise: "answer", importance: "high", status: "planned", sourceRefs: ["story://contract"], entityRefs: [], version: 0, updatedAt: "2026-07-31T00:00:00Z" };
    await fs.writeFile(path.join(root, "sessions", "obligations", "obl-2.json"), JSON.stringify({ ...obligationBase, fingerprint: hash(obligationBase) }));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "b".repeat(64) });
    const graph = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    expect(graph.issues).toContainEqual(expect.objectContaining({ code: "OBLIGATION_OWNER_UNRESOLVED", targetId: "obl-2" }));
  });

  it("rebuilds a blocked graph after its evidence is repaired", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-graph-repair-"));
    const contractBase = { status: "committed", canonWritten: true };
    const outlineBase = { status: "active", canonWritten: true, selectedChapterIds: ["c1"] };
    await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify({ ...contractBase, fingerprint: hash(contractBase) }));
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-1.json"), JSON.stringify({ ...outlineBase, fingerprint: hash(outlineBase) }));
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    const base = { schemaVersion: "narrative-obligation.v1", obligationId: "obl-repair", projectSlug: "demo", type: "mystery", title: "promise", questionOrPromise: "answer", importance: "high" as const, status: "planned" as const, sourceRefs: ["story://contract"], entityRefs: [] as string[], version: 0, updatedAt: "2026-07-31T00:00:00Z" };
    await fs.writeFile(path.join(root, "sessions", "obligations", "obl-repair.json"), JSON.stringify({ ...base, fingerprint: hash(base) }));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "c".repeat(64), evidence: { storyContract: { status: "bound", ref: "sessions/story-contract-adoption-proposal.json", fingerprint: hash(contractBase) }, outlineVersion: { status: "bound", ref: "sessions/outline-versions/outline-1.json", fingerprint: hash(outlineBase) }, obligationCoverage: { status: "bound", ref: "sessions/obligations/coverage-certificate.json", fingerprint: hash({ status: "issued" }) } } });
    const blocked = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    expect(blocked.status).toBe("blocked");
    const repaired = { ...base, entityRefs: ["c1"] as string[] };
    await fs.writeFile(path.join(root, "sessions", "obligations", "obl-repair.json"), JSON.stringify({ ...repaired, fingerprint: hash(repaired) }));
    const ready = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    expect(ready.status).toBe("ready");
  });

  it("blocks cycles and causality nodes outside the frozen scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-graph-structure-"));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "f".repeat(64) });
    await createCausalityEdge({ root, projectSlug: "demo", edgeId: "edge-a", sourceNodeId: "milestone:a", targetNodeId: "milestone:b", relation: "requires", trigger: "a", consequence: "b", delayedConsequence: "later", evidenceRefs: ["evidence://a"] });
    await createCausalityEdge({ root, projectSlug: "demo", edgeId: "edge-b", sourceNodeId: "milestone:b", targetNodeId: "milestone:a", relation: "requires", trigger: "b", consequence: "a", delayedConsequence: "later", evidenceRefs: ["evidence://b"] });
    await createCausalityEdge({ root, projectSlug: "demo", edgeId: "edge-outside", sourceNodeId: "outside-node", targetNodeId: "c1", relation: "enables", trigger: "outside", consequence: "inside", delayedConsequence: "later", evidenceRefs: ["evidence://outside"] });
    const graph = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    expect(graph.status).toBe("blocked");
    expect(graph.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEPENDENCY_CYCLE" }),
      expect.objectContaining({ code: "OUT_OF_SCOPE_NODE", targetId: "outside-node" })
    ]));
  });
  it("fails closed when a graph is re-signed with an invalid edge", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "publication-graph-tampered-"));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "f".repeat(64) });
    const graph = await createPublicationDependencyGraph({ root, projectSlug: "demo", frozenScope: scope });
    const target = path.join(root, "sessions", "publication-dependency-graphs", `${graph.graphId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8"));
    const tampered = { ...base, edges: [{ edgeId: "bad", sourceNodeId: "", targetNodeId: "chapter:c1", relation: "enables" }] };
    tampered.fingerprint = hash(tampered);
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readPublicationDependencyGraph(root, graph.graphId)).rejects.toThrow("PUBLICATION_DEPENDENCY_GRAPH_INTEGRITY_FAILED");
  });
});
