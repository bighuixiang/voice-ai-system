import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendObligationEvent, createNarrativeObligation, listNarrativeObligations, readNarrativeObligation } from "./narrativeObligation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("narrative obligation event core", () => {
  it("creates a proposed obligation and advances it only through append-only events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-core-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "The sealed gate", questionOrPromise: "Who sealed the gate?", sourceRefs: ["legacy://ledger/1"] });
    const confirmed = await appendObligationEvent(root, created.obligationId, { toStatus: "confirmed", reason: "Author confirmed this is a real mystery", actor: "author", expectedVersion: 0 });
    const planned = await appendObligationEvent(root, created.obligationId, { toStatus: "planned", reason: "Assign a chapter window", actor: "system", expectedVersion: 1 });

    expect(created.status).toBe("proposed");
    expect(planned.obligation).toMatchObject({ status: "planned", version: 2 });
    expect((await listNarrativeObligations(root))).toHaveLength(1);
    expect((await fs.readFile(path.join(root, "sessions", "obligations", `${created.obligationId}.events.jsonl`), "utf8")).trim().split(/\r?\n/)).toHaveLength(2);
  });

  it("rejects direct payoff without evidence and stale concurrent events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-guards-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "secret", title: "A hidden name", questionOrPromise: "What name is hidden?" });
    await expect(appendObligationEvent(root, created.obligationId, { toStatus: "paid", reason: "Done", actor: "author", expectedVersion: 0 })).rejects.toThrow("OBLIGATION_INVALID_TRANSITION");
    await appendObligationEvent(root, created.obligationId, { toStatus: "confirmed", reason: "Confirm", actor: "author", expectedVersion: 0 });
    await expect(appendObligationEvent(root, created.obligationId, { toStatus: "planned", reason: "Late writer", actor: "system", expectedVersion: 0 })).rejects.toThrow("OBLIGATION_VERSION_CONFLICT");
  });

  it("requires payoff evidence when a planned obligation is paid", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-payoff-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "goal", title: "Reach the archive", questionOrPromise: "Can the hero reach the archive?" });
    await appendObligationEvent(root, created.obligationId, { toStatus: "confirmed", reason: "Confirm", actor: "author", expectedVersion: 0 });
    await appendObligationEvent(root, created.obligationId, { toStatus: "planned", reason: "Plan", actor: "system", expectedVersion: 1 });
    await appendObligationEvent(root, created.obligationId, { toStatus: "setup", reason: "Setup", actor: "system", expectedVersion: 2 });
    await expect(appendObligationEvent(root, created.obligationId, { toStatus: "paid", reason: "No anchor", actor: "author", expectedVersion: 3 })).rejects.toThrow("OBLIGATION_PAYOFF_EVIDENCE_REQUIRED");
    await expect(appendObligationEvent(root, created.obligationId, { toStatus: "paid", reason: "Caller label", actor: "author", expectedVersion: 3, evidenceRefs: ["chapter-004"] })).rejects.toThrow("OBLIGATION_PAYOFF_EVIDENCE_INVALID");
    const paid = await appendObligationEvent(root, created.obligationId, { toStatus: "paid", reason: "Chapter payoff anchored", actor: "author", expectedVersion: 3, evidenceRefs: ["chapter://chapter-004#paragraph-2"] });
    expect(paid.obligation.status).toBe("paid");
  });

  it("replays the event log when the projection is stale and fails closed on a broken chain", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-recovery-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?" });
    await appendObligationEvent(root, created.obligationId, { toStatus: "confirmed", reason: "Confirm", actor: "author", expectedVersion: 0 });
    const projectionPath = path.join(root, "sessions", "obligations", `${created.obligationId}.json`);
    const stale = JSON.parse(await fs.readFile(projectionPath, "utf8")) as Record<string, unknown>;
    stale.status = "proposed"; stale.version = 0;
    await fs.writeFile(projectionPath, JSON.stringify(stale));
    await expect(readNarrativeObligation(root, created.obligationId)).resolves.toMatchObject({ status: "confirmed", version: 1 });
    const eventsPath = path.join(root, "sessions", "obligations", `${created.obligationId}.events.jsonl`);
    await fs.appendFile(eventsPath, `${JSON.stringify({ eventId: "corrupt", obligationId: created.obligationId, fromStatus: "planned", toStatus: "paid", expectedVersion: 9 })}\n`);
    await expect(readNarrativeObligation(root, created.obligationId)).rejects.toThrow("OBLIGATION_EVENT_LOG_CORRUPT");
  });
});
