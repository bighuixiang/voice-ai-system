import { describe, expect, it } from "vitest";
import { receiveRunDirection, classifyRunDirection } from "./runDirection.js";

describe("run direction causal events", () => {
  it("classifies and records a direction as received before claiming effect", () => {
    const event = receiveRunDirection({ runId: "run-1", workItemId: "w-1", authorText: "让下一章更紧张", phase: "model-call", targetObjectiveVersion: 3 });
    expect(event).toMatchObject({ status: "received", effectiveBoundary: "next-boundary", runId: "run-1", targetObjectiveVersion: 3 });
    expect(event.authorText).toBe("让下一章更紧张");
  });

  it("applies immediately only when no active call can conflict", () => {
    const event = receiveRunDirection({ runId: "run-1", workItemId: "w-1", authorText: "暂停", phase: "idle", targetObjectiveVersion: 1 });
    expect(event).toMatchObject({ status: "classified", effectiveBoundary: "now", classification: "pause" });
  });

  it("requires replan for a settled-scope change", () => {
    const event = receiveRunDirection({ runId: "run-1", workItemId: "w-1", authorText: "改掉核心结局", phase: "settled", targetObjectiveVersion: 4 });
    expect(event).toMatchObject({ status: "classified", effectiveBoundary: "replan", classification: "scope-change" });
  });

  it("rejects empty direction and exposes deterministic classification", () => {
    expect(() => receiveRunDirection({ runId: "run-1", workItemId: "w-1", authorText: " ", phase: "idle", targetObjectiveVersion: 1 })).toThrow("DIRECTION_TEXT_REQUIRED");
    expect(classifyRunDirection("请暂停当前工作")).toBe("pause");
  });
});
