import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BudgetReservation } from "./budgetReservation.js";
import { persistBudgetReservation, readBudgetReservation, settleBudgetReservation } from "./budgetReservation.js";
import { readModelInvocations, type ModelInvocationRecord } from "./modelInvocationLedger.js";
import { resolveInside } from "./pathSafety.js";
import { verifyModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";

export interface ModelInvocationSettlement {
  schemaVersion: "model-invocation-settlement.v1";
  settlementId: string;
  invocationId: string;
  invocationFingerprint: string;
  reservationId: string;
  bookRunId: string;
  projectSlug: string;
  consumedCents: number;
  costMeasurement: "actual" | "estimated";
  status: "settled";
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const settlementPath = (root: string, id: string): string => resolveInside(root, `sessions/model-invocation-settlements/${id}.json`);

function costToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("MODEL_INVOCATION_COST_INVALID");
  // A fractional cent is always rounded up so an estimate cannot understate spend.
  return Math.ceil(amount * 100 - Number.EPSILON);
}

export function assertModelInvocationSettlementIntegrity(settlement: ModelInvocationSettlement, expectedId?: string): ModelInvocationSettlement {
  const { fingerprint, ...base } = settlement;
  const valid = settlement.schemaVersion === "model-invocation-settlement.v1" && (!expectedId || settlement.settlementId === expectedId) && [settlement.settlementId, settlement.invocationId, settlement.invocationFingerprint, settlement.reservationId, settlement.bookRunId, settlement.projectSlug, settlement.createdAt].every((value) => typeof value === "string" && value.trim()) && /^[a-f0-9]{64}$/i.test(settlement.invocationFingerprint) && Number.isInteger(settlement.consumedCents) && settlement.consumedCents >= 0 && ["actual", "estimated"].includes(settlement.costMeasurement) && settlement.status === "settled" && !Number.isNaN(Date.parse(settlement.createdAt)) && /^[a-f0-9]{64}$/i.test(settlement.fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("MODEL_INVOCATION_SETTLEMENT_INTEGRITY_FAILED");
  return settlement;
}

export function settleModelInvocation(input: { invocation: ModelInvocationRecord; reservation: BudgetReservation; createdAt?: string }): ModelInvocationSettlement {
  const { invocation, reservation } = input;
  if (!invocation.bookRunId || !invocation.budgetReservationId || invocation.bookRunId !== reservation.bookRunId || invocation.budgetReservationId !== reservation.reservationId) {
    throw new Error("MODEL_INVOCATION_RESERVATION_MISMATCH");
  }
  if (!/^[a-f0-9]{64}$/i.test(invocation.fingerprint)) throw new Error("MODEL_INVOCATION_FINGERPRINT_REQUIRED");
  if (!invocation.invocationId.trim() || !reservation.projectSlug.trim()) throw new Error("MODEL_INVOCATION_SETTLEMENT_INPUT_INVALID");
  const consumedCents = costToCents(invocation.cost.amount);
  // Validate the reservation lifecycle and enforce the hard ceiling before issuing a receipt.
  settleBudgetReservation(reservation, consumedCents);
  const base = {
    schemaVersion: "model-invocation-settlement.v1" as const,
    settlementId: `invocation-settlement-${invocation.invocationId}`,
    invocationId: invocation.invocationId,
    invocationFingerprint: invocation.fingerprint,
    reservationId: reservation.reservationId,
    bookRunId: reservation.bookRunId,
    projectSlug: reservation.projectSlug,
    consumedCents,
    costMeasurement: invocation.cost.measurement,
    status: "settled" as const,
    createdAt: input.createdAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export async function persistModelInvocationSettlement(root: string, settlement: ModelInvocationSettlement, reservation: BudgetReservation): Promise<{ settlement: ModelInvocationSettlement; reservation: BudgetReservation }> {
  if (settlement.projectSlug !== reservation.projectSlug || settlement.bookRunId !== reservation.bookRunId || settlement.reservationId !== reservation.reservationId) {
    throw new Error("MODEL_INVOCATION_SETTLEMENT_SCOPE_MISMATCH");
  }
  const target = settlementPath(root, settlement.settlementId);
  try {
    const existing = assertModelInvocationSettlementIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ModelInvocationSettlement, settlement.settlementId);
    if (existing.fingerprint !== settlement.fingerprint || existing.invocationId !== settlement.invocationId || existing.reservationId !== settlement.reservationId) throw new Error("MODEL_INVOCATION_SETTLEMENT_CONFLICT");
    const current = await readBudgetReservation(root, reservation.reservationId);
    if (!current) throw new Error("MODEL_INVOCATION_RESERVATION_NOT_FOUND");
    return { settlement: existing, reservation: current };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  const settledReservation = settleBudgetReservation(reservation, settlement.consumedCents);
  await persistBudgetReservation(root, settledReservation);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { settlement, reservation: settledReservation };
}

export async function settlePersistedModelInvocation(root: string, invocationId: string, reservationId: string): Promise<{ settlement: ModelInvocationSettlement; reservation: BudgetReservation }> {
  const settlementId = `invocation-settlement-${invocationId}`;
  try {
    const existing = assertModelInvocationSettlementIntegrity(JSON.parse(await fs.readFile(settlementPath(root, settlementId), "utf8")) as ModelInvocationSettlement, settlementId);
    if (existing.invocationId !== invocationId || existing.reservationId !== reservationId) throw new Error("MODEL_INVOCATION_SETTLEMENT_CONFLICT");
    const current = await readBudgetReservation(root, reservationId);
    if (!current) throw new Error("MODEL_INVOCATION_RESERVATION_NOT_FOUND");
    return { settlement: existing, reservation: current };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  const invocation = (await readModelInvocations(root)).find((record) => record.invocationId === invocationId);
  if (!invocation) throw new Error("MODEL_INVOCATION_NOT_FOUND");
  const reservation = await readBudgetReservation(root, reservationId);
  if (!reservation) throw new Error("MODEL_INVOCATION_RESERVATION_NOT_FOUND");
  if (invocation.authorityBinding) await verifyModelInvocationAuthorityBinding(root, invocation.authorityBinding);
  const settlement = settleModelInvocation({ invocation, reservation });
  return persistModelInvocationSettlement(root, settlement, reservation);
}
