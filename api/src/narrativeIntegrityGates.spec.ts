import { describe, expect, it } from "vitest";
import { evaluateAgencyChain, evaluateDialogueAction, evaluateEmotionalAftermath, evaluateNarrativeDistance, evaluatePovKnowledge, evaluateVoiceDrift } from "./narrativeIntegrityGates.js";
describe("narrative integrity gates", () => {
  it("blocks agency without evaluated choices", () => { expect(evaluateAgencyChain({ knownFacts: ["camera"], options: ["destroy", "preserve"], evaluatedOptions: [], choiceReason: "", consequence: "" }).status).toBe("blocked"); });
  it("requires arc evidence for voice change", () => { expect(evaluateVoiceDrift({ priorVoice: "quiet", newVoice: "confession", relationshipMilestones: [], arcEvidence: [] }).status).toBe("drift"); });
  it("rejects dialogue as information questionnaire", () => { expect(evaluateDialogueAction({ speakerA: { goal: "", action: "" }, speakerB: { goal: "", action: "" }, powerShift: "", distinctStrategies: false }).status).toBe("info_qa"); });
  it("blocks POV knowledge leak and repeated reveal", () => { expect(evaluatePovKnowledge({ povKnownFacts: [], assertedFacts: ["sealed-letter"], priorReaderFacts: ["sealed-letter"], newConsequence: false }).status).toBe("blocked"); });
  it("allows marked distance shift but blocks secret mind entry", () => { expect(evaluateNarrativeDistance({ current: "close", next: "overview", trigger: "city lockdown seen from above", entersOtherMind: false, secretNamed: false }).status).toBe("allowed"); expect(evaluateNarrativeDistance({ current: "close", next: "close", trigger: "", entersOtherMind: true, secretNamed: true }).status).toBe("blocked"); });
  it("rejects emotion summary without aftermath chain", () => { expect(evaluateEmotionalAftermath({ trigger: "death", externalManifestation: "", interpretation: "", choice: "", aftermath: "" }).status).toBe("summary_only"); });
});
