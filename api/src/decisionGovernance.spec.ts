import { describe, expect, it } from "vitest";
import { createAutonomyReceipt, createDecisionEscalation, revokeAutonomyReceipt } from "./decisionGovernance.js";

describe("decision escalation and autonomy receipt", () => {
  it("records why a high-impact decision interrupts the author", () => {
    const escalation = createDecisionEscalation({ escalationId: "e-1", projectSlug: "p1", decisionType: "core-ending", impact: "changes protagonist ending", irreversibility: "cannot safely rewrite published edition", currentEvidence: ["contract://ending"], safeDefaults: ["hold candidate"], delayCost: "outline window expires", thresholdReason: "crosses L2" });
    expect(escalation).toMatchObject({ schemaVersion: "decision-escalation.v1", level: "L2", status: "needs-author" });
  });

  it("does not escalate low-risk reversible choices", () => {
    const escalation = createDecisionEscalation({ escalationId: "e-2", projectSlug: "p1", decisionType: "scene-label", impact: "changes a temporary label", irreversibility: "reversible", currentEvidence: ["scene://1"], safeDefaults: ["keep existing label"], delayCost: "none", thresholdReason: "below L2" });
    expect(escalation.level).toBe("L0");
  });

  it("issues a scoped autonomy receipt and supports explicit revocation", () => {
    const receipt = createAutonomyReceipt({ receiptId: "a-1", projectSlug: "p1", scope: ["scene-label"], level: "L1", evidenceRefs: ["review://1"], expiresAt: "2099-01-01T00:00:00.000Z", revocationPhrase: "stop delegated labels" });
    expect(receipt.status).toBe("active");
    expect(receipt.scope).toEqual(["scene-label"]);
    expect(revokeAutonomyReceipt(receipt, "stop delegated labels").status).toBe("revoked");
  });

  it("rejects an autonomy receipt that crosses L2 or has no expiry", () => {
    expect(() => createAutonomyReceipt({ receiptId: "a-2", projectSlug: "p1", scope: ["ending"], level: "L2", evidenceRefs: ["x"], expiresAt: "2099-01-01T00:00:00.000Z", revocationPhrase: "stop" })).toThrow("AUTONOMY_L2_FORBIDDEN");
    expect(() => createAutonomyReceipt({ receiptId: "a-3", projectSlug: "p1", scope: ["labels"], level: "L1", evidenceRefs: ["x"], expiresAt: "", revocationPhrase: "stop" })).toThrow("AUTONOMY_EXPIRY_REQUIRED");
  });
});
