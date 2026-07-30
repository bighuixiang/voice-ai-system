import { describe, expect, it } from "vitest";
import { createOrganizationContract, recordInstitutionAction } from "./organizationAction.js";

const org = { organizationId: "watch", name: "City Watch", goal: "secure the gates", values: ["order"], leaders: ["captain-1"], factions: ["reformers"], permissions: ["close-gate", "send-patrol"], resources: ["100 guards", "authority seal"], information: ["gate breach report"], responseDelay: "2 days", constraints: ["council approval for arrests"], currentPlan: "reinforce north gate", sourceRefs: ["world://watch"] };

describe("organization action", () => {
  it("creates an organization with independent operating capacity", () => {
    const result = createOrganizationContract(org);
    expect(result.permissions).toContain("close-gate");
    expect(result.responseDelay).toBe("2 days");
  });

  it("records off-POV action only with authority, resources, delay and evidence", () => {
    const contract = createOrganizationContract(org);
    const action = recordInstitutionAction(contract, { actionId: "action-1", action: "close-gate", actor: "captain-1", resourceUse: ["20 guards"], informationUsed: ["gate breach report"], at: "day-010", outcome: "north gate closed", evidenceRefs: ["chapter://3#report"] });
    expect(action.status).toBe("recorded");
    expect(action.responseDelay).toBe("2 days");
    expect(() => recordInstitutionAction(contract, { actionId: "action-2", action: "close-gate", actor: "captain-1", resourceUse: ["guards"], informationUsed: ["report"], at: "day-010", outcome: "closed", evidenceRefs: [] })).toThrow("INSTITUTION_ACTION_EVIDENCE_REQUIRED");
  });

  it("blocks actions outside organizational authority", () => {
    const contract = createOrganizationContract(org);
    expect(() => recordInstitutionAction(contract, { actionId: "action-3", action: "rewrite-law", actor: "captain-1", resourceUse: ["seal"], informationUsed: ["charter"], at: "day-010", outcome: "law changed", evidenceRefs: ["chapter://3"] })).toThrow("INSTITUTION_ACTION_NOT_AUTHORIZED");
  });
});
