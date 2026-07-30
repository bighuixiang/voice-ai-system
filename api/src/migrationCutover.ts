import crypto from "node:crypto";
import { buildProjectInventory, type ProjectInventoryEntry } from "./projectInventory.js";

export interface MigrationCutoverProject {
  projectSlug: string;
  classification: ProjectInventoryEntry["classification"];
  governanceState: ProjectInventoryEntry["governanceState"];
  status: "ready" | "blocked";
  blockers: string[];
}

export interface MigrationCutoverReport {
  schemaVersion: "project-migration-cutover.v1";
  status: "ready" | "blocked";
  projectCount: number;
  projects: MigrationCutoverProject[];
  blockers: string[];
  evaluatedAt: string;
  fingerprint: string;
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reportFingerprint<T extends { evaluatedAt: string }>(report: T): string {
  const { evaluatedAt: _evaluatedAt, ...stableReport } = report;
  return fingerprint(stableReport);
}

function projectBlockers(project: ProjectInventoryEntry): string[] {
  const blockers: string[] = [];
  if (project.classification === "unmanaged") blockers.push("unmanaged-project");
  if (project.classification === "invalid") blockers.push("invalid-project");
  if (project.governanceState === "legacy") blockers.push("legacy-governance");
  if (project.governanceState === "migration-preview") blockers.push("migration-preview-not-validated");
  if (project.governanceState === "migration-validated") blockers.push("migration-not-activated");
  if (project.governanceState === "migration-activation-incomplete") blockers.push("migration-activation-artifact-missing");
  if (project.governanceState === "governed") blockers.push("migration-cutover-not-activated");
  if (project.sourceConflicts.length > 0) blockers.push("legacy-source-conflict");
  if (project.baselineStatus === "degraded") blockers.push("capability-baseline-degraded");
  if (project.failures && project.failures.length > 0) blockers.push("capability-baseline-failure");
  return blockers;
}

export async function evaluateMigrationCutover(): Promise<MigrationCutoverReport> {
  const inventory = await buildProjectInventory();
  const projects = inventory.projects.map((project) => {
    const blockers = projectBlockers(project);
    return {
      projectSlug: project.projectSlug,
      classification: project.classification,
      governanceState: project.governanceState,
      status: blockers.length === 0 ? "ready" as const : "blocked" as const,
      blockers
    };
  });
  const blockers = projects.flatMap((project) => project.blockers.map((blocker) => `${project.projectSlug}:${blocker}`));
  if (projects.length === 0) blockers.push("no-projects");
  const base = {
    schemaVersion: "project-migration-cutover.v1" as const,
    status: blockers.length === 0 ? "ready" as const : "blocked" as const,
    projectCount: projects.length,
    projects,
    blockers,
    evaluatedAt: new Date().toISOString()
  };
  return { ...base, fingerprint: reportFingerprint(base) };
}
