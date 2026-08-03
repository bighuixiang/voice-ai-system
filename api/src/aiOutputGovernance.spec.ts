import { describe, expect, it } from "vitest";
import { assertCompletionEvidenceIntegrity, assertStructuredOutputGateIntegrity, evaluateCompletionEvidence, evaluateStructuredOutput } from "./aiOutputGovernance.js";

describe("AI output governance", () => {
  it("accepts schema-valid output but quarantines malformed output after one repair", () => {
    expect(evaluateStructuredOutput({ rawOutput: '{"summary":"ok"}', requiredFields: ["summary"] }).canonWriteAllowed).toBe(true);
    expect(evaluateStructuredOutput({ rawOutput: "not-json", requiredFields: ["summary"] }).status).toBe("repair-required");
    expect(evaluateStructuredOutput({ rawOutput: '{"other":true}', requiredFields: ["summary"], repairAttempted: true }).status).toBe("quarantined");
    expect(evaluateStructuredOutput({ rawOutput: '{"other":true}', requiredFields: ["summary"], repairAttempted: true }).canonWriteAllowed).toBe(false);
  });

  it("does not treat model self-claims as completion evidence", () => {
    expect(evaluateCompletionEvidence({ selfClaims: ["closed-loop", "96 points"], externalEvidenceRefs: [], stateMachineProofRefs: [], independentReviewPassed: false })).toMatchObject({ status: "blocked", completionAllowed: false });
    expect(evaluateCompletionEvidence({ selfClaims: ["closed-loop"], externalEvidenceRefs: ["chapter:1"], stateMachineProofRefs: [], independentReviewPassed: true }).status).toBe("supported");
  });
  it("rejects malformed gate inputs and detects tampered evidence", () => { expect(() => evaluateStructuredOutput({ rawOutput: "", requiredFields: ["summary"] })).toThrow("STRUCTURED_OUTPUT_INPUT_INVALID"); const output = evaluateStructuredOutput({ rawOutput: '{"summary":"ok"}', requiredFields: ["summary"] }); expect(() => assertStructuredOutputGateIntegrity({ ...output, canonWriteAllowed: false })).toThrow("STRUCTURED_OUTPUT_GATE_INTEGRITY_FAILED"); const evidence = evaluateCompletionEvidence({ selfClaims: [], externalEvidenceRefs: ["evidence://1"], stateMachineProofRefs: [], independentReviewPassed: true }); expect(() => assertCompletionEvidenceIntegrity({ ...evidence, completionAllowed: false })).toThrow("COMPLETION_EVIDENCE_INTEGRITY_FAILED"); });
});
