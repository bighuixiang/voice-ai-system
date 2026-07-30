import { describe, expect, it } from "vitest";
import { createWorldIntegrityCertificate } from "./worldIntegrityCertificate.js";

const valid = { certificateId: "world-cert-1", publicationId: "volume-1-final", auditVersion: "audit-2026-07", scope: "volume-1", coverage: { rules: ["rule-1"], states: ["state-1"], capabilities: ["cap-1"], resources: ["resource-ledger"], time: ["timeline-main"], organizations: ["watch"] }, openExceptionDebtIds: [], conflictIds: [], unknowns: [], scanFailures: [], sourceRefs: ["publication://volume-1"], generatedAt: "2026-07-30T00:00:00Z" };

describe("world integrity certificate", () => {
  it("freezes a scoped publication with complete coverage", () => {
    const certificate = createWorldIntegrityCertificate(valid);
    expect(certificate.status).toBe("certified");
    expect(certificate.claim).toContain("指定范围");
  });

  it("does not certify unresolved debts, conflicts, unknowns, or scan failures", () => {
    const certificate = createWorldIntegrityCertificate({ ...valid, openExceptionDebtIds: ["debt-1"], unknowns: ["south-road"] });
    expect(certificate.status).toBe("blocked");
    expect(certificate.blockers).toEqual(expect.arrayContaining(["OPEN_EXCEPTION_DEBT", "UNKNOWN_FACTS"]));
  });

  it("rejects incomplete coverage rather than claiming whole-world consistency", () => {
    expect(() => createWorldIntegrityCertificate({ ...valid, coverage: { ...valid.coverage, organizations: [] } })).toThrow("WORLD_CERTIFICATE_COVERAGE_REQUIRED");
  });
});
