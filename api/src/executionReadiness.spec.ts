import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { checkExecutionReadiness } from "./executionReadiness.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

function fp(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-ready-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
  await fs.mkdir(path.join(root, "sessions", "outline-candidates"), { recursive: true });
  const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-outline-candidate-demo", projectSlug: "demo", version: 1, outlineId: "outline-candidate-demo", outlineFingerprint: "outline-fp", selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"], strongFreezeCount: 3, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
  const version = { ...versionBase, fingerprint: fp(versionBase) };
  const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "execution-ready-outline-version-outline-candidate-demo", projectSlug: "demo", versionId: version.versionId, versionFingerprint: version.fingerprint, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
  const proof = { ...proofBase, fingerprint: fp(proofBase) };
  await fs.writeFile(path.join(root, "sessions", "outline-candidates", "outline-candidate-demo.json"), JSON.stringify({ fingerprint: "outline-fp" }), "utf8");
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-candidate-demo.json"), JSON.stringify(version), "utf8");
  await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify(proof), "utf8");
  return root;
}

describe("execution readiness boundary", () => {
  it("allows only chapters inside the adopted proof window", async () => {
    const root = await fixture();
    expect((await checkExecutionReadiness(root, "chapter-001")).allowed).toBe(true);
    expect(await checkExecutionReadiness(root, "chapter-009")).toMatchObject({ allowed: false, reason: "CHAPTER_OUTSIDE_WINDOW" });
  });

  it("fails closed when proof or project pointer is missing", async () => {
    const root = await fixture();
    await fs.rm(path.join(root, "sessions", "execution-ready-proof.json"));
    expect(await checkExecutionReadiness(root, "chapter-001")).toMatchObject({ allowed: false, reason: "PROOF_NOT_FOUND" });
  });

  it("fails closed when the persisted execution proof content is tampered with", async () => {
    const root = await fixture();
    const proofPath = path.join(root, "sessions", "execution-ready-proof.json");
    const proof = JSON.parse(await fs.readFile(proofPath, "utf8")) as Record<string, unknown>;
    proof.executionReady = false;
    await fs.writeFile(proofPath, JSON.stringify(proof), "utf8");
    expect(await checkExecutionReadiness(root, "chapter-001")).toMatchObject({ allowed: false, reason: "PROOF_TAMPERED" });
  });

  it("fails closed when the adopted outline version content is tampered with", async () => {
    const root = await fixture();
    const versionPath = path.join(root, "sessions", "outline-versions", "outline-candidate-demo.json");
    const version = JSON.parse(await fs.readFile(versionPath, "utf8")) as Record<string, unknown>;
    version.selectedChapterIds = ["chapter-009"];
    await fs.writeFile(versionPath, JSON.stringify(version), "utf8");
    expect(await checkExecutionReadiness(root, "chapter-001")).toMatchObject({ allowed: false, reason: "VERSION_TAMPERED" });
  });

  it("invalidates readiness when the upstream outline candidate changes", async () => {
    const root = await fixture();
    const candidatePath = path.join(root, "sessions", "outline-candidates", "outline-candidate-demo.json");
    await fs.writeFile(candidatePath, JSON.stringify({ fingerprint: "new-outline-fp" }), "utf8");
    expect(await checkExecutionReadiness(root, "chapter-001")).toMatchObject({ allowed: false, reason: "OUTLINE_SOURCE_STALE" });
  });

  it("fails closed when the proof lacks structure/change-level/authority binding", async () => {
    const root = await fixture();
    const proofPath = path.join(root, "sessions", "execution-ready-proof.json");
    const proof = JSON.parse(await fs.readFile(proofPath, "utf8")) as Record<string, unknown>;
    delete proof.structureVersionFingerprint;
    await fs.writeFile(proofPath, JSON.stringify({ ...proof, fingerprint: fp(Object.fromEntries(Object.entries(proof).filter(([key]) => key !== "fingerprint"))) }), "utf8");
    expect(await checkExecutionReadiness(root, "chapter-001")).toMatchObject({ allowed: false, reason: "EXECUTION_BINDING_STALE" });
  });
});
