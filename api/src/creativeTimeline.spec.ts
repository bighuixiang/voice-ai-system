import { describe, expect, it } from "vitest";
import { buildCreativeTimelineProjection } from "./creativeTimeline.js";
import type { CreativeSession } from "./creativeSession.js";

const baseSession = (messages: CreativeSession["messages"]): CreativeSession => ({
  schemaVersion: "creative-session.v1", sessionId: "session-demo", projectSlug: "demo", status: messages.length ? "understanding" : "capturing", phase: messages.length ? "understanding" : "capture", collaborationMode: "guided", latestDirection: "", unconfirmedAssumptions: [], decisionRefs: [], pendingPatchRefs: [], messages, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:01:00.000Z", fingerprint: "f".repeat(64)
});

describe("creative timeline projection", () => {
  it("projects author and system messages into one ordered durable timeline", () => {
    const timeline = buildCreativeTimelineProjection(baseSession([
      { id: "m1", clientMessageId: "c1", role: "author", text: "A lighthouse keeper waits.", source: { kind: "author" }, createdAt: "2026-07-30T00:00:01.000Z" },
      { id: "m2", clientMessageId: "c2", role: "system", text: "I understand the setting.", source: { kind: "system-paraphrase" }, createdAt: "2026-07-30T00:00:02.000Z" }
    ]));
    expect(timeline.entries).toMatchObject([
      { entryId: "m1", kind: "author-message", sourceRef: "session://session-demo#m1" },
      { entryId: "m2", kind: "system-message", sourceRef: "session://session-demo#m2" }
    ]);
    expect(timeline.activeEntryId).toBe("m2");
    expect(timeline.sourceMessageIds).toEqual(["m1", "m2"]);
    expect(timeline.fingerprint).toHaveLength(64);
  });

  it("marks task-result entries collapsed instead of presenting them as dialogue", () => {
    const timeline = buildCreativeTimelineProjection(baseSession([
      { id: "m1", clientMessageId: "c1", role: "task", text: "Task completed.", source: { kind: "task-result" }, createdAt: "2026-07-30T00:00:01.000Z" }
    ]));
    expect(timeline.entries[0]).toMatchObject({ kind: "task-result", collapsed: true });
  });

  it("projects durable execution work items as collapsed task cards", () => {
    const timeline = buildCreativeTimelineProjection(baseSession([]), [{ workItemId: "work-1", chapterId: "chapter-1", status: "running", createdAt: "2026-07-30T00:00:03.000Z" }]);
    expect(timeline.entries).toMatchObject([{ entryId: "work-1", kind: "task-progress", text: "chapter-1: running", collapsed: true, sourceRef: "work://work-1" }]);
    expect(timeline.taskIds).toEqual(["work-1"]);
  });

  it("projects review, adoption and recovery activities as distinct non-dialogue cards", () => {
    const timeline = buildCreativeTimelineProjection(baseSession([]), [], [
      { activityId: "review-1", kind: "review-card", text: "Review recommends adoption.", createdAt: "2026-07-30T00:00:01.000Z", sourceRef: "review://review-1" },
      { activityId: "adopt-1", kind: "adoption-event", text: "Candidate adopted.", createdAt: "2026-07-30T00:00:02.000Z", sourceRef: "adoption://adopt-1" },
      { activityId: "recovery-1", kind: "recovery-event", text: "Recovery settled.", createdAt: "2026-07-30T00:00:03.000Z", sourceRef: "recovery://recovery-1" }
    ]);
    expect(timeline.entries).toMatchObject([
      { entryId: "review-1", kind: "review-card", collapsed: false, sourceRef: "review://review-1" },
      { entryId: "adopt-1", kind: "adoption-event", collapsed: false },
      { entryId: "recovery-1", kind: "recovery-event", collapsed: false }
    ]);
    expect(timeline.activityIds).toEqual(["review-1", "adopt-1", "recovery-1"]);
  });

  it("projects a answered question decision as a traceable question event", () => {
    const timeline = buildCreativeTimelineProjection(baseSession([]), [], [{ activityId: "decision-q1", kind: "question-event", text: "Question answered: protect the bell", createdAt: "2026-07-30T00:00:04.000Z", sourceRef: "decision://decision-q1" }]);
    expect(timeline.entries).toMatchObject([{ entryId: "decision-q1", kind: "question-event", collapsed: false, sourceRef: "decision://decision-q1" }]);
  });
});
