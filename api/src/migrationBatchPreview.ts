import crypto from "node:crypto";
import path from "node:path";
import { buildProjectInventory } from "./projectInventory.js";
import { previewProjectMigration } from "./migrationPreview.js";
import { validateMigrationPreview } from "./migrationValidation.js";
import { getNovelsRoot } from "./workspace.js";

export interface MigrationBatchPreviewProject {
  projectSlug: string;
  status: "previewed" | "blocked";
  migrationId?: string;
  sourceFingerprint?: string;
  blockers: string[];
}

export interface MigrationBatchPreviewReport {
  schemaVersion: "project-migration-batch-preview.v1";
  status: "previewed" | "blocked";
  projectCount: number;
  projects: MigrationBatchPreviewProject[];
  blockers: string[];
  generatedAt: string;
  fingerprint: string;
}

export interface MigrationBatchValidationProject {
  projectSlug: string;
  status: "validated" | "blocked";
  migrationId?: string;
  sourceFingerprint?: string;
  conflicts?: string[];
  dependencies?: { outlineVersion: "ready" | "missing" };
  blockers: string[];
}

export interface MigrationBatchValidationReport {
  schemaVersion: "project-migration-batch-validation.v1";
  status: "validated" | "blocked";
  projectCount: number;
  projects: MigrationBatchValidationProject[];
  blockers: string[];
  generatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function reportFingerprint<T extends { generatedAt: string }>(report: T): string {
  const { generatedAt: _generatedAt, ...stableReport } = report;
  return hash(stableReport);
}

export async function previewAllProjectMigrations(): Promise<MigrationBatchPreviewReport> {
  void getNovelsRoot();
  const inventory = await buildProjectInventory();
  const projects: MigrationBatchPreviewProject[] = [];
  for (const project of inventory.projects) {
    if (project.classification !== "managed") {
      const blockers = [project.classification === "unmanaged" ? "unmanaged-project" : "invalid-project"];
      projects.push({ projectSlug: project.projectSlug, status: "blocked", blockers });
      continue;
    }
    try {
      const preview = await previewProjectMigration(path.join(getNovelsRoot(), project.projectSlug), project.projectSlug);
      projects.push({ projectSlug: project.projectSlug, status: "previewed", migrationId: preview.migrationId, sourceFingerprint: preview.sourceFingerprint, blockers: preview.conflicts });
    } catch (error) {
      projects.push({ projectSlug: project.projectSlug, status: "blocked", blockers: [error instanceof Error ? error.message : String(error)] });
    }
  }
  const blockers = projects.flatMap((project) => project.blockers.map((blocker) => `${project.projectSlug}:${blocker}`));
  const base = { schemaVersion: "project-migration-batch-preview.v1" as const, status: blockers.length ? "blocked" as const : "previewed" as const, projectCount: projects.length, projects, blockers, generatedAt: new Date().toISOString() };
  return { ...base, fingerprint: reportFingerprint(base) };
}

export async function validateAllProjectMigrations(): Promise<MigrationBatchValidationReport> {
  const previewReport = await previewAllProjectMigrations();
  const projects: MigrationBatchValidationProject[] = [];
  for (const previewed of previewReport.projects) {
    if (previewed.status !== "previewed" || !previewed.migrationId) {
      projects.push({ projectSlug: previewed.projectSlug, status: "blocked", blockers: previewed.blockers });
      continue;
    }
    try {
      const validation = await validateMigrationPreview(path.join(getNovelsRoot(), previewed.projectSlug), previewed.projectSlug, previewed.migrationId);
      const blockers = [
        ...validation.conflicts,
        ...(validation.dependencies.outlineVersion === "ready" ? [] : ["outline-version-missing"])
      ];
      projects.push({
        projectSlug: previewed.projectSlug,
        status: blockers.length ? "blocked" : "validated",
        migrationId: validation.migrationId,
        sourceFingerprint: validation.sourceFingerprint,
        conflicts: validation.conflicts,
        dependencies: validation.dependencies,
        blockers
      });
    } catch (error) {
      projects.push({ projectSlug: previewed.projectSlug, status: "blocked", migrationId: previewed.migrationId, sourceFingerprint: previewed.sourceFingerprint, blockers: [error instanceof Error ? error.message : String(error)] });
    }
  }
  const blockers = projects.flatMap((project) => project.blockers.map((blocker) => `${project.projectSlug}:${blocker}`));
  const base = { schemaVersion: "project-migration-batch-validation.v1" as const, status: blockers.length ? "blocked" as const : "validated" as const, projectCount: projects.length, projects, blockers, generatedAt: new Date().toISOString() };
  return { ...base, fingerprint: reportFingerprint(base) };
}
