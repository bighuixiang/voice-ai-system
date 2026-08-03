import { describe, expect, it } from "vitest";
import { evaluateObligationConflictGate } from "./obligationConflictGate.js";

describe("obligation conflict gate", () => {
  const base = { gateId: "conflict-1", affectedWorkItemIds: ["work-reveal"], alternatives: ["reinterpret clue", "split answer"] };
  it("blocks related generation until a red-blue choice is authorized", () => expect(evaluateObligationConflictGate(base)).toMatchObject({ status: "blocked", affectedWorkItemIds: ["work-reveal"] }));
  it("clears only with a declared alternative and authorization", () => expect(evaluateObligationConflictGate({ ...base, selectedAlternative: "split answer", authorizationGranted: true })).toMatchObject({ status: "cleared", selectedAlternative: "split answer" }));
});
