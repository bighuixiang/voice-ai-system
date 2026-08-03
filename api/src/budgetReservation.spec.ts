import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertBudgetReservation, consumeBudgetReservation, consumeBudgetReservationAtomically, createBudgetReservation, persistBudgetReservation, readBudgetReservation, releaseBudgetReservation, settleBudgetReservation } from "./budgetReservation.js";

describe("budget reservation", () => {
  it("reserves only a positive amount within the run limit", () => {
    expect(createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 1000, reservedCents: 400 })).toMatchObject({ status: "reserved", reservedCents: 400, consumedCents: 0, currency: "USD" });
    expect(() => createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 100, reservedCents: 101 })).toThrow("BUDGET_RESERVATION_INPUT_INVALID");
  });

  it("persists fingerprinted reservations and fails closed on tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "budget-reservation-"));
    const reservation = createBudgetReservation({ bookRunId: "book-run-2", projectSlug: "demo", runVersion: 2, limitCents: 900 });
    await persistBudgetReservation(root, reservation);
    expect(await readBudgetReservation(root, reservation.reservationId)).toEqual(reservation);
    const target = path.join(root, "sessions", "book-runs", `${reservation.reservationId}.budget-reservation.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.reservedCents = 1;
    await fs.writeFile(target, JSON.stringify(tampered));
    await expect(readBudgetReservation(root, reservation.reservationId)).rejects.toThrow("BUDGET_RESERVATION_INTEGRITY_FAILED");
  });

  it("settles or releases only an active reservation and preserves the lifecycle fingerprint", () => {
    const reservation = createBudgetReservation({ bookRunId: "book-run-3", projectSlug: "demo", runVersion: 1, limitCents: 500 });
    const settled = settleBudgetReservation(reservation, 275);
    expect(settled).toMatchObject({ status: "settled", consumedCents: 275 });
    expect(() => settleBudgetReservation(settled, 300)).toThrow("BUDGET_RESERVATION_SETTLEMENT_INVALID");
    const released = releaseBudgetReservation(reservation);
    expect(released.status).toBe("released");
    expect(() => releaseBudgetReservation(released)).toThrow("BUDGET_RESERVATION_RELEASE_INVALID");
  });

  it("accumulates provider spend without closing the reservation and stops at its ceiling", () => {
    const reservation = createBudgetReservation({ bookRunId: "book-run-4", projectSlug: "demo", runVersion: 1, limitCents: 5 });
    const consumed = consumeBudgetReservation(reservation, 2);
    expect(consumed).toMatchObject({ status: "reserved", consumedCents: 2 });
    expect(() => consumeBudgetReservation(consumed, 4)).toThrow("BUDGET_RESERVATION_CONSUMPTION_INVALID");
    expect(() => consumeBudgetReservation(settleBudgetReservation(consumed, 2), 1)).toThrow("BUDGET_RESERVATION_CONSUMPTION_INVALID");
  });
  it("serializes concurrent consumption and never overspends", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "budget-race-"));
    const reservation = createBudgetReservation({ bookRunId: "race", projectSlug: "demo", runVersion: 1, limitCents: 5 });
    await persistBudgetReservation(root, reservation);
    const results = await Promise.allSettled([
      consumeBudgetReservationAtomically(root, reservation.reservationId, 4),
      consumeBudgetReservationAtomically(root, reservation.reservationId, 4)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await readBudgetReservation(root, reservation.reservationId))?.consumedCents).toBe(4);
  });
  it("rejects a re-signed reservation with an invalid timestamp or path identity", () => { const reservation = createBudgetReservation({ bookRunId: "book-run-5", projectSlug: "demo", runVersion: 1, limitCents: 500 }); const { fingerprint: _fingerprint, ...base } = reservation; const invalidBase = { ...base, reservationId: "other", createdAt: "not-a-time" }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertBudgetReservation(invalid, reservation.reservationId)).toThrow("BUDGET_RESERVATION_INTEGRITY_FAILED"); });
});
