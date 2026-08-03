import crypto from "node:crypto";
import type { MilestoneRepairKind } from "./milestoneRepairPlan.js";
import { assertObligationCoverageCertificateCurrent } from "./obligationCertificate.js";
import { readCharacterArcContract } from "./characterArc.js";
import fs from "node:fs/promises";
import { resolveInside } from "./pathSafety.js";
import { evaluateMemoryProjectionFreshness } from "./memoryProjectionGate.js";
import { readWorldStateSnapshot } from "./worldState.js";
import { readNarrativeCurvePoint } from "./narrativeCurve.js";

export interface MilestoneRepairEvidencePolicyResult { schemaVersion: "milestone-repair-policy.v1"; kind: MilestoneRepairKind; status: "passed" | "blocked"; evidenceFamilies: string[]; issues: string[]; fingerprint: string; }

const familyByKind: Record<MilestoneRepairKind, { families: string[]; issue: string }> = {
  continuity: { families: ["continuity://", "projection://"], issue: "MILESTONE_CONTINUITY_EVIDENCE_REQUIRED" },
  memory: { families: ["memory://", "knowledge://"], issue: "MILESTONE_MEMORY_EVIDENCE_REQUIRED" },
  pacing: { families: ["pacing://", "chapter://"], issue: "MILESTONE_PACING_EVIDENCE_REQUIRED" },
  obligation: { families: ["obligation://", "coverage://"], issue: "MILESTONE_OBLIGATION_EVIDENCE_REQUIRED" },
  character: { families: ["character://", "arc://"], issue: "MILESTONE_CHARACTER_EVIDENCE_REQUIRED" },
  world: { families: ["world://", "rule://"], issue: "MILESTONE_WORLD_EVIDENCE_REQUIRED" },
  projection: { families: ["projection://", "derived://"], issue: "MILESTONE_PROJECTION_EVIDENCE_REQUIRED" },
};

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function evaluateMilestoneRepairEvidence(input: { kind: MilestoneRepairKind; evidenceRefs: readonly string[] }): MilestoneRepairEvidencePolicyResult {
  const policy = familyByKind[input.kind];
  const evidenceRefs = [...new Set(input.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
  const domainEvidence = evidenceRefs.some((ref) => policy.families.some((family) => ref.startsWith(family)));
  const repairEvidence = evidenceRefs.some((ref) => ref.startsWith("repair://"));
  const issues = domainEvidence || repairEvidence ? [] : [policy.issue];
  const base = { schemaVersion: "milestone-repair-policy.v1" as const, kind: input.kind, status: issues.length ? "blocked" as const : "passed" as const, evidenceFamilies: [...policy.families], issues };
  return { ...base, fingerprint: hash(base) };
}

export async function verifyMilestoneRepairDomainArtifact(input: { root: string; kind: MilestoneRepairKind; evidenceRefs: readonly string[]; sourceFingerprint: string; projectSlug?: string }): Promise<string | null> {
  if (input.kind === "obligation") {
    const explicitCoverage = input.evidenceRefs.some((ref) => ref.startsWith("obligation://") || ref.startsWith("coverage://"));
    if (!explicitCoverage) return null;
    try { await assertObligationCoverageCertificateCurrent(input.root, input.sourceFingerprint); return null; }
    catch { return "MILESTONE_OBLIGATION_CERTIFICATE_STALE"; }
  }
  if (input.kind === "character") {
    const arcRef = input.evidenceRefs.find((ref) => ref.startsWith("arc://"));
    if (!arcRef) return null;
    const arc = await readCharacterArcContract(input.root, arcRef.slice("arc://".length));
    if (!arc || !["active", "closed"].includes(arc.lifecycle) || !arc.milestones.length) return "MILESTONE_CHARACTER_ARC_ARTIFACT_STALE";
    const { fingerprint, ...base } = arc;
    if (hash(base) !== fingerprint) return "MILESTONE_CHARACTER_ARC_ARTIFACT_STALE";
  }
  if (input.kind === "projection") {
    const projectionRef = input.evidenceRefs.find((ref) => ref.startsWith("projection://"));
    if (!projectionRef) return null;
    const relative = projectionRef.slice("projection://".length) || "story-graph/storyline.json";
    const target = resolveInside(input.root, relative.endsWith(".json") ? relative : "story-graph/storyline.json");
    try {
      const projection = JSON.parse(await fs.readFile(target, "utf8")) as { projectSlug?: string; nodes?: unknown[]; edges?: unknown[]; updatedAt?: string };
      if ((input.projectSlug && projection.projectSlug !== input.projectSlug) || !Array.isArray(projection.nodes) || !Array.isArray(projection.edges) || !projection.updatedAt?.trim()) return "MILESTONE_PROJECTION_ARTIFACT_STALE";
    } catch { return "MILESTONE_PROJECTION_ARTIFACT_STALE"; }
  }
  if (input.kind === "memory") {
    const explicitMemory = input.evidenceRefs.some((ref) => ref.startsWith("memory://") || ref.startsWith("knowledge://"));
    if (!explicitMemory) return null;
    const freshness = await evaluateMemoryProjectionFreshness(input.root);
    if (freshness.status !== "current") return "MILESTONE_MEMORY_ARTIFACT_STALE";
    const candidates = ["knowledge/facts.jsonl", "knowledge/triples.jsonl", "memory/claims/events.jsonl"];
    for (const relative of candidates) {
      try { await fs.access(resolveInside(input.root, relative)); return null; } catch { /* try next authoritative memory artifact */ }
    }
    return "MILESTONE_MEMORY_ARTIFACT_STALE";
  }
  if (input.kind === "world") {
    const snapshotRef = input.evidenceRefs.find((ref) => ref.startsWith("world://"));
    if (!snapshotRef) return null;
    const snapshot = await readWorldStateSnapshot(input.root, snapshotRef.slice("world://".length));
    if (!snapshot || (input.projectSlug && snapshot.projectSlug !== input.projectSlug) || snapshot.schemaVersion !== "world-state-snapshot.v1" || !snapshot.region.trim() || !snapshot.asOf.trim() || !snapshot.publicationVersion.trim() || !snapshot.sourceRefs.length) return "MILESTONE_WORLD_ARTIFACT_STALE";
    const { fingerprint, ...base } = snapshot;
    if (hash(base) !== fingerprint) return "MILESTONE_WORLD_ARTIFACT_STALE";
  }
  if (input.kind === "continuity") {
    const continuityRef = input.evidenceRefs.find((ref) => ref.startsWith("continuity://"));
    if (!continuityRef) return null;
    const relative = continuityRef.slice("continuity://".length) || "ledger/continuity.json";
    const target = resolveInside(input.root, relative.endsWith(".json") ? relative : "ledger/continuity.json");
    try {
      const ledger = JSON.parse(await fs.readFile(target, "utf8")) as unknown;
      if (!Array.isArray(ledger) || ledger.some((entry) => !entry || typeof entry !== "object" || typeof (entry as { id?: unknown }).id !== "string" || !String((entry as { id: string }).id).trim())) return "MILESTONE_CONTINUITY_ARTIFACT_STALE";
    } catch { return "MILESTONE_CONTINUITY_ARTIFACT_STALE"; }
  }
  if (input.kind === "pacing") {
    const pacingRef = input.evidenceRefs.find((ref) => ref.startsWith("pacing://"));
    if (!pacingRef) return null;
    const point = await readNarrativeCurvePoint(input.root, pacingRef.slice("pacing://".length));
    if (!point || (input.projectSlug && point.projectSlug !== input.projectSlug) || point.schemaVersion !== "narrative-curve-point.v1" || !point.chapterId.trim() || !point.sceneId.trim() || !point.evidenceRefs.length || Object.values(point.dimensions).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) return "MILESTONE_PACING_ARTIFACT_STALE";
    const { fingerprint, ...base } = point;
    if (hash(base) !== fingerprint) return "MILESTONE_PACING_ARTIFACT_STALE";
  }
  return null;
}
