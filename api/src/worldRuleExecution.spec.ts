import { describe, expect, it } from "vitest";
import { evaluateWorldRuleExecution } from "./worldRuleExecution.js";
import type { WorldRuleContract } from "./worldRuleContract.js";

const contract = { schemaVersion: "world-rule-contract.v1", ruleId: "rule-1", version: 1, projectSlug: "demo", sourceCandidateId: "candidate", sourceFingerprint: "a".repeat(64), proposition: { condition: "charged anchor", mechanism: "fold path", result: "crosses", cost: "loses lifespan", limit: "once daily", failure: "pain", prohibitedInferences: ["does not grant immortality"], exceptions: [] }, scope: { subjects: ["caster"], regions: ["mountain"], time: { from: "chapter-1", to: "chapter-9" } }, disclosure: { objectiveStatus: "accepted", domains: [{ domainId: "canon", kind: "objective_canon" as const, claim: "rule" }] }, evidenceRefs: [{ kind: "canon-asset" as const, refId: "canon://rule" }], status: "accepted" as const, canonWritten: false, createdAt: "2026-01-01T00:00:00Z", fingerprint: "fp" } as WorldRuleContract;
describe("world rule execution", () => {
  it("returns observable result and cost only when scope and condition hold", () => {
    const result = evaluateWorldRuleExecution(contract, { subject: "caster", region: "mountain", chapter: "chapter-3", conditionMet: true });
    expect(result.status).toBe("executed");
    expect(result.result).toBe("crosses");
    expect(result.cost).toBe("loses lifespan");
  });

  it("fails closed outside scope or when condition is absent", () => {
    expect(evaluateWorldRuleExecution(contract, { subject: "civilian", region: "mountain", chapter: "chapter-3", conditionMet: true }).status).toBe("not_applicable");
    expect(evaluateWorldRuleExecution(contract, { subject: "caster", region: "mountain", chapter: "chapter-3", conditionMet: false }).status).toBe("condition_unmet");
  });

  it("exposes limits and prohibited inferences for downstream scene checks", () => {
    const result = evaluateWorldRuleExecution(contract, { subject: "caster", region: "mountain", chapter: "chapter-3", conditionMet: true });
    expect(result.limit).toBe("once daily");
    expect(result.prohibitedInferences).toContain("does not grant immortality");
  });
});
