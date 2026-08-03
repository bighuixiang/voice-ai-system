import { describe, expect, it } from "vitest";
import { assertModelCallFingerprintIntegrity, createModelCallFingerprint, evaluateModelCallReplay } from "./modelCallFingerprint.js";

const input = { businessInputFingerprint: "biz", contextManifestFingerprint: "ctx", routePolicyFingerprint: "route", promptSchemaVersion: "prompt.v1", outputSchemaVersion: "output.v1", modelCapabilityRef: "cap.deep", modelParameters: { temperature: 0, topP: 1, seed: 7 }, toolPermissions: ["read:canon", "read:canon"] };

describe("model call fingerprints", () => {
  it("normalizes tool permissions and binds all replay inputs", () => {
    const first = createModelCallFingerprint(input);
    expect(first.toolPermissions).toEqual(["read:canon"]);
    expect(evaluateModelCallReplay({ expected: first, actual: createModelCallFingerprint(input) }).status).toBe("pass");
  });

  it("blocks when a route, parameter, or permission changes", () => {
    const first = createModelCallFingerprint(input);
    const changed = createModelCallFingerprint({ ...input, modelParameters: { temperature: 0, topP: 1, seed: 8 } });
    expect(evaluateModelCallReplay({ expected: first, actual: changed }).reasons).toEqual(expect.arrayContaining(["FINGERPRINT_MODELPARAMETERS_MISMATCH", "CALL_FINGERPRINT_MISMATCH"]));
  });
  it("fails closed when either replay fingerprint is tampered", () => { const first = createModelCallFingerprint(input); expect(() => assertModelCallFingerprintIntegrity({ ...first, modelCapabilityRef: "tampered" })).toThrow("MODEL_CALL_FINGERPRINT_INTEGRITY_FAILED"); expect(() => evaluateModelCallReplay({ expected: first, actual: { ...first, toolPermissions: ["read:canon", " "] } })).toThrow("MODEL_CALL_FINGERPRINT_INTEGRITY_FAILED"); });
});
