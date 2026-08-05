import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import IndependentReviewPanel from "./IndependentReviewPanel.vue";
import type { UnderstandingReview } from "@/types/novel";

const review: UnderstandingReview = { schemaVersion: "understanding-review.v1", reviewId: "review-1", projectSlug: "demo", snapshotId: "snapshot-1", snapshotFingerprint: "a".repeat(64), calibrationVersion: "understanding-calibration.v1", reviewer: { kind: "human", id: "reviewer-1", attestationReference: "human://review/1" }, status: "passed", checks: [{ checkId: "canon-isolation", status: "passed", detail: "No canon writes." }], canonWritten: false, createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "f", evidenceRefs: ["audit://review/1"] };

describe("IndependentReviewPanel", () => {
  it("shows reviewer attestation and canon isolation", () => {
    const wrapper = mount(IndependentReviewPanel, { props: { review } });
    expect(wrapper.text()).toContain("独立评审证据");
    expect(wrapper.text()).toContain("human://review/1");
    expect(wrapper.text()).toContain("已写入正式设定：否");
    expect(wrapper.text()).toContain("验证通过");
  });

  it("submits all required external review checks", async () => {
    const wrapper = mount(IndependentReviewPanel);
    await wrapper.get("input[data-testid='reviewer-id']").setValue("provider-review-1");
    await wrapper.get("input[data-testid='review-attestation']").setValue("provider://review/1");
    await wrapper.get("input[data-testid='review-snapshot']").setValue("a".repeat(64));
    await wrapper.get("input[data-testid='review-evidence']").setValue("audit://review/1");
    for (const id of ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"]) await wrapper.get(`input[data-testid='review-check-${id}']`).setValue(`passed ${id}`);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]).toEqual([expect.objectContaining({ reviewerKind: "human", reviewerId: "provider-review-1", snapshotFingerprint: "a".repeat(64), evidenceRefs: ["audit://review/1"], checks: expect.arrayContaining([expect.objectContaining({ checkId: "canon-isolation" })]) })]);
  });
});
