import { describe, expect, it } from "vitest";
import { createOffPageCharacterPlan, recordOffPageEvent, reconcileOffPageReturn } from "./offPageCharacter.js";

const planInput = { planId: "plan-1", projectSlug: "demo", characterId: "ally", independentGoal: "secure medicine", resources: ["smuggler contact"], constraints: ["cannot enter the capital"], nearTermPlan: "trade at the east gate", sourceRefs: ["plan://ally-1"] };
describe("off-page character agency", () => {
  it("stores a secondary character's independent goal and constraints", () => {
    const plan = createOffPageCharacterPlan(planInput);
    expect(plan.independentGoal).toBe("secure medicine");
    expect(plan.status).toBe("planned");
  });

  it("records off-page action only with a causal plan and evidence", () => {
    const plan = createOffPageCharacterPlan(planInput);
    const event = recordOffPageEvent(plan, { eventId: "offpage-1", action: "trades medicine", consequence: "gets supplies", causalEvidenceRefs: ["scene://east-gate"], sourceRefs: ["scene://east-gate"] });
    expect(event.events[0]?.status).toBe("observed");
    expect(event.events[0]?.planId).toBe("plan-1");
  });

  it("blocks a convenient off-page result without causal evidence", () => {
    const plan = createOffPageCharacterPlan(planInput);
    expect(() => recordOffPageEvent(plan, { eventId: "offpage-2", action: "somehow gets medicine", consequence: "returns successful", causalEvidenceRefs: [], sourceRefs: ["chapter://return"] })).toThrow("OFFPAGE_CAUSAL_EVIDENCE_REQUIRED");
  });

  it("requires every off-page event to be accounted for when the character returns", () => {
    const plan = recordOffPageEvent(createOffPageCharacterPlan(planInput), { eventId: "offpage-1", action: "trades medicine", consequence: "gets supplies", causalEvidenceRefs: ["scene://east-gate"], sourceRefs: ["scene://east-gate"] });
    expect(() => reconcileOffPageReturn(plan, { returnSnapshotId: "snapshot://return", accountedEventIds: [], evidenceRefs: ["chapter://return"] })).toThrow("OFFPAGE_RETURN_ACCOUNTING_INCOMPLETE");
    const reconciled = reconcileOffPageReturn(plan, { returnSnapshotId: "snapshot://return", accountedEventIds: ["offpage-1"], evidenceRefs: ["chapter://return"] });
    expect(reconciled.returnReconciliation).toMatchObject({ status: "reconciled", returnSnapshotId: "snapshot://return", accountedEventIds: ["offpage-1"] });
  });
});
