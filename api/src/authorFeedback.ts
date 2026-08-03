import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseAdoptionTransaction } from "./proseAdoption.js";
import { readProseCandidate } from "./proseCandidate.js";

export interface AuthorFeedbackEvent {
  schemaVersion: "author-feedback-event.v1";
  eventId: string;
  projectSlug: string;
  candidateId: string;
  adoptionTransactionId: string;
  decision: "accepted" | "needs_revision" | "rejected";
  note: string;
  reasonCode: "provided" | "reason_unknown";
  createdAt: string;
  fingerprint: string;
}

function eventPath(root: string, eventId: string): string { return resolveInside(root, `sessions/author-feedback/${eventId}.json`); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function assertAuthorFeedbackIntegrity(event: AuthorFeedbackEvent, eventId?: string): AuthorFeedbackEvent {
  const { fingerprint: _fingerprint, ...base } = event;
  if (event.schemaVersion !== "author-feedback-event.v1" || (eventId !== undefined && event.eventId !== eventId) || !event.eventId.trim() || !event.projectSlug.trim() || !event.candidateId.trim() || !event.adoptionTransactionId.trim() || !["accepted", "needs_revision", "rejected"].includes(event.decision) || typeof event.note !== "string" || !["provided", "reason_unknown"].includes(event.reasonCode) || !Number.isFinite(Date.parse(event.createdAt)) || !/^[a-f0-9]{64}$/i.test(event.fingerprint) || hash(base) !== event.fingerprint) throw new Error("AUTHOR_FEEDBACK_INTEGRITY_FAILED");
  return event;
}
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readAuthorFeedbackEvent(root: string, eventId: string): Promise<AuthorFeedbackEvent | null> {
  try { return assertAuthorFeedbackIntegrity(JSON.parse(await fs.readFile(eventPath(root, eventId), "utf8")) as AuthorFeedbackEvent, eventId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function recordAuthorFeedback(input: {
  root: string;
  projectSlug: string;
  candidateId: string;
  adoptionTransactionId: string;
  decision: AuthorFeedbackEvent["decision"];
  note?: string;
}): Promise<AuthorFeedbackEvent> {
  const transaction = await readProseAdoptionTransaction(input.root, input.adoptionTransactionId);
  if (!transaction || transaction.status !== "committed" || transaction.candidateId !== input.candidateId) throw new Error("AUTHOR_FEEDBACK_ADOPTION_REQUIRED");
  const candidate = await readProseCandidate(input.root, input.candidateId);
  if (!candidate || candidate.projectSlug !== input.projectSlug.trim()) throw new Error("AUTHOR_FEEDBACK_PROJECT_MISMATCH");
  const eventId = `feedback-${input.adoptionTransactionId}-${hash({ decision: input.decision, note: input.note || "" }).slice(0, 16)}`;
  const existing = await readAuthorFeedbackEvent(input.root, eventId);
  if (existing) return existing;
  const base = {
    schemaVersion: "author-feedback-event.v1" as const,
    eventId,
    projectSlug: input.projectSlug,
    candidateId: input.candidateId,
    adoptionTransactionId: input.adoptionTransactionId,
    decision: input.decision,
    note: input.note || "",
    reasonCode: input.note?.trim() ? "provided" as const : "reason_unknown" as const,
    createdAt: new Date().toISOString()
  };
  const event: AuthorFeedbackEvent = { ...base, fingerprint: hash(base) };
  await writeJson(eventPath(input.root, eventId), event);
  return event;
}
