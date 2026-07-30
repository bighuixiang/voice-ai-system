import { describe, expect, it } from "vitest";
import { createValueOpponentContract } from "./valueOpponent.js";

const valid = { contractId: "opponent-1", protagonistId: "hero", opponentId: "rival", opponentDesire: "secure the city for her refugees", valueLogic: "safety before freedom", viableWinPath: "control the bridge council", pressureOnFalseBelief: "forces hero to choose trust over control", concreteConflict: "refugee safety versus individual autonomy", sourceRefs: ["plan://opponent-1"] };
describe("value opponent contract", () => {
  it("requires an independent desire, value logic, win path and pressure function", () => {
    const result = createValueOpponentContract(valid);
    expect(result.status).toBe("ready");
    expect(result.opponentId).toBe("rival");
  });

  it("rejects a tool antagonist without a credible win path or conflict", () => {
    expect(() => createValueOpponentContract({ ...valid, viableWinPath: "", concreteConflict: "" })).toThrow("VALUE_OPPONENT_FIELDS_REQUIRED");
  });

  it("does not allow the opponent to collapse into the protagonist identity", () => {
    expect(() => createValueOpponentContract({ ...valid, opponentId: "hero" })).toThrow("VALUE_OPPONENT_IDENTITY_CONFLICT");
  });
});
