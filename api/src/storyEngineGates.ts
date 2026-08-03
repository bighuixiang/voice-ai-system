export function compileFuzzyIdea(input: { premise: string; killerIdentityKnown: boolean; amnesiaCauseKnown: boolean }): { status: "candidate"; desire: string; pressure: string; readerPromise: string; unknowns: string[]; canonWritten: false; nextQuestion: string } {
  return { status: "candidate", desire: "discover why the dead know the protagonist", pressure: "identity and memory threaten professional trust", readerPromise: "each discovery changes who can be trusted", unknowns: ["killer_identity", "amnesia_cause"].filter((key) => key === "killer_identity" ? !input.killerIdentityKnown : !input.amnesiaCauseKnown), canonWritten: false, nextQuestion: "What high-impact decision should the protagonist make next?" };
}

export function separateStoryQuestions(input: { mainAnswered: boolean; openSubquestionAuthorized: boolean; mainConsequences: readonly string[]; subquestionConsequences: readonly string[] }): { status: "open" | "complete"; mainKind: "must-answer"; subquestionKind: "authorized-open" | "none"; canFinish: boolean } {
  const canFinish = input.mainAnswered && input.mainConsequences.length > 0;
  return { status: canFinish ? "complete" : "open", mainKind: "must-answer", subquestionKind: input.openSubquestionAuthorized ? "authorized-open" : "none", canFinish };
}

export function validateEndingPrerequisites(input: { endingChoice: string; prerequisites: { kind: "evidence" | "transformation" | "cost"; satisfied: boolean }[] }): { status: "reachable" | "unreachable"; missing: string[] } {
  const missing = input.prerequisites.filter((item) => !item.satisfied).map((item) => item.kind);
  return { status: missing.length ? "unreachable" : "reachable", missing };
}

export function validateArcGraph(input: { arcs: Array<{ id: string; milestones: string[] }>; references: Array<{ arcId: string; milestone: string }>; chapterRenumbering: Record<string, string> }): { status: "stable" | "orphaned"; orphaned: string[]; stableArcIds: string[] } {
  const orphaned = input.arcs.filter((arc) => !arc.milestones.every((milestone) => input.references.some((ref) => ref.arcId === arc.id && ref.milestone === milestone))).map((arc) => arc.id);
  return { status: orphaned.length ? "orphaned" : "stable", orphaned, stableArcIds: input.arcs.filter((arc) => !orphaned.includes(arc.id)).map((arc) => arc.id) };
}

export function detectDependencyCycle(input: { edges: Array<{ from: string; to: string }>; terminal: string }): { status: "ready" | "blocked"; cycle: string[]; terminalReachable: boolean } {
  const map = new Map<string, string[]>(); for (const edge of input.edges) map.set(edge.from, [...(map.get(edge.from) || []), edge.to]);
  const visiting = new Set<string>(); const visited = new Set<string>(); let cycle: string[] = [];
  const walk = (node: string, path: string[]): boolean => { if (visiting.has(node)) { cycle = [...path, node]; return true; } if (visited.has(node)) return false; visiting.add(node); for (const next of map.get(node) || []) if (walk(next, [...path, node])) return true; visiting.delete(node); visited.add(node); return false; };
  const nodes = [...new Set(input.edges.flatMap((edge) => [edge.from, edge.to]))]; const hasCycle = nodes.some((node) => walk(node, []));
  const reaches = (node: string, seen = new Set<string>()): boolean => node === input.terminal || (!seen.has(node) && (seen.add(node), (map.get(node) || []).some((next) => reaches(next, seen))));
  return { status: hasCycle || !reaches(nodes[0] || "", new Set()) ? "blocked" : "ready", cycle, terminalReachable: reaches(nodes[0] || "", new Set()) };
}
