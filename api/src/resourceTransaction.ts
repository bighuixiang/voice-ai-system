import crypto from "node:crypto";

export type ResourceAction = "grant" | "consume" | "transfer" | "lock" | "unlock";
export interface ResourceTransaction { schemaVersion: "resource-transaction.v1"; transactionId: string; resourceType: string; ownerId: string; action: ResourceAction; quantity: { min: number; max: number }; fromOwnerId: string; toOwnerId: string; locked: boolean; at: string; evidenceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createResourceTransaction(input: Omit<ResourceTransaction, "schemaVersion" | "fingerprint">): ResourceTransaction {
  if (!input.transactionId.trim() || !input.resourceType.trim() || !input.ownerId.trim() || !input.at.trim()) throw new Error("RESOURCE_TRANSACTION_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("RESOURCE_TRANSACTION_EVIDENCE_REQUIRED");
  if (input.quantity.min < 0 || input.quantity.max < input.quantity.min) throw new Error("RESOURCE_QUANTITY_INVALID");
  if (input.action === "transfer" && (!input.fromOwnerId.trim() || !input.toOwnerId.trim())) throw new Error("RESOURCE_TRANSFER_OWNERS_REQUIRED");
  const base = { schemaVersion: "resource-transaction.v1" as const, ...input, quantity: { ...input.quantity }, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
export function applyResourceTransactions(transactions: readonly ResourceTransaction[]): { balanceKnown: boolean; balances: Record<string, number> } {
  const seen = new Set<string>(); const balances: Record<string, number> = {}; let balanceKnown = true;
  for (const tx of transactions) {
    if (seen.has(tx.transactionId)) throw new Error("RESOURCE_TRANSACTION_DUPLICATE"); seen.add(tx.transactionId);
    if (tx.quantity.min !== tx.quantity.max) balanceKnown = false;
    const amount = tx.quantity.max;
    if (tx.action === "grant") balances[tx.ownerId] = (balances[tx.ownerId] ?? 0) + amount;
    if (tx.action === "consume" || tx.action === "lock") balances[tx.ownerId] = (balances[tx.ownerId] ?? 0) - amount;
    if (tx.action === "transfer") { balances[tx.fromOwnerId] = (balances[tx.fromOwnerId] ?? 0) - amount; balances[tx.toOwnerId] = (balances[tx.toOwnerId] ?? 0) + amount; }
    if (tx.action === "unlock") balances[tx.ownerId] = (balances[tx.ownerId] ?? 0) + amount;
    if (Object.values(balances).some((value) => value < 0) && balanceKnown) throw new Error("RESOURCE_BALANCE_NEGATIVE");
  }
  return { balanceKnown, balances };
}
