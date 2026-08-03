import { describe, expect, it } from "vitest";
import { assertQualityReportCurrent, attachQualityReportEvidence } from "./qualityReportEvidence.js";
import type { ChapterQualityReport } from "./types.js";

const report: ChapterQualityReport = { chapterId: "c1", overallScore: 80, summary: "summary", metrics: [], strengths: [], fixes: [], updatedAt: "2026-07-31T00:00:00.000Z" };

describe("quality report evidence", () => {
  it("binds a report to the evaluated content and source version", () => {
    const evidenced = attachQualityReportEvidence(report, { content: "chapter text", sourceFingerprint: "canon-1", evaluatorVersion: "quality-review.v1", mode: "hybrid" });
    expect(evidenced.evidence).toMatchObject({ sourceFingerprint: "canon-1", evaluatorVersion: "quality-review.v1", mode: "hybrid", contentSha256: expect.any(String) });
    expect(() => assertQualityReportCurrent(evidenced, { content: "chapter text", sourceFingerprint: "canon-1" })).not.toThrow();
  });

  it("fails closed for legacy or changed quality inputs", () => {
    expect(() => assertQualityReportCurrent(report, { content: "chapter text", sourceFingerprint: "canon-1" })).toThrow("QUALITY_REPORT_EVIDENCE_REQUIRED");
    const evidenced = attachQualityReportEvidence(report, { content: "chapter text", sourceFingerprint: "canon-1", evaluatorVersion: "quality-review.v1", mode: "rules" });
    expect(() => assertQualityReportCurrent(evidenced, { content: "changed", sourceFingerprint: "canon-1" })).toThrow("QUALITY_REPORT_STALE");
    expect(() => assertQualityReportCurrent(evidenced, { content: "chapter text", sourceFingerprint: "canon-2" })).toThrow("QUALITY_REPORT_STALE");
  });
});
