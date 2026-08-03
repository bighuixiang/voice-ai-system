export interface CompressionAuditInput { endingStatus: "tentative" | "confirmed"; opposingEvidence: readonly string[]; withdrawnDirections: readonly string[]; }
export function auditCompressedMemory(input: CompressionAuditInput): { preserved: boolean; endingStatus: CompressionAuditInput["endingStatus"]; opposingEvidence: string[]; withdrawnDirections: string[]; issues: string[] } {
  const issues: string[] = [];
  if (!input.endingStatus) issues.push("ENDING_STATUS_MISSING");
  if (!input.opposingEvidence.length) issues.push("OPPOSING_EVIDENCE_MISSING");
  if (!input.withdrawnDirections.length) issues.push("WITHDRAWN_DIRECTION_RELATION_MISSING");
  return { preserved: issues.length === 0, endingStatus: input.endingStatus, opposingEvidence: [...input.opposingEvidence], withdrawnDirections: [...input.withdrawnDirections], issues };
}
