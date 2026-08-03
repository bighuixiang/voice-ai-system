import { describe, expect, it } from "vitest";
import { evaluateObligationClosureGate } from "./obligationClosureGate.js";

const valid = { obligations: [{ obligationId: "obl-1", status: "paid", evidenceFresh: true }, { obligationId: "obl-2", status: "intentional_open", evidenceFresh: true }], sourceCoverageComplete: true, unresolvedCandidateCount: 0, conflictCount: 0, intentionalOpen: [{ obligationId: "obl-2", authorAuthorized: true, fairnessEvidence: ["reader://1"], answeredSubclaims: ["door opens"], sequelInheritance: true }] };
describe("obligation closure gate", () => {
  it("blocks paid-only books when coverage or conflicts remain", () => {
    const result = evaluateObligationClosureGate({ ...valid, unresolvedCandidateCount: 2, conflictCount: 1 });
    expect(result).toMatchObject({ status: "blocked", blockers: expect.arrayContaining(["unresolved-candidates", "unresolved-conflicts"]) });
  });
  it("allows audited complete only when every closure condition is current", () => {
    expect(evaluateObligationClosureGate(valid)).toMatchObject({ status: "audited_complete", blockers: [] });
  });
  it("requires the full intentional-open contract", () => {
    const result = evaluateObligationClosureGate({ ...valid, intentionalOpen: [{ ...valid.intentionalOpen[0], fairnessEvidence: [] }] });
    expect(result.blockers).toContain("obl-2:intentional-open-contract");
  });
});
