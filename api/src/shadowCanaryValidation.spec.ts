import { describe, expect, it } from "vitest";
import { assertShadowCanaryValidationIntegrity, createShadowCanaryValidation } from "./shadowCanaryValidation.js";

describe("shadow and canary validation", () => {
  it("keeps shadow output outside canon and records rollback evidence", () => {
    const validation = createShadowCanaryValidation({ validationId: "shadow-1", candidateVersion: "prompt-v2", mode: "shadow", authorAuthorized: false, status: "passed", anomalyRefs: [], rollbackTarget: "prompt-v1", evidenceRefs: ["run://1"] });
    expect(validation).toMatchObject({ mode: "shadow", canonWrites: false, status: "passed" });
    expect(() => assertShadowCanaryValidationIntegrity(validation)).not.toThrow();
  });

  it("requires explicit project authorization for canary and anomaly evidence for failure", () => {
    expect(() => createShadowCanaryValidation({ validationId: "canary-1", candidateVersion: "v2", mode: "canary", authorAuthorized: false, projectSlug: "demo", status: "passed", anomalyRefs: [], rollbackTarget: "v1", evidenceRefs: ["run://2"] })).toThrow("SHADOW_CANARY_AUTHORIZATION_INVALID");
    expect(() => createShadowCanaryValidation({ validationId: "shadow-2", candidateVersion: "v2", mode: "shadow", authorAuthorized: false, status: "failed", anomalyRefs: [], rollbackTarget: "v1", evidenceRefs: ["run://3"] })).toThrow("SHADOW_CANARY_FAILURE_EVIDENCE_REQUIRED");
  });
});
