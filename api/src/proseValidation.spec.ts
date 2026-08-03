import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { assertProseValidationBundleIntegrity, readProseValidationBundle, validateAndPersistProseCandidate } from "./proseValidation.js";
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-validation-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new candidate", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  return { root, candidate };
}

describe("prose validation bundle", () => {
  it("persists an independent deterministic validation bundle", async () => {
    const { root, candidate } = await fixture();
    const bundle = await validateAndPersistProseCandidate(root, candidate);
    expect(bundle).toMatchObject({ status: "passed", reviewer: { kind: "independent-deterministic", id: "prose-validation-v1" }, hardFailures: [] });
    await expect(fs.stat(path.join(root, "sessions", "prose-validations", `${candidate.candidateId}.json`))).resolves.toBeTruthy();
  });

  it("blocks when the context used by the candidate is stale", async () => {
    const { root, candidate } = await fixture();
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m2", text: "Changed author context." });
    await freezeContextManifest(root, "demo");
    const bundle = await validateAndPersistProseCandidate(root, candidate);
    expect(bundle.status).toBe("blocked");
    expect(bundle.hardFailures).toContain("context-current");
  });

  it("blocks text that cannot pass the versioned round-trip profile", async () => {
    const { root, candidate } = await fixture();
    const invalid = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c2", content: "bad\u0000text", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
    const bundle = await validateAndPersistProseCandidate(root, invalid);
    expect(bundle.status).toBe("blocked");
    expect(bundle.hardFailures).toContain("text-round-trip");
  });

  it("blocks a candidate when configured anti-goal evidence matches", async () => {
    const { root, candidate } = await fixture();
    const flagged = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c3", content: "The narrator explained the mystery.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-3" });
    const bundle = await validateAndPersistProseCandidate(root, flagged, { antiGoals: [{ antiGoal: "exposition", evidence: "author://anti-1", patterns: ["explained the mystery"] }], repairScope: ["sentence"] });
    expect(bundle.status).toBe("blocked");
    expect(bundle.hardFailures).toContain("anti-goal-guard");
  });

  it("blocks an adopted-path candidate after its chapter-intent manifest is superseded", async () => {
    const { root } = await fixture();
    const base = { decisionConsumptionReceiptRef: "receipt:prose-validation", storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] };
    const first = createProseGenerationManifest({ ...base, manifestId: "manifest-validation-1" });
    await persistProseGenerationManifest(root, first);
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new candidate", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-validation", generationManifestId: first.manifestId });
    await persistProseGenerationManifest(root, createProseGenerationManifest({ ...base, manifestId: "manifest-validation-2", latestAuthorDirection: "change the POV cost" }));
    const bundle = await validateAndPersistProseCandidate(root, candidate);
    expect(bundle.status).toBe("blocked");
    expect(bundle.hardFailures).toContain("generation-manifest-current");
  });

  it("fails closed when a persisted validation bundle is tampered", async () => {
    const { root, candidate } = await fixture();
    const bundle = await validateAndPersistProseCandidate(root, candidate);
    const target = path.join(root, "sessions", "prose-validations", `${candidate.candidateId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.status = "blocked";
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    expect(bundle.status).toBe("passed");
    await expect(readProseValidationBundle(root, candidate.candidateId)).rejects.toThrow("PROSE_VALIDATION_INTEGRITY_FAILED");
  });
  it("rejects a re-signed bundle whose status disagrees with failed checks", async () => { const { root, candidate } = await fixture("A clean scene."); const bundle = await validateAndPersistProseCandidate(root, candidate); const { fingerprint: _fingerprint, ...base } = bundle; const invalidBase = { ...base, status: "blocked", hardFailures: [] }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertProseValidationBundleIntegrity(invalid as typeof bundle)).toThrow("PROSE_VALIDATION_INTEGRITY_FAILED"); });
});
