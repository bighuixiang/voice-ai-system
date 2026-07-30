import crypto from "node:crypto";

export type SocialDomain = "production" | "prices" | "occupations" | "war" | "law" | "class" | "family" | "dailyLife";
export interface WorldRuleConsequenceAudit { schemaVersion: "world-rule-consequence-audit.v1"; auditId: string; ruleId: string; claim: string; coveredDomains: SocialDomain[]; impacts: Record<SocialDomain, string>; exemptions: Array<{ domain: SocialDomain; reason: string; evidenceRefs: string[] }>; status: "audited"; evidenceRefs: string[]; fingerprint: string; }
const domains: SocialDomain[] = ["production", "prices", "occupations", "war", "law", "class", "family", "dailyLife"];
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function auditWorldRuleConsequences(input: { auditId: string; ruleId: string; claim: string; impacts: Partial<Record<SocialDomain, string>>; exemptions: readonly { domain: SocialDomain; reason: string; evidenceRefs: readonly string[] }[]; evidenceRefs: readonly string[] }): WorldRuleConsequenceAudit {
  if (!input.auditId.trim() || !input.ruleId.trim() || !input.claim.trim()) throw new Error("WORLD_RULE_SOCIAL_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WORLD_RULE_SOCIAL_EVIDENCE_REQUIRED");
  for (const exemption of input.exemptions) { if (!exemption.reason.trim()) throw new Error("WORLD_RULE_EXEMPTION_REASON_REQUIRED"); if (!exemption.evidenceRefs.length) throw new Error("WORLD_RULE_EXEMPTION_EVIDENCE_REQUIRED"); }
  const exempt = new Set(input.exemptions.map((item) => item.domain));
  const missing = domains.filter((domain) => !input.impacts[domain]?.trim() && !exempt.has(domain));
  if (missing.length) throw new Error("WORLD_RULE_SOCIAL_IMPACT_MISSING");
  const base = { schemaVersion: "world-rule-consequence-audit.v1" as const, auditId: input.auditId, ruleId: input.ruleId, claim: input.claim, coveredDomains: domains.filter((domain) => Boolean(input.impacts[domain]?.trim())), impacts: Object.fromEntries(domains.map((domain) => [domain, input.impacts[domain] ?? ""])) as Record<SocialDomain, string>, exemptions: input.exemptions.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] })), status: "audited" as const, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
