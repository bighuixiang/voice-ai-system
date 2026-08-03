export interface FairWorkCandidate { workItemId: string; projectSlug: string; priority: number; waitedMs: number; dependenciesReady: boolean; budgetAllowed: boolean; }

export function selectFairWorkItems(input: { maxSlots: number; candidates: FairWorkCandidate[] }): FairWorkCandidate[] {
  if (!Number.isInteger(input.maxSlots) || input.maxSlots < 1) throw new Error("SCHEDULER_SLOTS_INVALID");
  const ready = input.candidates.filter((candidate) => candidate.dependenciesReady && candidate.budgetAllowed);
  const projects = [...new Set(ready.map((candidate) => candidate.projectSlug))].sort();
  const byProject = new Map(projects.map((project) => [project, ready.filter((candidate) => candidate.projectSlug === project).sort((a, b) => (b.waitedMs - a.waitedMs) || (b.priority - a.priority) || a.workItemId.localeCompare(b.workItemId))]));
  const selected: FairWorkCandidate[] = [];
  while (selected.length < input.maxSlots && projects.some((project) => (byProject.get(project)?.length || 0) > 0)) {
    const project = projects.filter((candidate) => (byProject.get(candidate)?.length || 0) > 0).sort((a, b) => {
      const left = byProject.get(a)![0]; const right = byProject.get(b)![0];
      return (right.waitedMs - left.waitedMs) || (right.priority - left.priority) || a.localeCompare(b);
    })[0];
    selected.push(byProject.get(project)!.shift()!);
  }
  return selected;
}
