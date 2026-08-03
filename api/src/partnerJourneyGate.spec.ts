import { describe, expect, it } from "vitest";
import { evaluatePartnerJourney } from "./partnerJourneyGate.js";
describe("partner journey", () => { it("rejects legacy-button dependency", () => { expect(evaluatePartnerJourney({ ideaSubmitted: true, questionAnswered: true, diffViewed: true, contractAdopted: true, requiredLegacyButton: true }).status).toBe("blocked"); }); });
