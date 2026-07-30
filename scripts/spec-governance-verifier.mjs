import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const REQUIRED_NORMATIVE_STRENGTHS = new Set(["MUST", "SHOULD", "MAY", "EXPERIMENT"]);

function defaultRoot() {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

function asPath(value) {
  if (value instanceof URL) return resolve(fileURLToPath(value));
  return resolve(String(value));
}

function defaultLoadJson(root, relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new Error(`Missing governance artifact ${relativePath}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function sourceVersion(artifact) {
  return artifact?.source?.version ?? artifact?.sourceSddVersion ?? artifact?.sddVersion ?? null;
}

function assertUniqueIds(rows, idField, label) {
  const seen = new Set();
  for (const row of rows) {
    const id = row?.[idField];
    if (typeof id !== "string" || !id.trim()) throw new Error(`${label} has missing ${idField}`);
    if (seen.has(id)) throw new Error(`duplicate ${label} ${id}`);
    seen.add(id);
  }
}

export function verifyGovernanceArtifacts({ root = defaultRoot(), expectedSddVersion, loadJson } = {}) {
  const workspace = asPath(root);
  const readJson = loadJson
    ? (relativePath) => loadJson(relativePath, (path) => defaultLoadJson(workspace, path))
    : (relativePath) => defaultLoadJson(workspace, relativePath);
  const catalog = readJson("docs/spec-governance/requirement-catalog.json");
  const evidence = readJson("docs/spec-governance/requirement-evidence.json");
  const coverage = readJson("docs/spec-governance/objective-coverage.json");
  const readiness = readJson("docs/spec-governance/goal-readiness.json");
  const convergence = readJson(`docs/spec-governance/convergence/${expectedSddVersion ?? sourceVersion(catalog)}.json`);
  const errors = [];

  const requirements = Array.isArray(catalog.requirements) ? catalog.requirements : [];
  const evidenceRows = Array.isArray(evidence.requirements) ? evidence.requirements : [];
  assertUniqueIds(requirements, "requirementId", "requirement");
  assertUniqueIds(evidenceRows, "requirementId", "requirement evidence");
  const validSlices = new Set(Object.keys(convergence.counts?.requirementsBySlice ?? {}));
  for (const requirement of requirements) {
    if (!validSlices.has(requirement.firstSlice)) {
      throw new Error(`orphan requirement ${requirement.requirementId}: invalid firstSlice`);
    }
    if (!REQUIRED_NORMATIVE_STRENGTHS.has(requirement.normativeStrength)) {
      throw new Error(`requirement ${requirement.requirementId} has invalid normativeStrength`);
    }
    if (!Array.isArray(requirement.reviewedFirstSliceAcceptanceRefs)) {
      throw new Error(`requirement ${requirement.requirementId} has no reviewed acceptance mapping`);
    }
  }
  const requirementIds = new Set(requirements.map((requirement) => requirement.requirementId));
  for (const row of evidenceRows) {
    if (!requirementIds.has(row.requirementId)) throw new Error(`orphan requirement evidence ${row.requirementId}`);
    if (!Array.isArray(row.acceptanceRefs) || !Array.isArray(row.implementationRefs) || !Array.isArray(row.releaseRefs)) {
      throw new Error(`requirement evidence ${row.requirementId} is incomplete`);
    }
  }
  if (evidenceRows.length !== requirements.length) throw new Error("requirement evidence count mismatch");

  const objectives = Array.isArray(coverage.objectives) ? coverage.objectives : [];
  assertUniqueIds(objectives, "objectiveId", "objective");
  for (const objective of objectives) {
    if (!Array.isArray(objective.requirementIds) || objective.requirementIds.length === 0) {
      throw new Error(`orphan objective ${objective.objectiveId}: no requirement mapping`);
    }
    if (!Array.isArray(objective.acceptanceTestIds) || objective.acceptanceTestIds.length === 0) {
      throw new Error(`orphan objective ${objective.objectiveId}: no acceptance mapping`);
    }
  }

  const sddVersion = expectedSddVersion ?? sourceVersion(catalog);
  for (const [name, artifact] of [["catalog", catalog], ["coverage", coverage], ["readiness", readiness], ["convergence", convergence]]) {
    const actual = sourceVersion(artifact);
    if (actual !== sddVersion) errors.push(`${name} source version ${actual ?? "missing"} != ${sddVersion}`);
  }
  if (convergence.counts?.requirements !== requirements.length) errors.push("convergence requirement count mismatch");
  if (coverage.summary?.explicitUserObjectives !== objectives.length) errors.push("objective count mismatch");

  const releaseGate = (readiness.gates ?? []).find((gate) => gate.gateId === "PRODUCT-RELEASE");
  const releaseReadiness = releaseGate?.status === "passed" ? "ready" : "do-not-activate";
  return {
    valid: errors.length === 0,
    sddVersion,
    requirementCount: requirements.length,
    requirementEvidenceCount: evidenceRows.length,
    acceptanceTestCount: convergence.counts?.acceptanceTests ?? 0,
    objectiveCount: objectives.length,
    releaseReadiness,
    errors,
  };
}

if (process.argv.includes("--check")) {
  const report = verifyGovernanceArtifacts({ expectedSddVersion: process.env.SDD_VERSION });
  if (!report.valid) throw new Error(report.errors.join("; "));
  console.log(`Governance artifacts verified: ${report.requirementCount} requirements, ${report.objectiveCount} objectives, release=${report.releaseReadiness}`);
}
