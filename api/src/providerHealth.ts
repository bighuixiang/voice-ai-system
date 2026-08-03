import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { retryClassFor } from "./modelInvocationLedger.js";

export type ProviderHealthState = "closed" | "open" | "half-open";
export interface ProviderHealthRecord {
  schemaVersion: "provider-health.v1";
  providerRef: string;
  state: ProviderHealthState;
  consecutiveFailures: number;
  failureThreshold: number;
  cooldownMs: number;
  openedAt?: string;
  halfOpenProbeInFlight: boolean;
  updatedAt: string;
  fingerprint: string;
}
export interface ProviderAttemptDecision { schemaVersion: "provider-attempt-decision.v1"; providerRef: string; state: ProviderHealthState; allow: boolean; consecutiveFailures: number; recoveryAt?: string; reason: string; fingerprint: string; }

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const providerPath = (root: string, providerRef: string): string => resolveInside(root, "sessions/provider-health/" + crypto.createHash("sha256").update(providerRef).digest("hex") + ".json");
const validateNow = (now: string): void => { if (!Number.isFinite(Date.parse(now))) throw new Error("PROVIDER_HEALTH_TIME_INVALID"); };

async function withProviderLock<T>(root: string, providerRef: string, action: () => Promise<T>): Promise<T> {
  const target = providerPath(root, providerRef);
  const lockPath = target + ".lock";
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await fs.mkdir(lockPath);
      try {
        return await action();
      } finally {
        await fs.rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw new Error("PROVIDER_HEALTH_LOCK_TIMEOUT");
}

function buildRecord(input: { providerRef: string; state: ProviderHealthState; consecutiveFailures: number; failureThreshold: number; cooldownMs: number; openedAt?: string; halfOpenProbeInFlight: boolean; updatedAt: string }): ProviderHealthRecord {
  const base = { schemaVersion: "provider-health.v1" as const, ...input };
  return { ...base, fingerprint: hash(base) };
}

export function assertProviderHealthIntegrity(record: ProviderHealthRecord): ProviderHealthRecord {
  const { fingerprint, ...base } = record;
  if (record.schemaVersion !== "provider-health.v1" || !record.providerRef.trim() || !["closed", "open", "half-open"].includes(record.state) || !Number.isInteger(record.consecutiveFailures) || record.consecutiveFailures < 0 || !Number.isInteger(record.failureThreshold) || record.failureThreshold < 1 || !Number.isInteger(record.cooldownMs) || record.cooldownMs < 0 || typeof record.halfOpenProbeInFlight !== "boolean" || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt)) || (record.openedAt !== undefined && (typeof record.openedAt !== "string" || !Number.isFinite(Date.parse(record.openedAt)))) || (record.state === "closed" && record.openedAt !== undefined) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("PROVIDER_HEALTH_INTEGRITY_FAILED");
  return record;
}
const assertRecord = assertProviderHealthIntegrity;

async function persistProviderHealth(root: string, record: ProviderHealthRecord): Promise<ProviderHealthRecord> {
  assertRecord(record);
  const target = providerPath(root, record.providerRef);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + "." + process.pid + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(record, null, 2) + "\n", "utf8");
  await fs.rename(temporary, target);
  return record;
}

export async function readProviderHealth(root: string, providerRef: string): Promise<ProviderHealthRecord | null> {
  if (!providerRef.trim()) throw new Error("PROVIDER_HEALTH_PROVIDER_REQUIRED");
  try { return assertRecord(JSON.parse(await fs.readFile(providerPath(root, providerRef), "utf8")) as ProviderHealthRecord); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function initial(providerRef: string, failureThreshold: number, cooldownMs: number, now: string): ProviderHealthRecord {
  return buildRecord({ providerRef, state: "closed", consecutiveFailures: 0, failureThreshold, cooldownMs, halfOpenProbeInFlight: false, updatedAt: now });
}

function decision(providerRef: string, state: ProviderHealthState, allow: boolean, consecutiveFailures: number, reason: string, openedAt?: string, cooldownMs?: number): ProviderAttemptDecision {
  const recoveryAt = openedAt && cooldownMs !== undefined ? new Date(Date.parse(openedAt) + cooldownMs).toISOString() : undefined;
  const base = { schemaVersion: "provider-attempt-decision.v1" as const, providerRef, state, allow, consecutiveFailures, ...(recoveryAt ? { recoveryAt } : {}), reason };
  return { ...base, fingerprint: hash(base) };
}

export async function authorizeProviderAttempt(root: string, providerRef: string, now: string): Promise<ProviderAttemptDecision> {
  validateNow(now);
  return withProviderLock(root, providerRef, async () => {
    const current = (await readProviderHealth(root, providerRef)) || initial(providerRef, 3, 30_000, now);
    if (current.state === "closed") return decision(providerRef, "closed", true, current.consecutiveFailures, "circuit closed");
    if (current.state === "half-open" && current.halfOpenProbeInFlight) return decision(providerRef, "open", false, current.consecutiveFailures, "half-open recovery probe already in flight", current.openedAt, current.cooldownMs);
    const recoveryAt = current.openedAt ? Date.parse(current.openedAt) + current.cooldownMs : Number.POSITIVE_INFINITY;
    if (Date.parse(now) < recoveryAt) return decision(providerRef, "open", false, current.consecutiveFailures, "circuit open until cooldown elapses", current.openedAt, current.cooldownMs);
    await persistProviderHealth(root, buildRecord({ providerRef: current.providerRef, state: "half-open", consecutiveFailures: current.consecutiveFailures, failureThreshold: current.failureThreshold, cooldownMs: current.cooldownMs, ...(current.openedAt ? { openedAt: current.openedAt } : {}), halfOpenProbeInFlight: true, updatedAt: now }));
    return decision(providerRef, "half-open", true, current.consecutiveFailures, "cooldown elapsed; one recovery probe admitted", current.openedAt, current.cooldownMs);
  });
}

export async function recordProviderFailure(root: string, providerRef: string, errorCode: string, input: { now: string; failureThreshold?: number; cooldownMs?: number }): Promise<ProviderHealthRecord> {
  validateNow(input.now);
  return withProviderLock(root, providerRef, async () => {
    const current = (await readProviderHealth(root, providerRef)) || initial(providerRef, input.failureThreshold ?? 3, input.cooldownMs ?? 30_000, input.now);
    if (retryClassFor(errorCode) !== "transient") return current;
    const threshold = input.failureThreshold ?? current.failureThreshold;
    const cooldownMs = input.cooldownMs ?? current.cooldownMs;
    const consecutiveFailures = current.consecutiveFailures + 1;
    return persistProviderHealth(root, buildRecord({ providerRef, state: consecutiveFailures >= threshold ? "open" : "closed", consecutiveFailures, failureThreshold: threshold, cooldownMs, ...(consecutiveFailures >= threshold ? { openedAt: input.now } : {}), halfOpenProbeInFlight: false, updatedAt: input.now }));
  });
}

export async function recordProviderSuccess(root: string, providerRef: string, now: string): Promise<ProviderHealthRecord> {
  validateNow(now);
  return withProviderLock(root, providerRef, async () => {
    const current = (await readProviderHealth(root, providerRef)) || initial(providerRef, 3, 30_000, now);
    return persistProviderHealth(root, buildRecord({ providerRef, state: "closed", consecutiveFailures: 0, failureThreshold: current.failureThreshold, cooldownMs: current.cooldownMs, halfOpenProbeInFlight: false, updatedAt: now }));
  });
}
