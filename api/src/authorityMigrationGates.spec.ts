import { describe, expect, it } from "vitest";
import { enforceCanonAuthority, evaluateLegacyRetirement, evaluateShadowParser } from "./authorityMigrationGates.js";
describe("authority migration gates", () => {
  it("keeps shadow parser non-writing on failures", () => { expect(evaluateShadowParser({ decorativeFalsePositiveRate: 0.12, fileFailures: 3, writesCanon: true, blockThreshold: 0.05 })).toMatchObject({ status: "shadow_blocked", writesCanon: false }); });
  it("rejects bypassing canon authority", () => { expect(enforceCanonAuthority({ entry: "legacy-patches", mutationGateway: false, proseTransaction: false, derivesFromCommittedEvent: false, bypassAttempt: true })).toMatchObject({ status: "rejected", canonWrite: false }); });
  it("keeps old entry compatibility until evidence permits retirement", () => { expect(evaluateLegacyRetirement({ callsRemaining: 2, rollbackWindowOpen: true, approved: false, compatibilityGuarded: true })).toMatchObject({ status: "compatibility", deleteAllowed: false, dualWrite: false }); });
});
