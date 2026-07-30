import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { validateAndPersistProseCandidate } from "./proseValidation.js";

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
});
