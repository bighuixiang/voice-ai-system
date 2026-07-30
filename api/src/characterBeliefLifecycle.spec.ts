import { describe, expect, it } from "vitest";
import { createBeliefLifecycle, recordBeliefEvent } from "./characterBeliefLifecycle.js";

const base = { beliefId: "belief-1", characterId: "hero", belief: "trust is weakness", sourceRefs: ["contract://1"] };
describe("character false-belief lifecycle", () => {
  it("keeps counterevidence and resistance separate from acknowledgment", () => {
    const formed = createBeliefLifecycle(base);
    const challenged = recordBeliefEvent(formed, { type: "counterevidence", description: "ally keeps the secret", evidenceRefs: ["scene://1"] });
    const resisted = recordBeliefEvent(challenged, { type: "resisted", description: "denies the evidence", evidenceRefs: ["scene://2"] });
    const consequence = recordBeliefEvent(resisted, { type: "behavioral-consequence", description: "chooses to trust despite risk", evidenceRefs: ["scene://3"] });
    const acknowledged = recordBeliefEvent(consequence, { type: "acknowledged", description: "admits the belief failed", evidenceRefs: ["scene://4"] });
    expect(challenged.status).toBe("challenged");
    expect(resisted.status).toBe("resisted");
    expect(acknowledged.status).toBe("acknowledged");
    expect(acknowledged.events).toHaveLength(5);
  });

  it("does not let a truth statement complete change without behavioral consequence", () => {
    const challenged = recordBeliefEvent(createBeliefLifecycle(base), { type: "counterevidence", description: "truth is spoken", evidenceRefs: ["scene://truth"] });
    expect(() => recordBeliefEvent(challenged, { type: "acknowledged", description: "heard the truth", evidenceRefs: ["scene://truth"] })).toThrow("BELIEF_BEHAVIORAL_CONSEQUENCE_REQUIRED");
  });

  it("requires pressure and cost evidence for relapse", () => {
    const acknowledged = recordBeliefEvent(recordBeliefEvent(createBeliefLifecycle(base), { type: "counterevidence", description: "evidence", evidenceRefs: ["scene://1"] }), { type: "shaken", description: "doubt begins", evidenceRefs: ["scene://2"] });
    expect(() => recordBeliefEvent(acknowledged, { type: "relapsed", description: "returns to old belief", evidenceRefs: ["scene://3"] })).toThrow("BELIEF_RELAPSE_PRESSURE_REQUIRED");
    const relapsed = recordBeliefEvent(acknowledged, { type: "relapsed", description: "returns under threat", evidenceRefs: ["scene://3"], pressureRefs: ["pressure://3"], costRefs: ["cost://3"] });
    expect(relapsed.status).toBe("relapsed");
  });
});
