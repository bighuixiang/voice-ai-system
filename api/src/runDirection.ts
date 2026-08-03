import crypto from "node:crypto";

export type DirectionClassification = "pause" | "scope-change" | "content-direction";
export type DirectionBoundary = "now" | "next-boundary" | "replan";
export interface RunDirectionEvent {
  schemaVersion: "run-direction-event.v1";
  eventId: string;
  runId: string;
  workItemId: string;
  authorText: string;
  classification: DirectionClassification;
  status: "received" | "classified";
  effectiveBoundary: DirectionBoundary;
  affectedWorkItemIds: string[];
  targetObjectiveVersion: number;
  createdAt: string;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function classifyRunDirection(text: string): DirectionClassification {
  if (/暂停|停止|别写|停下/u.test(text)) return "pause";
  if (/结局|核心承诺|范围|改掉/u.test(text)) return "scope-change";
  return "content-direction";
}

export function receiveRunDirection(input: { runId: string; workItemId: string; authorText: string; phase: "idle" | "model-call" | "settled"; targetObjectiveVersion: number }): RunDirectionEvent {
  if (!input.authorText.trim()) throw new Error("DIRECTION_TEXT_REQUIRED");
  if (!input.runId.trim() || !input.workItemId.trim() || !Number.isInteger(input.targetObjectiveVersion) || input.targetObjectiveVersion < 1) throw new Error("DIRECTION_FIELDS_INVALID");
  const classification = classifyRunDirection(input.authorText);
  const effectiveBoundary: DirectionBoundary = classification === "scope-change" || input.phase === "settled" ? "replan" : input.phase === "model-call" ? "next-boundary" : "now";
  const base = { schemaVersion: "run-direction-event.v1" as const, eventId: `direction-${hash({ ...input, classification }).slice(0, 20)}`, runId: input.runId, workItemId: input.workItemId, authorText: input.authorText, classification, status: (input.phase === "model-call" ? "received" : "classified") as "received" | "classified", effectiveBoundary, affectedWorkItemIds: [input.workItemId], targetObjectiveVersion: input.targetObjectiveVersion, createdAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}
