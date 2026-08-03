import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createBeatFulfillmentLedger, transitionBeatFulfillment, readBeatFulfillmentLedger } from "./beatFulfillment.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "beat-fulfillment-")); }
const beats = [{ beatId: "beat-1", label: "开门", required: true }, { beatId: "beat-2", label: "付出代价", required: true }];
describe("beat fulfillment evidence", () => {
  it("starts all planned beats as planned", async () => { const ledger = await createBeatFulfillmentLedger({ root: await root(), projectSlug: "demo", sceneId: "scene-1", sourceRefs: ["scene://scene-1"], beats }); expect(ledger.beats.map((b) => b.status)).toEqual(["planned", "planned"]); });
  it("requires prose evidence for evidenced and reason for missed/invalidated", async () => { const r = await root(); const ledger = await createBeatFulfillmentLedger({ root: r, projectSlug: "demo", sceneId: "scene-1", sourceRefs: ["scene://scene-1"], beats }); const attempted = await transitionBeatFulfillment(r, ledger.ledgerId, "beat-1", { status: "attempted" }); expect(attempted.beats[0].status).toBe("attempted"); await expect(transitionBeatFulfillment(r, ledger.ledgerId, "beat-1", { status: "evidenced", evidenceRefs: [] })).rejects.toThrow("BEAT_EVIDENCE_REQUIRED"); const evidenced = await transitionBeatFulfillment(r, ledger.ledgerId, "beat-1", { status: "evidenced", evidenceRefs: ["prose://scene-1#segment-1"] }); expect(evidenced.beats[0].status).toBe("evidenced"); await expect(transitionBeatFulfillment(r, ledger.ledgerId, "beat-2", { status: "missed" })).rejects.toThrow("BEAT_REASON_REQUIRED"); const missed = await transitionBeatFulfillment(r, ledger.ledgerId, "beat-2", { status: "missed", reason: "正文没有兑现" }); expect(missed.status).toBe("blocked"); });
  it("is idempotent and project isolated", async () => { const r = await root(); const one = await createBeatFulfillmentLedger({ root: r, projectSlug: "demo", sceneId: "scene-1", sourceRefs: ["scene://scene-1"], beats }); const two = await createBeatFulfillmentLedger({ root: r, projectSlug: "demo", sceneId: "scene-1", sourceRefs: ["other"], beats }); expect(two.fingerprint).toBe(one.fingerprint); expect(await readBeatFulfillmentLedger(r, one.ledgerId)).toEqual(one); });

  it("fails closed when the persisted ledger is tampered", async () => {
    const r = await root();
    const ledger = await createBeatFulfillmentLedger({ root: r, projectSlug: "demo", sceneId: "scene-1", sourceRefs: ["scene://scene-1"], beats });
    const target = path.join(r, "sessions", "beat-fulfillment", `${ledger.ledgerId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    await fs.writeFile(target, JSON.stringify({ ...persisted, status: "completed" }), "utf8");
    await expect(readBeatFulfillmentLedger(r, ledger.ledgerId)).rejects.toThrow("BEAT_FULFILLMENT_INTEGRITY_FAILED");
  });
});
