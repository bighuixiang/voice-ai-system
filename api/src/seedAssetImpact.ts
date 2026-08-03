import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface SeedAssetImpactReport {
  schemaVersion: "seed-asset-impact.v1";
  reportId: string;
  adoptionFingerprint: string;
  directFieldIds: string[];
  transitiveFieldIds: string[];
  directAssetIds: string[];
  transitiveAssetIds: string[];
  affectedAssetIds: string[];
  protectedAssetIds: string[];
  protectedAffectedAssetIds: string[];
  unaffectedAssetIds: string[];
  blockers: string[];
  status: "ready" | "blocked";
  fingerprint: string;
}

type ReceiptLike = { adoptionFingerprint: string; changedFields: readonly string[]; recompiledFields: readonly string[]; preservedFields: readonly string[] };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reportPath = (root: string, reportId: string) => resolveInside(root, `sessions/seed-asset-impacts/${reportId}.json`);

export function createSeedAssetImpactReport(input: { receipt: ReceiptLike; assetMap: Record<string, readonly string[]>; protectedAssetIds: readonly string[] }): SeedAssetImpactReport {
  if (!input.receipt.adoptionFingerprint.trim() || !input.receipt.recompiledFields.length) throw new Error("SEED_ASSET_IMPACT_INPUT_REQUIRED");
  const directFieldSet = new Set(input.receipt.changedFields);
  const recompiledFieldSet = new Set(input.receipt.recompiledFields);
  const allAssets = new Set<string>();
  const directAssets = new Set<string>();
  const transitiveAssets = new Set<string>();
  for (const [field, assets] of Object.entries(input.assetMap)) {
    for (const asset of assets) {
      if (!asset.trim()) throw new Error("SEED_ASSET_IMPACT_ASSET_INVALID");
      allAssets.add(asset);
      if (directFieldSet.has(field)) directAssets.add(asset);
      else if (recompiledFieldSet.has(field)) transitiveAssets.add(asset);
    }
  }
  for (const asset of directAssets) transitiveAssets.delete(asset);
  const affected = new Set([...directAssets, ...transitiveAssets]);
  const protectedAssets = [...new Set(input.protectedAssetIds)].sort();
  const protectedSet = new Set(protectedAssets);
  const protectedAffected = [...affected].filter((asset) => protectedSet.has(asset)).sort();
  const base = {
    schemaVersion: "seed-asset-impact.v1" as const,
    reportId: `seed-impact-${hash({ adoptionFingerprint: input.receipt.adoptionFingerprint, changedFields: [...input.receipt.changedFields], assetMap: input.assetMap, protectedAssets }).slice(0, 20)}`,
    adoptionFingerprint: input.receipt.adoptionFingerprint,
    directFieldIds: [...directFieldSet].sort(),
    transitiveFieldIds: [...recompiledFieldSet].filter((field) => !directFieldSet.has(field)).sort(),
    directAssetIds: [...directAssets].sort(),
    transitiveAssetIds: [...transitiveAssets].sort(),
    affectedAssetIds: [...affected].sort(),
    protectedAssetIds: protectedAssets,
    protectedAffectedAssetIds: protectedAffected,
    unaffectedAssetIds: [...allAssets].filter((asset) => !affected.has(asset)).sort(),
    blockers: protectedAffected.length ? ["PROTECTED_ASSET_AFFECTED"] : [],
    status: protectedAffected.length ? "blocked" as const : "ready" as const
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertSeedAssetImpactIntegrity(value: unknown): asserts value is SeedAssetImpactReport {
  if (!value || typeof value !== "object") throw new Error("SEED_ASSET_IMPACT_INTEGRITY_FAILED");
  const report = value as Record<string, unknown>;
  const arrays = ["directFieldIds", "transitiveFieldIds", "directAssetIds", "transitiveAssetIds", "affectedAssetIds", "protectedAssetIds", "protectedAffectedAssetIds", "unaffectedAssetIds", "blockers"];
  if (report.schemaVersion !== "seed-asset-impact.v1" || typeof report.reportId !== "string" || !report.reportId.trim() || typeof report.adoptionFingerprint !== "string" || !report.adoptionFingerprint.trim() || !["ready", "blocked"].includes(String(report.status)) || typeof report.fingerprint !== "string" || arrays.some((key) => !Array.isArray(report[key]) || (report[key] as unknown[]).some((item) => typeof item !== "string" || !item.trim()))) throw new Error("SEED_ASSET_IMPACT_INTEGRITY_FAILED");
  const { fingerprint, ...base } = report;
  if (hash(base) !== fingerprint) throw new Error("SEED_ASSET_IMPACT_INTEGRITY_FAILED");
}

export async function persistSeedAssetImpactReport(root: string, report: SeedAssetImpactReport): Promise<SeedAssetImpactReport> {
  assertSeedAssetImpactIntegrity(report);
  const target = reportPath(root, report.reportId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return report;
}

export async function readSeedAssetImpactReport(root: string, reportId: string): Promise<SeedAssetImpactReport | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(reportPath(root, reportId), "utf8")) as unknown;
    assertSeedAssetImpactIntegrity(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
