import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { DecisionRecord } from "./dialogueQuestions.js";

export interface DecisionImpactReport {
  schemaVersion: "decision-impact-report.v1";
  reportId: string;
  projectSlug: string;
  decisionId: string;
  supersededDecisionId: string;
  affectedConsumers: Array<{ consumer: string; consumerRef: string; receiptId: string }>;
  invalidation: "required" | "none";
  protectedDecisionIds: string[];
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reportPath = (root: string, reportId: string) => resolveInside(root, path.join("sessions", "decision-impact", `${reportId}.json`));

export function createDecisionImpactReport(input: { decision: DecisionRecord; supersededDecisionId: string; affectedConsumers: Array<{ consumer: string; consumerRef: string; receiptId: string }> }): DecisionImpactReport {
  if (!input.supersededDecisionId.trim()) throw new Error("DECISION_IMPACT_SUPERSEDED_REQUIRED");
  const base = {
    schemaVersion: "decision-impact-report.v1" as const,
    reportId: `decision-impact-${input.decision.decisionId}`,
    projectSlug: input.decision.projectSlug,
    decisionId: input.decision.decisionId,
    supersededDecisionId: input.supersededDecisionId,
    affectedConsumers: input.affectedConsumers.map((value) => ({ ...value })),
    invalidation: input.affectedConsumers.length ? "required" as const : "none" as const,
    protectedDecisionIds: [input.supersededDecisionId],
    createdAt: new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertDecisionImpactReportIntegrity(value: DecisionImpactReport): DecisionImpactReport {
  const { fingerprint, ...base } = value;
  const valid = value?.schemaVersion === "decision-impact-report.v1" && value.reportId.trim() && value.projectSlug.trim() && value.decisionId.trim() && value.supersededDecisionId.trim() && Array.isArray(value.affectedConsumers) && value.affectedConsumers.every((item) => item.consumer?.trim() && item.consumerRef?.trim() && item.receiptId?.trim()) && ["required", "none"].includes(value.invalidation) && value.protectedDecisionIds.includes(value.supersededDecisionId) && !Number.isNaN(Date.parse(value.createdAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("DECISION_IMPACT_REPORT_INTEGRITY_FAILED");
  return value;
}

export async function persistDecisionImpactReport(root: string, value: DecisionImpactReport): Promise<{ created: boolean; report: DecisionImpactReport }> {
  assertDecisionImpactReportIntegrity(value);
  try {
    const existing = assertDecisionImpactReportIntegrity(JSON.parse(await fs.readFile(reportPath(root, value.reportId), "utf8")) as DecisionImpactReport);
    return { created: false, report: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  const target = reportPath(root, value.reportId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { created: true, report: value };
}

export async function readDecisionImpactReport(root: string, reportId: string): Promise<DecisionImpactReport | null> {
  try { return assertDecisionImpactReportIntegrity(JSON.parse(await fs.readFile(reportPath(root, reportId), "utf8")) as DecisionImpactReport); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function readDecisionConsumptionRefs(root: string, decisionId: string): Promise<Array<{ consumer: string; consumerRef: string; receiptId: string }>> {
  const directory = resolveInside(root, "sessions/decision-consumption");
  try {
    const names = await fs.readdir(directory);
    const values: Array<{ consumer: string; consumerRef: string; receiptId: string }> = [];
    for (const name of names.filter((value) => value.endsWith(".json"))) {
      try {
        const value = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as { decisionId?: string; consumer?: string; consumerRef?: string; receiptId?: string };
        if (value.decisionId === decisionId && value.consumer && value.consumerRef && value.receiptId) values.push({ consumer: value.consumer, consumerRef: value.consumerRef, receiptId: value.receiptId });
      } catch { /* ignore unrelated malformed receipt; its own reader remains fail-closed */ }
    }
    return values;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}
