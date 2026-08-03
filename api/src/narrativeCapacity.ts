import crypto from "node:crypto";

export type NarrativeChangeKind = "arc-progression" | "reveal" | "character-change" | "setting-introduction" | "obligation-action";
export interface NarrativeCapacityInput {
  scopeId: string;
  budget: { maxArcProgressions: number; maxReveals: number; maxCharacterChanges: number; maxSettingIntroductions: number; maxObligationActions: number };
  changes: Array<{ changeId: string; kind: NarrativeChangeKind; description: string; evidenceRefs: string[] }>;
  sourceRefs: string[];
  riskAcceptance?: { actorId: string; authorizationId: string; rationale: string };
}
export interface NarrativeCapacityReport {
  schemaVersion: "narrative-capacity-report.v1";
  scopeId: string;
  status: "passed" | "blocked" | "accepted-risk";
  counts: { arcProgressions: number; reveals: number; characterChanges: number; settingIntroductions: number; obligationActions: number };
  overBudgetKinds: string[];
  requiredActions: Array<{ kind: string; action: "split-or-defer" | "accept-risk"; detail: string }>;
  issues: string[];
  riskAcceptance?: { actorId: string; authorizationId: string; rationale: string };
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mapping = {
  "arc-progression": ["arcProgressions", "maxArcProgressions"],
  reveal: ["reveals", "maxReveals"],
  "character-change": ["characterChanges", "maxCharacterChanges"],
  "setting-introduction": ["settingIntroductions", "maxSettingIntroductions"],
  "obligation-action": ["obligationActions", "maxObligationActions"]
} as const;
export function evaluateNarrativeCapacity(input: NarrativeCapacityInput): NarrativeCapacityReport {
  const counts = { arcProgressions: 0, reveals: 0, characterChanges: 0, settingIntroductions: 0, obligationActions: 0 };
  for (const change of input.changes) counts[mapping[change.kind][0]] += 1;
  const issues: string[] = [];
  if (!input.scopeId.trim() || !input.sourceRefs.length) issues.push("CAPACITY_SOURCE_REQUIRED");
  if (input.changes.some((change) => !change.changeId.trim() || !change.description.trim())) issues.push("CAPACITY_CHANGE_DESCRIPTION_REQUIRED");
  if (input.changes.some((change) => !change.evidenceRefs.length)) issues.push("CAPACITY_CHANGE_EVIDENCE_REQUIRED");
  const overBudgetKinds = (Object.keys(mapping) as NarrativeChangeKind[]).filter((kind) => counts[mapping[kind][0]] > input.budget[mapping[kind][1]]);
  const requiredActions: NarrativeCapacityReport["requiredActions"] = overBudgetKinds.map((kind) => ({ kind: mapping[kind][0], action: "split-or-defer", detail: `${mapping[kind][0]} exceeds its scoped budget; split, defer, or replace changes before expanding the scope.` }));
  const acceptance = input.riskAcceptance;
  const acceptanceValid = Boolean(acceptance?.actorId.trim() && acceptance.authorizationId.trim() && acceptance.rationale.trim());
  if (overBudgetKinds.length && !acceptanceValid) issues.push("CAPACITY_RISK_AUTHORIZATION_REQUIRED");
  if (overBudgetKinds.length && acceptanceValid) requiredActions.splice(0, requiredActions.length, ...overBudgetKinds.map((kind) => ({ kind: mapping[kind][0], action: "accept-risk" as const, detail: `Explicit risk acceptance ${acceptance!.authorizationId} covers this overflow.` })));
  const base = { schemaVersion: "narrative-capacity-report.v1" as const, scopeId: input.scopeId, status: issues.length ? "blocked" as const : overBudgetKinds.length ? "accepted-risk" as const : "passed" as const, counts, overBudgetKinds: overBudgetKinds.map((kind) => mapping[kind][0]), requiredActions, issues: [...new Set(issues)], ...(acceptance ? { riskAcceptance: acceptance } : {}) };
  return { ...base, fingerprint: hash(base) };
}
