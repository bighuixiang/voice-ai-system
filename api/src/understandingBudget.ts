import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { ContextManifest } from "./contextManifest.js";

export interface UnderstandingBudgetReservation {
  schemaVersion: "understanding-budget.v1";
  reservationId: string;
  projectSlug: string;
  purpose: "creative-understanding";
  units: number;
  manifestFingerprint: string;
  status: "reserved";
  providerCommit: false;
  reservedAt: string;
  fingerprint: string;
}

const locks = new Map<string, Promise<void>>();

function reservationFingerprint(reservation: UnderstandingBudgetReservation): string {
  const { fingerprint: _fingerprint, ...base } = reservation;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
}

function budgetPath(root: string): string {
  return resolveInside(root, "sessions/understanding-budget.json");
}

async function readReservation(root: string): Promise<UnderstandingBudgetReservation | null> {
  try {
    const reservation = JSON.parse(await fs.readFile(budgetPath(root), "utf8")) as UnderstandingBudgetReservation;
    if (!reservation || reservation.fingerprint !== reservationFingerprint(reservation)) throw new Error("UNDERSTANDING_BUDGET_INTEGRITY_FAILED");
    return reservation;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function writeReservation(root: string, reservation: UnderstandingBudgetReservation): Promise<void> {
  const target = budgetPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(reservation, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function withLock<T>(projectSlug: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectSlug) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(projectSlug, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(projectSlug) === current) locks.delete(projectSlug);
  }
}

export async function reserveUnderstandingBudget(
  root: string,
  projectSlug: string,
  manifest: ContextManifest | null,
  input: { reservationId: string; units: number }
): Promise<{ reservation: UnderstandingBudgetReservation; created: boolean }> {
  if (!manifest) throw new Error("T0_MANIFEST_REQUIRED");
  const reservationId = input.reservationId.trim();
  const units = Math.floor(input.units);
  if (!reservationId || !Number.isFinite(units) || units <= 0 || units > 1_000_000) throw new Error("INVALID_BUDGET_RESERVATION");

  return withLock(projectSlug, async () => {
    const existing = await readReservation(root);
    if (existing?.reservationId === reservationId && existing.manifestFingerprint === manifest.sourceFingerprint && existing.units === units) {
      return { reservation: existing, created: false };
    }
    const base = {
      schemaVersion: "understanding-budget.v1" as const,
      reservationId,
      projectSlug,
      purpose: "creative-understanding" as const,
      units,
      manifestFingerprint: manifest.sourceFingerprint,
      status: "reserved" as const,
      providerCommit: false as const,
      reservedAt: new Date().toISOString()
    };
    const reservation = {
      ...base,
      fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex")
    };
    await writeReservation(root, reservation);
    return { reservation, created: true };
  });
}

export async function readUnderstandingBudget(root: string): Promise<UnderstandingBudgetReservation | null> {
  return readReservation(root);
}
