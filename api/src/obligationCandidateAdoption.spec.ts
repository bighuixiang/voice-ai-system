import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { adoptNarrativeObligationCandidate } from "./obligationCandidateAdoption.js";
import type { NarrativeObligationCandidate } from "./obligationCandidates.js";
import { createNarrativeObligation, listNarrativeObligations } from "./narrativeObligation.js";

const candidate: NarrativeObligationCandidate = { schemaVersion: "narrative-obligation-candidate.v1", candidateId: "obligation-candidate-1", markerId: "FS-demo-001", status: "candidate", chapterIds: ["chapter-001"], sourceRefs: ["scene://chapter-001#scene-1", "story-event://event-1"], existingObligationId: null, fingerprint: "candidate-fingerprint-1" };

describe("narrative obligation candidate adoption", () => {
  it("fails closed without author authorization or traceable evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-adoption-"));
    await expect(adoptNarrativeObligationCandidate(root, { projectSlug: "demo", candidate, title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "", expectedCandidateFingerprint: candidate.fingerprint, evidenceRefs: [] })).rejects.toThrow("OBLIGATION_CANDIDATE_AUTHORIZATION_REQUIRED");
    await expect(adoptNarrativeObligationCandidate(root, { projectSlug: "demo", candidate, title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "author-1", expectedCandidateFingerprint: candidate.fingerprint, evidenceRefs: ["not-traceable"] })).rejects.toThrow("OBLIGATION_CANDIDATE_EVIDENCE_REQUIRED");
  });

  it("creates one proposed obligation with all source refs and is idempotent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-adoption-valid-"));
    const input = { projectSlug: "demo", candidate, title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "author-1", expectedCandidateFingerprint: candidate.fingerprint, evidenceRefs: ["decision://author/1"] };
    const first = await adoptNarrativeObligationCandidate(root, input);
    expect(first.created).toBe(true);
    expect(first.obligation).toMatchObject({ status: "proposed", sourceRefs: candidate.sourceRefs });
    const second = await adoptNarrativeObligationCandidate(root, input);
    expect(second).toMatchObject({ created: false, obligation: { obligationId: first.obligation.obligationId, status: "proposed" } });
    await expect(adoptNarrativeObligationCandidate(root, { ...input, expectedCandidateFingerprint: "stale-fingerprint" })).rejects.toThrow("OBLIGATION_CANDIDATE_STALE");
  });

  it("reuses the preview's existing obligation without creating a duplicate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-adoption-existing-"));
    const existing = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Existing gate", questionOrPromise: "Who sealed it?", sourceRefs: ["scene://chapter-001#scene-1"] });
    const candidateWithExisting = { ...candidate, candidateId: "obligation-candidate-existing", existingObligationId: existing.obligationId, fingerprint: "candidate-fingerprint-existing" };
    const result = await adoptNarrativeObligationCandidate(root, { projectSlug: "demo", candidate: candidateWithExisting, title: "Duplicate gate", questionOrPromise: "Should not be created", authorizationId: "author-1", expectedCandidateFingerprint: candidateWithExisting.fingerprint, evidenceRefs: ["decision://author/1"] });
    expect(result).toMatchObject({ created: false, obligation: { obligationId: existing.obligationId } });
    expect(await listNarrativeObligations(root)).toHaveLength(1);
  });

  it("blocks an existing-obligation pointer when the referenced obligation is orphaned", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-adoption-orphan-"));
    const candidateWithOrphan = { ...candidate, candidateId: "obligation-candidate-orphan", existingObligationId: "obligation-missing", fingerprint: "candidate-fingerprint-orphan" };
    await expect(adoptNarrativeObligationCandidate(root, { projectSlug: "demo", candidate: candidateWithOrphan, title: "Gate", questionOrPromise: "Who sealed it?", authorizationId: "author-1", expectedCandidateFingerprint: candidateWithOrphan.fingerprint, evidenceRefs: ["decision://author/1"] })).rejects.toThrow("OBLIGATION_CANDIDATE_EXISTING_ORPHANED");
    expect(await listNarrativeObligations(root)).toHaveLength(0);
  });
});
