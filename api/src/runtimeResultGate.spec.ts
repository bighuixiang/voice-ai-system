import { describe, expect, it } from "vitest";
import { classifyRuntimeInterruption } from "./dialogueRuntime.js";
import { gateRuntimeResult } from "./runtimeResultGate.js";

describe("runtime result gate", () => {
  it("isolates a late result after stop and keeps comments non-cancelling", () => {
    const stop = classifyRuntimeInterruption({ messageId: "stop-1", taskId: "task-1", text: "停止" });
    expect(gateRuntimeResult({ interruption: stop, resultText: "导师死亡版本" })).toMatchObject({ status: "isolated", submitted: false, reason: "STOP_EFFECTIVE" });
    const comment = classifyRuntimeInterruption({ messageId: "comment-1", taskId: "task-1", text: "这版气氛不错" });
    expect(gateRuntimeResult({ interruption: comment, resultText: "正常结果" })).toMatchObject({ status: "eligible", submitted: true, commentsDoNotCancel: true });
  });

  it("isolates output violating an effective constraint", () => {
    const constraint = { ...classifyRuntimeInterruption({ messageId: "c-1", taskId: "task-1", text: "导师不能死" }), lifecycle: ["received", "classified", "effective"] as Array<"received" | "classified" | "effective" | "queued" | "superseded"> };
    expect(gateRuntimeResult({ interruption: constraint, resultText: "导师死亡" })).toMatchObject({ status: "isolated", submitted: false, reason: "CONSTRAINT_VIOLATION" });
  });
});
