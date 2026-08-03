import { describe, expect, it } from "vitest";
import { buildMemoryReadyProof } from "./memoryReadyProof.js";

const preview = { retrievalId: "retrieval-aaaaaaaaaaaaaaaaaaaaaaaa", resultFingerprint: "a".repeat(64), sourceResultFingerprint: "b".repeat(64), query: "gate", boundary: { chapterId: "chapter-1" } } as never;
const health = { reportId: "memory-health-bbbbbbbbbbbbbbbbbbbbbbbb", fingerprint: "c".repeat(64), status: "healthy" } as never;

describe("memory ready proof", () => {
  it("freezes all memory inputs when no blocker remains", () => {
    const proof = buildMemoryReadyProof({ projectSlug: "demo", targetChapterId: "chapter-1", health, preview, projection: { status: "current", blockingReasons: [], affectedClaimIds: [] }, contradictionSetIds: [] });
    expect(proof).toMatchObject({ schemaVersion: "memory-ready-proof.v1", status: "ready", blockers: [], targetChapterId: "chapter-1" });
    expect(proof.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("records every unresolved blocker instead of claiming readiness", () => {
    const proof = buildMemoryReadyProof({ projectSlug: "demo", targetChapterId: "chapter-1", health: { ...health, status: "degraded" }, preview, projection: { status: "replacement-pending", blockingReasons: ["MEMORY_REPLACEMENT_PENDING"], affectedClaimIds: ["claim-1"] }, contradictionSetIds: ["contradiction-1"] });
    expect(proof).toMatchObject({ status: "blocked", blockers: ["MEMORY_HEALTH_DEGRADED", "MEMORY_REPLACEMENT_PENDING", "MEMORY_CONTRADICTION_UNRESOLVED"] });
  });

  it("blocks readiness when retrieval evidence is known to be insufficient", () => {
    const proof = buildMemoryReadyProof({
      projectSlug: "demo",
      targetChapterId: "chapter-1",
      health,
      preview: { ...preview, evidenceProfile: { gaps: ["conflict", "time-unknown"], independentSourceCount: 0, familyCount: 0, duplicateDerivedGroupCount: 0, sources: [], saysNoContradiction: false } },
      projection: { status: "current", blockingReasons: [], affectedClaimIds: [] },
      contradictionSetIds: []
    });

    expect(proof).toMatchObject({ status: "blocked", blockers: ["MEMORY_RETRIEVAL_EVIDENCE_GAP_CONFLICT", "MEMORY_RETRIEVAL_EVIDENCE_GAP_TIME_UNKNOWN"] });
  });

  it("binds a continuity audit and blocks when the audit is not complete", () => {
    const proof = buildMemoryReadyProof({
      projectSlug: "demo",
      targetChapterId: "chapter-1",
      health,
      preview,
      continuityAudit: { auditId: "continuity-audit-cccccccccccccccccccccccc", fingerprint: "d".repeat(64), status: "blocked" },
      projection: { status: "current", blockingReasons: [], affectedClaimIds: [] },
      contradictionSetIds: []
    });

    expect(proof).toMatchObject({
      status: "blocked",
      continuityAuditId: "continuity-audit-cccccccccccccccccccccccc",
      continuityAuditFingerprint: "d".repeat(64),
      blockers: ["MEMORY_CONTINUITY_AUDIT_BLOCKED"]
    });
  });
});
