import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeContextManifest } from "./contextManifest.js";
import { appendAuthorMessage } from "./creativeSession.js";
import { createProseCandidate, proseCandidateId, readProseCandidate, validateProseCandidate } from "./proseCandidate.js";
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-candidate-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A quiet opening with a locked promise." });
  await freezeContextManifest(root, "demo");
  return root;
}

describe("prose candidate isolation", () => {
  it("binds a candidate to an already frozen rich generation manifest", async () => {
    const root = await fixture();
    const manifest = createProseGenerationManifest({ manifestId: "manifest-candidate-1", decisionConsumptionReceiptRef: "receipt:prose-1", storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] });
    await persistProseGenerationManifest(root, manifest);
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-rich", generationManifestId: manifest.manifestId });
    expect(candidate.generation).toMatchObject({ manifestId: manifest.manifestId, manifestFingerprint: manifest.fingerprint, decisionConsumptionReceiptRef: manifest.decisionConsumptionReceiptRef });
  });

  it("fails closed when a requested generation manifest is not frozen", async () => {
    const root = await fixture();
    await expect(createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-missing", generationManifestId: "missing-manifest" })).rejects.toThrow("PROSE_GENERATION_MANIFEST_REQUIRED");
  });

  it("blocks a bound candidate when its frozen generation manifest disappears", async () => {
    const root = await fixture();
    const manifest = createProseGenerationManifest({ manifestId: "manifest-candidate-stale", decisionConsumptionReceiptRef: "receipt:prose-stale", storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] });
    await persistProseGenerationManifest(root, manifest);
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-stale", generationManifestId: manifest.manifestId });
    await fs.rm(path.join(root, "sessions", "prose-generation-manifests", `${manifest.manifestId}.json`));
    const validation = await validateProseCandidate(root, candidate);
    expect(validation.status).toBe("blocked");
    expect(validation.reasons).toContain("GENERATION_MANIFEST_REQUIRED");
  });

  it("marks an older candidate stale when the chapter intent receives a newer manifest", async () => {
    const root = await fixture();
    const base = { decisionConsumptionReceiptRef: "receipt:prose-current", storyContractRef: "contract:v1", outlineVersion: "outline:v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] };
    const first = createProseGenerationManifest({ ...base, manifestId: "manifest-current-1" });
    await persistProseGenerationManifest(root, first);
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-current", generationManifestId: first.manifestId });
    const second = createProseGenerationManifest({ ...base, manifestId: "manifest-current-2", latestAuthorDirection: "change the POV cost" });
    await persistProseGenerationManifest(root, second);
    const validation = await validateProseCandidate(root, candidate);
    expect(validation.status).toBe("blocked");
    expect(validation.reasons).toContain("GENERATION_MANIFEST_STALE");
  });

  it("persists generated prose outside canon and validates its context fingerprint", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
    expect(candidate.status).toBe("generated");
    expect(await fs.stat(path.join(root, "sessions", "prose-candidates", `${candidate.candidateId}.json`))).toBeTruthy();
    await expect(fs.stat(path.join(root, "chapters", "c1.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await validateProseCandidate(root, candidate)).status).toBe("passed");
  });

  it("freezes the drafting policy identity on an in-flight candidate", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-policy", policyVersion: "tiered-quality.v1", riskTier: "key" });
    expect(candidate).toMatchObject({ policyVersion: "tiered-quality.v1", riskTier: "key" });
    expect((await readProseCandidate(root, candidate.candidateId))?.riskTier).toBe("key");
  });

  it("does not reuse a candidate under a different policy tier", async () => {
    const root = await fixture();
    await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-conflict", policyVersion: "tiered-quality.v1", riskTier: "ordinary" });
    await expect(createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-conflict", policyVersion: "tiered-quality.v1", riskTier: "key" })).rejects.toThrow("PROSE_CANDIDATE_POLICY_CONFLICT");
  });

  it("blocks a candidate when the context manifest changes", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m2", text: "A changed opening." });
    await freezeContextManifest(root, "demo");
    const validation = await validateProseCandidate(root, candidate);
    expect(validation.status).toBe("blocked");
    expect(validation.reasons).toContain("CONTEXT_MANIFEST_STALE");
    expect(proseCandidateId("c1", "source-1")).toBe(candidate.candidateId);
  });

  it("sanitizes candidate ids for Windows-safe durable paths", () => {
    const candidateId = proseCandidateId("chapter:001", "outline-worker:proof:context");
    expect(candidateId).toMatch(/^prose-chapter-001-outline-worker-p/);
    expect(candidateId).not.toContain(":");
  });

  it("fails closed when the durable candidate is tampered", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-tamper" });
    const target = path.join(root, "sessions", "prose-candidates", `${candidate.candidateId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.content = "tampered canon candidate";
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    await expect(readProseCandidate(root, candidate.candidateId)).rejects.toThrow("PROSE_CANDIDATE_INTEGRITY_FAILED");
  });

  it("fails closed when a rehashed durable candidate has an unsupported lifecycle status", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-status" });
    const target = path.join(root, "sessions", "prose-candidates", `${candidate.candidateId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown> & { fingerprint: string };
    persisted.status = "published";
    const { fingerprint: _fingerprint, ...base } = persisted;
    persisted.fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    await expect(readProseCandidate(root, candidate.candidateId)).rejects.toThrow("PROSE_CANDIDATE_INTEGRITY_FAILED");
  });
});
