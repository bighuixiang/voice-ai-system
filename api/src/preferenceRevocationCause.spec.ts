import { describe, expect, it } from "vitest";
import { classifyPreferenceRevocation } from "./preferenceRevocationCause.js";

describe("preference revocation cause", () => {
  it("does not turn a canon-driven reversal into a negative preference", () => {
    expect(classifyPreferenceRevocation({ preferenceId: "mentor-alive", reason: "new canon requires death", canonChanged: true })).toMatchObject({ cause: "story-premise-change", negativePreferenceCreated: false });
  });
  it("creates a negative preference only when author dislike is explicit", () => {
    expect(classifyPreferenceRevocation({ preferenceId: "purple-prose", reason: "作者不喜欢这种写法", canonChanged: false }).negativePreferenceCreated).toBe(true);
  });
});
