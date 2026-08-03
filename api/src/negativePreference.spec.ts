import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertNegativePreferenceIntegrity, createNegativePreference, evaluateNegativePreferenceSuggestion, readNegativePreference } from "./negativePreference.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "negative-preference-")); }
const input = (root: string) => ({ root, projectSlug: "demo", preferenceId: "avoid-direct-emotion-summary", scope: "narration", rejectedPattern: "旁白直接总结情绪", rationale: "让读者从行动推断", confidence: 0.9, sourceRefs: ["decision://reject-1"] });
describe("scoped negative preference", () => {
  it("stores scoped preference instead of raw text blacklist", async () => { const p = await createNegativePreference(input(await root())); expect(p.scope).toBe("narration"); expect(p.rejectedPattern).toContain("总结情绪"); expect(p.rawTextBlacklist).toEqual([]); });
  it("requires a concrete scene difference for similar suggestions", async () => { const r = await root(); const p = await createNegativePreference(input(r)); const blocked = evaluateNegativePreferenceSuggestion(p, { proposedPattern: "旁白直接总结情绪", newScene: "内心独白场景", differenceExplanation: "" }); expect(blocked.status).toBe("blocked"); expect(blocked.reason).toBe("DIFFERENCE_EXPLANATION_REQUIRED"); const allowed = evaluateNegativePreferenceSuggestion(p, { proposedPattern: "旁白直接总结情绪", newScene: "法庭记录体", differenceExplanation: "此处是角色故意伪装的法庭记录体，信息功能不同", evidenceRefs: ["scene://court"] }); expect(allowed.status).toBe("allowed"); });
  it("is idempotent and requires confidence/evidence", async () => { const r = await root(); const p = await createNegativePreference(input(r)); expect(await createNegativePreference({ ...input(r), rationale: "changed" })).toEqual(p); await expect(createNegativePreference({ ...input(r), confidence: 0 })).rejects.toThrow("NEGATIVE_PREFERENCE_CONFIDENCE_REQUIRED"); expect(await readNegativePreference(r, p.preferenceId)).toEqual(p); });
  it("blocks recurrence of the same mechanism after surface rewriting", async () => { const r = await root(); const p = await createNegativePreference({ ...input(r), triggerConditions: ["emotion is explained instead of dramatized"], counterexamples: ["observable action reveals feeling"], rejectedMechanism: "directly summarize emotion", scope: "narration" }); const result = evaluateNegativePreferenceSuggestion(p, { proposedPattern: "quiet interior narration", proposedMechanism: "state the feeling directly", newScene: "narration", differenceExplanation: "", evidenceRefs: [] }); expect(result.status).toBe("blocked"); expect(result.reason).toBe("NEGATIVE_MECHANISM_RECURRING"); });
  it("permits explicit scoped exceptions without disabling the negative pattern globally", async () => { const r = await root(); const p = await createNegativePreference({ ...input(r), exceptions: [{ scope: "court-record", rationale: "deliberate false testimony", evidenceRefs: ["scene://court"] }] }); const allowed = evaluateNegativePreferenceSuggestion(p, { proposedPattern: "鏃佺櫧鐩存帴鎬荤粨鎯呯华", proposedMechanism: "", newScene: "court-record", differenceExplanation: "", evidenceRefs: ["scene://court"] }); expect(allowed.status).toBe("allowed"); expect(allowed.reason).toBe("SCOPED_EXCEPTION"); });
  it("rejects invalid confidence/source/exception evidence and fails closed on tampering", async () => {
    const r = await root();
    await expect(createNegativePreference({ ...input(r), confidence: Number.NaN })).rejects.toThrow("NEGATIVE_PREFERENCE_CONFIDENCE_REQUIRED");
    await expect(createNegativePreference({ ...input(r), sourceRefs: [" "] })).rejects.toThrow("NEGATIVE_PREFERENCE_SOURCE_REQUIRED");
    await expect(createNegativePreference({ ...input(r), exceptions: [{ scope: "court", rationale: "x", evidenceRefs: [] }] })).rejects.toThrow("NEGATIVE_PREFERENCE_EXCEPTION_REQUIRED");
    const p = await createNegativePreference(input(r));
    const target = path.join(r, "sessions", "negative-preferences", `${p.preferenceId}.json`);
    await fs.writeFile(target, JSON.stringify({ ...p, rationale: "tampered" }), "utf8");
    await expect(readNegativePreference(r, p.preferenceId)).rejects.toThrow("NEGATIVE_PREFERENCE_INTEGRITY_FAILED");
  });
  it("requires nonblank trigger evidence and validates suggestions against the stored fingerprint", async () => { const r = await root(); await expect(createNegativePreference({ ...input(r), triggerConditions: [" "] })).rejects.toThrow("NEGATIVE_PREFERENCE_FIELDS_REQUIRED"); const p = await createNegativePreference(input(r)); expect(() => evaluateNegativePreferenceSuggestion({ ...p, rationale: "tampered" }, { proposedPattern: "x", newScene: "n", differenceExplanation: "", evidenceRefs: [] })).toThrow("NEGATIVE_PREFERENCE_INTEGRITY_FAILED"); expect(() => assertNegativePreferenceIntegrity({ ...p, scope: "tampered" })).toThrow("NEGATIVE_PREFERENCE_INTEGRITY_FAILED"); });
});
