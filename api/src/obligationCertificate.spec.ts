import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertObligationCoverageCertificateCurrent, invalidateObligationCoverageCertificate, issueObligationCoverageCertificate } from "./obligationCertificate.js";
import { appendObligationEvent, createNarrativeObligation } from "./narrativeObligation.js";

const scene = { id: "scene-1", chapterId: "chapter-001", order: 1, title: "Gate", time: "", location: "", pov: "", characters: [], conflict: "", turn: "", informationReleased: [], foreshadowingIds: ["FS-demo-001"], powerProgression: "", updatedAt: new Date().toISOString() };

describe("obligation coverage certificate", () => {
  it("blocks a frozen scope with an orphan planned marker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-cert-blocked-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([scene]));
    await expect(issueObligationCoverageCertificate(root, ["chapter-001"], "publication-fingerprint-1")).rejects.toThrow("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
  });

  it("issues only after every admitted obligation reaches a replayable terminal event", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-cert-issued-"));
    await fs.mkdir(path.join(root, "scenes"), { recursive: true });
    await fs.writeFile(path.join(root, "scenes", "chapter-001.json"), JSON.stringify([scene]));
    const obligation = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?", sourceRefs: ["FS-demo-001"] });
    await appendObligationEvent(root, obligation.obligationId, { toStatus: "confirmed", reason: "Author admitted marker", actor: "author", expectedVersion: 0 });
    await appendObligationEvent(root, obligation.obligationId, { toStatus: "planned", reason: "Window selected", actor: "system", expectedVersion: 1 });
    await appendObligationEvent(root, obligation.obligationId, { toStatus: "setup", reason: "Setup anchored", actor: "system", expectedVersion: 2 });
    await appendObligationEvent(root, obligation.obligationId, { toStatus: "paid", reason: "Payoff anchored", actor: "author", expectedVersion: 3, evidenceRefs: ["chapter://chapter-001#paragraph-2"] });
    const certificate = await issueObligationCoverageCertificate(root, ["chapter-001"], "publication-fingerprint-1");
    expect(certificate).toMatchObject({ schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "publication-fingerprint-1", obligationCount: 1 });
    expect(JSON.parse(await fs.readFile(path.join(root, "sessions", "obligations", "coverage-certificate.json"), "utf8"))).toMatchObject({ status: "issued" });
    await expect(assertObligationCoverageCertificateCurrent(root, "publication-fingerprint-1")).resolves.toMatchObject({ valid: true });
    const certificatePath = path.join(root, "sessions", "obligations", "coverage-certificate.json");
    const tampered = JSON.parse(await fs.readFile(certificatePath, "utf8")) as Record<string, unknown>;
    tampered.obligationCount = 99;
    await fs.writeFile(certificatePath, JSON.stringify(tampered), "utf8");
    await expect(assertObligationCoverageCertificateCurrent(root, "publication-fingerprint-1")).rejects.toThrow("OBLIGATION_COVERAGE_CERTIFICATE_STALE");
    await expect(assertObligationCoverageCertificateCurrent(root, "publication-fingerprint-2")).rejects.toThrow("OBLIGATION_COVERAGE_CERTIFICATE_STALE");
    const invalidation = await invalidateObligationCoverageCertificate(root, "publication-fingerprint-2");
    expect(invalidation).toMatchObject({ status: "stale", previousSourceFingerprint: "publication-fingerprint-1", currentSourceFingerprint: "publication-fingerprint-2" });
    expect(JSON.parse(await fs.readFile(path.join(root, "sessions", "obligations", "coverage-certificate.invalidation.json"), "utf8"))).toMatchObject({ status: "stale" });
  });
});
