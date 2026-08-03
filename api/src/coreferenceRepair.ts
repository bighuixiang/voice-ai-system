export interface CoreferenceRepair { incidentId: string; layer: "extraction"; pronoun: string; priorEntityId: string; correctedEntityId: string; repairStrategy: "coreference-authority-override"; regressionCaseId: string; status: "open"; }
export function createCoreferenceRepair(input: { incidentId: string; pronoun: string; priorEntityId: string; correctedEntityId: string; correctionCount: number; regressionCaseId: string }): CoreferenceRepair {
  if (!input.incidentId.trim() || !input.pronoun.trim() || !input.priorEntityId.trim() || !input.correctedEntityId.trim() || !input.regressionCaseId.trim()) throw new Error("COREFERENCE_REPAIR_FIELDS_REQUIRED");
  if (input.correctionCount < 2) throw new Error("COREFERENCE_REPAIR_ESCALATION_REQUIRED");
  return { incidentId: input.incidentId, layer: "extraction", pronoun: input.pronoun, priorEntityId: input.priorEntityId, correctedEntityId: input.correctedEntityId, repairStrategy: "coreference-authority-override", regressionCaseId: input.regressionCaseId, status: "open" };
}
export function applyCoreferenceRepair(repair: CoreferenceRepair, input: { pronoun: string; candidateEntityIds: readonly string[] }): { entityId: string; strategy: CoreferenceRepair["repairStrategy"] } {
  if (repair.status !== "open" || input.pronoun !== repair.pronoun) throw new Error("COREFERENCE_REPAIR_NOT_APPLICABLE");
  if (!input.candidateEntityIds.includes(repair.correctedEntityId)) throw new Error("COREFERENCE_CORRECTED_ENTITY_NOT_CANDIDATE");
  return { entityId: repair.correctedEntityId, strategy: repair.repairStrategy };
}
