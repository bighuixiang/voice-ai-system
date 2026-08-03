import crypto from "node:crypto";

export interface ObligationMemoryRisk { schemaVersion: "obligation-memory-risk.v1"; obligationId: string; status: "normal" | "forgetting-risk"; gapChapters: number; nearPayoffWindow: boolean; action: "none" | "recontextualize-existing-scene"; autoInsert: false; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateObligationMemoryRisk(input: { obligationId: string; setupChapter: number; currentChapter: number; targetWindowChapter: number; lastReminderChapter?: number; importance: "low" | "medium" | "high"; reminderGapThreshold?: number }): ObligationMemoryRisk {
  if (!input.obligationId.trim() || ![input.setupChapter, input.currentChapter, input.targetWindowChapter].every(Number.isInteger) || input.setupChapter < 0 || input.currentChapter < input.setupChapter || input.targetWindowChapter < input.setupChapter) throw new Error("MEMORY_RISK_INPUT_INVALID");
  const gapChapters = input.currentChapter - (input.lastReminderChapter ?? input.setupChapter);
  const threshold = input.reminderGapThreshold ?? (input.importance === "high" ? 12 : input.importance === "medium" ? 20 : 30);
  const nearPayoffWindow = input.targetWindowChapter - input.currentChapter <= Math.max(5, threshold);
  const risky = input.importance === "high" && gapChapters >= threshold && nearPayoffWindow;
  const base = { schemaVersion: "obligation-memory-risk.v1" as const, obligationId: input.obligationId, status: risky ? "forgetting-risk" as const : "normal" as const, gapChapters, nearPayoffWindow, action: risky ? "recontextualize-existing-scene" as const : "none" as const, autoInsert: false as const };
  return { ...base, fingerprint: hash(base) };
}
