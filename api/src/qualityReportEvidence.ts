import crypto from "node:crypto";
import type { ChapterQualityReport, QualityReportEvidence } from "./types.js";

function sha256(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }

export function attachQualityReportEvidence(report: ChapterQualityReport, input: {
  content: string;
  sourceFingerprint: string;
  evaluatorVersion: string;
  mode: QualityReportEvidence["mode"];
  generatedAt?: string;
}): ChapterQualityReport {
  if (!input.sourceFingerprint.trim() || !input.evaluatorVersion.trim()) throw new Error("QUALITY_REPORT_EVIDENCE_FIELDS_REQUIRED");
  return {
    ...report,
    evidence: {
      contentSha256: sha256(input.content),
      sourceFingerprint: input.sourceFingerprint.trim(),
      evaluatorVersion: input.evaluatorVersion.trim(),
      mode: input.mode,
      generatedAt: input.generatedAt || new Date().toISOString()
    }
  };
}

export function assertQualityReportCurrent(report: ChapterQualityReport, input: { content: string; sourceFingerprint: string }): void {
  if (!report.evidence || report.evidence.mode === "legacy") throw new Error("QUALITY_REPORT_EVIDENCE_REQUIRED");
  if (report.evidence.contentSha256 !== sha256(input.content) || report.evidence.sourceFingerprint !== input.sourceFingerprint.trim()) throw new Error("QUALITY_REPORT_STALE");
}
