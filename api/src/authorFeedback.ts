import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseAdoptionTransaction } from "./proseAdoption.js";

export interface AuthorFeedbackEvent {
  schemaVersion: "author-feedback-event.v1";
  eventId: string;
  projectSlug: string;
  candidateId: string;
  adoptionTransactionId: string;
  decision: "accepted" | "needs_revision" | "rejected";
  note: string;
  createdAt: string;
  fingerprint: string;
}

function eventPath(root: string, eventId: string): string { return resolveInside(root, `sessions/author-feedback/${eventId}.json`); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readAuthorFeedbackEvent(root: string, eventId: string): Promise<AuthorFeedbackEvent | null> {
  try { return JSON.parse(await fs.readFile(eventPath(root, eventId), "utf8")) as AuthorFeedbackEvent; }
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
    createdAt: new Date().toISOString()
  };
  const event: AuthorFeedbackEvent = { ...base, fingerprint: hash(base) };
  await writeJson(eventPath(input.root, eventId), event);
  return event;
}
