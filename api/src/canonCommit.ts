import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface CanonCommitEvent {
  schemaVersion: "canon-commit-event.v1";
  eventId: string;
  mutationId: string;
  proposalId: string;
  projectSlug: string;
  authorizationId: string;
  actorId: string;
  candidateId: string;
  canonCommitFingerprint: string;
  createdAt: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeCanonCommitFingerprint(input: Pick<CanonCommitEvent, "mutationId" | "proposalId" | "projectSlug" | "authorizationId" | "actorId" | "candidateId">): string {
  return hash({ mutationId: input.mutationId, proposalId: input.proposalId, projectSlug: input.projectSlug, authorizationId: input.authorizationId, actorId: input.actorId, candidateId: input.candidateId });
}

function eventPath(root: string): string {
  return path.join(root, "sessions", "canon-commit-events.jsonl");
}

function mutationPath(root: string, mutationId: string): string {
  return path.join(root, "sessions", "mutations", `${mutationId}.json`);
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verifyEvent(value: unknown): value is CanonCommitEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CanonCommitEvent>;
  if (event.schemaVersion !== "canon-commit-event.v1" || typeof event.eventId !== "string" || !event.eventId.trim() || typeof event.mutationId !== "string" || !event.mutationId.trim() || typeof event.proposalId !== "string" || !event.proposalId.trim() || typeof event.projectSlug !== "string" || !event.projectSlug.trim() || typeof event.authorizationId !== "string" || !event.authorizationId.trim() || typeof event.actorId !== "string" || !event.actorId.trim() || typeof event.candidateId !== "string" || !event.candidateId.trim() || typeof event.canonCommitFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(event.canonCommitFingerprint) || typeof event.createdAt !== "string" || !Number.isFinite(Date.parse(event.createdAt))) return false;
  return event.canonCommitFingerprint === computeCanonCommitFingerprint(event as CanonCommitEvent);
}

export async function readLatestCanonCommit(root: string, projectSlug: string): Promise<CanonCommitEvent | null> {
  try {
    const lines = (await fs.readFile(eventPath(root), "utf8")).split(/\r?\n/).filter(Boolean);
    const candidates = lines.map((line) => JSON.parse(line) as unknown).filter((value): value is CanonCommitEvent => verifyEvent(value) && value.projectSlug === projectSlug);
    for (const event of candidates.reverse()) {
      try {
        const plan = JSON.parse(await fs.readFile(mutationPath(root, event.mutationId), "utf8")) as Record<string, unknown>;
        if (plan.schemaVersion !== "mutation-plan.v1" || plan.status !== "committed" || plan.mutationId !== event.mutationId || plan.proposalId !== event.proposalId || plan.projectSlug !== event.projectSlug || plan.authorizationId !== event.authorizationId || plan.actorId !== event.actorId || !Array.isArray(plan.targets)) continue;
        let targetsCurrent = true;
        for (const target of plan.targets as Array<{ relativePath?: unknown; afterSha256?: unknown; existed?: unknown }>) {
          if (typeof target.relativePath !== "string" || !target.relativePath.trim() || typeof target.afterSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(target.afterSha256)) { targetsCurrent = false; break; }
          try {
            const bytes = await fs.readFile(resolveInside(root, target.relativePath));
            if (sha256(bytes) !== target.afterSha256) { targetsCurrent = false; break; }
          } catch { targetsCurrent = false; break; }
        }
        if (targetsCurrent) return event;
      } catch (error) {
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") continue;
        throw error;
      }
    }
    return null;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
