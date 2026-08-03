import { describe, expect, it } from "vitest";
import { detectRhythmMonotony, detectStagnation, evaluateCognitiveBudget, evaluateMultiDomainValidation, evaluateSettingActionability, recoverLongChapter, synthesizeRedBlue, validateSegmentSeam } from "./craftExecutionGates.js";
describe("craft execution gates", () => {
  it("filters setting exposition through current action", () => { expect(evaluateSettingActionability({ expositionUnits: 8, currentActionInteractions: 0, neededNow: 2, delayed: 6, environmentPressure: 1, misjudgmentCost: 1 }).status).toBe("infodump"); });
  it("blocks cognitive overload", () => { expect(evaluateCognitiveBudget({ newInfoUnits: 12, similarNames: 12, newRules: 3, clues: 4, capacity: 10 }).status).toBe("overloaded"); });
  it("detects same-length sentence rhythm", () => { expect(detectRhythmMonotony({ sentenceLengths: [8, 8, 8], repeatedEndings: 3, actionReactionJudgmentCost: false }).status).toBe("monotone"); });
  it("locates segment state contradiction", () => { expect(validateSegmentSeam({ priorInjuries: ["left-leg-broken"], priorItems: ["key"], nextActions: ["run to door"], nextItemsUsed: ["key"] }).status).toBe("contradiction"); });
  it("resumes from verified boundary after worker crash", () => { expect(recoverLongChapter({ frozenManifest: true, verifiedSegments: 2, unfinishedBeats: 1, baselineTail: true, workerCrashed: true }).status).toBe("resumed"); });
  it("pauses repeated near-identical candidates", () => { expect(detectStagnation({ coreProblemUnchanged: true, versions: 3, maxSimilarVersions: 3 }).status).toBe("paused"); });
  it("freezes red evidence over self-score", () => { expect(synthesizeRedBlue({ blueValidOpening: true, redEvidence: ["no-choice"], selfScore: 95, failures: ["pov", "beat"] }).status).toBe("blocked"); });
  it("does not let total score hide hard failures", () => { expect(evaluateMultiDomainValidation({ score: 92, hardFailures: ["POV"], missedObligations: ["FS-1"], evaluatedDomains: ["pov"] }).status).toBe("blocked"); });
});
