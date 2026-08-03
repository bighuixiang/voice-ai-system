import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCraftExperiment } from "./craftExperiment.js";

export type CraftFeedbackOutcome = "accepted" | "rejected" | "edited";
export interface CraftFeedbackEvent {
  schemaVersion: "craft-feedback-event.v1";
  feedbackId: string;
  projectSlug: string;
  experimentId: string;
  actor: string;
  outcome: CraftFeedbackOutcome;
  note: string;
  changedDimensions: string[];
  confounders: string[];
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const feedbackPath = (root: string, id: string) => resolveInside(root, `sessions/craft-feedback/${id}.json`);

export function assertCraftFeedbackIntegrity(event: CraftFeedbackEvent, expectedId?: string): CraftFeedbackEvent {
  const { fingerprint, ...base } = event;
  if (event.schemaVersion !== "craft-feedback-event.v1" || (expectedId !== undefined && event.feedbackId !== expectedId) || !event.feedbackId.trim() || !event.projectSlug.trim() || !event.experimentId.trim() || !event.actor.trim() || !["accepted", "rejected", "edited"].includes(event.outcome) || !event.note.trim() || !event.changedDimensions.length || event.changedDimensions.some((value) => !value.trim()) || new Set(event.changedDimensions).size !== event.changedDimensions.length || event.confounders.some((value) => !value.trim()) || !Number.isFinite(Date.parse(event.createdAt)) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("CRAFT_FEEDBACK_INTEGRITY_FAILED");
  return event;
}

async function writeJson(root: string, event: CraftFeedbackEvent): Promise<void> {
  const target = feedbackPath(root, event.feedbackId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readCraftFeedbackEvent(root: string, feedbackId: string): Promise<CraftFeedbackEvent | null> {
  try { return assertCraftFeedbackIntegrity(JSON.parse(await fs.readFile(feedbackPath(root, feedbackId), "utf8")) as CraftFeedbackEvent, feedbackId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function listCraftFeedbackEvents(root: string, projectSlug: string, experimentId?: string): Promise<CraftFeedbackEvent[]> {
  let names: string[];
  try { names = await fs.readdir(resolveInside(root, "sessions/craft-feedback")); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const events = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readCraftFeedbackEvent(root, name.slice(0, -5))));
  return events.filter((event): event is CraftFeedbackEvent => Boolean(event && event.projectSlug === projectSlug && (!experimentId || event.experimentId === experimentId))).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function recordCraftFeedback(input: { root: string; projectSlug: string; experimentId: string; actor: string; outcome: CraftFeedbackOutcome; note: string; changedDimensions: readonly string[]; confounders: readonly string[] }): Promise<CraftFeedbackEvent> {
  if (!input.projectSlug.trim() || !input.experimentId.trim() || !input.actor.trim() || !["accepted", "rejected", "edited"].includes(input.outcome) || !input.note.trim() || !input.changedDimensions.length || input.changedDimensions.some((value) => !value.trim()) || new Set(input.changedDimensions).size !== input.changedDimensions.length || input.confounders.some((value) => !value.trim())) throw new Error("CRAFT_FEEDBACK_INPUT_INVALID");
  const experiment = await readCraftExperiment(input.root, input.experimentId);
  if (!experiment) throw new Error("CRAFT_EXPERIMENT_NOT_FOUND");
  if (experiment.projectSlug !== input.projectSlug) throw new Error("CRAFT_FEEDBACK_PROJECT_MISMATCH");
  if (!["judged", "failed", "inconclusive"].includes(experiment.status)) throw new Error("CRAFT_FEEDBACK_EXPERIMENT_NOT_READY");
  const feedbackId = `craft-feedback-${input.experimentId}-${hash({ actor: input.actor, outcome: input.outcome, note: input.note, changedDimensions: input.changedDimensions, confounders: input.confounders }).slice(0, 16)}`;
  const existing = await readCraftFeedbackEvent(input.root, feedbackId);
  if (existing) return existing;
  const base = { schemaVersion: "craft-feedback-event.v1" as const, feedbackId, projectSlug: input.projectSlug, experimentId: input.experimentId, actor: input.actor, outcome: input.outcome, note: input.note, changedDimensions: [...input.changedDimensions], confounders: [...input.confounders], createdAt: new Date().toISOString() };
  const event = { ...base, fingerprint: hash(base) };
  await writeJson(input.root, event);
  return event;
}
