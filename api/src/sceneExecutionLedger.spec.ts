import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createSceneCardContract } from "./sceneCard.js";
import { createSceneExecutionLedger, appendSceneExecutionEvidence, readSceneExecutionLedger } from "./sceneExecutionLedger.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "scene-ledger-")); }
async function card(r: string) { return createSceneCardContract({ root: r, projectSlug: "demo", sceneId: "scene-1", chapterId: "chapter-1", trigger: "alarm", povCharacterId: "hero", roleGoal: "escape", conflictStrategy: "negotiate", turningPoint: "door locks", informationChange: "learns route", emotionChange: "fear to resolve", relationshipChange: "trust breaks", resourceChange: "loses key", entryState: "inside", exitState: "outside", nextSceneHook: "pursuit", sourceRefs: ["source://card"] }); }
describe("scene execution ledger", () => {
  it("compiles a scene card into a planned ledger", async () => { const r = await root(); const c = await card(r); const ledger = await createSceneExecutionLedger({ root: r, sceneCard: c, obligationIds: ["obl-1"] }); expect(ledger.status).toBe("planned"); expect(ledger.plan.trigger).toBe("alarm"); expect(ledger.plan.nextSceneHook).toBe("pursuit"); expect(ledger.sceneCardFingerprint).toBe(c.fingerprint); });
  it("records evidence and completes only after all required execution facts", async () => { const r = await root(); const ledger = await createSceneExecutionLedger({ root: r, sceneCard: await card(r), obligationIds: ["obl-1"] }); const kinds = ["trigger", "pov-goal", "obstacle", "strategy", "turning-point", "choice", "cost", "information-change", "character-change", "relationship-change", "resource-change", "obligation-action", "next-hook"] as const; let current = ledger; for (const kind of kinds) current = await appendSceneExecutionEvidence(r, current.ledgerId, { kind, value: `${kind} observed`, evidenceRefs: [`prose://scene-1#${kind}`] }); expect(current.status).toBe("completed"); expect(current.evidence.length).toBe(kinds.length); });
  it("rejects evidence without source and remains isolated/idempotent", async () => { const r = await root(); const c = await card(r); const one = await createSceneExecutionLedger({ root: r, sceneCard: c, obligationIds: [] }); const two = await createSceneExecutionLedger({ root: r, sceneCard: c, obligationIds: ["other"] }); expect(two.fingerprint).toBe(one.fingerprint); await expect(appendSceneExecutionEvidence(r, one.ledgerId, { kind: "choice", value: "x", evidenceRefs: [] })).rejects.toThrow("SCENE_LEDGER_EVIDENCE_REQUIRED"); expect(await readSceneExecutionLedger(r, one.ledgerId)).toEqual(one); });
});
