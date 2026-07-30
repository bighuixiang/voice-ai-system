import crypto from "node:crypto";

export interface ClosureSchedule { schemaVersion: "closure-schedule.v1"; status: "ready" | "blocked"; risks: string[]; assignments: Record<string, string>; fingerprint: string; }
export interface PayoffReservation { schemaVersion: "payoff-reservation.v1"; window: string; capacity: number; used: number; overbooked: number; status: "available" | "conflict"; fingerprint: string; }
export interface AdaptiveReminder { schemaVersion: "adaptive-reminder.v1"; obligationId: string; action: "recontextualize" | "escalate" | "wait"; newInformation: string; fingerprint: string; }
export interface ExposureRisk { schemaVersion: "exposure-risk.v1"; obligationId: string; status: "low" | "watch" | "high-risk"; reasons: string[]; fingerprint: string; }
export interface ClosureSceneContract { schemaVersion: "closure-scene-contract.v1"; contractId: string; valid: boolean; entryKnowledge: string; trigger: string; pursuer: string; resistance: string; evidenceRefs: string[]; irreversibleChoice: string; answer: string; immediateConsequence: string; emotionalAftermath: string; remainingQuestions: string[]; nextPressure: string; fingerprint: string; }
export interface ClosureOutcome { schemaVersion: "closure-outcome.v1"; payoffId: string; propagatedDomains: string[]; downstreamRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createClosureSchedule(input: { obligations: readonly Array<{ id: string; dependencies: readonly string[]; window: string }>; availableWindows: readonly string[] }): ClosureSchedule {
  const ids = new Set(input.obligations.map((item) => item.id)); const risks: string[] = []; const graph = new Map(input.obligations.map((item) => [item.id, item.dependencies.filter((dependency) => ids.has(dependency))])); const visiting = new Set<string>(); const visited = new Set<string>(); const hasCycle = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const dependency of graph.get(id) ?? []) if (hasCycle(dependency)) return true; visiting.delete(id); visited.add(id); return false; }; if ([...ids].some((id) => hasCycle(id))) risks.push("dependency-cycle"); for (const item of input.obligations) if (!input.availableWindows.includes(item.window)) risks.push(`unreachable:${item.id}`); const assignments: Record<string, string> = {}; for (const item of input.obligations) assignments[item.id] = item.window; const base = { schemaVersion: "closure-schedule.v1" as const, status: risks.length ? "blocked" as const : "ready" as const, risks: [...new Set(risks)], assignments };
  return { ...base, fingerprint: hash(base) };
}
export function reservePayoffCapacity(input: { window: string; capacity: number; reservations: readonly Array<{ obligationId: string; load: number }> }): PayoffReservation {
  const used = input.reservations.reduce((sum, reservation) => sum + reservation.load, 0); const overbooked = Math.max(0, used - input.capacity); const base = { schemaVersion: "payoff-reservation.v1" as const, window: input.window, capacity: input.capacity, used, overbooked, status: overbooked ? "conflict" as const : "available" as const };
  return { ...base, fingerprint: hash(base) };
}
export function planAdaptiveReminder(input: { obligationId: string; chaptersSinceLastReminder: number; readerSalience: number; relatedCharacterPresent: boolean; competingObligations: number; previousInformationGain: number; currentContext: string }): AdaptiveReminder {
  const action = input.readerSalience < 0.35 || input.chaptersSinceLastReminder >= 5 ? "recontextualize" as const : input.previousInformationGain < 0.1 ? "escalate" as const : "wait" as const; const base = { schemaVersion: "adaptive-reminder.v1" as const, obligationId: input.obligationId, action, newInformation: action === "wait" ? "" : `context: ${input.currentContext}` };
  return { ...base, fingerprint: hash(base) };
}
export function detectExposureRisk(input: { obligationId: string; reminders: readonly Array<{ hypothesis: string; chapter: number }>; characterAttentionCount: number; competingHypotheses: number }): ExposureRisk {
  const reasons: string[] = []; if (input.reminders.length >= 3) reasons.push("continuous-reminders"); if (new Set(input.reminders.map((item) => item.hypothesis)).size === 1) reasons.push("single-hypothesis"); if (input.characterAttentionCount >= 3) reasons.push("character-overattention"); if (!input.competingHypotheses) reasons.push("no-competition"); const base = { schemaVersion: "exposure-risk.v1" as const, obligationId: input.obligationId, status: reasons.length >= 2 ? "high-risk" as const : reasons.length ? "watch" as const : "low" as const, reasons };
  return { ...base, fingerprint: hash(base) };
}
export function createClosureSceneContract(input: Omit<ClosureSceneContract, "schemaVersion" | "valid" | "fingerprint">): ClosureSceneContract {
  const required = [input.entryKnowledge, input.trigger, input.pursuer, input.resistance, input.irreversibleChoice, input.answer, input.immediateConsequence, input.emotionalAftermath, input.nextPressure]; const valid = required.every((value) => value.trim()) && input.evidenceRefs.length > 0; const base = { schemaVersion: "closure-scene-contract.v1" as const, ...input, evidenceRefs: [...input.evidenceRefs], remainingQuestions: [...input.remainingQuestions], valid };
  return { ...base, fingerprint: hash(base) };
}
export function propagateClosureOutcome(input: { payoffId: string; changes: readonly Array<{ domain: string; before: string; after: string }>; downstreamRefs: readonly string[] }): ClosureOutcome {
  if (!input.payoffId.trim() || !input.changes.length || !input.downstreamRefs.length) throw new Error("CLOSURE_OUTCOME_FIELDS_REQUIRED"); const base = { schemaVersion: "closure-outcome.v1" as const, payoffId: input.payoffId, propagatedDomains: [...new Set(input.changes.map((change) => change.domain))], downstreamRefs: [...input.downstreamRefs] };
  return { ...base, fingerprint: hash(base) };
}
