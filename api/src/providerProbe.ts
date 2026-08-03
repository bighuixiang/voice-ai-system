import crypto from "node:crypto";
import type { AgentRunConfig, ProcessRunner, ProcessRunOptions } from "./codexRunner.js";
import { appendModelInvocation, createModelInvocationRecord, type ModelInvocationRecord } from "./modelInvocationLedger.js";

export interface ProviderProbeResult {
  output: { finalMessage: string; stdout: string; stderr: string; exitCode: number | null; durationMs: number; timedOut?: boolean; cancelled?: boolean };
  record: ModelInvocationRecord;
}

export async function runProviderProbe(input: {
  root: string;
  projectRoot: string;
  config: AgentRunConfig;
  prompt: string;
  taskId: string;
  taskFingerprint: string;
  contextManifestRef: string;
  promptSchemaVersion: string;
  routeDecision: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  currency?: string;
  runner: ProcessRunner;
  options?: ProcessRunOptions;
}): Promise<ProviderProbeResult> {
  if (!input.prompt.trim() || !input.taskId.trim() || !input.taskFingerprint.trim()) throw new Error("PROVIDER_PROBE_INPUT_REQUIRED");
  if (![input.estimatedInputTokens, input.estimatedOutputTokens, input.estimatedCost].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("PROVIDER_PROBE_ESTIMATE_INVALID");
  const invocationId = `provider-probe-${crypto.randomUUID()}`;
  const attemptId = `attempt-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const output = await input.runner.run(input.prompt, input.projectRoot, input.config, input.options);
  const finishedAt = new Date().toISOString();
  const status = output.cancelled ? "cancelled" as const : output.timedOut ? "timed-out" as const : output.exitCode === 0 ? "completed" as const : "failed" as const;
  const record = createModelInvocationRecord({
    invocationId,
    taskId: input.taskId,
    taskFingerprint: input.taskFingerprint,
    attemptId,
    routeDecision: input.routeDecision,
    modelCapabilityRef: `provider://${input.config.provider}/${input.config.label}/${input.config.model || "default"}`,
    contextManifestRef: input.contextManifestRef,
    promptSchemaVersion: input.promptSchemaVersion,
    startedAt,
    finishedAt,
    status,
    usage: { inputTokens: input.estimatedInputTokens, outputTokens: input.estimatedOutputTokens, cachedTokens: 0, measurement: "estimated" },
    cost: { amount: input.estimatedCost, currency: input.currency || "USD", measurement: "estimated", estimateMethod: "provider-probe-input-estimate" },
    cache: { hit: false },
    ...(status === "failed" || status === "cancelled" || status === "timed-out" ? { failure: { code: status === "timed-out" ? "PROVIDER_TIMEOUT" : status === "cancelled" ? "PROVIDER_CANCELLED" : "PROVIDER_EXIT_NONZERO", retryClass: status === "failed" ? "transient" as const : "non-retryable" as const, message: output.stderr || `provider exited with ${String(output.exitCode)}` } } : {}),
    adoptionDecision: "probe-only"
  });
  await appendModelInvocation(input.root, record);
  return { output, record };
}
