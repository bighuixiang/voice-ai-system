import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface BudgetReservation {
  schemaVersion: "budget-reservation.v1";
  reservationId: string;
  bookRunId: string;
  projectSlug: string;
  runVersion: number;
  currency: "USD";
  limitCents: number;
  reservedCents: number;
  consumedCents: number;
  status: "reserved" | "settled" | "released";
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reservationPath = (root: string, id: string): string => resolveInside(root, `sessions/book-runs/${id}.budget-reservation.json`);

function assertBase(input: { bookRunId: string; projectSlug: string; runVersion: number; limitCents: number; reservedCents: number }): void {
  if (!input.bookRunId.trim() || !input.projectSlug.trim() || !Number.isInteger(input.runVersion) || input.runVersion < 1 || !Number.isInteger(input.limitCents) || input.limitCents <= 0 || !Number.isInteger(input.reservedCents) || input.reservedCents <= 0 || input.reservedCents > input.limitCents) throw new Error("BUDGET_RESERVATION_INPUT_INVALID");
}

export function createBudgetReservation(input: { bookRunId: string; projectSlug: string; runVersion: number; limitCents: number; reservedCents?: number; createdAt?: string }): BudgetReservation {
  const reservedCents = input.reservedCents ?? input.limitCents;
  assertBase({ ...input, reservedCents });
  const base = {
    schemaVersion: "budget-reservation.v1" as const,
    reservationId: `budget-${input.bookRunId}-v${input.runVersion}`,
    bookRunId: input.bookRunId,
    projectSlug: input.projectSlug,
    runVersion: input.runVersion,
    currency: "USD" as const,
    limitCents: input.limitCents,
    reservedCents,
    consumedCents: 0,
    status: "reserved" as const,
    createdAt: input.createdAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertBudgetReservation(value: unknown, expectedId?: string): BudgetReservation {
  if (!value || typeof value !== "object") throw new Error("BUDGET_RESERVATION_INTEGRITY_FAILED");
  const reservation = value as Partial<BudgetReservation>;
  const { fingerprint: _fingerprint, ...base } = reservation as BudgetReservation;
  if (
    reservation.schemaVersion !== "budget-reservation.v1" || (expectedId !== undefined && reservation.reservationId !== expectedId) || typeof reservation.reservationId !== "string" || !reservation.reservationId.trim() ||
    typeof reservation.bookRunId !== "string" || !reservation.bookRunId.trim() || typeof reservation.projectSlug !== "string" || !reservation.projectSlug.trim() ||
    !Number.isInteger(reservation.runVersion) || (reservation.runVersion as number) < 1 || reservation.currency !== "USD" ||
    !Number.isInteger(reservation.limitCents) || (reservation.limitCents as number) <= 0 || !Number.isInteger(reservation.reservedCents) || (reservation.reservedCents as number) <= 0 || (reservation.reservedCents as number) > (reservation.limitCents as number) ||
    !Number.isInteger(reservation.consumedCents) || (reservation.consumedCents as number) < 0 || (reservation.consumedCents as number) > (reservation.reservedCents as number) ||
    !["reserved", "settled", "released"].includes(reservation.status as string) || typeof reservation.createdAt !== "string" || Number.isNaN(Date.parse(reservation.createdAt)) ||
    typeof reservation.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(reservation.fingerprint) || hash(base) !== reservation.fingerprint
  ) throw new Error("BUDGET_RESERVATION_INTEGRITY_FAILED");
  return reservation as BudgetReservation;
}

export function settleBudgetReservation(reservation: BudgetReservation, consumedCents: number): BudgetReservation {
  assertBudgetReservation(reservation);
  if (reservation.status !== "reserved" || !Number.isInteger(consumedCents) || consumedCents < 0 || consumedCents > reservation.reservedCents) throw new Error("BUDGET_RESERVATION_SETTLEMENT_INVALID");
  const base = { ...reservation, status: "settled" as const, consumedCents };
  const { fingerprint: _fingerprint, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}

/** Record spend for one completed provider attempt while keeping the reservation open. */
export function consumeBudgetReservation(reservation: BudgetReservation, additionalCents: number): BudgetReservation {
  assertBudgetReservation(reservation);
  if (reservation.status !== "reserved" || !Number.isInteger(additionalCents) || additionalCents < 0 || reservation.consumedCents + additionalCents > reservation.reservedCents) throw new Error("BUDGET_RESERVATION_CONSUMPTION_INVALID");
  const base = { ...reservation, consumedCents: reservation.consumedCents + additionalCents };
  const { fingerprint: _fingerprint, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}

export function releaseBudgetReservation(reservation: BudgetReservation): BudgetReservation {
  assertBudgetReservation(reservation);
  if (reservation.status !== "reserved") throw new Error("BUDGET_RESERVATION_RELEASE_INVALID");
  const base = { ...reservation, status: "released" as const };
  const { fingerprint: _fingerprint, ...withoutFingerprint } = base;
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}

export async function persistBudgetReservation(root: string, reservation: BudgetReservation): Promise<BudgetReservation> {
  assertBudgetReservation(reservation);
  const target = reservationPath(root, reservation.reservationId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(reservation, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return reservation;
}

/** Atomically consumes an open reservation so concurrent provider completions cannot overspend it. */
export async function consumeBudgetReservationAtomically(root: string, reservationId: string, additionalCents: number): Promise<BudgetReservation> {
  const lockPath = resolveInside(root, `sessions/book-runs/${reservationId}.budget-reservation.lock`);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { await fs.mkdir(lockPath); acquired = true; break; }
    catch (error) {
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
  if (!acquired) throw new Error("BUDGET_RESERVATION_LOCK_TIMEOUT");
  try {
    const current = await readBudgetReservation(root, reservationId);
    if (!current) throw new Error("BUDGET_RESERVATION_NOT_FOUND");
    return await persistBudgetReservation(root, consumeBudgetReservation(current, additionalCents));
  } finally {
    await fs.rm(lockPath, { recursive: true, force: true });
  }
}

export async function readBudgetReservation(root: string, reservationId: string): Promise<BudgetReservation | null> {
  try {
    return assertBudgetReservation(JSON.parse(await fs.readFile(reservationPath(root, reservationId), "utf8")), reservationId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
