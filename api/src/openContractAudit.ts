export interface OpenContractAudit { status: "open_contract_incomplete" | "audited_complete"; repairRoutes: Array<"close_in_current_book" | "reframe_as_true_open_subquestion" | "defer_explicitly_unfinished">; blockers: string[]; }
export function auditOpenContract(input: { obligationId: string; coreConflictDependsOnAnswer: boolean; authorMarkedSequelHook: boolean; fairnessEvidence: readonly string[]; answeredSubclaims: readonly string[]; }): OpenContractAudit {
  if (!input.obligationId.trim()) throw new Error("OPEN_CONTRACT_ID_REQUIRED");
  const incomplete = input.coreConflictDependsOnAnswer && (input.authorMarkedSequelHook || !input.fairnessEvidence.length || !input.answeredSubclaims.length);
  if (incomplete) return { status: "open_contract_incomplete", blockers: [`${input.obligationId}:open-contract-incomplete`], repairRoutes: ["close_in_current_book", "reframe_as_true_open_subquestion", "defer_explicitly_unfinished"] };
  return { status: "audited_complete", blockers: [], repairRoutes: [] };
}
