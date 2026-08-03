import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEvidenceAnchoredEvaluation } from "./evidenceAnchoredEvaluation.js";
import { persistEvidenceAnchoredEvaluation, readEvidenceAnchoredEvaluation } from "./evaluationEvidenceStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("evaluation evidence anchor store", () => {
  it("persists and replays an immutable anchored evaluation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-evidence-store-")); roots.push(root);
    const evaluation = createEvidenceAnchoredEvaluation({ evaluationId: "eval-store-1", content: "The door opened.", anchors: [{ start: 0, end: 8 }], contractFingerprint: "contract-v1", chapterIntentFingerprint: "intent-v1", reason: "The opening action is explicit." });
    await expect(persistEvidenceAnchoredEvaluation(root, evaluation)).resolves.toMatchObject({ created: true, evaluation });
    await expect(readEvidenceAnchoredEvaluation(root, evaluation.evaluationId)).resolves.toEqual(evaluation);
    await expect(persistEvidenceAnchoredEvaluation(root, evaluation)).resolves.toMatchObject({ created: false });
  });

  it("fails closed when a persisted anchored evaluation is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-evidence-store-")); roots.push(root);
    const evaluation = createEvidenceAnchoredEvaluation({ evaluationId: "eval-store-tampered", content: "The door opened.", anchors: [{ start: 0, end: 8 }], contractFingerprint: "contract-v1", chapterIntentFingerprint: "intent-v1", reason: "The opening action is explicit." });
    await persistEvidenceAnchoredEvaluation(root, evaluation);
    const target = path.join(root, "evaluations", "evidence-anchors", `${evaluation.evaluationId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.reason = "forged";
    await fs.writeFile(target, JSON.stringify(tampered));
    await expect(readEvidenceAnchoredEvaluation(root, evaluation.evaluationId)).rejects.toThrow("EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  });
});
