import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendObligationEvent, createNarrativeObligation, listNarrativeObligations, readNarrativeObligation } from "./narrativeObligation.js";
import crypto from "node:crypto";

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

  it("does not parse the obligation coverage certificate as a narrative obligation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-coverage-scan-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "obligations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "obligations", "coverage-certificate.json"), JSON.stringify({ schemaVersion: "obligation-coverage-certificate.v1", status: "issued" }), "utf8");
    await expect(listNarrativeObligations(root)).resolves.toEqual([]);
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

  it("requires type-specific payoff semantics instead of treating appearance as resolution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-semantic-payoff-")); roots.push(root);
    const object = await createNarrativeObligation(root, { projectSlug: "demo", type: "object", title: "The jade pendant", questionOrPromise: "What is its origin?" });
    for (const [status, expectedVersion] of [["confirmed", 0], ["planned", 1], ["setup", 2]] as const) await appendObligationEvent(root, object.obligationId, { toStatus: status, reason: status, actor: "system", expectedVersion });
    await expect(appendObligationEvent(root, object.obligationId, { toStatus: "paid", reason: "It appeared again", actor: "author", expectedVersion: 3, evidenceRefs: ["chapter://ch-4#pendant"] })).rejects.toThrow("OBLIGATION_PAYOFF_SEMANTIC_EVIDENCE_REQUIRED");
    await expect(appendObligationEvent(root, object.obligationId, { toStatus: "paid", reason: "Origin revealed", actor: "author", expectedVersion: 3, evidenceRefs: ["origin://pendant/ch-4"] })).resolves.toMatchObject({ obligation: { status: "paid" } });
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

  it("rejects a re-signed obligation projection with an invalid status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-semantic-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?" });
    const target = path.join(root, "sessions", "obligations", created.obligationId + ".json");
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const resigned = { ...base, status: "bogus" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readNarrativeObligation(root, created.obligationId)).rejects.toThrow("OBLIGATION_SEMANTIC_INVALID");
  });

  it("fails closed when a re-signed event skips the transition graph", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-event-semantic-")); roots.push(root);
    const created = await createNarrativeObligation(root, { projectSlug: "demo", type: "mystery", title: "Gate", questionOrPromise: "Who sealed it?" });
    const eventsPath = path.join(root, "sessions", "obligations", `${created.obligationId}.events.jsonl`);
    const eventBase = { schemaVersion: "obligation-event.v1", eventId: "event-forged", obligationId: created.obligationId, fromStatus: "proposed", toStatus: "paid", evidenceRefs: ["chapter://1"], reason: "skip confirmation", actor: "author", expectedVersion: 0, createdAt: new Date().toISOString() };
    const event = { ...eventBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(eventBase)).digest("hex") };
    await fs.writeFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    await expect(readNarrativeObligation(root, created.obligationId)).rejects.toThrow("OBLIGATION_EVENT_LOG_CORRUPT");
  });
});
