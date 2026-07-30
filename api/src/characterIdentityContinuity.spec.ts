import { describe, expect, it } from "vitest";
import { createCharacterContinuity, recordCharacterContinuityEvent } from "./characterIdentityContinuity.js";

const base = { characterId: "hero", projectSlug: "demo", identityVersion: "identity-v1", sourceRefs: ["canon://hero"] };
describe("character death resurrection identity continuity", () => {
  it("records death with cause and evidence", () => {
    const result = recordCharacterContinuityEvent(createCharacterContinuity(base), { type: "death", description: "falls at the bridge", cause: "blood loss", evidenceRefs: ["chapter://10"] });
    expect(result.status).toBe("dead");
  });

  it("requires mechanism and cost for resurrection, then breaks identity continuity", () => {
    const dead = recordCharacterContinuityEvent(createCharacterContinuity(base), { type: "death", description: "falls", cause: "blood loss", evidenceRefs: ["chapter://10"] });
    const revived = recordCharacterContinuityEvent(dead, { type: "resurrection", description: "returns through the gate", mechanism: "oath exchange", cost: "loses name and memory", evidenceRefs: ["chapter://12"], identityChange: "does not recognize the old contract" });
    expect(revived.status).toBe("identity-broken");
    expect(revived.identityVersion).not.toBe("identity-v1");
  });

  it("does not permit resurrection while alive or without identity change evidence", () => {
    expect(() => recordCharacterContinuityEvent(createCharacterContinuity(base), { type: "resurrection", description: "returns", mechanism: "magic", cost: "none", evidenceRefs: ["chapter://1"], identityChange: "" })).toThrow("CHARACTER_RESURRECTION_STATE_INVALID");
  });
});
