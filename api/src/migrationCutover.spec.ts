import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateMigrationCutover } from "./migrationCutover.js";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import crypto from "node:crypto";

const roots: string[] = [];
afterEach(async () => {
  delete process.env.NOVELS_ROOT;
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("migration cutover readiness", () => {
  it("reports every legacy or unmanaged project as a blocking cutover item", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    await fs.mkdir(path.join(root, "legacy"), { recursive: true });
    await fs.writeFile(path.join(root, "legacy", "story.md"), "legacy", "utf8");

    const report = await evaluateMigrationCutover();
    expect(report).toMatchObject({ schemaVersion: "project-migration-cutover.v1", status: "blocked" });
    expect(report.blockers).toEqual(expect.arrayContaining([expect.stringContaining("legacy")]))
    expect(report.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectSlug: "legacy", status: "blocked", blockers: expect.arrayContaining(["unmanaged-project"]) })
    ]));
  });

  it("does not treat a project flag alone as a completed cutover", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "governed");
    await fs.mkdir(projectRoot, { recursive: true });
    const project = { slug: "governed", title: "Governed", roughIdea: "x", chapters: [], outlineVersion: { versionId: "outline-1" }, migration: { state: "activated", writeAuthority: "prose-adoption" } };
    await fs.writeFile(path.join(projectRoot, "project.json"), `${JSON.stringify(project)}\n`, "utf8");
    const before = await fs.readFile(path.join(projectRoot, "project.json"), "utf8");

    const report = await evaluateMigrationCutover();
    expect(report).toMatchObject({ status: "blocked" });
    expect(report.projects).toEqual([expect.objectContaining({ projectSlug: "governed", status: "blocked", blockers: expect.arrayContaining(["migration-activation-artifact-missing"]) })]);
    expect(await fs.readFile(path.join(projectRoot, "project.json"), "utf8")).toBe(before);
  });

  it("does not infer global cutover from an outline pointer alone", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-pointer-only-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "pointer-only");
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "pointer-only", chapters: [], outlineVersion: { versionId: "outline-1" } }));

    const report = await evaluateMigrationCutover();

    expect(report.status).toBe("blocked");
    expect(report.projects).toEqual([expect.objectContaining({ projectSlug: "pointer-only", status: "blocked", blockers: expect.arrayContaining(["migration-cutover-not-activated"]) })]);
  });

  it("blocks an activated project that still exposes legacy source conflicts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-conflict-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "conflicted");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    const project = { slug: "conflicted", title: "Conflicted", roughIdea: "x", chapters: [], outlineVersion: { versionId: "outline-1" }, migration: { state: "activated", migrationId: "migration-1", writeAuthority: "prose-adoption" } };
    await fs.writeFile(path.join(projectRoot, "project.json"), `${JSON.stringify(project)}\n`, "utf8");
    await fs.writeFile(path.join(projectRoot, "project.yaml"), "legacy: true\n", "utf8");
    const activationBase = { schemaVersion: "project-migration-activation.v1", migrationId: "migration-1", projectSlug: "conflicted", status: "activated", writeAuthority: "prose-adoption", sourceFingerprint: "source-1", activatedAt: "2026-07-30T00:00:00.000Z" };
    const crypto = await import("node:crypto");
    const activation = { ...activationBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(activationBase)).digest("hex") };
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration-1.activation.json"), JSON.stringify(activation), "utf8");

    const report = await evaluateMigrationCutover();

    expect(report.status).toBe("blocked");
    expect(report.projects).toEqual([expect.objectContaining({ projectSlug: "conflicted", status: "blocked", blockers: expect.arrayContaining(["legacy-source-conflict"]) })]);
  });

  it("allows a managed project with a complete activation artifact and current baseline", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-ready-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const project = createProjectSkeleton({ title: "Ready", roughIdea: "A fully activated project." });
    await createProjectFiles(project);
    const projectPath = path.join(projectRoot(project.slug), "project.json");
    const current = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
    current.migration = { state: "activated", migrationId: "migration-ready", writeAuthority: "prose-adoption" };
    await fs.writeFile(projectPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    const activationBase = {
      schemaVersion: "project-migration-activation.v1",
      migrationId: "migration-ready",
      projectSlug: "ready",
      status: "activated",
      writeAuthority: "prose-adoption",
      sourceFingerprint: "f".repeat(64),
      activatedAt: "2026-07-30T00:00:00.000Z"
    };
    const activation = { ...activationBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(activationBase)).digest("hex") };
    await fs.mkdir(path.join(projectRoot(project.slug), "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot(project.slug), "sessions", "migrations", "migration-ready.activation.json"), JSON.stringify(activation), "utf8");

    const report = await evaluateMigrationCutover();
    expect(report).toMatchObject({ status: "ready", projectCount: 1, blockers: [] });
    expect(report.projects).toEqual([expect.objectContaining({ projectSlug: "ready", governanceState: "migration-activated", status: "ready", blockers: [] })]);
  });

  it("keeps the cutover fingerprint stable when the inventory is unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-cutover-fingerprint-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const project = createProjectSkeleton({ title: "Stable", roughIdea: "A stable inventory." });
    await createProjectFiles(project);

    const first = await evaluateMigrationCutover();
    const second = await evaluateMigrationCutover();

    expect(second.fingerprint).toBe(first.fingerprint);
  });
});
