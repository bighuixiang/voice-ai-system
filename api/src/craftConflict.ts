import crypto from "node:crypto";

export type CraftRuleKind = "hard-constraint" | "anti-goal" | "scene-goal" | "global-pattern" | "author-preference";
export type CraftRuleScope = "scene" | "chapter" | "project" | "global";

export interface CraftRule {
  ruleId: string;
  kind: CraftRuleKind;
  scope: CraftRuleScope;
  target: string;
  directive: "allow" | "deny";
  statement: string;
  sourceRefs: string[];
}

export interface CraftConflictInput {
  taskId: string;
  sceneId: string;
  rules: CraftRule[];
  sourceRefs: string[];
}

export interface CraftConflictResult {
  schemaVersion: "craft-conflict-resolution.v1";
  taskId: string;
  sceneId: string;
  status: "ready" | "blocked";
  conflicts: Array<{ target: string; ruleIds: string[]; reason: string }>;
  red: { ruleIds: string[]; rationale: string };
  blue: { ruleIds: string[]; rationale: string };
  selectedRuleIds: string[];
  rejectedRuleIds: string[];
  promptDirectives: string[];
  sourceRefs: string[];
  fingerprint: string;
}

const rank = (rule: CraftRule): number => {
  if (rule.kind === "hard-constraint" || rule.kind === "anti-goal") return 500;
  if (rule.kind === "scene-goal") return 400;
  if (rule.scope === "scene") return 350;
  if (rule.kind === "global-pattern") return 200;
  return 100;
};

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function resolveCraftConflicts(input: CraftConflictInput): CraftConflictResult {
  if (!input.taskId || !input.sceneId) throw new Error("CRAFT_CONFLICT_CONTEXT_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("CRAFT_CONFLICT_SOURCE_REQUIRED");
  const groups = new Map<string, CraftRule[]>();
  for (const rule of input.rules) {
    const group = groups.get(rule.target) || [];
    group.push(rule);
    groups.set(rule.target, group);
  }
  const conflicts = [...groups.entries()]
    .map(([target, rules]) => ({ target, rules }))
    .filter(({ rules }) => new Set(rules.map((rule) => rule.directive)).size > 1)
    .map(({ target, rules }) => ({ target, ruleIds: rules.map((rule) => rule.ruleId), reason: "opposing directives preserved for red-blue review" }));
  const selected = new Set<string>();
  const rejected = new Set<string>();
  for (const rules of groups.values()) {
    const ordered = [...rules].sort((a, b) => rank(b) - rank(a) || a.ruleId.localeCompare(b.ruleId));
    const winner = ordered[0];
    if (winner) selected.add(winner.ruleId);
    for (const rule of ordered.slice(1)) {
      if (winner && rule.directive !== winner.directive) rejected.add(rule.ruleId);
      else selected.add(rule.ruleId);
    }
  }
  const hardConflict = conflicts.some((conflict) => conflict.ruleIds.filter((id) => input.rules.find((rule) => rule.ruleId === id)?.kind === "hard-constraint").length > 1);
  const status = hardConflict ? "blocked" : "ready";
  const redIds = conflicts.flatMap((conflict) => conflict.ruleIds).filter((id) => rejected.has(id));
  const blueIds = conflicts.flatMap((conflict) => conflict.ruleIds).filter((id) => selected.has(id));
  const base = { schemaVersion: "craft-conflict-resolution.v1" as const, taskId: input.taskId, sceneId: input.sceneId, status, conflicts, red: { ruleIds: redIds, rationale: "challenge lower-priority or conflicting directives" }, blue: { ruleIds: blueIds, rationale: "preserve highest-priority applicable directives" }, selectedRuleIds: [...selected], rejectedRuleIds: [...rejected], promptDirectives: [...selected].map((id) => input.rules.find((rule) => rule.ruleId === id)?.statement || ""), sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
