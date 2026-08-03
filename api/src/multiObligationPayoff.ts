import crypto from "node:crypto";
import { evaluatePayoffEvidence, type PayoffContract, type PayoffEvidenceResult } from "./obligationEvidence.js";

export interface MultiObligationPayoffResult { schemaVersion: "multi-obligation-payoff.v1"; payoffRef: string; assessments: PayoffEvidenceResult[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateMultiObligationPayoff(input: { payoffRef: string; contracts: readonly PayoffContract[]; setupRefsByObligation: Readonly<Record<string, readonly string[]>>; reminderRefsByObligation?: Readonly<Record<string, readonly string[]>>; answeredSubclaimsByObligation?: Readonly<Record<string, readonly string[]>>; semanticReasonsByObligation: Readonly<Record<string, string>>; observableChangesByObligation: Readonly<Record<string, readonly string[]>>; confidenceByObligation?: Readonly<Record<string, number>> }): MultiObligationPayoffResult {
  if (!input.payoffRef.trim() || input.contracts.length < 2) throw new Error("MULTI_PAYOFF_CONTRACTS_REQUIRED");
  const assessments = input.contracts.map((contract) => evaluatePayoffEvidence({ contract, setupRefs: input.setupRefsByObligation[contract.obligationId] || [], reminderRefs: input.reminderRefsByObligation?.[contract.obligationId] || [], payoffRef: input.payoffRef, semanticReason: input.semanticReasonsByObligation[contract.obligationId] || "", confidence: input.confidenceByObligation?.[contract.obligationId] ?? 0, observableChanges: input.observableChangesByObligation[contract.obligationId] || [], answeredSubclaims: input.answeredSubclaimsByObligation?.[contract.obligationId] || [] }));
  const base = { schemaVersion: "multi-obligation-payoff.v1" as const, payoffRef: input.payoffRef, assessments };
  return { ...base, fingerprint: hash(base) };
}
