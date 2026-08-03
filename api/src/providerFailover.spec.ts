import { describe, expect, it } from "vitest";
import { assertProviderFailoverDecisionIntegrity, evaluateProviderFailover, type ProviderFailoverCandidate } from "./providerFailover.js";

const candidate = (overrides: Partial<ProviderFailoverCandidate> = {}): ProviderFailoverCandidate => ({
  candidateId: "claude-sonnet",
  provider: "claude-code",
  modelId: "sonnet",
  status: "active",
  verifiedTaskTypes: ["outline.generate"],
  structuredOutput: true,
  contextLimit: 16_000,
  privacyClasses: ["private"],
  dataResidencies: ["local"],
  ...overrides
});

describe("provider failover compatibility", () => {
  it("selects a compatible candidate and freezes the input boundary", () => {
    const decision = evaluateProviderFailover({
      currentCandidateId: "codex-gpt",
      taskType: "outline.generate",
      requiredContextTokens: 8_000,
      requiresStructuredOutput: true,
      privacyClass: "private",
      dataResidency: "local",
      frozenInputFingerprint: "input-sha-1",
      candidates: [candidate()]
    });

    expect(decision).toMatchObject({ status: "selected", candidateId: "claude-sonnet", switched: true, frozenInputFingerprint: "input-sha-1" });
    expect(decision.reason).toContain("compatible");
  });

  it("blocks failover when a candidate cannot receive private material", () => {
    const decision = evaluateProviderFailover({
      currentCandidateId: "codex-gpt",
      taskType: "outline.generate",
      requiredContextTokens: 8_000,
      requiresStructuredOutput: true,
      privacyClass: "private",
      dataResidency: "local",
      frozenInputFingerprint: "input-sha-2",
      candidates: [candidate({ privacyClasses: ["public"], dataResidencies: ["us"] })]
    });

    expect(decision).toMatchObject({ status: "blocked", reasonCode: "NO_COMPATIBLE_FAILOVER" });
    expect(decision.reason).toContain("privacy");
  });

  it("rejects a candidate that is unverified or too small for the frozen context", () => {
    const decision = evaluateProviderFailover({
      currentCandidateId: "codex-gpt",
      taskType: "outline.generate",
      requiredContextTokens: 20_000,
      requiresStructuredOutput: true,
      privacyClass: "private",
      dataResidency: "local",
      frozenInputFingerprint: "input-sha-3",
      candidates: [candidate({ status: "retired" }), candidate({ candidateId: "small", contextLimit: 1_000 })]
    });

    expect(decision).toMatchObject({ status: "blocked", reasonCode: "NO_COMPATIBLE_FAILOVER" });
    expect(decision.reason).toContain("context");
  });
  it("rejects malformed candidates and detects failover decision tampering", () => { expect(() => evaluateProviderFailover({ currentCandidateId: "codex-gpt", taskType: "outline.generate", requiredContextTokens: 8_000, requiresStructuredOutput: true, privacyClass: "private", dataResidency: "local", frozenInputFingerprint: "input-sha", candidates: [candidate({ contextLimit: 0 })] })).toThrow("FAILOVER_CANDIDATE_INVALID"); const decision = evaluateProviderFailover({ currentCandidateId: "codex-gpt", taskType: "outline.generate", requiredContextTokens: 8_000, requiresStructuredOutput: true, privacyClass: "private", dataResidency: "local", frozenInputFingerprint: "input-sha", candidates: [candidate()] }); expect(() => assertProviderFailoverDecisionIntegrity({ ...decision, switched: false })).toThrow("FAILOVER_DECISION_INTEGRITY_FAILED"); });
});
