import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyGovernanceArtifacts } from "./spec-governance-verifier.mjs";

test("verifies the generated governance bundle without upgrading release readiness", () => {
  const report = verifyGovernanceArtifacts({
    root: new URL("..", import.meta.url),
    expectedSddVersion: "v1.18.40",
  });

  assert.equal(report.valid, true);
  assert.equal(report.sddVersion, "v1.18.40");
  assert.ok(report.requirementCount > 0);
  assert.ok(report.acceptanceTestCount > 0);
  assert.ok(report.objectiveCount >= 10);
  assert.equal(report.requirementEvidenceCount, report.requirementCount);
  assert.equal(report.releaseReadiness, "do-not-activate");
  assert.deepEqual(report.errors, []);
});

test("rejects a governance bundle with an orphan requirement", () => {
  assert.throws(
    () => verifyGovernanceArtifacts({
      root: new URL("..", import.meta.url),
      expectedSddVersion: "v1.18.40",
      loadJson: (path, readJson) => {
        const value = readJson(path);
        if (path.endsWith("requirement-catalog.json")) {
          return { ...value, requirements: [...value.requirements, { requirementId: "FR-ORPHAN" }] };
        }
        return value;
      },
    }),
    /orphan requirement FR-ORPHAN/,
  );
});
