import { describe, expect, it } from "vitest";
import { applyResourceTransactions, createResourceTransaction } from "./resourceTransaction.js";

const valid = { transactionId: "tx-1", resourceType: "energy", ownerId: "hero", action: "consume" as const, quantity: { min: 2, max: 2 }, fromOwnerId: "hero", toOwnerId: "", locked: false, at: "day-010", evidenceRefs: ["scene://10#cost"] };

describe("resource transactions", () => {
  it("records ownership, quantity, time, and evidence", () => {
    const tx = createResourceTransaction(valid);
    expect(tx.schemaVersion).toBe("resource-transaction.v1");
    expect(tx.quantity).toEqual({ min: 2, max: 2 });
  });

  it("prevents duplicate transactions and impossible known balances", () => {
    const first = createResourceTransaction({ ...valid, action: "grant", fromOwnerId: "treasury", quantity: { min: 5, max: 5 } });
    const spend = createResourceTransaction({ ...valid, transactionId: "tx-2", quantity: { min: 6, max: 6 } });
    expect(() => applyResourceTransactions([first, spend])).toThrow("RESOURCE_BALANCE_NEGATIVE");
    expect(() => applyResourceTransactions([first, first])).toThrow("RESOURCE_TRANSACTION_DUPLICATE");
  });

  it("allows ranges while preserving unknown balance", () => {
    const tx = createResourceTransaction({ ...valid, quantity: { min: 1, max: 4 }, action: "lock", locked: true });
    expect(applyResourceTransactions([tx]).balanceKnown).toBe(false);
  });
});
