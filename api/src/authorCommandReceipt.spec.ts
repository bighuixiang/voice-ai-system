import { describe, expect, it } from "vitest";
import { authorizeReceiptAction, createAuthorCommandReceipt } from "./authorCommandReceipt.js";

describe("author command receipt", () => {
  it("records the original command before any effect and exposes its boundary", () => {
    const receipt = createAuthorCommandReceipt({ receiptId: "r-1", projectSlug: "p1", clientMessageId: "m-1", originalText: "先看一版，不要写入正典", intentAtoms: ["preview"], currentInterpretation: "作者要看探索候选", clarificationItems: [], requestedActions: ["generate-candidate"], risk: "low", effectBoundary: "candidate-only" });
    expect(receipt).toMatchObject({ schemaVersion: "author-command-receipt.v1", status: "accepted", originalText: "先看一版，不要写入正典", effectBoundary: "candidate-only" });
    expect(authorizeReceiptAction(receipt, "generate-candidate")).toMatchObject({ allowed: true });
  });

  it("blocks high-risk ambiguity and does not authorize requested effects", () => {
    const receipt = createAuthorCommandReceipt({ receiptId: "r-2", projectSlug: "p1", clientMessageId: "m-2", originalText: "把结局改成开放式", intentAtoms: ["change-ending"], currentInterpretation: "结局方向存在冲突", clarificationItems: ["是否保留主角终局选择"], requestedActions: ["rewrite-ending", "publish"], risk: "high", effectBoundary: "no-canon-write" });
    expect(receipt.status).toBe("blocked");
    expect(authorizeReceiptAction(receipt, "rewrite-ending")).toMatchObject({ allowed: false, reason: "receipt-blocked" });
  });

  it("rejects actions outside the declared allowance", () => {
    const receipt = createAuthorCommandReceipt({ receiptId: "r-3", projectSlug: "p1", clientMessageId: "m-3", originalText: "换个方向", intentAtoms: ["redirect"], currentInterpretation: "调整后续候选", clarificationItems: [], requestedActions: ["queue-direction"], risk: "medium", effectBoundary: "future-work-only" });
    expect(authorizeReceiptAction(receipt, "write-canon")).toMatchObject({ allowed: false, reason: "action-not-allowed" });
  });
});
