import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateMultiScaleRegression } from "./evaluationSampling.js";
import { persistEvaluationRegression, readEvaluationRegression } from "./evaluationRegressionStore.js";

describe("evaluation regression store", () => {
  it("persists and replays an immutable multi-scale result", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-regression-store-"));
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.7, book: 0.8 }, candidate: { selection: 0.8, book: 0.8 }, hardFailures: [] });
    await expect(persistEvaluationRegression(root, { regressionId: "regression-1", projectSlug: "demo", result })).resolves.toMatchObject({ created: true });
    await expect(readEvaluationRegression(root, "regression-1")).resolves.toMatchObject({ result });
  });

  it("fails closed when a regression result is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-regression-store-tamper-"));
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.7 }, candidate: { selection: 0.8 }, hardFailures: [] });
    await persistEvaluationRegression(root, { regressionId: "regression-tamper", projectSlug: "demo", result });
    const target = path.join(root, "evaluations", "regressions", "regression-tamper.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, any>;
    tampered.result.status = "regression";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readEvaluationRegression(root, "regression-tamper")).rejects.toThrow("MULTI_SCALE_REGRESSION_INTEGRITY_FAILED");
  });
});
