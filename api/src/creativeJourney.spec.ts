import { describe, expect, it } from "vitest";
import { assessJourneyFreshness, buildCreativeJourneyProjection } from "./creativeJourney.js";
import type { CreativeSession } from "./creativeSession.js";

function session(messages: CreativeSession["messages"]): CreativeSession {
  return {
    schemaVersion: "creative-session.v1",
    sessionId: "session-demo",
    projectSlug: "demo",
    status: "capturing",
    messages,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

describe("creative journey projection", () => {
  it("exposes one capture action before the author has supplied an idea", () => {
    const projection = buildCreativeJourneyProjection(session([]));

    expect(projection.stage).toBe("capture");
    expect(projection.primaryAction).toMatchObject({ id: "capture-idea", kind: "capture", status: "available" });
    expect(projection.activeQuestion).toBeUndefined();
    expect(projection.primaryAsset).toBe("creative-session");
    expect(projection).toMatchObject({ freshness: "current", projectionVersion: expect.any(String), sourceFingerprint: expect.any(String) });
  });

  it("exposes the understanding question as the only blocking action after input", () => {
    const projection = buildCreativeJourneyProjection(session([
      {
        id: "message-1",
        clientMessageId: "client-1",
        role: "author",
        text: "一个失去记忆的守门人想找回自己的名字。",
        source: { kind: "author" },
        createdAt: "2026-07-30T00:01:00.000Z"
      }
    ]));

    expect(projection.stage).toBe("understanding");
    expect(projection.primaryAction).toMatchObject({ id: "review-understanding", kind: "review", status: "available" });
    expect(projection.activeQuestion).toMatchObject({ id: "question-primary-desire", status: "candidate" });
    expect(projection.sourceMessageIds).toEqual(["message-1"]);
    expect(projection.unsavedState).toMatchObject({ hasDraft: false });
    expect(assessJourneyFreshness(projection, { sourceFingerprint: "different", projectionVersion: projection.projectionVersion })).toMatchObject({ freshness: "conflicted", primaryAction: "reconcile" });
  });

  it("projects the authoritative active question and converges after its decision is recorded", () => {
    const input = session([{
      id: "message-2", clientMessageId: "client-2", role: "author", text: "A keeper hears a bell beneath the tide.", source: { kind: "author" }, createdAt: "2026-07-30T00:01:00.000Z"
    }]);
    const active = buildCreativeJourneyProjection(input, { activeQuestion: { questionId: "question-core-conflict", text: "What threatens the keeper?", source: "deterministic-gap" } });
    expect(active.activeQuestion).toMatchObject({ id: "question-core-conflict", status: "active", text: "What threatens the keeper?" });
    const answered = buildCreativeJourneyProjection(input, { answeredQuestionIds: ["question-primary-desire"] });
    expect(answered.activeQuestion).toBeUndefined();
    expect(answered.fingerprint).not.toBe(active.fingerprint);
  });
});
