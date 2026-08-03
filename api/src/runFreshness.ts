export type WorkFreshnessStatus = "fresh" | "stale-not-started" | "stale-running" | "audit-required";
export interface WorkFreshnessResult { schemaVersion: "work-freshness.v1"; status: WorkFreshnessStatus; action: "none" | "replace-input-version" | "pause-for-impact-analysis" | "mark-audit-required"; changedRefs: string[]; }

export function evaluateWorkItemFreshness(input: { status: "ready" | "running" | "completed"; inputVersions: Record<string, number>; currentVersions: Record<string, number> }): WorkFreshnessResult {
  const changedRefs = Object.keys(input.currentVersions).filter((key) => input.inputVersions[key] !== input.currentVersions[key]);
  if (!changedRefs.length) return { schemaVersion: "work-freshness.v1", status: "fresh", action: "none", changedRefs: [] };
  if (input.status === "ready") return { schemaVersion: "work-freshness.v1", status: "stale-not-started", action: "replace-input-version", changedRefs };
  if (input.status === "running") return { schemaVersion: "work-freshness.v1", status: "stale-running", action: "pause-for-impact-analysis", changedRefs };
  return { schemaVersion: "work-freshness.v1", status: "audit-required", action: "mark-audit-required", changedRefs };
}
