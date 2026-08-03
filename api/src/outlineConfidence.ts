import crypto from "node:crypto";

export type OutlineConfidence = "committed" | "rolling" | "tentative" | "exploratory";
export type OutlineConfidenceRole = "constraint" | "chapter-detail" | "milestone";
export type OutlineDetailLevel = "detailed" | "milestone" | "constraint-only";
export interface OutlineConfidenceInput {
  totalChapterCount: number;
  strongFreezeCount: number;
  nodes: Array<{ nodeId: string; chapterOrder: number; confidence: OutlineConfidence; role: OutlineConfidenceRole; detailLevel: OutlineDetailLevel }>;
}
export interface OutlineConfidenceReport { schemaVersion: "outline-confidence-report.v1"; status: "passed" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateOutlineConfidence(input: OutlineConfidenceInput): OutlineConfidenceReport {
  const issues: string[] = [];
  if (!Number.isInteger(input.totalChapterCount) || input.totalChapterCount < 3 || input.totalChapterCount > 5) issues.push("HORIZON_RANGE_INVALID");
  if (!Number.isInteger(input.strongFreezeCount) || input.strongFreezeCount < 3 || input.strongFreezeCount > input.totalChapterCount) issues.push("STRONG_FREEZE_INVALID");
  const ids = input.nodes.map((node) => node.nodeId); if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) issues.push("CONFIDENCE_NODE_ID_DUPLICATE");
  for (const node of input.nodes) {
    if (node.chapterOrder <= input.strongFreezeCount && (!(["committed", "rolling"] as OutlineConfidence[]).includes(node.confidence) || node.detailLevel !== "detailed")) issues.push("NEAR_HORIZON_CONFIDENCE_TOO_LOW");
    if (node.chapterOrder > input.strongFreezeCount && node.role === "chapter-detail" && node.confidence === "committed") issues.push("DISTANT_DETAIL_OVERCOMMITTED");
    if (node.chapterOrder > input.strongFreezeCount && node.role === "chapter-detail" && node.detailLevel === "detailed") issues.push("DISTANT_DETAIL_TOO_DETAILED");
    if (node.confidence === "committed" && node.role !== "constraint" && node.chapterOrder > input.strongFreezeCount) issues.push("DISTANT_DETAIL_OVERCOMMITTED");
  }
  const base = { schemaVersion: "outline-confidence-report.v1" as const, status: issues.length ? "blocked" as const : "passed" as const, issues: [...new Set(issues)] };
  return { ...base, fingerprint: hash(base) };
}
