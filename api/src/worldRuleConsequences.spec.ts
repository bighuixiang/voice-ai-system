import { describe, expect, it } from "vitest";
import { auditWorldRuleConsequences } from "./worldRuleConsequences.js";

const valid = { auditId: "audit-teleport", ruleId: "teleport", claim: "any licensed mage can teleport", impacts: { production: "couriers bypass roads", prices: "long-distance freight falls", occupations: "caravan work declines", war: "rapid deployment", law: "license enforcement", class: "mages gain leverage", family: "visits become easier", dailyLife: "short trips skip roads" }, exemptions: [], evidenceRefs: ["world://teleport", "chapter://4#license"] };

describe("world rule social consequences", () => {
  it("audits downstream social domains rather than accepting a rule in isolation", () => {
    const result = auditWorldRuleConsequences(valid);
    expect(result.status).toBe("audited");
    expect(result.coveredDomains).toHaveLength(8);
  });

  it("blocks a rule with obvious impacts left unexplained", () => {
    expect(() => auditWorldRuleConsequences({ ...valid, impacts: { ...valid.impacts, prices: "" } })).toThrow("WORLD_RULE_SOCIAL_IMPACT_MISSING");
  });

  it("allows a domain exemption only with explanation evidence", () => {
    const result = auditWorldRuleConsequences({ ...valid, impacts: { ...valid.impacts, war: "" }, exemptions: [{ domain: "war", reason: "teleport range is too short for armies", evidenceRefs: ["world://teleport#range"] }] });
    expect(result.exemptions[0]?.domain).toBe("war");
    expect(() => auditWorldRuleConsequences({ ...valid, impacts: { ...valid.impacts, war: "" }, exemptions: [{ domain: "war", reason: "not relevant", evidenceRefs: [] }] })).toThrow("WORLD_RULE_EXEMPTION_EVIDENCE_REQUIRED");
  });
});
