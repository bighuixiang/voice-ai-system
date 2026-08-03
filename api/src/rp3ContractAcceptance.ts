import crypto from "node:crypto";

export interface Rp3ContractAcceptanceDecision {
  schemaVersion: "rp3-contract-acceptance.v1";
  releaseProfile: "RP3-contract";
  status: "accepted" | "do-not-activate";
  expectedRequirementCount: number;
  verifiedRequirementCount: number;
  authorAcceptance: "accepted" | "missing" | "rejected";
  realProviderEvidence: "present" | "missing";
  blockedReasons: string[];
  fingerprint: string;
}

export function evaluateRp3ContractAcceptance(input: {
  expectedRequirementIds: string[];
  verifiedRequirementIds: string[];
  authorAcceptance?: { status: "accepted" | "rejected"; actorId: string; authorizationId: string; evidenceRefs: string[] } | null;
  realProviderEvidence?: { status: "present"; providerRef: string; evidenceRefs: string[] } | null;
}): Rp3ContractAcceptanceDecision {
  const expected = [...new Set(input.expectedRequirementIds)].sort();
  const verified = [...new Set(input.verifiedRequirementIds)].sort();
  const blockedReasons: string[] = [];
  if (!expected.length) blockedReasons.push("RP3_REQUIREMENTS_MISSING");
  if (expected.length !== verified.length || expected.some((id, index) => id !== verified[index])) blockedReasons.push("RP3_REQUIREMENTS_NOT_FULLY_VERIFIED");
  const author = input.authorAcceptance;
  const authorStatus = author?.status === "accepted" && author.actorId.trim() && author.authorizationId.trim() && author.evidenceRefs.length ? "accepted" as const : author?.status === "rejected" ? "rejected" as const : "missing" as const;
  if (authorStatus !== "accepted") blockedReasons.push(authorStatus === "rejected" ? "AUTHOR_ACCEPTANCE_REJECTED" : "AUTHOR_ACCEPTANCE_REQUIRED");
  const provider = input.realProviderEvidence;
  const providerStatus = provider?.status === "present" && provider.providerRef.trim() && provider.evidenceRefs.length ? "present" as const : "missing" as const;
  if (providerStatus !== "present") blockedReasons.push("REAL_PROVIDER_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "rp3-contract-acceptance.v1" as const, releaseProfile: "RP3-contract" as const, status: blockedReasons.length ? "do-not-activate" as const : "accepted" as const, expectedRequirementCount: expected.length, verifiedRequirementCount: verified.length, authorAcceptance: authorStatus, realProviderEvidence: providerStatus, blockedReasons };
  return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
