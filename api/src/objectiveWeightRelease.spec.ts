import { describe, expect, it } from "vitest";
import { createObjectiveWeightRelease, explainCandidateWithRelease } from "./objectiveWeightRelease.js";

describe("objective weight release", () => {
  it("records stage weights and basis, while historical candidates retain their original version", () => {
    const release = createObjectiveWeightRelease({ releaseId: "weights-ending-v3", version: 3, stage: "ending", weights: { closure: 0.8, aftermath: 0.2 }, basisRefs: ["author://ending-policy"], publishedAt: "2026-08-01T00:00:00Z" });
    expect(release).toMatchObject({ version: 3, stage: "ending", basisRefs: ["author://ending-policy"] });
    expect(explainCandidateWithRelease({ candidateId: "candidate-ch1", candidateCreatedVersion: 1, release })).toMatchObject({ evaluatedWithVersion: 1, historical: true });
  });
});
