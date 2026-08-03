import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createAgencyChain, readAgencyChain, evaluateAgencyChain } from "./agencyChain.js";
import crypto from "node:crypto";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "agency-chain-")); }
const input = (root: string, overrides: Record<string, unknown> = {}) => ({ root, projectSlug: "demo", sceneId: "scene-1", characterId: "hero", perception: "看到守卫靠近", desire: "保护同伴", availableStrategies: ["躲藏", "谈判"], actualChoice: "谈判", immediateReason: "争取时间", cost: "暴露身份", consequence: "守卫改变路线", evidenceRefs: ["prose://scene-1#choice"], ...overrides });
describe("character agency chain", () => {
  it("stores a replayable perception-to-consequence chain", async () => { const chain = await createAgencyChain(input(await root())); expect(chain.status).toBe("valid"); expect(chain.steps.map((s) => s.kind)).toEqual(["perception", "desire", "options", "choice", "reason", "cost", "consequence"]); });
  it("blocks agency breaks in key scenes", async () => { const chain = await createAgencyChain(input(await root(), { actualChoice: "fight" })); expect(chain.status).toBe("broken"); expect(chain.breaks).toContain("CHOICE_NOT_IN_AVAILABLE_STRATEGIES"); const reasonless = evaluateAgencyChain({ ...chain, steps: chain.steps.map((s) => s.kind === "reason" ? { ...s, value: "" } : s) }); expect(reasonless.status).toBe("broken"); expect(reasonless.breaks).toContain("IMMEDIATE_REASON_REQUIRED"); });
  it("is idempotent and requires evidence", async () => { const r = await root(); const one = await createAgencyChain(input(r)); const two = await createAgencyChain(input(r, { actualChoice: "躲藏" })); expect(two.fingerprint).toBe(one.fingerprint); await expect(createAgencyChain(input(r, { evidenceRefs: [] }))).rejects.toThrow("AGENCY_EVIDENCE_REQUIRED"); expect(await readAgencyChain(r, one.chainId)).toEqual(one); });
  it("blocks chains whose individual steps lack evidence or repeat a semantic kind", async () => {
    const chain = await createAgencyChain(input(await root()));
    const missingEvidence = evaluateAgencyChain({ ...chain, steps: chain.steps.map((step) => step.kind === "cost" ? { ...step, evidenceRefs: [] } : step) });
    expect(missingEvidence.status).toBe("broken");
    expect(missingEvidence.breaks).toContain("AGENCY_STEP_EVIDENCE_REQUIRED");
    const duplicated = evaluateAgencyChain({ ...chain, steps: [...chain.steps, { ...chain.steps[0], value: "second perception" }] });
    expect(duplicated.breaks).toContain("AGENCY_STEP_DUPLICATE");
  });
  it("fails closed when a re-signed chain changes semantic status", async () => {
    const r = await root();
    const chain = await createAgencyChain(input(r));
    const target = path.join(r, "sessions", "agency-chains", `${chain.chainId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const resigned = { ...base, status: "broken", breaks: [] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readAgencyChain(r, chain.chainId)).rejects.toThrow("AGENCY_CHAIN_INTEGRITY_FAILED");
  });
});
