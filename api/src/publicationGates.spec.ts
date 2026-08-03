import { describe, expect, it } from "vitest";
import { freezeEdition, renderDeterministically, replayCompletionAudit, settleDelivery, summarizeObligationBadges } from "./publicationGates.js";
describe("publication gates", () => {
  it("hides secret obligation meaning from default map", () => { expect(summarizeObligationBadges({ obligations: [{ status: "overdue", secret: true, trueMeaning: "killer" }], authorized: false })).toMatchObject({ leaked: true, badges: [] }); });
  it("stales completion audit when frozen input changes", () => { expect(replayCompletionAudit({ frozenFingerprint: "a", currentFingerprint: "b", checks: ["c"], exceptions: [] }).stale).toBe(true); });
  it("blocks edition freeze with duplicate IDs or active writer", () => { expect(freezeEdition({ chapters: [{ id: "c1", order: 1, hash: "h", settled: true }, { id: "c1", order: 2, hash: "h2", settled: true }], activeWriter: false, proofCurrent: true }).frozen).toBe(false); });
  it("requires deterministic safe reader render", () => { expect(renderDeterministically({ manifest: "m", ast: "a", renderer: "r", firstHash: "h", secondHash: "h", leak: false })).toMatchObject({ identical: true, safe: true }); });
  it("does not publish partial multi-format delivery", () => { expect(settleDelivery({ adapters: [{ format: "md", ok: true, hash: "1" }, { format: "txt", ok: false, hash: "" }], approved: true, existingReady: false })).toMatchObject({ ready: false, proof: false, partialVisible: false }); });
});
