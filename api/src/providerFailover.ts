import crypto from "node:crypto";

export type ProviderFailoverStatus = "selected" | "blocked";
export type ProviderFailoverReasonCode = "NO_COMPATIBLE_FAILOVER" | "FAILOVER_INPUT_INVALID";

export interface ProviderFailoverCandidate {
  candidateId: string;
  provider: string;
  modelId?: string;
  status: "active" | "retired";
  verifiedTaskTypes: string[];
  structuredOutput: boolean;
  contextLimit: number;
  privacyClasses: string[];
  dataResidencies: string[];
}

export interface ProviderFailoverDecision {
  schemaVersion: "provider-failover-decision.v1";
  status: ProviderFailoverStatus;
  reasonCode?: ProviderFailoverReasonCode;
  candidateId?: string;
  provider?: string;
  modelId?: string;
  switched: boolean;
  frozenInputFingerprint: string;
  rejectedCandidates: Array<{ candidateId: string; reasons: string[] }>;
  reason: string;
  fingerprint: string;
}

interface ProviderFailoverInput {
  currentCandidateId: string;
  taskType: string;
  requiredContextTokens: number;
  requiresStructuredOutput: boolean;
  privacyClass: string;
  dataResidency: string;
  frozenInputFingerprint: string;
  candidates: ProviderFailoverCandidate[];
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertProviderFailoverDecisionIntegrity(decision: ProviderFailoverDecision): ProviderFailoverDecision { const { fingerprint, ...base } = decision; if (decision.schemaVersion !== "provider-failover-decision.v1" || !decision.frozenInputFingerprint.trim() || hash(base) !== fingerprint) throw new Error("FAILOVER_DECISION_INTEGRITY_FAILED"); return decision; }

function validate(input: ProviderFailoverInput): void {
  if (!input.currentCandidateId.trim() || !input.taskType.trim() || !input.privacyClass.trim() || !input.dataResidency.trim() || !input.frozenInputFingerprint.trim() || !Number.isInteger(input.requiredContextTokens) || input.requiredContextTokens < 0 || !Array.isArray(input.candidates)) {
    throw new Error("FAILOVER_INPUT_INVALID");
  }
  if (input.candidates.some((candidate) => !candidate.candidateId.trim() || !candidate.provider.trim() || !["active", "retired"].includes(candidate.status) || !candidate.verifiedTaskTypes.length || candidate.verifiedTaskTypes.some((task) => !task.trim()) || !Number.isInteger(candidate.contextLimit) || candidate.contextLimit < 1 || !candidate.privacyClasses.length || candidate.privacyClasses.some((value) => !value.trim()) || !candidate.dataResidencies.length || candidate.dataResidencies.some((value) => !value.trim()))) throw new Error("FAILOVER_CANDIDATE_INVALID");
}

function rejectionReasons(input: ProviderFailoverInput, candidate: ProviderFailoverCandidate): string[] {
  const reasons: string[] = [];
  if (!candidate.candidateId.trim() || candidate.candidateId === input.currentCandidateId) reasons.push("same candidate");
  if (candidate.status !== "active") reasons.push("candidate is retired");
  if (!candidate.verifiedTaskTypes.includes(input.taskType)) reasons.push("task capability is not verified");
  if (input.requiresStructuredOutput && !candidate.structuredOutput) reasons.push("structured output is not supported");
  if (!Number.isInteger(candidate.contextLimit) || candidate.contextLimit < input.requiredContextTokens) reasons.push("context capacity is insufficient");
  if (!candidate.privacyClasses.includes(input.privacyClass)) reasons.push("privacy boundary is not authorized");
  if (!candidate.dataResidencies.includes(input.dataResidency)) reasons.push("data residency is not authorized");
  return reasons;
}

export function evaluateProviderFailover(input: ProviderFailoverInput): ProviderFailoverDecision {
  validate(input);
  const rejectedCandidates = input.candidates.map((candidate) => ({ candidateId: candidate.candidateId, reasons: rejectionReasons(input, candidate) }));
  const selectedIndex = rejectedCandidates.findIndex((item) => item.reasons.length === 0);
  const selected = selectedIndex >= 0 ? input.candidates[selectedIndex] : undefined;
  const base = selected
    ? {
        schemaVersion: "provider-failover-decision.v1" as const,
        status: "selected" as const,
        candidateId: selected.candidateId,
        provider: selected.provider,
        ...(selected.modelId ? { modelId: selected.modelId } : {}),
        switched: true,
        frozenInputFingerprint: input.frozenInputFingerprint,
        rejectedCandidates,
        reason: "selected a compatible failover candidate without changing the frozen business input"
      }
    : {
        schemaVersion: "provider-failover-decision.v1" as const,
        status: "blocked" as const,
        reasonCode: "NO_COMPATIBLE_FAILOVER" as const,
        switched: false,
        frozenInputFingerprint: input.frozenInputFingerprint,
        rejectedCandidates,
        reason: rejectedCandidates.flatMap((item) => item.reasons.map((reason) => `${item.candidateId}: ${reason}`)).join("; ") || "no failover candidate was supplied"
      };
  return { ...base, fingerprint: hash(base) };
}
