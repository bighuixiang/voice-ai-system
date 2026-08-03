import { describe, expect, it } from "vitest";
import { buildProseValidationDossier } from "./proseDossier.js";

const domains = ["hard-guards", "chapter-function", "scene-execution", "character-agency", "pov-information", "obligation-beats", "seams", "author-goal", "language-craft"] as const;
const valid = { projectSlug: "demo", candidateId: "candidate-1", baselineFingerprint: "base-1", domains: domains.map((domain) => ({ domain, applicable: true, evidence: [`evidence://${domain}`], counterEvidence: [], confidence: 0.9, blockingLevel: "none" as const, status: "evaluated" as const })), overallScore: 0.95, sourceRefs: ["prose://candidate-1"] };
describe("prose validation dossier", () => {
  it("records all required domains and passes", () => { const dossier = buildProseValidationDossier(valid); expect(dossier.status).toBe("passed"); expect(dossier.domains).toHaveLength(9); });
  it("never lets overall score hide hard failure or unevaluated domain", () => { const report = buildProseValidationDossier({ ...valid, overallScore: 1, domains: valid.domains.map((d) => d.domain === "hard-guards" ? { ...d, blockingLevel: "hard" as const, counterEvidence: ["guard failed"] } : d) }); expect(report.status).toBe("blocked"); expect(report.issues).toContain("HARD_GUARD_FAILED"); const unevaluated = buildProseValidationDossier({ ...valid, domains: valid.domains.map((d) => d.domain === "seams" ? { ...d, status: "unevaluated" as const, applicable: true, evidence: [] } : d) }); expect(unevaluated.status).toBe("blocked"); expect(unevaluated.issues).toContain("DOMAIN_UNEVALUATED"); });
  it("requires confidence, evidence and source", () => { expect(buildProseValidationDossier({ ...valid, sourceRefs: [] }).issues).toContain("DOSSIER_SOURCE_REQUIRED"); expect(buildProseValidationDossier({ ...valid, domains: valid.domains.map((d) => d.domain === "language-craft" ? { ...d, confidence: 0, evidence: [] } : d) }).status).toBe("blocked"); });
  it("rejects duplicate domains, invalid scores, and blank evidence anchors", () => {
    const report = buildProseValidationDossier({ ...valid, overallScore: 2, sourceRefs: [""], domains: [{ ...valid.domains[0], evidence: [""] }, ...valid.domains] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["DOSSIER_SCORE_INVALID", "DOSSIER_SOURCE_REQUIRED", "DOMAIN_DUPLICATE", "DOMAIN_EVIDENCE_REQUIRED"]));
  });
});
