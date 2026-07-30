import { describe, expect, it } from "vitest";
import { acceptDebateDecision, createDebateDecision } from "./debateDecision.js";

const valid = {
  debateId: "debate-1", taskId: "task-1", proposition: "让主角公开证据",
  frozenInputFingerprint: "f".repeat(64),
  blue: { thesis: "公开会推进主线", evidence: [{ ref: "contract://c1", claim: "契约要求公开" }], benefits: ["推进冲突"], failureConditions: ["证据不完整"], unknowns: ["读者是否信任" ] },
  red: { thesis: "公开会暴露盟友", evidence: [{ ref: "character://a1", claim: "盟友仍未准备" }], benefits: ["保留秘密"], failureConditions: ["秘密被敌人利用"], unknowns: ["盟友真实立场"] },
  disagreements: [{ topic: "时机", blue: "现在公开", red: "延后公开" }],
  decisionLevel: "L2" as const,
  affectedAssets: ["contract:c1", "character:a1"], evidenceRefs: ["contract://c1", "character://a1"],
  fallbackCost: "需要重写两章"
};

describe("debate decisions", () => {
  it("records proposition, independent evidence, disagreements and author gate", () => {
    const card = createDebateDecision(valid);
    expect(card).toMatchObject({ schemaVersion: "debate-decision.v1", proposition: valid.proposition, decisionLevel: "L2", status: "needs-author", authorRequired: true });
    expect(card.blue.evidence[0].ref).toBe("contract://c1");
    expect(card.red.evidence[0].ref).toBe("character://a1");
    expect(card.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not fabricate a red side and blocks evidence-free cards", () => {
    const card = createDebateDecision({ ...valid, red: { ...valid.red, thesis: "", evidence: [], benefits: [], failureConditions: [], unknowns: [] }, disagreements: [] });
    expect(card.status).toBe("blocked");
    expect(card.redFinding).toContain("未发现同等强度的反例");
    expect(() => createDebateDecision({ ...valid, evidenceRefs: [] })).toThrow("DEBATE_EVIDENCE_REQUIRED");
  });

  it("accepts only author-approved L2 decisions and preserves supersession metadata", () => {
    const card = createDebateDecision(valid);
    expect(() => acceptDebateDecision(card)).toThrow("DEBATE_AUTHOR_APPROVAL_REQUIRED");
    const accepted = acceptDebateDecision(card, { authorDecision: "accept", supersedesDecisionId: "decision-old", migrationProposal: "先迁移契约再改正文" });
    expect(accepted).toMatchObject({ status: "accepted", supersedesDecisionId: "decision-old", migrationProposal: "先迁移契约再改正文" });
  });
});
