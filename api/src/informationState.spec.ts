import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createInformationStateTrace, appendInformationEvent, readInformationStateTrace } from "./informationState.js";
import crypto from "node:crypto";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "information-state-")); }
const input = (root: string) => ({ root, projectSlug: "demo", sceneId: "scene-1", povCharacterId: "hero", authorTruth: [{ factId: "gate-open", value: "门已打开" }, { factId: "traitor", value: "guard betrayed them" }], readerKnown: ["gate-open"], povKnown: ["gate-open"], povBeliefs: [{ factId: "traitor", value: "guard is loyal" }], otherPrivate: [{ characterId: "guard", factIds: ["traitor"] }], sourceRefs: ["source://scene-1"] });
describe("POV information state trace", () => {
  it("creates separate truth, reader, POV, belief and private sets", async () => { const trace = await createInformationStateTrace(input(await root())); expect(trace.states.readerKnown).toEqual(["gate-open"]); expect(trace.states.povBeliefs[0].value).toBe("guard is loyal"); });
  it("updates reveal/mislead/infer events and blocks knowledge-boundary violations", async () => { const r = await root(); const trace = await createInformationStateTrace(input(r)); const revealed = await appendInformationEvent(r, trace.traceId, { kind: "reveal", factId: "traitor", target: "reader", evidenceRefs: ["prose://scene-1#reveal"] }); expect(revealed.states.readerKnown).toContain("traitor"); await expect(appendInformationEvent(r, trace.traceId, { kind: "inner", factId: "traitor", target: "pov", evidenceRefs: ["prose://scene-1#inner"] })).rejects.toThrow("POV_KNOWLEDGE_BOUNDARY"); const inferred = await appendInformationEvent(r, trace.traceId, { kind: "infer", factId: "gate-open", target: "pov", inferenceBasis: ["gate-open"], evidenceRefs: ["prose://scene-1#infer"] }); expect(inferred.events.at(-1)?.kind).toBe("infer"); });
  it("is idempotent and requires evidence", async () => { const r = await root(); const one = await createInformationStateTrace(input(r)); const two = await createInformationStateTrace(input(r)); expect(two.fingerprint).toBe(one.fingerprint); await expect(appendInformationEvent(r, one.traceId, { kind: "reveal", factId: "gate-open", target: "reader", evidenceRefs: [] })).rejects.toThrow("INFORMATION_EVIDENCE_REQUIRED"); expect(await readInformationStateTrace(r, one.traceId)).toEqual(one); });
  it("fails closed when a re-signed trace leaks an unknown POV fact", async () => {
    const r = await root();
    const trace = await createInformationStateTrace(input(r));
    const target = path.join(r, "sessions", "information-state", `${trace.traceId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const states = base.states as Record<string, unknown>;
    const resigned = { ...base, states: { ...states, povKnown: ["secret-never-established"] } };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readInformationStateTrace(r, trace.traceId)).rejects.toThrow("INFORMATION_STATE_INTEGRITY_FAILED");
  });
});
