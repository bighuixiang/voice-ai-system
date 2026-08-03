import crypto from "node:crypto";

export interface BoundedDelegationGrant { schemaVersion: "bounded-delegation-grant.v1"; grantId: string; scope: string[]; allowedActions: string[]; expiresAt: string; status: "active" | "revoked"; revokedAt?: string; revokeReason?: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const forbidden = new Set(["character-death", "ending", "budget", "copyright", "private-material", "l2-hard-gate"]);
export function createBoundedDelegationGrant(input: { grantId: string; scope: readonly string[]; allowedActions: readonly string[]; expiresAt: string }): BoundedDelegationGrant {
  if (!input.grantId.trim() || !input.scope.length || !input.allowedActions.length || !input.expiresAt.trim() || Number.isNaN(Date.parse(input.expiresAt))) throw new Error("BOUNDED_DELEGATION_FIELDS_REQUIRED");
  if (input.scope.some((item) => forbidden.has(item)) || input.allowedActions.some((item) => forbidden.has(item))) throw new Error("BOUNDED_DELEGATION_SCOPE_FORBIDDEN");
  const base = { schemaVersion: "bounded-delegation-grant.v1" as const, grantId: input.grantId, scope: [...new Set(input.scope)], allowedActions: [...new Set(input.allowedActions)], expiresAt: input.expiresAt, status: "active" as const };
  return { ...base, fingerprint: hash(base) };
}
export function authorizeBoundedDelegation(grant: BoundedDelegationGrant, action: string, now = new Date().toISOString()): { allowed: boolean; reason: string } {
  if (grant.status === "revoked") return { allowed: false, reason: "DELEGATION_REVOKED" };
  if (Date.parse(now) >= Date.parse(grant.expiresAt)) return { allowed: false, reason: "DELEGATION_EXPIRED" };
  if (!grant.allowedActions.includes(action) || grant.scope.every((item) => !action.startsWith(item))) return { allowed: false, reason: "DELEGATION_ACTION_OUT_OF_SCOPE" };
  return { allowed: true, reason: "AUTHORIZED" };
}
export function revokeBoundedDelegation(grant: BoundedDelegationGrant, reason: string): BoundedDelegationGrant {
  if (!reason.trim()) throw new Error("DELEGATION_REVOKE_REASON_REQUIRED");
  const base = { ...grant, status: "revoked" as const, revokedAt: new Date().toISOString(), revokeReason: reason.trim() };
  const { fingerprint: _fingerprint, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}
