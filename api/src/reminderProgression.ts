import crypto from "node:crypto";

export interface ReminderProgressionResult { schemaVersion: "reminder-progression.v1"; effective: boolean; repeated: boolean; changes: string[]; reason?: "NO_NOVEL_CHANGE"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateReminderProgression(input: { priorText: string; currentText: string; newInformation?: string; newCost?: string; relationshipChange?: string; }): ReminderProgressionResult {
  if (!input.currentText.trim()) throw new Error("REMINDER_TEXT_REQUIRED");
  const changes = [input.newInformation, input.newCost, input.relationshipChange].map((value) => value?.trim() || "").filter(Boolean);
  const repeated = input.priorText.trim() === input.currentText.trim();
  const effective = changes.length > 0;
  const base = { schemaVersion: "reminder-progression.v1" as const, effective, repeated, changes, ...(effective ? {} : { reason: "NO_NOVEL_CHANGE" as const }) };
  return { ...base, fingerprint: hash(base) };
}
