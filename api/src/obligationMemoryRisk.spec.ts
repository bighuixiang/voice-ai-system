import { describe, expect, it } from "vitest";
import { evaluateObligationMemoryRisk } from "./obligationMemoryRisk.js";

describe("obligation memory risk", () => {
  it("flags a high-importance obligation with no reminder near its payoff window", () => expect(evaluateObligationMemoryRisk({ obligationId: "obl-1", setupChapter: 5, currentChapter: 72, targetWindowChapter: 80, importance: "high" })).toMatchObject({ status: "forgetting-risk", action: "recontextualize-existing-scene", autoInsert: false }));
  it("does not flag a recently reminded obligation", () => expect(evaluateObligationMemoryRisk({ obligationId: "obl-1", setupChapter: 5, currentChapter: 72, targetWindowChapter: 80, lastReminderChapter: 68, importance: "high" })).toMatchObject({ status: "normal", action: "none" }));
});
