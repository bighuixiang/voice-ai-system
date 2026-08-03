import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProseCandidatePanel from "./ProseCandidatePanel.vue";
import type { ProseAdoptionReadiness, ProseAdoptionTransaction, ProseCandidate, ProseRepairCandidate, ProseRepairPlan, ProseRepairRegression, ProseValidationBundle, RedBlueReview } from "@/types/novel";

const candidate: ProseCandidate = { schemaVersion: "prose-candidate.v1", candidateId: "prose-1", projectSlug: "demo", chapterId: "chapter-001", policyVersion: "tiered-quality.v1", riskTier: "elevated", status: "generated", content: "Candidate prose only.", generation: { schemaVersion: "prose-generation-manifest.v1", chapterId: "chapter-001", outlineVersionId: "version-1", executionProofFingerprint: "p", contextManifestId: "manifest-1", contextFingerprint: "c", createdAt: "2026-07-30T00:00:00.000Z" }, sourceFingerprint: "s", createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "f" };
const validation: ProseValidationBundle = { schemaVersion: "prose-validation-bundle.v1", bundleId: "bundle-1", candidateId: candidate.candidateId, candidateFingerprint: candidate.fingerprint, status: "passed", checks: [{ checkId: "context", status: "passed", detail: "Context is current." }], hardFailures: [], reviewer: { kind: "independent-deterministic", id: "prose-validation-v1" }, createdAt: candidate.createdAt, fingerprint: "b" };
const review: RedBlueReview = { schemaVersion: "red-blue-review.v1", reviewId: "review-1", candidateId: candidate.candidateId, candidateFingerprint: candidate.fingerprint, validationBundleFingerprint: validation.fingerprint, status: "passed", redFindings: [], blueStrengths: [{ strengthId: "strength-1", detail: "Maintains POV." }], commonGround: [{ claimId: "candidate-bound", detail: "Same candidate", evidenceRefs: [] }], blueArgument: { claims: [{ claimId: "strength-1", detail: "Maintains POV.", evidenceRefs: [] }], protectedStrengths: ["strength-1"] }, redArgument: { claims: [], counterevidenceRefs: [], falsifiers: ["Validation must remain current."] }, verdict: "supports-adoption", recommendation: "adopt", reviewer: { kind: "independent-deterministic", id: "red-blue-review-v1" }, createdAt: candidate.createdAt, fingerprint: "r" };
const blockedReview: RedBlueReview = { ...review, reviewId: "review-blocked", status: "blocked", redFindings: [{ findingId: "placeholder-or-wrapper", severity: "hard", detail: "Placeholder" }], blueArgument: { ...review.blueArgument, protectedStrengths: ["strength-1"] }, redArgument: { ...review.redArgument, claims: [{ claimId: "placeholder-or-wrapper", detail: "Placeholder", evidenceRefs: [] }] }, verdict: "blocks-adoption", recommendation: "repair", fingerprint: "blocked-review" };
const readiness: ProseAdoptionReadiness = { candidateId: candidate.candidateId, chapterId: candidate.chapterId, targetPath: "chapters/chapter-001.md", expectedCanonSha256: "canon-before", authorizationRequired: true, validationStatus: "passed", canonWritten: false };
const adoption: ProseAdoptionTransaction = { schemaVersion: "prose-adoption-transaction.v1", transactionId: "adopt-1", candidateId: candidate.candidateId, targetPath: readiness.targetPath, expectedCanonSha256: readiness.expectedCanonSha256, adoptedSha256: "canon-after", authorizationId: "author-1", reviewFingerprint: "review-fp", reviewVerdict: "supports-adoption", status: "committed", createdAt: candidate.createdAt, committedAt: candidate.createdAt, fingerprint: "adoption-fp" };
const repairPlan: ProseRepairPlan = { schemaVersion: "prose-repair-plan.v1", planId: "plan-1", projectSlug: "demo", candidateId: candidate.candidateId, reviewFingerprint: blockedReview.fingerprint, status: "ready", targetFindings: [{ findingId: "placeholder-or-wrapper", severity: "hard", evidenceRefs: [], expectedImprovement: "Remove placeholder." }], scope: { kind: "local-span", chapterId: candidate.chapterId, affectedParagraphIndexes: [0], maxChangedParagraphs: 1 }, protectedStrengths: ["strength-1"], protectedItems: [], prohibitedActions: [], expectedEvidence: [], regressionChecks: [], rollbackPoint: { candidateFingerprint: candidate.fingerprint, canonUntouched: true }, authorDecisionRequired: true, createdAt: candidate.createdAt, fingerprint: "plan-fp" };
const repairCandidate: ProseRepairCandidate = { schemaVersion: "prose-repair-candidate.v1", repairCandidateId: "repair-1", planId: repairPlan.planId, parentCandidateId: candidate.candidateId, parentCandidateFingerprint: candidate.fingerprint, candidateId: "prose-repaired-1", changedParagraphIndexes: [0], status: "generated", createdAt: candidate.createdAt, fingerprint: "repair-fp" };
const regression: ProseRepairRegression = { schemaVersion: "prose-repair-regression.v1", regressionId: "regression-1", planId: repairPlan.planId, parentCandidateFingerprint: candidate.fingerprint, repairedCandidateFingerprint: "repaired-fp", parentReviewFingerprint: blockedReview.fingerprint, repairedReviewFingerprint: "repaired-review-fp", repairedValidationFingerprint: "repaired-validation-fp", status: "passed", improvements: [{ findingId: "placeholder-or-wrapper", status: "resolved", evidenceRefs: [] }], regressions: [], preservedStrengths: ["strength-1"], canonicalUntouched: true, createdAt: candidate.createdAt, fingerprint: "regression-fp" };

describe("ProseCandidatePanel", () => {
  it("keeps candidate prose visibly separate from canon", () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate] } });
    expect(wrapper.text()).toContain("候选正文，不是 canon");
    expect(wrapper.text()).toContain("Candidate prose only.");
    expect(wrapper.get("[data-testid='candidate-policy']").text()).toContain("tiered-quality.v1");
  });

  it("emits validation and review actions", async () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate] } });
    await wrapper.get("button[aria-label='验证 prose-1']").trigger("click");
    await wrapper.get("button[aria-label='红蓝审阅 prose-1']").trigger("click");
    expect(wrapper.emitted("validate")?.[0]).toEqual([candidate]);
    expect(wrapper.emitted("review")?.[0]).toEqual([candidate]);
  });

  it("renders independent validation and red-blue evidence", () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate], validations: { [candidate.candidateId]: validation }, reviews: { [candidate.candidateId]: review } } });
    expect(wrapper.text()).toContain("context: passed");
    expect(wrapper.text()).toContain("Maintains POV.");
    expect(wrapper.text()).toContain("验证通过");
  });

  it("offers a repair-plan action only for blocked red-blue review", async () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate], reviews: { [candidate.candidateId]: blockedReview } } });
    await wrapper.get("[data-testid='repair-prose-1']").trigger("click");
    expect(wrapper.emitted("repair")?.[0]).toEqual([candidate]);
  });

  it("revalidates a generated repair candidate through the regression dossier action", async () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate], reviews: { [candidate.candidateId]: blockedReview }, repairPlans: { [candidate.candidateId]: repairPlan }, repairCandidates: { [candidate.candidateId]: repairCandidate }, repairRegressions: { [candidate.candidateId]: regression } } });
    await wrapper.get("[data-testid='evaluate-repair-prose-1']").trigger("click");
    expect(wrapper.emitted("evaluate-repair")?.[0]).toEqual([candidate]);
    expect(wrapper.text()).toContain("passed");
  });

  it("requires author authorization before emitting adoption and supports chapter settlement", async () => {
    const wrapper = mount(ProseCandidatePanel, { props: { candidates: [candidate], readiness: { [candidate.candidateId]: readiness }, adoptions: { [candidate.candidateId]: adoption } } });
    const adopt = wrapper.get("button[data-testid='adopt-prose-1']");
    expect((adopt.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get("input[data-testid='authorization-prose-1']").setValue("author-1");
    expect((adopt.element as HTMLButtonElement).disabled).toBe(false);
    await adopt.trigger("click");
    expect(wrapper.emitted("adopt")?.[0]).toEqual([candidate, { expectedCanonSha256: "canon-before", authorizationId: "author-1" }]);
    await wrapper.get("button[data-testid='settle-prose-1']").trigger("click");
    expect(wrapper.emitted("settle")?.[0]).toEqual([candidate, adoption]);
  });
});
