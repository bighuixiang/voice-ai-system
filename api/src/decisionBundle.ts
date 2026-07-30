import crypto from "node:crypto";

export interface DecisionBundleItem {
  decisionId: string;
  label: string;
  affectedAssets: string[];
  risk: "low";
  reversible: true;
  rollbackBoundary: string;
}

export interface DecisionBundle {
  schemaVersion: "decision-bundle.v1";
  bundleId: string;
  items: DecisionBundleItem[];
  recommendation: string;
  strongestCounterargument: string;
  nearTermOutcome: string;
  rollbackBoundary: string;
  status: "reviewable" | "accepted";
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createDecisionBundle(input: Omit<DecisionBundle, "schemaVersion" | "rollbackBoundary" | "status" | "fingerprint">): DecisionBundle {
  if (!input.bundleId.trim() || !input.items.length || !input.recommendation.trim() || !input.strongestCounterargument.trim() || !input.nearTermOutcome.trim()) throw new Error("DECISION_BUNDLE_FIELDS_REQUIRED");
  if (input.items.some((item) => !item.reversible)) throw new Error("DECISION_BUNDLE_NOT_REVERSIBLE");
  if (input.items.some((item) => item.risk !== "low")) throw new Error("DECISION_BUNDLE_RISK_TOO_HIGH");
  const rollbackBoundary = input.items[0].rollbackBoundary;
  if (!rollbackBoundary.trim() || input.items.some((item) => item.rollbackBoundary !== rollbackBoundary)) throw new Error("DECISION_BUNDLE_ROLLBACK_BOUNDARY_MISMATCH");
  const items = input.items.map((item) => ({ ...item, affectedAssets: [...item.affectedAssets] }));
  const base = { schemaVersion: "decision-bundle.v1" as const, bundleId: input.bundleId, items, recommendation: input.recommendation, strongestCounterargument: input.strongestCounterargument, nearTermOutcome: input.nearTermOutcome, rollbackBoundary, status: "reviewable" as const };
  return { ...base, fingerprint: hash(base) };
}

export function acceptDecisionBundle(bundle: DecisionBundle): DecisionBundle {
  if (bundle.status !== "reviewable") throw new Error("DECISION_BUNDLE_NOT_REVIEWABLE");
  const base = { ...bundle, status: "accepted" as const };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}
