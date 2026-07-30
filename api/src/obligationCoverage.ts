import fs from "node:fs/promises";
import { readChapterDashboard, readLedgerEntries, readSceneCards } from "./writingCockpit.js";
import { listNarrativeObligations } from "./narrativeObligation.js";

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
  registeredIds: string[];
  orphanPlannedIds: string[];
  sourceCoverageStatus: ObligationSourceCoverageStatus;
  evidenceBackedPayoffTransitionExists: boolean;
  canClaimNoOpenObligations: false;
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
    const currentDashboard = await readChapterDashboard(root, chapterId);
    (currentDashboard.unresolvedForeshadowingIds || []).forEach((id) => dashboard.add(id));
  }
  const legacyLedgerIds = sorted((await readLedgerEntries(root, "foreshadowing")).map((entry) => entry.id));
  const obligations = await listNarrativeObligations(root);
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
    registeredIds,
    orphanPlannedIds,
    sourceCoverageStatus,
    evidenceBackedPayoffTransitionExists: hasPayoff,
    canClaimNoOpenObligations: false,
    generatedAt: new Date().toISOString()
  };
}

export async function writeNarrativeObligationCoverage(root: string, report: NarrativeObligationCoverageReport): Promise<void> {
  const target = `${root}/sessions/obligations/coverage.json`;
  await fs.mkdir(`${root}/sessions/obligations`, { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
