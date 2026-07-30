import crypto from "node:crypto";

export interface EvaluationCaseManifest {
  caseId: string;
  version: "1.0.0";
  layer: "smoke" | "failure" | "migration";
  scope: "capability-baseline";
  frozenInputFingerprint: string;
  holdoutClass: "public" | "holdout";
  rights: "synthetic";
  status: "frozen";
}

export interface EvaluationSuiteManifest {
  schemaVersion: "evaluation-suite.v1";
  suiteId: "rp0-baseline";
  version: "1.0.0";
  status: "frozen";
  layers: { smoke: 1; failure: 1; migration: 1 };
  cases: EvaluationCaseManifest[];
  contaminationChecks: {
    sourceContentIncluded: false;
    holdoutInputsExcluded: true;
  };
  reproducibility: {
    inputEncoding: "canonical-json";
    outputPolicy: "metadata-only";
    rerunPolicy: "same-fingerprint-required";
  };
}

const fixtureDescriptors = [
  { caseId: "rp0-capability-baseline", layer: "smoke" as const, holdoutClass: "public" as const, input: "healthy-read-only-baseline" },
  { caseId: "rp0-missing-support-file", layer: "failure" as const, holdoutClass: "public" as const, input: "missing-story-control-support-file" },
  { caseId: "rp0-legacy-source-conflict", layer: "migration" as const, holdoutClass: "holdout" as const, input: "legacy-project-source-conflict" }
];

function fingerprint(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function buildRp0EvaluationSuite(): EvaluationSuiteManifest {
  return {
    schemaVersion: "evaluation-suite.v1",
    suiteId: "rp0-baseline",
    version: "1.0.0",
    status: "frozen",
    layers: { smoke: 1, failure: 1, migration: 1 },
    cases: fixtureDescriptors.map((descriptor) => ({
      caseId: descriptor.caseId,
      version: "1.0.0",
      layer: descriptor.layer,
      scope: "capability-baseline",
      frozenInputFingerprint: fingerprint(JSON.stringify({ suiteId: "rp0-baseline", version: "1.0.0", ...descriptor })),
      holdoutClass: descriptor.holdoutClass,
      rights: "synthetic",
      status: "frozen"
    })),
    contaminationChecks: {
      sourceContentIncluded: false,
      holdoutInputsExcluded: true
    },
    reproducibility: {
      inputEncoding: "canonical-json",
      outputPolicy: "metadata-only",
      rerunPolicy: "same-fingerprint-required"
    }
  };
}
