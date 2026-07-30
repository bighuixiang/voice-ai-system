import crypto from "node:crypto";

export interface OrganizationContract { schemaVersion: "organization-contract.v1"; organizationId: string; name: string; goal: string; values: string[]; leaders: string[]; factions: string[]; permissions: string[]; resources: string[]; information: string[]; responseDelay: string; constraints: string[]; currentPlan: string; sourceRefs: string[]; fingerprint: string; }
export interface InstitutionActionEvent { schemaVersion: "institution-action-event.v1"; actionId: string; organizationId: string; action: string; actor: string; resourceUse: string[]; informationUsed: string[]; at: string; responseDelay: string; outcome: string; evidenceRefs: string[]; status: "recorded"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createOrganizationContract(input: Omit<OrganizationContract, "schemaVersion" | "fingerprint">): OrganizationContract {
  if (!input.organizationId.trim() || !input.name.trim() || !input.goal.trim() || !input.responseDelay.trim() || !input.currentPlan.trim()) throw new Error("ORGANIZATION_FIELDS_REQUIRED");
  if (!input.values.length || !input.leaders.length || !input.permissions.length || !input.resources.length || !input.information.length || !input.constraints.length || !input.sourceRefs.length) throw new Error("ORGANIZATION_CAPACITY_REQUIRED");
  const base = { schemaVersion: "organization-contract.v1" as const, ...input, values: [...input.values], leaders: [...input.leaders], factions: [...input.factions], permissions: [...input.permissions], resources: [...input.resources], information: [...input.information], constraints: [...input.constraints], sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
export function recordInstitutionAction(contract: OrganizationContract, input: { actionId: string; action: string; actor: string; resourceUse: readonly string[]; informationUsed: readonly string[]; at: string; outcome: string; evidenceRefs: readonly string[] }): InstitutionActionEvent {
  if (!input.actionId.trim() || !input.action.trim() || !input.actor.trim() || !input.at.trim() || !input.outcome.trim()) throw new Error("INSTITUTION_ACTION_FIELDS_REQUIRED");
  if (!contract.permissions.includes(input.action)) throw new Error("INSTITUTION_ACTION_NOT_AUTHORIZED");
  if (!input.resourceUse.length || !input.informationUsed.length || !input.evidenceRefs.length) throw new Error("INSTITUTION_ACTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "institution-action-event.v1" as const, actionId: input.actionId, organizationId: contract.organizationId, action: input.action, actor: input.actor, resourceUse: [...input.resourceUse], informationUsed: [...input.informationUsed], at: input.at, responseDelay: contract.responseDelay, outcome: input.outcome, evidenceRefs: [...input.evidenceRefs], status: "recorded" as const };
  return { ...base, fingerprint: hash(base) };
}
