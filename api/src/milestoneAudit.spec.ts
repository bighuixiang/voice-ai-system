import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { recordMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";
import { auditMilestoneRepair, readMilestoneAudit } from "./milestoneAudit.js";
import { recordWorldStateSnapshot } from "./worldState.js";
import { createNarrativeCurvePoint } from "./narrativeCurve.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

describe("milestone audit", () => {
  it("replays repair evidence and persists a passed immutable audit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 2, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "obligation", targetId: "obl-1", reason: "missing terminal evidence", evidenceRefs: ["audit://obl-1"] }] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "REPAIR_ACTION_COMPLETION_REQUIRED" })] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 2, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["repair://obl-1"] });
    const audit = await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" });
    expect(audit).toMatchObject({ schemaVersion: "milestone-audit.v1", status: "passed", planId: plan.planId, actionIds: [plan.actions[0].actionId] });
    await expect(readMilestoneAudit(root, audit.auditId)).resolves.toEqual(audit);
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toEqual(audit);
  });

  it("fails closed when the source changes or the audit is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-invalid-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "continuity", targetId: "c1", reason: "drift", evidenceRefs: ["audit://c1"] }] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-2" })).rejects.toThrow("MILESTONE_AUDIT_SOURCE_MISMATCH");
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["repair://c1"] });
    const audit = await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" });
    const target = path.join(root, "sessions", "milestone-audits", `${audit.auditId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.status = "blocked";
    await fs.writeFile(target, JSON.stringify(value), "utf8");
    await expect(readMilestoneAudit(root, audit.auditId)).rejects.toThrow("MILESTONE_AUDIT_INTEGRITY_FAILED");
  });

  it("applies the character domain adapter instead of accepting generic audit evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-domain-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "character", targetId: "hero", reason: "arc evidence missing", evidenceRefs: ["audit://hero"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["audit://hero"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_DOMAIN_EVIDENCE_REQUIRED" })] });
  });

  it("dereferences an obligation coverage certificate for explicit obligation evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-obligation-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "obligation", targetId: "obl-1", reason: "coverage evidence", evidenceRefs: ["obligation://coverage"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["obligation://coverage"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_OBLIGATION_CERTIFICATE_STALE" })] });
    const certificate = { schemaVersion: "obligation-coverage-certificate.v1", status: "issued", sourceFingerprint: "source-1", chapterIds: ["c1"], plannedIds: [], obligationCount: 0, terminalObligationIds: [], generatedAt: "2026-07-31T00:00:00.000Z" };
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ ...certificate, fingerprint: hash(certificate) }), "utf8");
    const passed = await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" });
    expect(passed.status).toBe("passed");
  });

  it("dereferences an active character arc for explicit arc evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-character-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "character", targetId: "hero", reason: "arc evidence", evidenceRefs: ["arc://arc-1"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["arc://arc-1"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_CHARACTER_ARC_ARTIFACT_STALE" })] });
    const arcBase = { schemaVersion: "character-arc-contract.v1", arcId: "arc-1", projectSlug: "demo", characterId: "hero", dramaticContractId: "dramatic-1", startState: "fearful", targetChange: "chooses", keyPressures: ["loss"], plannedChoices: ["stay"], plannedCosts: ["escape"], relationshipImpacts: [], allowedRegression: "temporary retreat", sourceRefs: ["chapter://1"], lifecycle: "active", milestones: [{ milestoneId: "milestone-1", choiceEvidenceId: "choice-1", milestone: "stays", actualChange: "chooses connection", sourceRefs: ["chapter://1#end"], recordedAt: "2026-07-31T00:00:00.000Z" }], createdAt: "2026-07-31T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" };
    await fs.mkdir(path.join(root, "sessions", "character-arcs"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "character-arcs", "arc-1.json"), JSON.stringify({ ...arcBase, fingerprint: hash(arcBase) }), "utf8");
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });

  it("dereferences a project-scoped story projection for explicit projection evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-projection-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "projection", targetId: "story-graph", reason: "projection stale", evidenceRefs: ["projection://story-graph/storyline.json"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["projection://story-graph/storyline.json"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_PROJECTION_ARTIFACT_STALE" })] });
    await fs.mkdir(path.join(root, "story-graph"), { recursive: true });
    await fs.writeFile(path.join(root, "story-graph", "storyline.json"), JSON.stringify({ projectSlug: "demo", nodes: [], edges: [], updatedAt: "2026-07-31T00:00:00.000Z" }), "utf8");
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });

  it("dereferences current memory artifacts for explicit knowledge evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-memory-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "memory", targetId: "claim-1", reason: "memory projection stale", evidenceRefs: ["knowledge://facts"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["knowledge://facts"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_MEMORY_ARTIFACT_STALE" })] });
    await fs.mkdir(path.join(root, "knowledge"), { recursive: true });
    await fs.writeFile(path.join(root, "knowledge", "facts.jsonl"), "{\"id\":\"fact-1\"}\n", "utf8");
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });

  it("dereferences a project-scoped world snapshot for explicit world evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-world-"));
    const snapshot = await recordWorldStateSnapshot({ root, projectSlug: "demo", asOf: "chapter-1", region: "region-1", publicationVersion: "canon-1", politicalControl: ["council"], activeConflicts: [], institutions: ["court"], infrastructure: ["road"], markets: [], environment: ["temperate"], resources: ["water"], effectiveRuleIds: [], unknowns: ["border"], sourceRefs: ["chapter://1"] });
    const worldRef = `world://${snapshot.snapshotId}`;
    await fs.rm(path.join(root, "sessions", "world-state-snapshots", `${snapshot.snapshotId}.json`));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "world", targetId: "region-1", reason: "state drift", evidenceRefs: [worldRef] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: [worldRef] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_WORLD_ARTIFACT_STALE" })] });
    await fs.mkdir(path.join(root, "sessions", "world-state-snapshots"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "world-state-snapshots", `${snapshot.snapshotId}.json`), JSON.stringify(snapshot), "utf8");
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });

  it("dereferences a structured continuity ledger for explicit continuity evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-continuity-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "continuity", targetId: "risk-1", reason: "continuity drift", evidenceRefs: ["continuity://ledger/continuity.json"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["continuity://ledger/continuity.json"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_CONTINUITY_ARTIFACT_STALE" })] });
    await fs.mkdir(path.join(root, "ledger"), { recursive: true });
    await fs.writeFile(path.join(root, "ledger", "continuity.json"), JSON.stringify([{ id: "risk-1", kind: "continuity", status: "resolved" }]), "utf8");
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });

  it("dereferences a narrative curve point for explicit pacing evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-audit-pacing-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1"], issues: [{ kind: "pacing", targetId: "scene-1", reason: "pace drift", evidenceRefs: ["pacing://point-1"] }] });
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "run-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["pacing://point-1"] });
    await expect(auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).resolves.toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "MILESTONE_PACING_ARTIFACT_STALE" })] });
    await createNarrativeCurvePoint({ root, projectSlug: "demo", pointId: "point-1", chapterId: "c1", sceneId: "scene-1", dimensions: { pressure: 50, information: 40, emotion: 60, relationship: 30, progression: 45, payoff: 20 }, whiteSpace: ["breath"], evidenceRefs: ["scene://1"] });
    expect((await auditMilestoneRepair({ root, planId: plan.planId, sourceFingerprint: "source-1" })).status).toBe("passed");
  });
});
