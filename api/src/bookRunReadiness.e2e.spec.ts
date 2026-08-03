import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import crypto from "node:crypto";
import { issueClosureCertificate } from "./closureCertificate.js";
import { issueQuiescenceProof } from "./quiescenceProof.js";
import { persistBudgetReservation, readBudgetReservation, releaseBudgetReservation } from "./budgetReservation.js";
import { cancelExecutionWorkItem, finishExecutionWorkItem, listExecutionWorkItems } from "./executionQueue.js";

let server: http.Server;
let baseUrl = "";
let root = "";
const hex = "a".repeat(64);
async function json<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> { const response = await fetch(`${baseUrl}${url}`, init); return { status: response.status, data: (await response.json()) as T }; }
async function writeJson(file: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(value)}\n`, "utf8"); }
describe("BookRun readiness dependency closure", () => {
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-ready-e2e-")); process.env.NOVELS_ROOT = root; process.env.PLATFORM_ROOT = path.join(root, "platform"); process.env.NOVEL_DATA_ROOT = path.join(root, "data"); process.env.NOVEL_DB_PATH = path.join(root, "data", "creative.sqlite"); await new Promise<void>((resolve) => { server = createApp().listen(0, "127.0.0.1", resolve); }); const address = server.address(); if (!address || typeof address === "string") throw new Error("server address unavailable"); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterEach(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await fs.rm(root, { recursive: true, force: true }); });
  it("moves a minimally evidenced run from blocked dependency graph to ready", async () => {
    const created = await json<{ project: { slug: string; chapters: Array<{ id: string }> } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Readiness closure", roughIdea: "A courier crosses a locked city." }) });
    expect(created.status).toBe(201);
    const slug = created.data.project.slug;
    const projectRoot = path.join(root, slug);
    await writeJson(path.join(projectRoot, "sessions", "story-contract-adoption-proposal.json"), { status: "committed", canonWritten: true, fingerprint: hex });
    const project = JSON.parse(await fs.readFile(path.join(projectRoot, "project.json"), "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-v1" };
    await writeJson(path.join(projectRoot, "project.json"), project);
    await writeJson(path.join(projectRoot, "sessions", "outline-versions", "outline-v1.json"), { status: "active", canonWritten: true, fingerprint: hex });
    await writeJson(path.join(projectRoot, "sessions", "obligations", "coverage-certificate.json"), { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", fingerprint: hex });
    const scopedChapters = created.data.project.chapters.slice(0, 2);
    const started = await json<{ run: { bookRunId: string } }>(`/api/novel/projects/${slug}/book-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: scopedChapters.map((chapter) => chapter.id), storyContractRef: "sessions/story-contract-adoption-proposal.json", autonomyLevel: "L1", limits: { maxWorkItems: 2, maxBudgetCents: 1000 } }) });
    expect(started.status).toBe(201);
    await json(`/api/novel/projects/${slug}/session/context-manifest`, { method: "POST" });
    await json(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 800 }) });
    const readiness = await json<{ proof: { status: string; blockedReasons: string[] } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST" });
    expect(readiness.status).toBe(200);
    expect(readiness.data.proof).toMatchObject({ status: "ready", blockedReasons: [] });
    const advanced = await json<{ run: { status: string }; scheduled: Array<{ status: string }> }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requireReadiness: true }) });
    expect(advanced.status).toBe(201);
    expect(["queued", "running", "gate_required", "scope_complete"]).toContain(advanced.data.run.status);
    const chapter = scopedChapters[0];
    const settlementBases = await Promise.all(scopedChapters.map(async (entry, index) => {
      const chapterContent = await fs.readFile(path.join(projectRoot, entry.contentPath || `chapters/chapter-${index + 1}.md`), "utf8");
      const base = { schemaVersion: "chapter-settlement.v1" as const, settlementId: `settlement-e2e-${index + 1}`, projectSlug: slug, chapterId: entry.id, adoptionTransactionId: `adopt-e2e-${index + 1}`, adoptedContentSha256: crypto.createHash("sha256").update(chapterContent, "utf8").digest("hex"), status: "settled" as const, nextAction: "schedule_dependency_ready_work" as const, createdAt: new Date().toISOString() };
      return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
    }));
    const settlementBase = settlementBases[0];
    await writeJson(path.join(projectRoot, "sessions", "chapter-settlements", `${settlementBase.settlementId}.json`), settlementBase);
    await json(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 800 }) });
    const refreshedReadiness = await json<{ proof: { status: string } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST" });
    expect(refreshedReadiness.data.proof.status).toBe("ready");
    const secondScheduled = await json<{ run: { status: string; version: number } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requireReadiness: true }) });
    expect(secondScheduled.status).toBe(201);
    expect(secondScheduled.data.run.status).not.toBe("scope_complete");
    await writeJson(path.join(projectRoot, "sessions", "chapter-settlements", `${settlementBases[1].settlementId}.json`), settlementBases[1]);
    await json(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/budget-reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservedCents: 800 }) });
    const finalReadiness = await json<{ proof: { status: string } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/readiness`, { method: "POST" });
    expect(finalReadiness.data.proof.status).toBe("ready");
    const completed = await json<{ run: { status: string; version: number } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requireReadiness: true }) });
    expect(completed.status).toBe(201);
    expect(completed.data.run.status).toBe("scope_complete");
    for (const reservationId of [`budget-${started.data.run.bookRunId}-v1`, `budget-${started.data.run.bookRunId}-v2`, `budget-${started.data.run.bookRunId}-v3`]) {
      const reservation = await readBudgetReservation(projectRoot, reservationId);
      if (reservation?.status === "reserved") await persistBudgetReservation(projectRoot, releaseBudgetReservation(reservation));
    }
    for (const item of await listExecutionWorkItems(projectRoot)) {
      if (["queued", "running", "claimed"].includes(item.status)) {
        await finishExecutionWorkItem(projectRoot, item.workItemId, { status: "completed", runId: item.runId, fencingToken: item.fencingToken });
      } else if (item.status === "blocked") {
        await cancelExecutionWorkItem(projectRoot, item.workItemId, { error: "E2E_WORKER_SCOPE_CLOSED" });
      }
    }
    await issueQuiescenceProof(projectRoot, { bookRunId: started.data.run.bookRunId, runVersion: completed.data.run.version });
    const coverage = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "canon-1", chapterIds: scopedChapters.map((entry) => entry.id), plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: new Date().toISOString() };
    await writeJson(path.join(projectRoot, "sessions", "obligations", "coverage-certificate.json"), { ...coverage, fingerprint: crypto.createHash("sha256").update(JSON.stringify(coverage)).digest("hex") });
    await issueClosureCertificate(projectRoot, { projectSlug: slug, chapterIds: scopedChapters.map((entry) => entry.id), sourceFingerprint: "canon-1" });
    const audit = await json<{ audit: { status: string } }>(`/api/novel/projects/${slug}/book-runs/${started.data.run.bookRunId}/completion-audits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFingerprint: "canon-1" }) });
    expect(audit.status).toBe(201);
    const derived = await json<{ transaction: { transactionId: string; status: string } }>(`/api/novel/projects/${slug}/runtime/chapters/${chapter.id}/settlements/${settlementBase.settlementId}/derived`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writes: [{ relativePath: "derived/e2e-summary.json", content: "{\"bookRun\":\"scope_complete\"}\n" }] }) });
    expect(derived.status).toBe(201);
    expect(derived.data.transaction.status).toBe("committed");
    const releaseE2e = await json<{ proof: { status: string; settlementId: string; derivedTransactionId: string } }>(`/api/novel/projects/${slug}/release-e2e-acceptance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId: chapter.id, settlementId: settlementBase.settlementId, derivedTransactionId: derived.data.transaction.transactionId }) });
    expect(releaseE2e.status).toBe(201);
    expect(releaseE2e.data.proof).toMatchObject({ status: "verified", settlementId: settlementBase.settlementId, derivedTransactionId: derived.data.transaction.transactionId });
    const edition = await json<{ manifest: { editionId: string; status: string; readerSafe: boolean } }>(`/api/novel/projects/${slug}/publication-editions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canonCommitFingerprint: "canon-1", author: "e2e-author", language: "zh-CN", chapters: scopedChapters.map((entry, index) => ({ chapterId: entry.id, title: entry.title, order: index + 1, contentPath: entry.contentPath, settlementId: settlementBases[index].settlementId })) }) });
    expect(edition.status).toBe(201);
    expect(edition.data.manifest).toMatchObject({ status: "frozen", readerSafe: true });
    const tree = await json<{ tree: { status: string; readerSafe: boolean } }>(`/api/novel/projects/${slug}/publication-editions/${edition.data.manifest.editionId}/tree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(tree.status).toBe(201);
    const artifacts = await json<{ artifacts: { status: string; fingerprint: string } }>(`/api/novel/projects/${slug}/publication-editions/${edition.data.manifest.editionId}/artifacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formats: ["markdown"] }) });
    expect(artifacts.status).toBe(201);
    const delivery = await json<{ proof: { status: string } }>(`/api/novel/projects/${slug}/publication-editions/${edition.data.manifest.editionId}/delivery-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: "e2e-author-release", approverKind: "author", expectedArtifactSetFingerprint: artifacts.data.artifacts.fingerprint }) });
    expect(delivery.status).toBe(201);
    expect(delivery.data.proof.status).toBe("issued");
    const backup = await json<{ manifest: { backupId: string; status: string } }>(`/api/novel/projects/${slug}/backups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(backup.status).toBe(201);
    expect(backup.data.manifest.status).toBe("verified");
    const restoreDrill = await json<{ receipt: { status: string; backupId: string } }>(`/api/novel/projects/${slug}/backups/${backup.data.manifest.backupId}/restore-drill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(restoreDrill.status).toBe(201);
    expect(restoreDrill.data.receipt).toMatchObject({ status: "verified", backupId: backup.data.manifest.backupId });
    const calibration = await json<{ evidence: { status: string; sourceKind: string; accuracy: number } }>(`/api/novel/projects/${slug}/session/understanding/quality-calibration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluatorVersion: "provider-evaluator-v1", sourceKind: "provider", holdoutInputFingerprint: "holdout-provider-v1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, attestation: { kind: "provider-signed", reference: "provider://e2e/attestation/1" }, evidenceRefs: ["provider://e2e/holdout/1"] }) });
    expect(calibration.status).toBe(201);
    expect(calibration.data.evidence).toMatchObject({ status: "calibrated", sourceKind: "provider", accuracy: 0.9 });
    const snapshotBase = { schemaVersion: "understanding-snapshot.v1", snapshotId: "snapshot-release-e2e", projectSlug: slug, mode: "shadow", sourceFingerprint: "c".repeat(64), sourceMessageIds: [], coreExplicit: [], inferred: [], unknowns: [], question: { id: "question-primary-desire", text: "What matters most?", status: "candidate", impact: "high", source: "deterministic-gap" }, modelCallIssued: false, canonWritten: false, createdAt: new Date().toISOString() };
    await writeJson(path.join(projectRoot, "sessions", "understanding-snapshot.json"), { ...snapshotBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(snapshotBase)).digest("hex") });
    const externalReview = await json<{ review: { status: string; reviewer: { kind: string } } }>(`/api/novel/projects/${slug}/session/understanding/review/external`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerKind: "provider", reviewerId: "provider-panel-e2e", attestationReference: "attestation://provider-panel-e2e/review-1", snapshotFingerprint: snapshotBase.sourceFingerprint, checks: ["source-fingerprint", "evidence-spans", "branch-separation", "question-gate", "canon-isolation"].map((checkId) => ({ checkId, detail: "verified" })), evidenceRefs: ["holdout://provider-panel-e2e/review-1"] }) });
    expect(externalReview.status).toBe(201);
    expect(externalReview.data.review).toMatchObject({ status: "passed", reviewer: { kind: "provider" } });
    const migrationPreview = await json<{ preview: { migrationId: string } }>(`/api/novel/projects/${slug}/migrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(migrationPreview.status).toBe(200);
    const migrationValidation = await json<{ validation: { fingerprint: string } }>(`/api/novel/projects/${slug}/migrations/${migrationPreview.data.preview.migrationId}/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(migrationValidation.status).toBe(200);
    const migrationActivation = await json<{ activation: { status: string } }>(`/api/novel/projects/${slug}/migrations/${migrationPreview.data.preview.migrationId}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: "book-run-release-migration-1", expectedValidationFingerprint: migrationValidation.data.validation.fingerprint }) });
    expect(migrationActivation.status).toBe(200);
    expect(migrationActivation.data.activation.status).toBe("activated");
    const acceptance = await json<{ decision: { status: string; checks: Array<{ checkId: string; status: string; evidence: string[] }> } }>("/api/novel/release-acceptance");
    expect(acceptance.status).toBe(200);
    expect(acceptance.data.decision.status).toBe("accepted");
    expect(acceptance.data.decision.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: "governed-e2e", status: "passed" }),
      expect.objectContaining({ checkId: "delivery-proof", status: "passed" }),
      expect.objectContaining({ checkId: "external-calibration", status: "passed" }),
      expect.objectContaining({ checkId: "v2-independent-review", status: "passed" })
    ]));
    const isolatedProject = await json<{ project: { slug: string } }>("/api/novel/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Unrelated project", roughIdea: "Must not contaminate release evidence." }) });
    expect(isolatedProject.status).toBe(201);
    const rechecked = await json<{ decision: { status: string; checks: Array<{ checkId: string; status: string; evidence: string[] }> } }>("/api/novel/release-acceptance");
    expect(rechecked.data.decision.status).toBe("do-not-activate");
    const governedCheck = rechecked.data.decision.checks.find((check) => check.checkId === "governed-e2e");
    const deliveryCheck = rechecked.data.decision.checks.find((check) => check.checkId === "delivery-proof");
    expect(governedCheck).toMatchObject({ status: "passed", evidence: [expect.stringContaining(slug)] });
    expect(deliveryCheck).toMatchObject({ status: "passed", evidence: [expect.stringContaining(slug)] });
    expect(governedCheck?.evidence.some((entry) => entry.includes(isolatedProject.data.project.slug))).toBe(false);
    expect(deliveryCheck?.evidence.some((entry) => entry.includes(isolatedProject.data.project.slug))).toBe(false);
    const migrationCheck = rechecked.data.decision.checks.find((check) => check.checkId === "migration-cutover");
    expect(migrationCheck).toMatchObject({ status: "missing", evidence: expect.arrayContaining([expect.stringContaining(isolatedProject.data.project.slug)]) });
  });
});
