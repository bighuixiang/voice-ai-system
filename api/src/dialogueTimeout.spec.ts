import { describe, expect, it } from "vitest";
import { evaluateDialogueTimeout } from "./dialogueTimeout.js";

describe("dialogue timeout does not imply consent", () => {
  it("keeps a high-impact unanswered question gated", () => {
    const result = evaluateDialogueTimeout({ questionId: "q-ending", elapsedMs: 10000, timeoutMs: 1000, impact: "high", pendingWrite: true, validDelegation: false });
    expect(result).toMatchObject({ status: "gate_required", consent: false, writeAllowed: false });
  });

  it("allows only read-only continuation without consent", () => {
    const result = evaluateDialogueTimeout({ questionId: "q-label", elapsedMs: 10000, timeoutMs: 1000, impact: "low", pendingWrite: false, validDelegation: false });
    expect(result).toMatchObject({ status: "read_only_continue", consent: false, writeAllowed: false });
  });

  it("requires an explicit, unexpired delegation before automatic choice", () => {
    const result = evaluateDialogueTimeout({ questionId: "q-style", elapsedMs: 10000, timeoutMs: 1000, impact: "medium", pendingWrite: true, validDelegation: true });
    expect(result).toMatchObject({ status: "delegated_continue", consent: true, writeAllowed: true });
  });
});
