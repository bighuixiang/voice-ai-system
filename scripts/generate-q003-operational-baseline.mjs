import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const novelsRoot = join(root, "novels");
const sddPath = join(root, "docs/plans/2026-07-24-novel-creative-partner-sdd.md");
const sqlitePath = join(root, "data/creative-platform.sqlite");
const outputPath = join(root, "docs/spec-governance/audits/current-q003-operational-baseline.json");
const checkOnly = process.argv.includes("--check");

const sdd = readFileSync(sddPath, "utf8");
const sddVersion = sdd.match(/(?:Discovery Draft|Specification Approved) (v\d+\.\d+(?:\.\d+)?)/)?.[1];
if (!sddVersion) throw new Error("Cannot parse the SDD version.");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countBy(rows, selector) {
  const counts = new Map();
  for (const row of rows) {
    const raw = selector(row);
    const key = typeof raw === "string" && raw.trim() ? raw : "missing";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function ratio(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : null;
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.max(0, Math.ceil(fraction * sortedValues.length) - 1)];
}

function summarizeNumbers(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { sampleCount: 0, min: null, p50: null, p95: null, max: null, average: null };
  }
  return {
    sampleCount: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
    average: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 2),
  };
}

function parseJsonLines(path) {
  if (!existsSync(path)) return { rows: [], lineCount: 0, invalidLineCount: 0, fingerprint: null };
  const buffer = readFileSync(path);
  const lines = buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim());
  const rows = [];
  let invalidLineCount = 0;
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      invalidLineCount += 1;
    }
  }
  return {
    rows,
    lineCount: lines.length,
    invalidLineCount,
    fingerprint: { bytes: buffer.byteLength, sha256: sha256(buffer) },
  };
}

function sumCounts(target, source) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function projectRef(slug) {
  return `project-${sha256(slug).slice(0, 10)}`;
}

function fileFingerprint(path) {
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  return { bytes: buffer.byteLength, sha256: sha256(buffer) };
}

function sqliteFingerprintSet(path) {
  return {
    database: fileFingerprint(path),
    wal: fileFingerprint(`${path}-wal`),
    shm: fileFingerprint(`${path}-shm`),
  };
}

const projectDirectories = existsSync(novelsRoot)
  ? readdirSync(novelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(novelsRoot, entry.name, "project.json")))
    .map((entry) => entry.name)
    .sort()
  : [];

const projects = [];
for (const directory of projectDirectories) {
  const base = join(novelsRoot, directory);
  const projectPath = join(base, "project.json");
  const project = JSON.parse(readFileSync(projectPath, "utf8"));
  const chapters = safeArray(project.chapters);
  const history = parseJsonLines(join(base, "tasks/history.jsonl"));
  const invocations = parseJsonLines(join(base, "tasks/invocations.jsonl"));
  const recaps = parseJsonLines(join(base, "tasks/recaps.jsonl"));
  const backgroundJobs = parseJsonLines(join(base, "tasks/background-jobs.jsonl"));
  const durationMs = history.rows.map((row) => row?.durationMs).filter(Number.isFinite);
  const terminalTasks = history.rows.filter((row) => ["success", "error", "cancelled"].includes(row?.status));
  const taskErrors = terminalTasks.filter((row) => row.status === "error").length;
  const proposedPatchTargetCount = invocations.rows.reduce(
    (sum, row) => sum + safeArray(row?.proposedPatchTargets).length,
    0,
  );
  const acceptedPatchTargetCount = invocations.rows.reduce(
    (sum, row) => sum + safeArray(row?.acceptedPatchTargets).length,
    0,
  );
  const qualityDirectory = join(base, "quality");
  const qualityFiles = existsSync(qualityDirectory)
    ? readdirSync(qualityDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^chapter-.+\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
    : [];
  const qualityScores = [];
  const qualityFingerprints = [];
  for (const file of qualityFiles) {
    const path = join(qualityDirectory, file);
    const buffer = readFileSync(path);
    const report = JSON.parse(buffer.toString("utf8"));
    if (Number.isFinite(report?.overallScore)) qualityScores.push(report.overallScore);
    qualityFingerprints.push({ fileKind: "chapter-quality-report", bytes: buffer.byteLength, sha256: sha256(buffer) });
  }

  projects.push({
    projectRef: projectRef(String(project.slug ?? directory)),
    substantialProject: chapters.length >= 20,
    chapters: {
      total: chapters.length,
      byStatus: countBy(chapters, (chapter) => chapter?.status),
      checkedCount: chapters.filter((chapter) => chapter?.status === "checked").length,
    },
    taskHistory: {
      total: history.rows.length,
      sourceLineCount: history.lineCount,
      invalidLineCount: history.invalidLineCount,
      byStatus: countBy(history.rows, (row) => row?.status),
      byType: countBy(history.rows, (row) => row?.type),
      terminalCount: terminalTasks.length,
      terminalErrorCount: taskErrors,
      terminalErrorRate: ratio(taskErrors, terminalTasks.length),
      durationMs: summarizeNumbers(durationMs),
    },
    invocations: {
      total: invocations.rows.length,
      sourceLineCount: invocations.lineCount,
      invalidLineCount: invocations.invalidLineCount,
      byStatus: countBy(invocations.rows, (row) => row?.status),
      byAdoptionDecision: countBy(invocations.rows, (row) => row?.adoptionDecision),
      proposedPatchTargetCount,
      acceptedPatchTargetCount,
      acceptedPatchTargetShareOfProposed: ratio(acceptedPatchTargetCount, proposedPatchTargetCount),
      denominatorWarning: "This share is not an author acceptance rate: pending, not-required, direct-save, and manual-edit semantics differ.",
    },
    backgroundJobs: {
      total: backgroundJobs.rows.length,
      sourceLineCount: backgroundJobs.lineCount,
      invalidLineCount: backgroundJobs.invalidLineCount,
      byStatus: countBy(backgroundJobs.rows, (row) => row?.status),
      byType: countBy(backgroundJobs.rows, (row) => row?.type),
    },
    recaps: {
      total: recaps.rows.length,
      sourceLineCount: recaps.lineCount,
      invalidLineCount: recaps.invalidLineCount,
    },
    fileQualityReports: {
      reportCount: qualityScores.length,
      chapterCoverage: ratio(qualityScores.length, chapters.length),
      overallScore: summarizeNumbers(qualityScores),
    },
    sourceFingerprints: {
      project: fileFingerprint(projectPath),
      taskHistory: history.fingerprint,
      invocations: invocations.fingerprint,
      backgroundJobs: backgroundJobs.fingerprint,
      recaps: recaps.fingerprint,
      qualityReports: qualityFingerprints,
    },
  });
}

const aggregateChapterStatuses = {};
const aggregateTaskStatuses = {};
const aggregateInvocationDecisions = {};
let aggregateChapters = 0;
let aggregateCheckedChapters = 0;
let aggregateDraftedChapters = 0;
let aggregateQualityReports = 0;
let aggregateTasks = 0;
let aggregateTerminalTasks = 0;
let aggregateTerminalErrors = 0;
let aggregateInvocations = 0;
let aggregateProposedTargets = 0;
let aggregateAcceptedTargets = 0;
let invalidJsonLines = 0;
for (const project of projects) {
  aggregateChapters += project.chapters.total;
  aggregateCheckedChapters += project.chapters.checkedCount;
  aggregateDraftedChapters += project.chapters.byStatus.drafted ?? 0;
  aggregateQualityReports += project.fileQualityReports.reportCount;
  aggregateTasks += project.taskHistory.total;
  aggregateTerminalTasks += project.taskHistory.terminalCount;
  aggregateTerminalErrors += project.taskHistory.terminalErrorCount;
  aggregateInvocations += project.invocations.total;
  aggregateProposedTargets += project.invocations.proposedPatchTargetCount;
  aggregateAcceptedTargets += project.invocations.acceptedPatchTargetCount;
  invalidJsonLines += project.taskHistory.invalidLineCount
    + project.invocations.invalidLineCount
    + project.backgroundJobs.invalidLineCount
    + project.recaps.invalidLineCount;
  sumCounts(aggregateChapterStatuses, project.chapters.byStatus);
  sumCounts(aggregateTaskStatuses, project.taskHistory.byStatus);
  sumCounts(aggregateInvocationDecisions, project.invocations.byAdoptionDecision);
}

function sqliteRows(database, sql) {
  return database.prepare(sql).all().map((row) => ({ ...row }));
}

let runtime = { available: false, reasonCode: existsSync(sqlitePath) ? "not-read" : "sqlite-missing" };
if (existsSync(sqlitePath)) {
  const sourceFingerprintsBefore = sqliteFingerprintSet(sqlitePath);
  const snapshotDirectory = mkdtempSync(join(tmpdir(), "q003-sqlite-"));
  const snapshotPath = join(snapshotDirectory, "creative-platform.sqlite");
  copyFileSync(sqlitePath, snapshotPath);
  if (existsSync(`${sqlitePath}-wal`)) copyFileSync(`${sqlitePath}-wal`, `${snapshotPath}-wal`);
  if (existsSync(`${sqlitePath}-shm`)) copyFileSync(`${sqlitePath}-shm`, `${snapshotPath}-shm`);
  const database = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const runs = sqliteRows(database, `
      SELECT project_slug, status, command, failure_count, rewrite_count, quality_score,
             created_at, started_at, finished_at
      FROM runtime_runs
    `);
    const events = sqliteRows(database, "SELECT project_slug, type, stage FROM runtime_events");
    const checkpoints = sqliteRows(database, "SELECT project_slug, chapter_id FROM runtime_checkpoints");
    const commands = sqliteRows(database, `
      SELECT project_slug, type, status, created_at, claimed_at, finished_at
      FROM runtime_write_commands
    `);
    const snapshots = sqliteRows(database, "SELECT project_slug, chapter_id FROM runtime_snapshots");
    const branches = sqliteRows(database, "SELECT project_slug, type, status FROM runtime_branches");
    const qualityScores = sqliteRows(database, "SELECT project_slug, chapter_id, score FROM runtime_quality_scores");
    const knowledgeRefs = sqliteRows(database, "SELECT project_slug, kind, score FROM runtime_knowledge_refs");
    const runDurations = runs.map((run) => {
      const started = Date.parse(run.started_at);
      const finished = Date.parse(run.finished_at);
      return Number.isFinite(started) && Number.isFinite(finished) && finished >= started ? finished - started : null;
    }).filter(Number.isFinite);
    const commandDurations = commands.map((command) => {
      const started = Date.parse(command.claimed_at ?? command.created_at);
      const finished = Date.parse(command.finished_at);
      return Number.isFinite(started) && Number.isFinite(finished) && finished >= started ? finished - started : null;
    }).filter(Number.isFinite);
    const qualityValues = qualityScores.map((row) => row.score).filter(Number.isFinite);
    const runQualityValues = runs.map((row) => row.quality_score).filter(Number.isFinite);
    runtime = {
      available: true,
      sourceFingerprints: sourceFingerprintsBefore,
      runs: {
        total: runs.length,
        byStatus: countBy(runs, (row) => row.status),
        byCommand: countBy(runs, (row) => row.command),
        durationMs: summarizeNumbers(runDurations),
        durationWarning: "Wall-clock run duration may include pauses, recovery, or abandoned intervals; it is not active model latency.",
        failureCountTotal: runs.reduce((sum, row) => sum + (Number(row.failure_count) || 0), 0),
        rewriteCountTotal: runs.reduce((sum, row) => sum + (Number(row.rewrite_count) || 0), 0),
        persistedQualityScore: summarizeNumbers(runQualityValues),
      },
      events: {
        total: events.length,
        byType: countBy(events, (row) => row.type),
        byStage: countBy(events, (row) => row.stage),
      },
      writeCommands: {
        total: commands.length,
        byStatus: countBy(commands, (row) => row.status),
        byType: countBy(commands, (row) => row.type),
        durationMs: summarizeNumbers(commandDurations),
        durationWarning: "Wall-clock command duration may include queueing and pause time; use it as operational exposure, not pure execution latency.",
      },
      checkpoints: { total: checkpoints.length },
      snapshots: { total: snapshots.length },
      branches: { total: branches.length, byStatus: countBy(branches, (row) => row.status) },
      qualityScores: {
        total: qualityScores.length,
        distinctProjectChapterCount: new Set(qualityScores.map((row) => `${row.project_slug}\u0000${row.chapter_id}`)).size,
        score: summarizeNumbers(qualityValues),
      },
      knowledgeRefs: { total: knowledgeRefs.length, byKind: countBy(knowledgeRefs, (row) => row.kind) },
      privacyNote: "Only selected metadata columns were queried; JSON payloads, messages, errors, labels, titles, and prose were not read into the audit.",
    };
  } finally {
    database.close();
    const resolvedTempRoot = resolve(tmpdir());
    const resolvedSnapshotDirectory = resolve(snapshotDirectory);
    if (!resolvedSnapshotDirectory.startsWith(`${resolvedTempRoot}${sep}`)) {
      throw new Error("Refusing to clean a SQLite snapshot outside the OS temp directory.");
    }
    rmSync(resolvedSnapshotDirectory, { recursive: true, force: true });
  }
  const sourceFingerprintsAfter = sqliteFingerprintSet(sqlitePath);
  if (JSON.stringify(sourceFingerprintsBefore) !== JSON.stringify(sourceFingerprintsAfter)) {
    throw new Error("Operational SQLite sources changed during Q-003 snapshot capture; retry from a stable state.");
  }
}

const substantialProjects = projects.filter((project) => project.substantialProject);
const substantialChapterCount = substantialProjects.reduce((sum, project) => sum + project.chapters.total, 0);
const substantialQualityReportCount = substantialProjects.reduce(
  (sum, project) => sum + project.fileQualityReports.reportCount,
  0,
);

const report = {
  schemaVersion: "1.0.0",
  sddVersion,
  decisionId: "Q-003",
  status: "observational-baseline-not-causal-proof",
  generatedBy: "scripts/generate-q003-operational-baseline.mjs",
  dataBoundary: {
    mode: "local-read-only-metadata-whitelist",
    projectDiscovery: "Only direct children of novels/ containing project.json are projects; checkpoint copies are excluded.",
    substantialProjectCriterion: "chapterCount >= 20; this is an audit segmentation rule, not a product classification.",
    prohibitedFields: [
      "title",
      "roughIdea",
      "chapter prose",
      "inputSummary",
      "outputSummary",
      "promptSnapshot",
      "contextSnapshot",
      "result",
      "rawOutput",
      "recap summary",
      "SQLite JSON payloads",
      "SQLite messages and errors",
    ],
    mutationPerformed: false,
    invalidJsonLineCount: invalidJsonLines,
  },
  observedFacts: {
    projects: {
      total: projects.length,
      substantialCount: substantialProjects.length,
    },
    chapters: {
      total: aggregateChapters,
      byStatus: Object.fromEntries(Object.entries(aggregateChapterStatuses).sort(([left], [right]) => left.localeCompare(right))),
      draftedCount: aggregateDraftedChapters,
      draftedShare: ratio(aggregateDraftedChapters, aggregateChapters),
      checkedCount: aggregateCheckedChapters,
      checkedShare: ratio(aggregateCheckedChapters, aggregateChapters),
    },
    fileQualityEvidence: {
      reportCount: aggregateQualityReports,
      allChapterCoverage: ratio(aggregateQualityReports, aggregateChapters),
      substantialProjectChapterCoverage: ratio(substantialQualityReportCount, substantialChapterCount),
      warning: "A report count is evidence availability, not independent proof of literary quality or author satisfaction.",
    },
    tasks: {
      total: aggregateTasks,
      byStatus: Object.fromEntries(Object.entries(aggregateTaskStatuses).sort(([left], [right]) => left.localeCompare(right))),
      terminalCount: aggregateTerminalTasks,
      terminalErrorCount: aggregateTerminalErrors,
      terminalErrorRate: ratio(aggregateTerminalErrors, aggregateTerminalTasks),
    },
    invocations: {
      total: aggregateInvocations,
      byAdoptionDecision: Object.fromEntries(
        Object.entries(aggregateInvocationDecisions).sort(([left], [right]) => left.localeCompare(right)),
      ),
      proposedPatchTargetCount: aggregateProposedTargets,
      acceptedPatchTargetCount: aggregateAcceptedTargets,
      acceptedPatchTargetShareOfProposed: ratio(aggregateAcceptedTargets, aggregateProposedTargets),
      warning: "This is not an author acceptance rate because the denominator mixes pending, not-required, direct-save, and manual-edit paths.",
    },
    runtime,
  },
  projects,
  redBlueAssessment: {
    blueCase: [
      "The repository contains enough real task and runtime metadata to reject a purely theoretical policy choice.",
      "A tiered policy can preserve hard gates while allocating deeper review to openings, turns, reveals, climaxes, payoffs, and endings.",
      "Recorded latency, terminal errors, and sparse quality/adoption evidence make an adaptive rollout safer than globally maximizing either speed or review depth.",
    ],
    redCase: [
      "The sample contains only one substantial project, so genre, author, and project diversity are not established.",
      "Quality reports and accepted patch targets are too sparse and semantically incomplete to prove causal quality improvement.",
      "Persisted running or pending states cannot be interpreted as live work, abandonment, failure, or rejection without lifecycle reconciliation.",
      "Model-generated quality scores are not independent human judgments and cannot establish reader or author satisfaction.",
    ],
  },
  candidateAssessment: [
    {
      option: "A",
      verdict: "retain-as-comparison-arm-not-proven-default",
      rationale: "Useful as a throughput baseline, but current evidence does not show that deferred deep review protects long-range obligations or literary quality.",
    },
    {
      option: "B",
      verdict: "retain-as-key-chapter-arm-not-proven-default",
      rationale: "Useful for high-risk chapters, but current latency and failure evidence plus missing causal uplift data do not justify universal maximum-depth review.",
    },
    {
      option: "C",
      verdict: "selected-by-author-as-default-policy-not-causally-proven-optimum",
      rationale: "The author selected C as the product default. This settles intent, while shadow experiments must still calibrate thresholds and cannot reinterpret the selection as causal proof of optimality or implementation evidence.",
    },
  ],
  unknowns: [
    "Author satisfaction and edit effort per candidate",
    "Reader outcome or independent literary-quality judgment",
    "Token, model, and monetary cost normalized per settled chapter",
    "True author acceptance rate across governed adoption, direct saves, and manual edits",
    "Causal quality uplift from additional candidates, reviews, and repair loops",
    "Risk-tier calibration by chapter function and genre",
    "Whether recorded running and pending states are still operationally live",
  ],
  requiredNextEvidence: [
    "Introduce policyVersion, riskTier, candidateCount, reviewCount, repairCount, elapsedMs, normalizedCost, and terminalOutcome telemetry without storing prose.",
    "Record explicit governed adoption outcomes and post-adoption manual edit distance at stable chapter boundaries.",
    "Run A/B/C in shadow or author-approved experiments with hard gates held constant; compare settled-chapter latency, failure, rework, and independent review outcomes.",
    "Do not learn or auto-promote a policy from model self-scores alone.",
  ],
  conclusion: {
    recommendedCandidate: "C",
    selectedCandidate: "C",
    selectionSource: "direct-author-answer",
    specificationActivationAllowed: true,
    runtimeActivationAllowed: false,
    statement: "C is the author-confirmed default drafting policy. It is not a causally proven optimum and remains unimplemented and runtime-inactive until the common hard gates, policy telemetry, shadow calibration, and release evidence pass.",
  },
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (checkOnly) {
  let existing = null;
  try {
    existing = readFileSync(outputPath, "utf8");
  } catch {
    // A missing output is stale.
  }
  if (existing !== output) {
    console.error(`STALE ${relative(root, outputPath)}`);
    process.exitCode = 1;
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
  console.log(`WROTE ${relative(root, outputPath)}`);
  console.log(`BASELINE ${projects.length} projects, ${aggregateTasks} tasks, ${runtime.available ? runtime.runs.total : 0} runtime runs`);
}
