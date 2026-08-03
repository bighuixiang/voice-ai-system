import crypto from "node:crypto";
import { listNarrativeObligations, type ObligationType } from "./narrativeObligation.js";

export interface ObligationLoadReport { schemaVersion: "obligation-load-report.v1"; projectSlug: string; windowChapterIds: string[]; openObligationCount: number; weightedLoad: number; byImportance: Record<"low" | "medium" | "high", number>; byType: Partial<Record<ObligationType, number>>; recommendations: string[]; status: "stable" | "watch" | "blocked"; canClaimNoOpenObligations: false; fingerprint: string; generatedAt: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export async function buildObligationLoadReport(root: string, projectSlug: string, chapterIds: readonly string[]): Promise<ObligationLoadReport> {
  const all = (await listNarrativeObligations(root)).filter((item) => item.projectSlug === projectSlug);
  const open = all.filter((item) => !["paid", "neutralized", "transformed", "waived", "invalidated"].includes(item.status));
  const byImportance = { low: 0, medium: 0, high: 0 } as Record<"low" | "medium" | "high", number>; const byType: Partial<Record<ObligationType, number>> = {};
  for (const item of open) { byImportance[item.importance] += 1; byType[item.type] = (byType[item.type] || 0) + 1; }
  const weightedLoad = byImportance.low + byImportance.medium * 2 + byImportance.high * 3;
  const recommendations: string[] = []; if (weightedLoad >= 8) recommendations.push("spread obligations across multiple windows before adding more high-impact items"); if (byImportance.high >= 3) recommendations.push("spread high-importance obligations and assign explicit recovery windows"); if (open.length > 0 && !chapterIds.length) recommendations.push("attach open obligations to a chapter window before execution");
  const status: ObligationLoadReport["status"] = weightedLoad >= 8 ? "blocked" : weightedLoad >= 4 ? "watch" : "stable";
  const base = { schemaVersion: "obligation-load-report.v1" as const, projectSlug, windowChapterIds: [...chapterIds], openObligationCount: open.length, weightedLoad, byImportance, byType, recommendations, status, canClaimNoOpenObligations: false as const, generatedAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}
