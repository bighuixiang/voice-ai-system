import crypto from "node:crypto";
import type { CreativeObjectiveItem } from "./creativeObjective.js";

export interface ObjectiveChangeImpact { schemaVersion: "objective-change-impact.v1"; oldVersion: number; newVersion: number; changedObjectiveIds: string[]; affectedAssets: string[]; futureOnly: boolean; retroactiveAuthorizationRequired: boolean; preservedHistoricalVersion: number; reasons: string[]; fingerprint: string; }
export interface ObjectiveDriftReport { schemaVersion: "objective-drift-report.v1"; status: "stable" | "drifting" | "oscillating"; targetVersion: number; observations: Array<{ assetId: string; targetVersion: number; deviation: string[]; sourceLayer: "generation" | "review" | "author-feedback" | "objective-change" }>; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function analyzeObjectiveChange(input: { oldVersion: number; newVersion: number; oldItems: CreativeObjectiveItem[]; newItems: CreativeObjectiveItem[]; affectedAssets: string[]; retroactiveRequested: boolean; authorizationGranted: boolean }): ObjectiveChangeImpact {
  if (!Number.isInteger(input.oldVersion) || !Number.isInteger(input.newVersion) || input.newVersion <= input.oldVersion) throw new Error("OBJECTIVE_VERSION_ORDER_INVALID");
  const oldById = new Map(input.oldItems.map((item) => [item.objectiveId, item]));
  const changedObjectiveIds = input.newItems.filter((item) => JSON.stringify(item) !== JSON.stringify(oldById.get(item.objectiveId))).map((item) => item.objectiveId);
  const reasons: string[] = [];
  if (!input.affectedAssets.length) reasons.push("OBJECTIVE_AFFECTED_ASSETS_REQUIRED");
  if (input.retroactiveRequested && !input.authorizationGranted) reasons.push("RETROACTIVE_OBJECTIVE_AUTHORIZATION_REQUIRED");
  const base = { schemaVersion: "objective-change-impact.v1" as const, oldVersion: input.oldVersion, newVersion: input.newVersion, changedObjectiveIds, affectedAssets: [...input.affectedAssets], futureOnly: !input.retroactiveRequested, retroactiveAuthorizationRequired: input.retroactiveRequested, preservedHistoricalVersion: input.oldVersion, reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}

export function monitorObjectiveDrift(input: { targetVersion: number; observations: ObjectiveDriftReport["observations"]; }): ObjectiveDriftReport {
  if (!Number.isInteger(input.targetVersion) || input.targetVersion < 1) throw new Error("OBJECTIVE_DRIFT_TARGET_VERSION_INVALID");
  const deviations = input.observations.filter((observation) => observation.targetVersion !== input.targetVersion || observation.deviation.length);
  const versions = input.observations.map((observation) => observation.targetVersion);
  const oscillating = versions.length >= 3 && versions.at(-1) === versions.at(-3) && versions.at(-1) !== versions.at(-2);
  const status = oscillating ? "oscillating" as const : deviations.length ? "drifting" as const : "stable" as const;
  const reasons = deviations.length ? deviations.map((observation) => `${observation.assetId}:${observation.sourceLayer}`) : [];
  const base = { schemaVersion: "objective-drift-report.v1" as const, status, targetVersion: input.targetVersion, observations: input.observations.map((observation) => ({ ...observation, deviation: [...observation.deviation] })), reasons };
  return { ...base, fingerprint: hash(base) };
}
