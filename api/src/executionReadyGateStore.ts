import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ExecutionReadyGateReport } from "./executionReadyGate.js";

const filePath = (root: string) => path.join(root, "sessions", "execution-ready-gate.json");
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertIntegrity(value: ExecutionReadyGateReport): ExecutionReadyGateReport {
  const { fingerprint: _fingerprint, ...base } = value;
  if (value.schemaVersion !== "execution-ready-gate.v1" || !value.projectSlug.trim() || !value.outlineVersionId.trim() || !["ready", "blocked"].includes(value.status) || typeof value.executionReady !== "boolean" || !Array.isArray(value.checks) || !value.checks.length || value.checks.some((check) => !check || typeof check.checkId !== "string" || !["passed", "failed"].includes(check.status) || typeof check.detail !== "string") || !/^[a-f0-9]{64}$/i.test(value.fingerprint) || hash(base) !== value.fingerprint) throw new Error("EXECUTION_READY_GATE_INTEGRITY_FAILED");
  return value;
}

export async function readExecutionReadyGateReport(root: string): Promise<ExecutionReadyGateReport | null> {
  try {
    return assertIntegrity(JSON.parse(await fs.readFile(filePath(root), "utf8")) as ExecutionReadyGateReport);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    if (error instanceof Error && error.message === "EXECUTION_READY_GATE_INTEGRITY_FAILED") throw new Error("EXECUTION_READY_GATE_CORRUPT");
    throw error;
  }
}

export async function persistExecutionReadyGateReport(root: string, report: ExecutionReadyGateReport, expectedProjectSlug?: string): Promise<ExecutionReadyGateReport> {
  if (!report.projectSlug.trim() || (expectedProjectSlug !== undefined && report.projectSlug !== expectedProjectSlug)) throw new Error("EXECUTION_READY_GATE_PROJECT_MISMATCH");
  assertIntegrity(report);
  const existing = await readExecutionReadyGateReport(root);
  if (existing && existing.fingerprint === report.fingerprint) return existing;
  await fs.mkdir(path.dirname(filePath(root)), { recursive: true });
  const temporary = `${filePath(root)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath(root));
  return report;
}
