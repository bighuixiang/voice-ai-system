import type { RuntimeInterruption } from "./dialogueRuntime.js";

export function gateRuntimeResult(input: { interruption: RuntimeInterruption; resultText: string; nowMs?: number; interruptionMs?: number }): { status: "eligible" | "isolated"; submitted: boolean; reason?: "STOP_EFFECTIVE" | "CONSTRAINT_VIOLATION"; commentsDoNotCancel: boolean } {
  if (!input.resultText.trim()) throw new Error("RUNTIME_RESULT_REQUIRED");
  const stopEffective = input.interruption.kind === "stop" && input.interruption.lifecycle.includes("effective");
  const constraintViolation = input.interruption.kind === "constraint" && /导师.{0,4}(死|死亡)|mentor.{0,8}die/i.test(input.resultText);
  if (stopEffective) return { status: "isolated", submitted: false, reason: "STOP_EFFECTIVE", commentsDoNotCancel: false };
  if (constraintViolation) return { status: "isolated", submitted: false, reason: "CONSTRAINT_VIOLATION", commentsDoNotCancel: false };
  return { status: "eligible", submitted: true, commentsDoNotCancel: input.interruption.kind === "comment" };
}
