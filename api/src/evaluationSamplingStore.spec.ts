import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEvaluationSamplingPlan, summarizeEvaluationSampling } from "./evaluationSampling.js";
import { persistEvaluationSamplingPlan, persistEvaluationSamplingSummary, readEvaluationSamplingSummary } from "./evaluationSamplingStore.js";

describe("evaluation sampling store", () => {
  it("persists and replays immutable plans and summaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-sampling-store-"));
    const plan = createEvaluationSamplingPlan({ seeds: [1, 2, 3], temperature: 0.7, topP: 0.9, minSamples: 2, maxSamples: 3, stopRule: "fixed-count" });
    const summary = summarizeEvaluationSampling({ plan, outcomes: [{ valid: true, win: true, failed: false }, { valid: true, win: false, failed: false }] });
    await expect(persistEvaluationSamplingPlan(root, { planId: "plan-1", projectSlug: "demo", plan })).resolves.toMatchObject({ created: true });
    await expect(persistEvaluationSamplingSummary(root, { summaryId: "summary-1", projectSlug: "demo", planFingerprint: plan.fingerprint, summary })).resolves.toMatchObject({ created: true });
    await expect(readEvaluationSamplingSummary(root, "summary-1")).resolves.toMatchObject({ summary });
  });

  it("fails closed when a summary record is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-sampling-store-tamper-"));
    const plan = createEvaluationSamplingPlan({ seeds: [1, 2], temperature: 0.7, topP: 0.9, minSamples: 2, maxSamples: 2, stopRule: "fixed-count" });
    const summary = summarizeEvaluationSampling({ plan, outcomes: [{ valid: true, win: true, failed: false }, { valid: true, win: true, failed: false }] });
    await persistEvaluationSamplingSummary(root, { summaryId: "summary-tamper", projectSlug: "demo", planFingerprint: plan.fingerprint, summary });
    const target = path.join(root, "evaluations", "sampling", "summaries", "summary-tamper.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, any>;
    tampered.summary.winRate = 0;
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readEvaluationSamplingSummary(root, "summary-tamper")).rejects.toThrow("EVALUATION_SAMPLING_SUMMARY_INTEGRITY_FAILED");
  });
});
