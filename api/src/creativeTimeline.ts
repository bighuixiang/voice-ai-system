import crypto from "node:crypto";
import type { CreativeSession } from "./creativeSession.js";

export type CreativeTimelineEntryKind = "author-message" | "system-message" | "task-result" | "task-progress" | "review-card" | "adoption-event" | "recovery-event" | "question-event";
export interface CreativeTimelineEntry { entryId: string; kind: CreativeTimelineEntryKind; text: string; createdAt: string; sourceRef: string; collapsed: boolean; }
export interface CreativeTimelineProjection {
  schemaVersion: "creative-timeline-projection.v1";
  projectSlug: string;
  sessionId: string;
  sourceMessageIds: string[];
  taskIds: string[];
  taskFingerprint: string;
  activityIds: string[];
  activityFingerprint: string;
  sessionFingerprint: string;
  activeEntryId?: string;
  entries: CreativeTimelineEntry[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function buildCreativeTimelineProjection(session: CreativeSession, workItems: ReadonlyArray<{ workItemId: string; chapterId: string; status: string; createdAt: string }> = [], activities: ReadonlyArray<{ activityId: string; kind: "review-card" | "adoption-event" | "recovery-event" | "question-event"; text: string; createdAt: string; sourceRef: string }> = []): CreativeTimelineProjection {
  const messageEntries = session.messages.map((message): CreativeTimelineEntry => ({ entryId: message.id, kind: message.source.kind === "author" ? "author-message" : message.source.kind === "task-result" ? "task-result" : "system-message", text: message.text, createdAt: message.createdAt, sourceRef: `session://${session.sessionId}#${message.id}`, collapsed: message.source.kind === "task-result" }));
  const taskEntries = workItems.map((item): CreativeTimelineEntry => ({ entryId: item.workItemId, kind: "task-progress", text: `${item.chapterId}: ${item.status}`, createdAt: item.createdAt, sourceRef: `work://${item.workItemId}`, collapsed: true }));
  const activityEntries = activities.map((activity): CreativeTimelineEntry => ({ entryId: activity.activityId, kind: activity.kind, text: activity.text, createdAt: activity.createdAt, sourceRef: activity.sourceRef, collapsed: false }));
  const entries = [...messageEntries, ...taskEntries, ...activityEntries].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.entryId.localeCompare(right.entryId));
  const base = {
    schemaVersion: "creative-timeline-projection.v1" as const,
    projectSlug: session.projectSlug,
    sessionId: session.sessionId,
    sourceMessageIds: session.messages.map((message) => message.id),
    taskIds: workItems.map((item) => item.workItemId),
    taskFingerprint: hash(workItems.map((item) => ({ workItemId: item.workItemId, chapterId: item.chapterId, status: item.status, createdAt: item.createdAt }))),
    activityIds: activities.map((activity) => activity.activityId),
    activityFingerprint: hash(activities.map((activity) => ({ activityId: activity.activityId, kind: activity.kind, text: activity.text, createdAt: activity.createdAt, sourceRef: activity.sourceRef }))),
    sessionFingerprint: session.fingerprint,
    ...(entries.length ? { activeEntryId: entries.at(-1)?.entryId } : {}),
    entries
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertCreativeTimelineProjectionIntegrity(timeline: CreativeTimelineProjection, expectedProjectSlug?: string): CreativeTimelineProjection {
  const { fingerprint: _fingerprint, ...base } = timeline;
  const messageEntries = timeline.entries?.filter((entry) => ["author-message", "system-message", "task-result"].includes(entry.kind)) || [];
  const taskEntries = timeline.entries?.filter((entry) => entry.kind === "task-progress") || [];
  const activityEntries = timeline.entries?.filter((entry) => ["review-card", "adoption-event", "recovery-event", "question-event"].includes(entry.kind)) || [];
  const valid = timeline.schemaVersion === "creative-timeline-projection.v1" && (!expectedProjectSlug || timeline.projectSlug === expectedProjectSlug) && Boolean(timeline.projectSlug?.trim() && timeline.sessionId?.trim() && timeline.sessionFingerprint?.trim()) && Array.isArray(timeline.sourceMessageIds) && Array.isArray(timeline.taskIds) && timeline.taskIds.every((id) => typeof id === "string" && id.trim()) && typeof timeline.taskFingerprint === "string" && /^[a-f0-9]{64}$/i.test(timeline.taskFingerprint) && Array.isArray(timeline.activityIds) && timeline.activityIds.every((id) => typeof id === "string" && id.trim()) && typeof timeline.activityFingerprint === "string" && /^[a-f0-9]{64}$/i.test(timeline.activityFingerprint) && Array.isArray(timeline.entries) && timeline.entries.every((entry) => Boolean(entry.entryId?.trim() && entry.text?.trim() && entry.sourceRef?.trim() && entry.createdAt?.trim()) && ["author-message", "system-message", "task-result", "task-progress", "review-card", "adoption-event", "recovery-event", "question-event"].includes(entry.kind) && typeof entry.collapsed === "boolean") && JSON.stringify(timeline.sourceMessageIds) === JSON.stringify(messageEntries.map((entry) => entry.entryId)) && JSON.stringify(timeline.taskIds) === JSON.stringify(taskEntries.map((entry) => entry.entryId)) && JSON.stringify(timeline.activityIds) === JSON.stringify(activityEntries.map((entry) => entry.entryId)) && /^[a-f0-9]{64}$/i.test(timeline.fingerprint) && hash(base) === timeline.fingerprint;
  if (!valid) throw new Error("CREATIVE_TIMELINE_PROJECTION_INTEGRITY_FAILED");
  return timeline;
}
