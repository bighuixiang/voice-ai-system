export interface ObjectiveConflictOption { strategy: "暗线吸引" | "外部合作" | "推迟承诺"; impact: string; }
export function buildObjectiveConflictOptions(input: { left: string; right: string }): ObjectiveConflictOption[] {
  if (!input.left.trim() || !input.right.trim()) throw new Error("OBJECTIVE_CONFLICT_FIELDS_REQUIRED");
  return ["暗线吸引", "外部合作", "推迟承诺"].map((strategy) => ({ strategy: strategy as ObjectiveConflictOption["strategy"], impact: `${strategy}：保留“${input.left}”并满足“${input.right}”的不同代价与节奏路径` }));
}
