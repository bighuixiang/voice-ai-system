import { describe, expect, it } from "vitest";
import { assertCraftAttributionIntegrity, createCraftAttribution, transitionCraftAttribution } from "./craftAttribution.js";

const input = { candidateId: "candidate-1", patternId: "pattern-1", projectSlug: "demo", authorId: "author-1", judgment: "scene-fit" as const, scope: "scene:opening", rationale: "works for this reveal", evidenceRefs: ["prose://scene-1"] };
describe("craft author attribution", () => {
  it("records acceptance as context-only evidence, not pattern validation", () => {
    const record = createCraftAttribution(input);
    expect(record.status).toBe("adopted");
    expect(record.authority).toBe("context-only");
    expect(record.promotionEligible).toBe(false);
    expect(record.judgment).toBe("scene-fit");
  });

  it("requires explicit events and evidence to limit or revoke adoption", () => {
    const adopted = createCraftAttribution(input);
    const limited = transitionCraftAttribution(adopted, { target: "limited", actor: "author-1", reason: "only valid in opening", evidenceRefs: ["review://1"] });
    expect(limited.status).toBe("limited");
    const revoked = transitionCraftAttribution(limited, { target: "revoked", actor: "author-1", reason: "reproduces unwanted cadence", evidenceRefs: ["review://2"] });
    expect(revoked.status).toBe("revoked");
    expect(revoked.events).toHaveLength(3);
  });

  it("does not let promotion events be forged from author acceptance", () => {
    const adopted = createCraftAttribution(input);
    expect(() => transitionCraftAttribution(adopted, { target: "validated" as never, actor: "author-1", reason: "liked it", evidenceRefs: ["review://3"] })).toThrow("CRAFT_ATTRIBUTION_PROMOTION_FORBIDDEN");
  });
  it("fails closed for blank evidence and tampered attribution", () => { expect(() => createCraftAttribution({ ...input, evidenceRefs: [" "] })).toThrow("CRAFT_ATTRIBUTION_EVIDENCE_REQUIRED"); const record = createCraftAttribution(input); expect(() => assertCraftAttributionIntegrity({ ...record, scope: "tampered" })).toThrow("CRAFT_ATTRIBUTION_INTEGRITY_FAILED"); });
});
