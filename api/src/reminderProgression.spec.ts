import { describe, expect, it } from "vitest";
import { evaluateReminderProgression } from "./reminderProgression.js";

describe("reminder progression", () => {
  it("does not count repeated wording without a new change", () => expect(evaluateReminderProgression({ priorText: "玉佩发热", currentText: "玉佩发热" })).toMatchObject({ effective: false, repeated: true, reason: "NO_NOVEL_CHANGE" }));
  it("counts a reminder that changes an inference or imposes a cost", () => expect(evaluateReminderProgression({ priorText: "玉佩发热", currentText: "玉佩发热", relationshipChange: "角色误判盟友并收窄答案" })).toMatchObject({ effective: true, repeated: true, changes: ["角色误判盟友并收窄答案"] }));
});
