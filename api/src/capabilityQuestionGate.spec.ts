import { describe, expect, it } from "vitest";
import { classifyQuestionCapability } from "./capabilityQuestionGate.js";
describe("question capability gate", () => { it("does not present partner waiting or answer API for legacy string questions", () => { expect(classifyQuestionCapability({ capabilityQuestionStrings: ["保留意象吗？"], hasDialogueQuestionSchema: false })).toMatchObject({ status: "legacy-only", partnerWaitingUi: false, answerApiEnabled: false }); }); });
