import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertFeedbackAttributionIntegrity, assertPreferenceHypothesisIntegrity, createFeedbackAttribution, derivePreferenceHypothesis, listPreferenceHypotheses, promotePreferenceHypothesis, readFeedbackAttribution, readPreferenceHypothesis, recordPreferenceOpposition, revokePreferenceHypothesis } from "./feedbackLearning.js";

async function rootFixture() {
  return fs.mkdtemp(path.join(os.tmpdir(), "feedback-learning-"));
}

const event = (eventId: string, adoptionTransactionId: string, note: string) => ({
  schemaVersion: "author-feedback-event.v1" as const,
  eventId,
  projectSlug: "demo",
  candidateId: `candidate-${eventId}`,
  adoptionTransactionId,
  decision: "needs_revision" as const,
  note,
  createdAt: "2026-07-30T00:00:00.000Z",
  fingerprint: `fingerprint-${eventId}`
});

describe("feedback attribution and preference learning", () => {
  it("keeps a single feedback item as a scoped candidate and persists evidence", async () => {
    const root = await rootFixture();
    const attribution = await createFeedbackAttribution({
      root,
      event: event("event-1", "adoption-1", "压缩冗余对白"),
      category: "structure",
      scope: { chapterId: "chapter-1", sceneId: "scene-2" },
      evidenceRefs: ["candidate://candidate-event-1#paragraph-2"],
      confounders: ["本章为过渡章节"],
      confidence: { lower: 0.3, upper: 0.6 }
    });
    expect(attribution.lifecycle).toBe("candidate");
    expect(attribution.allowPreferenceLearning).toBe(false);
    expect(attribution.evidenceRefs).toHaveLength(1);
    expect(await readFeedbackAttribution(root, attribution.attributionId)).toEqual(attribution);
  });

  it("requires two independent same-scope observations before activation", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-1", "adoption-1", "压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "prefer-compact-dialogue" });
    expect((await derivePreferenceHypothesis({ root, attribution: first })).lifecycle).toBe("candidate");
    const second = await createFeedbackAttribution({ root, event: event("event-2", "adoption-2", "继续压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://two"], confounders: [], confidence: { lower: 0.6, upper: 0.85 }, pattern: "prefer-compact-dialogue" });
    const hypothesis = await derivePreferenceHypothesis({ root, attribution: second });
    expect(hypothesis.lifecycle).toBe("validated");
    expect(hypothesis.supportEventIds).toEqual(["event-1", "event-2"]);
    expect(hypothesis.scope).toEqual({ chapterId: "chapter-1" });
  });

  it("does not count the same adoption event twice", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-1", "adoption-1", "压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "prefer-compact-dialogue" });
    await derivePreferenceHypothesis({ root, attribution: first });
    const duplicate = await createFeedbackAttribution({ root, event: event("event-duplicate", "adoption-1", "再次压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://duplicate"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "prefer-compact-dialogue" });
    expect((await derivePreferenceHypothesis({ root, attribution: duplicate })).lifecycle).toBe("candidate");
  });

  it("does not learn from a tampered persisted attribution", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-tamper-1", "adoption-tamper-1", "x"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "tamper-guard" });
    await fs.writeFile(path.join(root, "sessions", "feedback-attributions", `${first.attributionId}.json`), JSON.stringify({ ...first, fingerprint: "f".repeat(64) }), "utf8");
    const second = await createFeedbackAttribution({ root, event: event("event-tamper-2", "adoption-tamper-2", "x"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://two"], confounders: [], confidence: { lower: 0.6, upper: 0.8 }, pattern: "tamper-guard" });
    await expect(derivePreferenceHypothesis({ root, attribution: second })).rejects.toThrow("FEEDBACK_ATTRIBUTION_INTEGRITY_FAILED");
  });

  it("preserves evidence while allowing the author to revoke a hypothesis", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-1", "adoption-1", "压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "prefer-compact-dialogue" });
    await derivePreferenceHypothesis({ root, attribution: first });
    const second = await createFeedbackAttribution({ root, event: event("event-2", "adoption-2", "继续压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://two"], confounders: [], confidence: { lower: 0.6, upper: 0.85 }, pattern: "prefer-compact-dialogue" });
    const validated = await derivePreferenceHypothesis({ root, attribution: second });
    const revoked = await revokePreferenceHypothesis({ root, hypothesisId: validated.hypothesisId, actor: "author-1", reason: "仅适用于这一卷" });
    expect(revoked.lifecycle).toBe("retired");
    expect(revoked.supportEventIds).toEqual(["event-1", "event-2"]);
    expect(revoked.revokeReason).toBe("仅适用于这一卷");
    expect(await readPreferenceHypothesis(root, validated.hypothesisId)).toEqual(revoked);
  });

  it("requires explicit author approval to promote a validated hypothesis into active scope", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-active-1", "adoption-active-1", "keep pressure"), category: "structure", scope: { chapterId: "chapter-active" }, evidenceRefs: ["candidate://active-one"], confounders: [], confidence: { lower: 0.6, upper: 0.8 }, pattern: "keep-pressure" });
    const second = await createFeedbackAttribution({ root, event: event("event-active-2", "adoption-active-2", "keep pressure"), category: "structure", scope: { chapterId: "chapter-active" }, evidenceRefs: ["candidate://active-two"], confounders: [], confidence: { lower: 0.7, upper: 0.9 }, pattern: "keep-pressure" });
    const validated = await derivePreferenceHypothesis({ root, attribution: second });
    expect(validated.lifecycle).toBe("validated");
    await expect(promotePreferenceHypothesis({ root, hypothesisId: validated.hypothesisId, actor: "", reason: "" })).rejects.toThrow("PREFERENCE_PROMOTION_APPROVAL_REQUIRED");
    const active = await promotePreferenceHypothesis({ root, hypothesisId: validated.hypothesisId, actor: "author", reason: "Repeated scoped evidence supports this preference." });
    expect(active.lifecycle).toBe("active");
    expect(active.supportEventIds).toEqual(["event-active-1", "event-active-2"]);
    expect(await listPreferenceHypotheses(root, "demo", "active")).toEqual([active]);
    expect(await listPreferenceHypotheses(root, "foreign", "active")).toEqual([]);
  });

  it("records opposition and weakens instead of deleting the hypothesis", async () => {
    const root = await rootFixture();
    const first = await createFeedbackAttribution({ root, event: event("event-1", "adoption-1", "压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://one"], confounders: [], confidence: { lower: 0.4, upper: 0.7 }, pattern: "prefer-compact-dialogue" });
    const second = await createFeedbackAttribution({ root, event: event("event-2", "adoption-2", "继续压缩冗余对白"), category: "structure", scope: { chapterId: "chapter-1" }, evidenceRefs: ["candidate://two"], confounders: [], confidence: { lower: 0.6, upper: 0.85 }, pattern: "prefer-compact-dialogue" });
    await derivePreferenceHypothesis({ root, attribution: first });
    const hypothesis = await derivePreferenceHypothesis({ root, attribution: second });
    const weakened = await recordPreferenceOpposition({ root, hypothesisId: hypothesis.hypothesisId, oppositionEventId: "event-opposition-1", reason: "作者在高潮场景明确保留冗余停顿" });
    expect(weakened.lifecycle).toBe("weakened");
    expect(weakened.oppositionEventIds).toEqual(["event-opposition-1"]);
    expect(weakened.oppositionReasons).toEqual(["作者在高潮场景明确保留冗余停顿"]);
  });
  it("fails closed for malformed evidence, authorization and tampering", async () => { const root = await rootFixture(); await expect(createFeedbackAttribution({ root, event: event("event-1", "adoption-1", "x"), category: "structure", scope: {}, evidenceRefs: [" "], confounders: [], confidence: { lower: 0, upper: 1 } })).rejects.toThrow("FEEDBACK_ATTRIBUTION_EVIDENCE_REQUIRED"); const attribution = await createFeedbackAttribution({ root, event: event("event-2", "adoption-2", "x"), category: "structure", scope: {}, evidenceRefs: ["candidate://two"], confounders: [], confidence: { lower: 0, upper: 1 }, pattern: "p" }); expect(() => assertFeedbackAttributionIntegrity({ ...attribution, pattern: "tampered" })).toThrow("FEEDBACK_ATTRIBUTION_INTEGRITY_FAILED"); const hypothesis = await derivePreferenceHypothesis({ root, attribution }); expect(() => assertPreferenceHypothesisIntegrity({ ...hypothesis, lifecycle: "retired" })).toThrow("PREFERENCE_HYPOTHESIS_INTEGRITY_FAILED"); await expect(revokePreferenceHypothesis({ root, hypothesisId: hypothesis.hypothesisId, actor: "", reason: "x" })).rejects.toThrow("PREFERENCE_REVOCATION_REASON_REQUIRED"); });
});
