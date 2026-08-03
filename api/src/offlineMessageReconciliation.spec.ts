import { describe, expect, it } from "vitest";
import { reconcileOfflineMessages } from "./offlineMessageReconciliation.js";

describe("offline message reconciliation", () => {
  it("shows server drift and merges unsent messages by idempotent id without replaying continue", () => {
    const result = reconcileOfflineMessages({ serverCursor: 8, localCursor: 6, pending: [{ clientMessageId: "m-1", text: "继续" }, { clientMessageId: "m-2", text: "保留悬念" }], serverMessageIds: ["m-1"] });
    expect(result).toMatchObject({ showDiff: true, resubmit: false, overwriteDecision: false, merged: [{ clientMessageId: "m-2" }] });
  });
});
