import type { ContextManifest } from "./contextManifest.js";
import { buildUnderstandingRiskProfile, type UnderstandingRiskProfile } from "./understandingRiskProfile.js";
import type { UnderstandingBudgetReservation } from "./understandingBudget.js";
import type { UnderstandingCapabilityAuthorization } from "./understandingAuthorization.js";

export type PreflightStatus = "block" | "ready";

export interface UnderstandingPreflightReason {
  dependency: "t0-context-manifest" | "task-risk-profile" | "budget-reservation" | "model-capability-authorization";
  status: "missing" | "ready";
  reason: string;
}

export interface UnderstandingPreflight {
  schemaVersion: "understanding-preflight.v1";
  status: PreflightStatus;
  modelCallAllowed: boolean;
  reasons: UnderstandingPreflightReason[];
  contextManifestFingerprint?: string;
  currentSessionFingerprint?: string;
  riskProfile?: UnderstandingRiskProfile;
}

export function evaluateUnderstandingPreflight(
  contextManifest: ContextManifest | null,
  budgetReservation: UnderstandingBudgetReservation | null = null,
  capabilityAuthorization: UnderstandingCapabilityAuthorization | null = null,
  currentSessionFingerprint?: string
): UnderstandingPreflight {
  const riskProfile = buildUnderstandingRiskProfile();
  const manifestCurrent = Boolean(
    contextManifest && (!currentSessionFingerprint || currentSessionFingerprint === contextManifest.sourceFingerprint)
  );
  const reasons: UnderstandingPreflightReason[] = [
    manifestCurrent
      ? { dependency: "t0-context-manifest", status: "ready", reason: "T0 input is frozen with a source fingerprint." }
      : { dependency: "t0-context-manifest", status: "missing", reason: contextManifest ? "The frozen T0 fingerprint is stale; freeze the current author session again." : "Freeze the exact author session before interpretation." },
    { dependency: "task-risk-profile", status: "ready", reason: "Deterministic V2 impact, reversibility, T0 and canon-write boundaries are declared." },
    contextManifest && budgetReservation?.manifestFingerprint === contextManifest.sourceFingerprint
      ? { dependency: "budget-reservation", status: "ready", reason: "Budget is reserved against the current T0 fingerprint." }
      : { dependency: "budget-reservation", status: "missing", reason: "No interpretation budget is reserved for the current T0 fingerprint." },
    manifestCurrent && budgetReservation?.manifestFingerprint === contextManifest?.sourceFingerprint &&
    capabilityAuthorization?.status === "authorized" && capabilityAuthorization.modelCallAllowed &&
    capabilityAuthorization.manifestFingerprint === contextManifest?.sourceFingerprint
      ? { dependency: "model-capability-authorization", status: "ready", reason: "The selected agent passed availability and capability-floor checks for this T0 and budget." }
      : { dependency: "model-capability-authorization", status: "missing", reason: "No authorized, available model capability is bound to the current T0 and budget." }
  ];
  const blocked = reasons.some((reason) => reason.status === "missing");
  return {
    schemaVersion: "understanding-preflight.v1",
    status: blocked ? "block" : "ready",
    modelCallAllowed: !blocked,
    reasons,
    riskProfile,
    ...(contextManifest ? { contextManifestFingerprint: contextManifest.sourceFingerprint } : {}),
    ...(currentSessionFingerprint ? { currentSessionFingerprint } : {})
  };
}
