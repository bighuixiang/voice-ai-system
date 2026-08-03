import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { adoptProseCandidate } from "./proseAdoption.js";
import { assertAuthorFeedbackIntegrity, readAuthorFeedbackEvent, recordAuthorFeedback } from "./authorFeedback.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "author-feedback-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.writeFile(path.join(root, "chapters", "c1.md"), "old\n", "utf8");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const transaction = await adoptProseCandidate({ root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: crypto.createHash("sha256").update("old\n").digest("hex"), authorizationId: "author-1" });
  return { root, candidate, transaction };
}

describe("author feedback events", () => {
  it("records an immutable feedback event only after adoption and is idempotent", async () => {
    const { root, candidate, transaction } = await fixture();
    const input = { root, projectSlug: "demo", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "needs_revision" as const, note: "Keep the tension but sharpen the turn." };
    const first = await recordAuthorFeedback(input);
    expect(first).toMatchObject({ decision: "needs_revision", candidateId: candidate.candidateId });
    expect(await recordAuthorFeedback(input)).toEqual(first);
    expect(await readAuthorFeedbackEvent(root, first.eventId)).toEqual(first);
  });

  it("fails closed when a persisted feedback event has an invalid decision despite a valid hash", async () => {
    const { root, candidate, transaction } = await fixture();
    const event = await recordAuthorFeedback({ root, projectSlug: "demo", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "needs_revision", note: "Keep the tension." });
    const target = path.join(root, "sessions", "author-feedback", `${event.eventId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.decision = "accepted-but-unverified";
    delete tampered.fingerprint;
    await fs.writeFile(target, JSON.stringify({ ...tampered, fingerprint: crypto.createHash("sha256").update(JSON.stringify(tampered)).digest("hex") }), "utf8");
    await expect(readAuthorFeedbackEvent(root, event.eventId)).rejects.toThrow("AUTHOR_FEEDBACK_INTEGRITY_FAILED");
    await expect(recordAuthorFeedback({ root, projectSlug: "demo", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "needs_revision", note: "Keep the tension." })).rejects.toThrow("AUTHOR_FEEDBACK_INTEGRITY_FAILED");
  });

  it("does not let feedback cross the candidate project boundary", async () => {
    const { root, candidate, transaction } = await fixture();
    await expect(recordAuthorFeedback({ root, projectSlug: "other-project", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "accepted", note: "cross-project" })).rejects.toThrow("AUTHOR_FEEDBACK_PROJECT_MISMATCH");
  });
  it("supports direct audit of feedback integrity", async () => { const { root, candidate, transaction } = await fixture(); const event = await recordAuthorFeedback({ root, projectSlug: "demo", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "accepted", note: "Good." }); expect(assertAuthorFeedbackIntegrity(event, event.eventId)).toEqual(event); });
  it("records reason_unknown instead of inventing a rejection rationale", async () => { const { root, candidate, transaction } = await fixture(); const event = await recordAuthorFeedback({ root, projectSlug: "demo", candidateId: candidate.candidateId, adoptionTransactionId: transaction.transactionId, decision: "rejected" }); expect(event).toMatchObject({ decision: "rejected", reasonCode: "reason_unknown", note: "" }); });
});
