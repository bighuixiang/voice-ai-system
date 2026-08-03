import { describe, expect, it } from "vitest";
import { evaluateCharacterArcRhythm, recordArcRhythmEvent } from "./characterArcRhythm.js";

const event = (chapterId: string, phase: "accumulation" | "probe" | "choice" | "consequence" | "integration" | "stagnation" | "relapse" | "transformation", overrides: Record<string, unknown> = {}) => ({ chapterId, phase, pressure: "betrayal risk", choice: "warn ally", cost: "lose escape window", evidenceRefs: [`chapter://${chapterId}`], ...overrides });
describe("character arc rhythm", () => {
  it("allows accumulation and deliberate stagnation without demanding chapter growth", () => {
    const record = recordArcRhythmEvent({ arcId: "arc-1", characterId: "hero", events: [], sourceRefs: ["arc://1"] }, event("1", "accumulation"));
    const result = evaluateCharacterArcRhythm(record, { minimumNovelPressure: 1 });
    expect(result.status).toBe("healthy");
  });

  it("flags repeated conflict with no new pressure, choice, or cost as empty rotation", () => {
    const record = recordArcRhythmEvent({ arcId: "arc-1", characterId: "hero", events: [], sourceRefs: ["arc://1"] }, event("1", "choice"));
    const repeated = recordArcRhythmEvent(record, event("2", "choice", { evidenceRefs: ["chapter://2"] }));
    const result = evaluateCharacterArcRhythm(repeated, { minimumNovelPressure: 1 });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContain("ARC_EMPTY_ROTATION");
  });

  it("records relapse only with pressure and cost evidence", () => {
    const record = recordArcRhythmEvent({ arcId: "arc-1", characterId: "hero", events: [], sourceRefs: ["arc://1"] }, event("1", "relapse"));
    expect(record.events[0]?.phase).toBe("relapse");
    expect(evaluateCharacterArcRhythm(record, { minimumNovelPressure: 1 }).status).toBe("healthy");
  });

  it("uses minimumNovelPressure instead of silently ignoring it", () => {
    const record = recordArcRhythmEvent({ arcId: "arc-1", characterId: "hero", events: [], sourceRefs: ["arc://1"] }, event("1", "accumulation"));
    const result = evaluateCharacterArcRhythm(record, { minimumNovelPressure: 2 });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContain("ARC_NOVEL_PRESSURE_INSUFFICIENT");
  });
});
