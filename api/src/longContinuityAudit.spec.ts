import { describe, expect, it } from "vitest";
import { buildLongContinuityAudit } from "./longContinuityAudit.js";
const health = { reportId: "memory-health-aaaaaaaaaaaaaaaaaaaaaaaa", fingerprint: "a".repeat(64), status: "healthy" as const, coverage: { totalChapters: 2, settledChapters: 2, eligibleClaims: 3 }, staleProjectionCount: 0, sourceRefs: ["memory/claims/current.json"] } as never;
describe("long continuity audit", () => {
  it("issues audited-consistent only when coverage and conflict debt are clear", () => { expect(buildLongContinuityAudit({ projectSlug: "demo", health, candidateClaims: 0, contradictionSetIds: [] })).toMatchObject({ status: "audited-consistent", coverage: { settledRatio: 1 }, issues: [] }); });
  it("blocks continuity certification when candidate or contradictory claims remain", () => { const audit = buildLongContinuityAudit({ projectSlug: "demo", health: { ...health, coverage: { ...health.coverage, settledChapters: 1 }, staleProjectionCount: 1 }, candidateClaims: 2, contradictionSetIds: ["set-1"] }); expect(audit).toMatchObject({ status: "blocked", issues: expect.arrayContaining(["SETTLED_CHAPTER_COVERAGE_INCOMPLETE", "CANDIDATE_CLAIMS_UNSETTLED", "CONTRADICTION_SETS_OPEN", "STALE_PROJECTIONS_PRESENT"]) }); });
});
