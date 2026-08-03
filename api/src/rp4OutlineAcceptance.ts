import crypto from "node:crypto";

export interface Rp4OutlineAcceptanceDecision {
  schemaVersion: "rp4-outline-acceptance.v1";
  releaseProfile: "RP4-outline";
  status: "accepted" | "do-not-activate";
  expectedRequirementCount: number;
  verifiedRequirementCount: number;
  rp3Dependency: "accepted" | "blocked";
  authorAcceptance: "accepted" | "missing" | "rejected";
  releaseEvidence: "present" | "missing";
  blockedReasons: string[];
  fingerprint: string;
}

export function evaluateRp4OutlineAcceptance(input: {
  expectedRequirementIds: string[];
  verifiedRequirementIds: string[];
  rp3Status: "accepted" | "do-not-activate";
  authorAcceptance?: { status: "accepted" | "rejected"; actorId: string; authorizationId: string; evidenceRefs: string[] } | null;
  releaseEvidence?: { status: "present"; evidenceRefs: string[] } | null;
}): Rp4OutlineAcceptanceDecision {
  const expected = [...new Set(input.expectedRequirementIds)].sort();
  const verified = [...new Set(input.verifiedRequirementIds)].sort();
  const blockedReasons: string[] = [];
  if (!expected.length) blockedReasons.push("RP4_REQUIREMENTS_MISSING");
  if (expected.length !== verified.length || expected.some((id, index) => id !== verified[index])) blockedReasons.push("RP4_REQUIREMENTS_NOT_FULLY_VERIFIED");
  const dependency = input.rp3Status === "accepted" ? "accepted" as const : "blocked" as const;
  if (dependency !== "accepted") blockedReasons.push("RP3_DEPENDENCY_NOT_ACCEPTED");
  const author = input.authorAcceptance;
  const authorStatus = author?.status === "accepted" && author.actorId.trim() && author.authorizationId.trim() && author.evidenceRefs.length ? "accepted" as const : author?.status === "rejected" ? "rejected" as const : "missing" as const;
  if (authorStatus !== "accepted") blockedReasons.push(authorStatus === "rejected" ? "AUTHOR_ACCEPTANCE_REJECTED" : "AUTHOR_ACCEPTANCE_REQUIRED");
  const evidence = input.releaseEvidence;
  const evidenceStatus = evidence?.status === "present" && evidence.evidenceRefs.length ? "present" as const : "missing" as const;
  if (evidenceStatus !== "present") blockedReasons.push("RP4_RELEASE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "rp4-outline-acceptance.v1" as const, releaseProfile: "RP4-outline" as const, status: blockedReasons.length ? "do-not-activate" as const : "accepted" as const, expectedRequirementCount: expected.length, verifiedRequirementCount: verified.length, rp3Dependency: dependency, authorAcceptance: authorStatus, releaseEvidence: evidenceStatus, blockedReasons };
  return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
