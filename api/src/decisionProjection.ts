import crypto from "node:crypto";
import type { DecisionRecord } from "./dialogueQuestions.js";

export interface DecisionProjection {
  schemaVersion: "decision-projection.v1";
  projectSlug: string;
  current: DecisionRecord[];
  supersededDecisionIds: string[];
  historyCount: number;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function projectDecisionRecords(records: readonly DecisionRecord[], projectSlug?: string): DecisionProjection {
  const scoped = records.filter((record) => !projectSlug || record.projectSlug === projectSlug);
  const superseded = new Set(scoped.flatMap((record) => record.supersedesDecisionId ? [record.supersedesDecisionId] : []));
  const current = scoped.filter((record) => !superseded.has(record.decisionId)).sort((left, right) => left.questionId.localeCompare(right.questionId) || left.questionVersion - right.questionVersion || left.decisionId.localeCompare(right.decisionId));
  const base = { schemaVersion: "decision-projection.v1" as const, projectSlug: projectSlug || scoped[0]?.projectSlug || "", current, supersededDecisionIds: [...superseded].sort(), historyCount: scoped.length };
  return { ...base, fingerprint: hash(base) };
}

export function assertDecisionProjectionIntegrity(value: DecisionProjection): DecisionProjection {
  const { fingerprint, ...base } = value;
  if (value?.schemaVersion !== "decision-projection.v1" || !value.projectSlug.trim() || !Array.isArray(value.current) || !Array.isArray(value.supersededDecisionIds) || !Number.isInteger(value.historyCount) || value.historyCount < value.current.length || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("DECISION_PROJECTION_INTEGRITY_FAILED");
  return value;
}
