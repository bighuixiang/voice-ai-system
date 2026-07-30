import { describe, expect, it } from "vitest";
import { acceptPreferenceProbeSelection, createDialogueMemoryRecord, createPreferenceProbeSelection, forgetDialogueMemory, reviseDialogueMemory } from "./dialogueMemoryGovernance.js";

const probe = { probeId: "probe-1", frozenFacts: ["主角是快递员"], dimension: "叙述距离", variants: [{ variantId: "a", text: "近距离" }, { variantId: "b", text: "远距离" }] };
const memory = { memoryId: "memory-1", projectSlug: "demo", content: "作者偏好短句", sourceRefs: ["utterance://u1"], scope: "project" as const, confidence: "provisional" as const, derivedCanonRefs: [] as string[], compressionVersion: "v1" };

describe("dialogue memory governance", () => {
  it("turns pair selection into a scoped, revocable preference hypothesis", () => {
    const selection = createPreferenceProbeSelection({ probe, selectedVariantId: "a", reason: "更贴近人物呼吸", scope: "scene", validationContexts: ["scene-1"], evidenceRefs: ["author://choice-1"] });
    expect(selection).toMatchObject({ schemaVersion: "preference-probe-selection.v1", status: "active", scope: "scene", hypothesis: "叙述距离=近距离" });
    expect(() => createPreferenceProbeSelection({ probe, selectedVariantId: "a", reason: "全局都这样", scope: "project", validationContexts: [], evidenceRefs: [] })).toThrow("PREFERENCE_SELECTION_EVIDENCE_REQUIRED");
    expect(acceptPreferenceProbeSelection(selection, { action: "revoke", reason: "新场景不适用" })).toMatchObject({ status: "revoked", revocationReason: "新场景不适用" });
  });

  it("keeps compressed memory source-bound and refuses silent canon forgetting", () => {
    const record = createDialogueMemoryRecord(memory);
    expect(record).toMatchObject({ status: "effective", sourceRefs: ["utterance://u1"], scope: "project" });
    expect(reviseDialogueMemory(record, { correctedContent: "作者偏好短句但本场景例外", correctionRef: "utterance://u2", reason: "作者纠正" })).toMatchObject({ status: "corrected", correctionRefs: ["utterance://u2"] });
    expect(() => forgetDialogueMemory({ ...record, derivedCanonRefs: ["contract://c1"] }, "作者要求遗忘")).toThrow("MEMORY_CANON_IMPACT_REVIEW_REQUIRED");
    expect(forgetDialogueMemory(record, "作者要求遗忘")).toMatchObject({ status: "forgotten", forgetReason: "作者要求遗忘" });
  });
});
