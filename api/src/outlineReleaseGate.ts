import crypto from "node:crypto";

export interface OutlineReleaseGateDecision {
  schemaVersion: "outline-release-gate.v1";
  releaseProfile: "RP4-outline";
  status: "ready" | "blocked";
  fullBookExecutable: false;
  checks: Array<{ checkId: "rp3-dependency" | "outline-validation" | "active-version" | "near-horizon" | "execution-proof"; status: "passed" | "failed"; detail: string }>;
  blockedReasons: string[];
  fingerprint: string;
}

export function evaluateOutlineReleaseGate(input: {
  rp3Status: "accepted" | "do-not-activate";
  outlineValidationStatus: "passed" | "blocked" | "missing";
  outlineVersionStatus: "active" | "missing";
  executionProofStatus: "ready" | "blocked" | "missing";
  selectedChapterCount: number;
  strongFreezeCount: number;
}): OutlineReleaseGateDecision {
  const checks: OutlineReleaseGateDecision["checks"] = [
    { checkId: "rp3-dependency", status: input.rp3Status === "accepted" ? "passed" : "failed", detail: "RP4 depends on an accepted RP3 contract." },
    { checkId: "outline-validation", status: input.outlineValidationStatus === "passed" ? "passed" : "failed", detail: "The outline candidate must have a current passing validation report." },
    { checkId: "active-version", status: input.outlineVersionStatus === "active" ? "passed" : "failed", detail: "An adopted active outline version is required." },
    { checkId: "near-horizon", status: input.selectedChapterCount >= 3 && input.selectedChapterCount <= 5 && input.strongFreezeCount >= 3 && input.strongFreezeCount <= input.selectedChapterCount ? "passed" : "failed", detail: "Only a 3-5 chapter rolling window with at least three strongly frozen chapters may enter execution." },
    { checkId: "execution-proof", status: input.executionProofStatus === "ready" ? "passed" : "failed", detail: "The execution-ready proof must be current and ready." }
  ];
  const blockedReasons = checks.filter((check) => check.status === "failed").map((check) => `OUTLINE_GATE_${check.checkId.toUpperCase().replaceAll("-", "_")}`);
  const base = {
    schemaVersion: "outline-release-gate.v1" as const,
    releaseProfile: "RP4-outline" as const,
    status: blockedReasons.length ? "blocked" as const : "ready" as const,
    fullBookExecutable: false as const,
    checks,
    blockedReasons
  };
  return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
