import { describe, expect, it } from "vitest";
import { advanceRuntimeInterruption, classifyRuntimeInterruption, reconcileDialogueSession } from "./dialogueRuntime.js";

describe("dialogue runtime interruptions and recovery", () => {
  it("immediately gates stop and high-impact correction messages", () => {
    const result = classifyRuntimeInterruption({ messageId: "m-1", text: "Stop, the protagonist is wrong", taskId: "task-1" });
    expect(result.kind).toBe("stop");
    expect(result.effect).toBe("gate-now");
    expect(result.lifecycle).toEqual(["received", "classified", "effective"]);
  });

  it("queues ordinary direction with explicit causal states", () => {
    const result = classifyRuntimeInterruption({ messageId: "m-2", text: "Use a colder tone next", taskId: "task-1" });
    expect(result.lifecycle).toEqual(["received", "classified", "queued"]);
  });

  it("reconciles session recovery from authoritative cursor and exposes conflicts", () => {
    const result = reconcileDialogueSession({ serverCursor: 10, localCursor: 8, authoritativeEvents: ["question-answered", "task-running"], activeQuestionId: "q-1", localDraftMessageId: "draft-1" });
    expect(result.source).toBe("server-authoritative");
    expect(result.conflicts).toContain("local-draft-ahead-of-server");
    expect(result.activeQuestionId).toBe("q-1");
  });

  it("validates causal lifecycle transitions and records supersession", () => {
    const queued = classifyRuntimeInterruption({ messageId: "m-3", text: "Use a colder tone", taskId: "task-1" });
    expect(advanceRuntimeInterruption(queued, "effective", "task-started").lifecycle).toEqual(["received", "classified", "queued", "effective"]);
    expect(advanceRuntimeInterruption(queued, "superseded", "newer-direction").lifecycle).toEqual(["received", "classified", "queued", "superseded"]);
    expect(() => advanceRuntimeInterruption(queued, "superseded", "")).toThrow("RUNTIME_TRANSITION_REASON_REQUIRED");
  });
});
