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
    expect(projection.progress).toEqual({ completed: 0, total: 10, current: 1 });
    expect(projection.nextInstruction).toBe("请先用自己的话描述想创作的故事。");
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
    expect(projection.progress).toEqual({ completed: 0, total: 10, current: 1 });
    expect(projection.nextInstruction).toBe("请确认原始输入并生成第一个关键问题。");
    expect(assessJourneyFreshness(projection, { sourceFingerprint: "different", projectionVersion: projection.projectionVersion })).toMatchObject({ freshness: "conflicted", primaryAction: "reconcile" });
  });

  it("projects the authoritative active question and converges after its decision is recorded", () => {
    const input = session([{
      id: "message-2", clientMessageId: "client-2", role: "author", text: "A keeper hears a bell beneath the tide.", source: { kind: "author" }, createdAt: "2026-07-30T00:01:00.000Z"
    }]);
    const active = buildCreativeJourneyProjection(input, { activeQuestion: { questionId: "question-core-conflict", text: "What threatens the keeper?", impact: "high", source: "deterministic-gap" } });
    expect(active.activeQuestion).toMatchObject({ id: "question-core-conflict", status: "active", text: "What threatens the keeper?" });
    const answered = buildCreativeJourneyProjection(input, { answeredQuestionIds: ["question-primary-desire"] });
    expect(answered.activeQuestion).toBeUndefined();
    expect(answered.progress).toEqual({ completed: 1, total: 10, current: 2 });
    expect(answered.nextInstruction).toBe("请继续确认下一个关键问题。");
    expect(answered.fingerprint).not.toBe(active.fingerprint);
  });

  it("preserves the medium impact of the ninth authoritative question", () => {
    const projection = buildCreativeJourneyProjection(session([{
      id: "message-3", clientMessageId: "client-3", role: "author", text: "A city waits below the sea.", source: { kind: "author" }, createdAt: "2026-07-30T00:01:00.000Z"
    }]), { activeQuestion: { questionId: "question-reader-promise", text: "开头向读者承诺怎样的体验或答案？", impact: "medium", source: "deterministic-gap" } });

    expect(projection.activeQuestion).toMatchObject({ id: "question-reader-promise", impact: "medium", status: "active" });
  });

  it("moves the completed sequence into a persisted review or outline-ready stage", () => {
    const input = session([{ id: "message-4", clientMessageId: "client-4", role: "author", text: "A keeper must choose.", source: { kind: "author" }, createdAt: "2026-07-30T00:01:00.000Z" }]);
    const questionIds = ["question-primary-desire", "question-core-conflict", "question-failure-cost", "question-inner-need", "question-misbelief", "question-world-rule", "question-opposing-pressure", "question-irreversible-choice", "question-reader-promise", "question-ending-direction"];

    expect(buildCreativeJourneyProjection(input, { answeredQuestionIds: questionIds })).toMatchObject({ stage: "blueprint-review", primaryAction: { id: "review-understanding", kind: "review" }, progress: { completed: 10, total: 10, current: 10 } });
    expect(buildCreativeJourneyProjection(input, { answeredQuestionIds: questionIds, blueprintConfirmed: true })).toMatchObject({ stage: "ready-for-outline", primaryAction: { id: "generate-outline", kind: "continue" } });
    expect(buildCreativeJourneyProjection(input, { answeredQuestionIds: questionIds, blueprintConfirmed: true, blueprintNeedsRefresh: true })).toMatchObject({ stage: "blueprint-review", blueprintNeedsRefresh: true, nextInstruction: "你刚补充了创作想法，请先修改或重新生成故事蓝图并再次确认。" });
  });
});
