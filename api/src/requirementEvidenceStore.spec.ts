import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRequirementEvidenceLink } from "./deliveryGovernance.js";
import { readRequirementEvidenceLink, writeRequirementEvidenceLink } from "./requirementEvidenceStore.js";

describe("requirement evidence store", () => {
  it("round-trips project-scoped evidence and fails closed on tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "requirement-evidence-"));
    const link = createRequirementEvidenceLink({ projectSlug: "demo", requirementId: "FR-1", sliceId: "slice-1", contractRefs: ["contract"], tests: ["test"], fixtures: ["fixture"], metrics: ["metric"], releaseEvidence: ["evidence"], status: "verified" });
    await writeRequirementEvidenceLink(root, link);
    await expect(readRequirementEvidenceLink(root, "FR-1", "slice-1", "demo")).resolves.toEqual(link);
    await expect(readRequirementEvidenceLink(root, "FR-1", "slice-1", "other")).rejects.toThrow("REQUIREMENT_EVIDENCE_INVALID");
  });

  it("requires release evidence for verified and released links", () => {
    expect(() => createRequirementEvidenceLink({ requirementId: "FR-1", sliceId: "slice-1", contractRefs: ["contract"], tests: ["test"], fixtures: [], metrics: [], releaseEvidence: [], status: "verified" })).toThrow("REQUIREMENT_EVIDENCE_RELEASE_EVIDENCE_REQUIRED");
  });
});
