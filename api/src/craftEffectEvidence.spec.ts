import { describe, expect, it } from "vitest";
import { assertCraftEffectEvidenceIntegrity, createCraftEffectEvidence } from "./craftEffectEvidence.js";

const valid = { patternId: "p1", readerProblem: "读者无法判断承诺是否可信", context: "中段信息不完整的调查场景", prerequisites: ["角色有可验证目标"], cost: "延迟答案并增加误解", failureChapters: ["没有后续回收的章节"], evidence: { proseAnchors: ["prose://scene-1#setup"], comparisonSamples: ["experiment://1"], authorJudgment: "作者确认读者提前注意到线索" }, modelClaim: "模型认为有效", sourceRefs: ["review://1"] };
describe("craft effect evidence chain", () => {
  it("records why a pattern works with non-model evidence", () => { const chain = createCraftEffectEvidence(valid); expect(chain.status).toBe("supported"); expect(chain.evidence.proseAnchors).toHaveLength(1); });
  it("blocks model self-assertion without independent evidence", () => { expect(() => createCraftEffectEvidence({ ...valid, evidence: { proseAnchors: [], comparisonSamples: [], authorJudgment: "" } })).toThrow("CRAFT_EFFECT_INDEPENDENT_EVIDENCE_REQUIRED"); });
  it("requires context, prerequisites, cost and failure boundaries", () => { expect(() => createCraftEffectEvidence({ ...valid, prerequisites: [] })).toThrow("CRAFT_EFFECT_PREREQUISITES_REQUIRED"); expect(() => createCraftEffectEvidence({ ...valid, failureChapters: [] })).toThrow("CRAFT_EFFECT_FAILURE_BOUNDARY_REQUIRED"); });
  it("marks author intent without independent anchors as insufficient", () => { const chain = createCraftEffectEvidence({ ...valid, evidence: { proseAnchors: [], comparisonSamples: [], authorJudgment: "作者认为有效" } }); expect(chain.status).toBe("insufficient-independent-evidence"); });
  it("rejects blank evidence references and detects tampering", () => { expect(() => createCraftEffectEvidence({ ...valid, sourceRefs: [" "] })).toThrow("CRAFT_EFFECT_SOURCE_REQUIRED"); const chain = createCraftEffectEvidence(valid); expect(() => assertCraftEffectEvidenceIntegrity({ ...chain, modelClaim: "tampered" })).toThrow("CRAFT_EFFECT_INTEGRITY_FAILED"); });
});
