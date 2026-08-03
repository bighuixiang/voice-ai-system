import fs from "node:fs/promises";
import { readChapterDashboard, readLedgerEntries, readSceneCards, readStoryControl } from "./writingCockpit.js";
import { listNarrativeObligations } from "./narrativeObligation.js";
import { findUnmigratedLegacyLedgerIds, listLegacyLedgerMigrations } from "./legacyLedgerMigration.js";

export type ObligationSourceCoverageStatus =
  | "covered"
  | "partial"
  | "empty-assets-coverage-unknown"
  | "no-planned-markers";

export interface NarrativeObligationCoverageReport {
  schemaVersion: "narrative-obligation-coverage.v1";
  chapterIds: string[];
  plannedIds: string[];
  dashboardIds: string[];
  legacyLedgerIds: string[];
  migratedLegacyLedgerIds: string[];
  unmigratedLegacyLedgerIds: string[];
  registeredIds: string[];
  orphanPlannedIds: string[];
  sourceCoverageStatus: ObligationSourceCoverageStatus;
  evidenceBackedPayoffTransitionExists: boolean;
  canClaimNoOpenObligations: false;
  coverageMissing: boolean;
  unconfirmedCandidates: string[];
  generatedAt: string;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort();
}

export async function auditNarrativeObligationCoverage(root: string, chapterIds: string[]): Promise<NarrativeObligationCoverageReport> {
  const normalizedChapterIds = sorted(chapterIds);
  const planned = new Set<string>();
  const dashboard = new Set<string>();
  for (const chapterId of normalizedChapterIds) {
    const scenes = await readSceneCards(root, chapterId);
    scenes.flatMap((scene) => scene.foreshadowingIds || []).forEach((id) => planned.add(id));
    for (const beat of scenes.flatMap((scene) => scene.craftBeats || [])) {
      if (beat.type !== "foreshadow_setup" && beat.type !== "foreshadow_payoff") continue;
      for (const marker of [beat.label, beat.setup || "", beat.payoff || ""].join(" ").match(/\b(?:FS|OBL|FORESHADOW)[-_][A-Z0-9_-]+\b/gi) || []) planned.add(marker);
    }
    const currentDashboard = await readChapterDashboard(root, chapterId);
    (currentDashboard.unresolvedForeshadowingIds || []).forEach((id) => dashboard.add(id));
  }
  const storyControl = await readStoryControl(root);
  for (const event of storyControl.events || []) {
    for (const marker of (event.foreshadowing || "").match(/\b(?:FS|OBL|FORESHADOW)[-_][A-Z0-9_-]+\b/gi) || []) planned.add(marker);
    for (const beat of event.craftBeats || []) {
      if (beat.type !== "foreshadow_setup" && beat.type !== "foreshadow_payoff") continue;
      for (const marker of [beat.label, beat.setup || "", beat.payoff || ""].join(" ").match(/\b(?:FS|OBL|FORESHADOW)[-_][A-Z0-9_-]+\b/gi) || []) planned.add(marker);
    }
  }
  const legacyLedgerIds = sorted((await readLedgerEntries(root, "foreshadowing")).map((entry) => entry.id));
  const obligations = await listNarrativeObligations(root);
  const migrations = await listLegacyLedgerMigrations(root);
  const unmigratedLegacyLedgerIds = findUnmigratedLegacyLedgerIds({ legacyIds: legacyLedgerIds, receipts: migrations, obligationIds: obligations.map((item) => item.obligationId) });
  const migratedLegacyLedgerIds = legacyLedgerIds.filter((id) => !unmigratedLegacyLedgerIds.includes(id));
  const registeredIds = sorted(obligations.map((item) => item.obligationId));
  const registeredSourceRefs = new Set(obligations.flatMap((item) => item.sourceRefs || []));
  const plannedIds = sorted(planned);
  const orphanPlannedIds = plannedIds.filter((id) => !registeredSourceRefs.has(id) && !registeredIds.includes(id));
  const hasPayoff = obligations.some((item) => ["paid", "partially_paid", "transformed", "neutralized", "intentional_open"].includes(item.status));
  const sourceCoverageStatus: ObligationSourceCoverageStatus = plannedIds.length === 0
    ? "no-planned-markers"
    : orphanPlannedIds.length === 0
      ? "covered"
      : legacyLedgerIds.length === 0 && obligations.length === 0
        ? "empty-assets-coverage-unknown"
        : "partial";
  return {
    schemaVersion: "narrative-obligation-coverage.v1",
    chapterIds: normalizedChapterIds,
    plannedIds,
    dashboardIds: sorted(dashboard),
    legacyLedgerIds,
    migratedLegacyLedgerIds,
    unmigratedLegacyLedgerIds,
    registeredIds,
    orphanPlannedIds,
    sourceCoverageStatus,
    evidenceBackedPayoffTransitionExists: hasPayoff,
    canClaimNoOpenObligations: false,
    coverageMissing: orphanPlannedIds.length > 0 || (plannedIds.length > 0 && obligations.length === 0),
    unconfirmedCandidates: orphanPlannedIds,
    generatedAt: new Date().toISOString()
  };
}

export async function writeNarrativeObligationCoverage(root: string, report: NarrativeObligationCoverageReport): Promise<void> {
  const target = `${root}/sessions/obligations/coverage.json`;
  await fs.mkdir(`${root}/sessions/obligations`, { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
