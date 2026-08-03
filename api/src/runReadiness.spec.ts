import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertRunReadinessProof, createRunReadinessProof, persistRunReadinessProof, readRunReadinessProof } from "./runReadiness.js";

describe("run readiness proof", () => {
  it("blocks when startup evidence is incomplete and preserves explicit reasons", () => {
    const proof = createRunReadinessProof({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, scopeFingerprint: "a".repeat(64), frozenPublicationScope: true, storyContract: false, workGraph: true, contextManifest: false, budgetReservation: false });
    expect(proof).toMatchObject({ status: "blocked", blockedReasons: ["missing-storyContract", "missing-contextManifest", "missing-budgetReservation"] });
    expect(() => assertRunReadinessProof({ ...proof, status: "ready" })).toThrow("RUN_READINESS_INTEGRITY_FAILED");
  });

  it("persists and rejects tampered readiness evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "run-readiness-"));
    const proof = createRunReadinessProof({ bookRunId: "book-run-2", projectSlug: "demo", runVersion: 2, scopeFingerprint: "b".repeat(64), frozenPublicationScope: true, storyContract: true, workGraph: true, contextManifest: true, budgetReservation: true });
    await persistRunReadinessProof(root, proof);
    expect(await readRunReadinessProof(root, proof.proofId)).toMatchObject({ status: "ready", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const target = path.join(root, "sessions", "book-runs", `${proof.proofId}.readiness.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "blocked";
    await fs.writeFile(target, JSON.stringify(tampered));
    await expect(readRunReadinessProof(root, proof.proofId)).rejects.toThrow("RUN_READINESS_INTEGRITY_FAILED");
  });

  it("blocks when the publication dependency graph is blocked", () => {
    const proof = createRunReadinessProof({ bookRunId: "book-run-graph", projectSlug: "demo", runVersion: 1, scopeFingerprint: "c".repeat(64), frozenPublicationScope: true, storyContract: true, workGraph: true, contextManifest: true, budgetReservation: true, dependencyGraphStatus: "blocked" });
    expect(proof.status).toBe("blocked");
    expect(proof.blockedReasons).toContain("dependency-graph-blocked");
    expect(assertRunReadinessProof(proof).dependencyGraphStatus).toBe("blocked");
  });

  it("rejects a rehashed proof with an invalid evaluation timestamp", () => {
    const proof = createRunReadinessProof({ bookRunId: "book-run-time", projectSlug: "demo", runVersion: 1, scopeFingerprint: "d".repeat(64), frozenPublicationScope: true, storyContract: true, workGraph: true, contextManifest: true, budgetReservation: true });
    const { fingerprint: _fingerprint, ...base } = proof;
    const forgedBase = { ...base, evaluatedAt: "not-a-date" };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertRunReadinessProof(forged)).toThrow("RUN_READINESS_INTEGRITY_FAILED");
  });
});
