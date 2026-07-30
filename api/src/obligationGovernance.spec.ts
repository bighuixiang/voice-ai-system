import { describe, expect, it } from "vitest";
import { assessObligationSourceCoverage, evaluateObligationWindow, planObligationRepair, authorizeIntentionalOpen, projectObligationVisibility } from "./obligationGovernance.js";

describe("obligation governance", () => {
  it("reports missing source coverage instead of treating an empty ledger as healthy", () => {
    const result = assessObligationSourceCoverage({ scannedSources: ["story-contract", "chapter-1"], parsedSources: ["story-contract"], unresolvedSources: ["chapter-1"], obligationCount: 0 });
    expect(result.status).toBe("coverage_missing");
    expect(result.unresolvedSources).toContain("chapter-1");
  });

  it("uses semantic hard/soft windows rather than chapter id arithmetic", () => {
    const result = evaluateObligationWindow({ obligationId: "obl-1", windowType: "milestone", currentMilestone: "after-door", targetMilestone: "after-door", hardness: "hard", paid: false });
    expect(result.status).toBe("overdue");
  });

  it("offers minimal repair routes with impact and cost", () => {
    const result = planObligationRepair({ obligationId: "obl-1", routes: [{ kind: "local-evidence", impact: "low", cost: 1 }, { kind: "new-chapter", impact: "high", cost: 8 }] });
    expect(result.recommended.kind).toBe("local-evidence");
  });

  it("requires author intent and fairness evidence for intentional open", () => {
    const result = authorizeIntentionalOpen({ obligationId: "obl-1", authorIntent: "leave for sequel", understoodRisk: "some readers expect answer", fairnessEvidence: ["reader-view-1"], answeredSubclaims: ["door opens"], sequelInheritance: true });
    expect(result.status).toBe("intentional_open");
    expect(() => authorizeIntentionalOpen({ obligationId: "obl-2", authorIntent: "", understoodRisk: "", fairnessEvidence: [], answeredSubclaims: [], sequelInheritance: false })).toThrow("INTENTIONAL_OPEN_NOT_AUTHORIZED");
  });

  it("redacts author truth from collaborator and reader projections", () => {
    const result = projectObligationVisibility({ authorSecret: "door is portal", collaborator: "must plan payoff", readerVisible: "door hums", publicMetadata: "mystery-1" }, "reader");
    expect(result).toEqual({ label: "mystery-1", hint: "door hums" });
  });
});
