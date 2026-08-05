import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import QualityCalibrationPanel from "./QualityCalibrationPanel.vue";
import type { QualityCalibrationEvidence } from "@/types/novel";

const evidence: QualityCalibrationEvidence = {
  schemaVersion: "quality-calibration-evidence.v1", calibrationId: "calibration-1", evaluatorVersion: "provider-v4", sourceKind: "provider", split: "holdout", caseIds: [], inputFingerprint: "sealed-holdout-v4", evaluatedCount: 20, correctCount: 18, accuracy: 0.9, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://provider/v4" }, evidenceRefs: ["audit://provider/v4"], createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "fp-1"
};

describe("QualityCalibrationPanel", () => {
  it("shows external holdout evidence without exposing labels", () => {
    const wrapper = mount(QualityCalibrationPanel, { props: { evidence } });
    expect(wrapper.text()).toContain("外部校准证据");
    expect(wrapper.text()).toContain("sealed-holdout-v4");
    expect(wrapper.text()).toContain("服务商");
    expect(wrapper.text()).toContain("留出集");
    expect(wrapper.text()).toContain("标签与评审输入隔离");
    expect(wrapper.text()).not.toContain("case-1");
  });

  it("emits only provider or human attested submissions", async () => {
    const wrapper = mount(QualityCalibrationPanel);
    await wrapper.get("input[data-testid='calibration-evaluator']").setValue("human-review-v1");
    await wrapper.get("input[data-testid='calibration-holdout']").setValue("sealed-human-v1");
    await wrapper.get("input[data-testid='calibration-evaluated']").setValue("10");
    await wrapper.get("input[data-testid='calibration-correct']").setValue("9");
    await wrapper.get("input[data-testid='calibration-attestation']").setValue("human://review/v1");
    await wrapper.get("input[data-testid='calibration-evidence-ref']").setValue("audit://human/v1");
    expect((wrapper.get("button[data-testid='submit-calibration']").element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]).toEqual([expect.objectContaining({ sourceKind: "human", evaluatorVersion: "human-review-v1", holdoutInputFingerprint: "sealed-human-v1", evaluatedCount: 10, correctCount: 9, attestation: { kind: "human-reviewed", reference: "human://review/v1" }, evidenceRefs: ["audit://human/v1"] })]);
  });
});
