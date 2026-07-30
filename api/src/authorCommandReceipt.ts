import crypto from "node:crypto";

export type CommandRisk = "low" | "medium" | "high";
export type CommandReceiptStatus = "received" | "classified" | "accepted" | "blocked";
export interface AuthorCommandReceipt {
  schemaVersion: "author-command-receipt.v1";
  receiptId: string;
  projectSlug: string;
  clientMessageId: string;
  originalText: string;
  intentAtoms: string[];
  currentInterpretation: string;
  clarificationItems: string[];
  requestedActions: string[];
  risk: CommandRisk;
  effectBoundary: string;
  status: CommandReceiptStatus;
  createdAt: string;
  fingerprint: string;
}
export interface ReceiptAuthorization { allowed: boolean; reason: "authorized" | "receipt-blocked" | "action-not-allowed" | "boundary-disallows-canon"; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createAuthorCommandReceipt(input: Omit<AuthorCommandReceipt, "schemaVersion" | "status" | "createdAt" | "fingerprint">): AuthorCommandReceipt {
  if (!input.receiptId.trim() || !input.projectSlug.trim() || !input.clientMessageId.trim() || !input.originalText.trim() || !input.currentInterpretation.trim() || !input.intentAtoms.length || !input.requestedActions.length || !input.effectBoundary.trim()) throw new Error("COMMAND_RECEIPT_FIELDS_REQUIRED");
  const status: CommandReceiptStatus = input.risk === "high" && input.clarificationItems.length ? "blocked" : input.clarificationItems.length ? "classified" : "accepted";
  const base = { schemaVersion: "author-command-receipt.v1" as const, ...input, intentAtoms: [...input.intentAtoms], clarificationItems: [...input.clarificationItems], requestedActions: [...input.requestedActions], status, createdAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}

export function authorizeReceiptAction(receipt: AuthorCommandReceipt, action: string): ReceiptAuthorization {
  if (receipt.status === "blocked") return { allowed: false, reason: "receipt-blocked" };
  if (!receipt.requestedActions.includes(action)) return { allowed: false, reason: "action-not-allowed" };
  if ((action === "write-canon" || action === "publish" || action === "rewrite-ending") && receipt.effectBoundary === "no-canon-write") return { allowed: false, reason: "boundary-disallows-canon" };
  return { allowed: true, reason: "authorized" };
}
