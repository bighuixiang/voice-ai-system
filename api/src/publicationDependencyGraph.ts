import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { listCausalityEdges, type CausalityRelation } from "./causalityGraph.js";
import { listNarrativeObligations } from "./narrativeObligation.js";
import { listVolumeContracts } from "./volumeContract.js";
import type { FrozenPublicationScope } from "./frozenPublicationScope.js";

export type PublicationDependencyNodeKind = "scope" | "story-contract" | "outline-version" | "volume" | "milestone" | "chapter" | "obligation";
export type PublicationDependencyEdgeRelation = "requires" | "enables" | "owns" | CausalityRelation;
export interface PublicationDependencyNode { nodeId: string; kind: PublicationDependencyNodeKind; ref: string; status: "bound" | "unbound"; fingerprint?: string; }
export interface PublicationDependencyEdge { edgeId: string; sourceNodeId: string; targetNodeId: string; relation: PublicationDependencyEdgeRelation; }
export interface PublicationDependencyIssue { code: "SCOPE_EVIDENCE_UNBOUND" | "OUTLINE_ARTIFACT_MISSING" | "OBLIGATION_OWNER_UNRESOLVED" | "OBLIGATION_COVERAGE_UNBOUND" | "DEPENDENCY_CYCLE" | "OUT_OF_SCOPE_NODE" | "DUPLICATE_EDGE"; targetId: string; detail: string; }
export interface PublicationDependencyGraph {
  schemaVersion: "publication-dependency-graph.v1";
  graphId: string;
  projectSlug: string;
  scopeId: string;
  scopeFingerprint: string;
  version: number;
  status: "ready" | "blocked";
  nodes: PublicationDependencyNode[];
  edges: PublicationDependencyEdge[];
  issues: PublicationDependencyIssue[];
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const graphPath = (root: string, graphId: string): string => resolveInside(root, `sessions/publication-dependency-graphs/${graphId}.json`);
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

function assertIntegrity(graph: PublicationDependencyGraph, graphId: string): PublicationDependencyGraph {
  const { fingerprint: _fingerprint, ...base } = graph;
  const nodesValid = Array.isArray(graph.nodes) && graph.nodes.every((node) => node && typeof node.nodeId === "string" && node.nodeId.trim() && ["scope", "story-contract", "outline-version", "volume", "milestone", "chapter", "obligation"].includes(node.kind) && typeof node.ref === "string" && node.ref.trim() && ["bound", "unbound"].includes(node.status) && (node.fingerprint === undefined || /^[a-f0-9]{64}$/i.test(node.fingerprint)));
  const edgesValid = Array.isArray(graph.edges) && graph.edges.every((edge) => edge && typeof edge.edgeId === "string" && edge.edgeId.trim() && typeof edge.sourceNodeId === "string" && edge.sourceNodeId.trim() && typeof edge.targetNodeId === "string" && edge.targetNodeId.trim() && ["requires", "enables", "owns", "complicates", "reveals", "pays_off", "conflicts_with"].includes(edge.relation));
  const issuesValid = Array.isArray(graph.issues) && graph.issues.every((issue) => issue && ["SCOPE_EVIDENCE_UNBOUND", "OUTLINE_ARTIFACT_MISSING", "OBLIGATION_OWNER_UNRESOLVED", "OBLIGATION_COVERAGE_UNBOUND", "DEPENDENCY_CYCLE", "OUT_OF_SCOPE_NODE", "DUPLICATE_EDGE"].includes(issue.code) && typeof issue.targetId === "string" && issue.targetId.trim() && typeof issue.detail === "string" && issue.detail.trim());
  if (graph.schemaVersion !== "publication-dependency-graph.v1" || graph.graphId !== graphId || !graph.projectSlug.trim() || !graph.scopeId.trim() || !/^[a-f0-9]{64}$/i.test(graph.scopeFingerprint) || graph.version !== 1 || !["ready", "blocked"].includes(graph.status) || !nodesValid || !edgesValid || !issuesValid || !/^[a-f0-9]{64}$/i.test(graph.fingerprint) || hash(base) !== graph.fingerprint) throw new Error("PUBLICATION_DEPENDENCY_GRAPH_INTEGRITY_FAILED");
  return graph;
}

export async function readPublicationDependencyGraph(root: string, graphId: string): Promise<PublicationDependencyGraph | null> {
  const value = await readJson<PublicationDependencyGraph>(graphPath(root, graphId));
  return value ? assertIntegrity(value, graphId) : null;
}

export async function createPublicationDependencyGraph(input: { root: string; projectSlug: string; frozenScope: FrozenPublicationScope }): Promise<PublicationDependencyGraph> {
  if (!input.projectSlug.trim() || input.frozenScope.projectSlug !== input.projectSlug) throw new Error("PUBLICATION_DEPENDENCY_SCOPE_MISMATCH");
  const identity = { projectSlug: input.projectSlug, scopeId: input.frozenScope.scopeId, scopeFingerprint: input.frozenScope.scopeFingerprint, evidence: input.frozenScope.evidence };
  const graphId = `publication-dependency-${hash(identity).slice(0, 24)}`;
  const existing = await readPublicationDependencyGraph(input.root, graphId);
  if (existing?.status === "ready") return existing;
  const nodes: PublicationDependencyNode[] = [{ nodeId: `scope:${input.frozenScope.scopeId}`, kind: "scope", ref: `sessions/publication-scopes/${input.frozenScope.scopeId}.json`, status: "bound", fingerprint: input.frozenScope.fingerprint }];
  const edges: PublicationDependencyEdge[] = [];
  const issues: PublicationDependencyIssue[] = [];
  const addNode = (node: PublicationDependencyNode) => { if (!nodes.some((existingNode) => existingNode.nodeId === node.nodeId)) nodes.push(node); };
  const addEdge = (sourceNodeId: string, targetNodeId: string, relation: PublicationDependencyEdgeRelation) => {
    const duplicate = edges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId && edge.relation === relation);
    if (duplicate) { issues.push({ code: "DUPLICATE_EDGE", targetId: `${sourceNodeId}->${targetNodeId}`, detail: "Duplicate dependency edge was suppressed." }); return; }
    edges.push({ edgeId: `edge-${hash({ sourceNodeId, targetNodeId, relation }).slice(0, 16)}`, sourceNodeId, targetNodeId, relation });
  };
  const scopeNodeId = `scope:${input.frozenScope.scopeId}`;
  for (const [kind, binding] of Object.entries(input.frozenScope.evidence) as Array<["storyContract" | "outlineVersion" | "obligationCoverage", FrozenPublicationScope["evidence"]["storyContract"]]>) {
    const nodeKind = kind === "storyContract" ? "story-contract" : kind === "outlineVersion" ? "outline-version" : "obligation";
    const nodeId = `${nodeKind}:${binding.ref}`;
    addNode({ nodeId, kind: nodeKind, ref: binding.ref, status: binding.status, ...(binding.fingerprint ? { fingerprint: binding.fingerprint } : {}) });
    addEdge(nodeId, scopeNodeId, "requires");
    if (binding.status === "unbound") issues.push({ code: kind === "obligationCoverage" ? "OBLIGATION_COVERAGE_UNBOUND" : "SCOPE_EVIDENCE_UNBOUND", targetId: binding.ref, detail: `${kind} evidence is explicitly unbound for this frozen scope.` });
  }
  for (const chapterId of input.frozenScope.chapterIds) { const nodeId = `chapter:${chapterId}`; addNode({ nodeId, kind: "chapter", ref: chapterId, status: "bound" }); addEdge(scopeNodeId, nodeId, "enables"); }

  const outlineBinding = input.frozenScope.evidence.outlineVersion;
  if (outlineBinding.status === "bound") {
    const outlineId = path.basename(outlineBinding.ref, ".json").replace(/[^a-zA-Z0-9._-]/g, "");
    const outline = await readJson<{ selectedChapterIds?: string[] }>(resolveInside(input.root, `sessions/outline-versions/${outlineId}.json`));
    if (!outline) issues.push({ code: "OUTLINE_ARTIFACT_MISSING", targetId: outlineBinding.ref, detail: "Bound outline version cannot be read." });
    else for (const chapterId of outline.selectedChapterIds || []) if (input.frozenScope.chapterIds.includes(chapterId)) addEdge(`outline-version:${outlineBinding.ref}`, `chapter:${chapterId}`, "enables");
  }
  for (const volume of await listVolumeContracts(input.root, input.projectSlug)) {
    if (volume.status !== "confirmed") continue;
    const volumeNodeId = `volume:${volume.volumeId}`;
    addNode({ nodeId: volumeNodeId, kind: "volume", ref: `sessions/volume-contracts/${volume.volumeId}.json`, status: "bound", fingerprint: volume.fingerprint });
    addEdge(volumeNodeId, scopeNodeId, "requires");
    for (const milestone of [...volume.stageGoals, ...volume.stagePayoffs]) { const milestoneNodeId = `milestone:${volume.volumeId}:${hash(milestone).slice(0, 12)}`; addNode({ nodeId: milestoneNodeId, kind: "milestone", ref: milestone, status: "bound" }); addEdge(volumeNodeId, milestoneNodeId, "enables"); }
  }
  let obligations: Awaited<ReturnType<typeof listNarrativeObligations>> = [];
  try { obligations = await listNarrativeObligations(input.root); }
  catch { issues.push({ code: "OBLIGATION_OWNER_UNRESOLVED", targetId: "obligation-scan", detail: "One or more obligation artifacts could not be parsed; ownership remains unresolved." }); }
  for (const obligation of obligations) {
    if (obligation.projectSlug !== input.projectSlug || obligation.status === "invalidated") continue;
    const obligationNodeId = `obligation:${obligation.obligationId}`;
    addNode({ nodeId: obligationNodeId, kind: "obligation", ref: `sessions/obligations/${obligation.obligationId}.json`, status: "bound", fingerprint: obligation.fingerprint });
    const owner = input.frozenScope.chapterIds.find((chapterId) => obligation.entityRefs.includes(chapterId) || obligation.sourceRefs.some((ref) => ref.includes(chapterId)));
    if (!owner) issues.push({ code: "OBLIGATION_OWNER_UNRESOLVED", targetId: obligation.obligationId, detail: "Obligation has no explicit in-scope chapter owner." });
    else addEdge(`chapter:${owner}`, obligationNodeId, "owns");
  }
  for (const edge of await listCausalityEdges(input.root, input.projectSlug)) {
    const inScope = (nodeId: string) => input.frozenScope.chapterIds.includes(nodeId) || nodeId.startsWith("milestone:");
    if (!inScope(edge.sourceNodeId)) issues.push({ code: "OUT_OF_SCOPE_NODE", targetId: edge.sourceNodeId, detail: "Causality source node is outside the frozen publication scope." });
    if (!inScope(edge.targetNodeId)) issues.push({ code: "OUT_OF_SCOPE_NODE", targetId: edge.targetNodeId, detail: "Causality target node is outside the frozen publication scope." });
    addNode({ nodeId: `milestone:${edge.sourceNodeId}`, kind: "milestone", ref: edge.sourceNodeId, status: "bound" });
    addNode({ nodeId: `milestone:${edge.targetNodeId}`, kind: "milestone", ref: edge.targetNodeId, status: "bound" });
    addEdge(`milestone:${edge.sourceNodeId}`, `milestone:${edge.targetNodeId}`, edge.relation);
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.sourceNodeId, [...(adjacency.get(edge.sourceNodeId) || []), edge.targetNodeId]);
  const visited = new Set<string>();
  const active = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (nodeId: string) => {
    if (active.has(nodeId)) { cycleNodes.add(nodeId); return; }
    if (visited.has(nodeId)) return;
    active.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) visit(next);
    active.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.nodeId);
  for (const nodeId of cycleNodes) issues.push({ code: "DEPENDENCY_CYCLE", targetId: nodeId, detail: "Publication dependency graph contains a directed cycle." });
  const base = { schemaVersion: "publication-dependency-graph.v1" as const, graphId, projectSlug: input.projectSlug, scopeId: input.frozenScope.scopeId, scopeFingerprint: input.frozenScope.scopeFingerprint, version: 1, status: issues.length ? "blocked" as const : "ready" as const, nodes, edges, issues, createdAt: new Date().toISOString() };
  const graph: PublicationDependencyGraph = { ...base, fingerprint: hash(base) };
  await writeJson(graphPath(input.root, graphId), graph);
  return graph;
}
