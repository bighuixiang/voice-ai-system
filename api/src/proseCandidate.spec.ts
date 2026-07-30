import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeContextManifest } from "./contextManifest.js";
import { appendAuthorMessage } from "./creativeSession.js";
import { createProseCandidate, proseCandidateId, validateProseCandidate } from "./proseCandidate.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-candidate-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A quiet opening with a locked promise." });
  await freezeContextManifest(root, "demo");
  return root;
}

describe("prose candidate isolation", () => {
  it("persists generated prose outside canon and validates its context fingerprint", async () => {
    const root = await fixture();
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "A candidate scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
    expect(candidate.status).toBe("generated");
    expect(await fs.stat(path.join(root, "sessions", "prose-candidates", `${candidate.candidateId}.json`))).toBeTruthy();
    await expect(fs.stat(path.join(root, "chapters", "c1.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await validateProseCandidate(root, candidate)).status).toBe("passed");
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
});
