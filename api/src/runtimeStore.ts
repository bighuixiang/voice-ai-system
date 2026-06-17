import type {
  NarrativeSnapshot,
  RuntimeCheckpoint,
  RuntimeCommand,
  RuntimeCommandStatus,
  RuntimeCommandType,
  RuntimeDerivativeBranch,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeKnowledgeRef,
  RuntimePipelineStage,
  RuntimeRun,
  RuntimeRunStatus,
  RuntimeSnapshotRecord,
  RuntimeStatusSnapshot
} from "./types.js";
import { openDatabase } from "./database.js";

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToRun(row: Record<string, unknown>): RuntimeRun {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    chapterId: typeof row.chapter_id === "string" ? row.chapter_id : undefined,
    branchId: typeof row.branch_id === "string" ? row.branch_id : undefined,
    status: row.status as RuntimeRunStatus,
    currentStage: typeof row.current_stage === "string" ? (row.current_stage as RuntimePipelineStage) : undefined,
    command: row.command as RuntimeCommandType,
    input: parseJson<Record<string, unknown>>(row.input_json, {}),
    result: parseJson<Record<string, unknown> | undefined>(row.result_json, undefined),
    error: typeof row.error === "string" ? row.error : undefined,
    failureCount: Number(row.failure_count || 0),
    rewriteCount: Number(row.rewrite_count || 0),
    qualityScore: typeof row.quality_score === "number" ? row.quality_score : undefined,
    createdAt: String(row.created_at),
    startedAt: typeof row.started_at === "string" ? row.started_at : undefined,
    updatedAt: String(row.updated_at),
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : undefined
  };
}

function rowToCommand(row: Record<string, unknown>): RuntimeCommand {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    type: row.type as RuntimeCommandType,
    status: row.status as RuntimeCommandStatus,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
    createdAt: String(row.created_at),
    claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : undefined,
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : undefined,
    updatedAt: String(row.updated_at)
  };
}

function rowToEvent(row: Record<string, unknown>): RuntimeEvent {
  return {
    id: Number(row.id),
    eventId: String(row.event_id),
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    projectSlug: String(row.project_slug),
    type: row.type as RuntimeEventType,
    stage: typeof row.stage === "string" ? (row.stage as RuntimePipelineStage) : undefined,
    message: String(row.message),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdAt: String(row.created_at)
  };
}

function rowToCheckpoint(row: Record<string, unknown>): RuntimeCheckpoint {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    chapterId: typeof row.chapter_id === "string" ? row.chapter_id : undefined,
    label: String(row.label),
    manifest: parseJson(row.manifest_json, []),
    createdAt: String(row.created_at)
  };
}

function rowToBranch(row: Record<string, unknown>): RuntimeDerivativeBranch {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    baseRunId: typeof row.base_run_id === "string" ? row.base_run_id : undefined,
    sourceChapterId: typeof row.source_chapter_id === "string" ? row.source_chapter_id : undefined,
    type: row.type as RuntimeDerivativeBranch["type"],
    title: String(row.title),
    status: row.status as RuntimeDerivativeBranch["status"],
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToSnapshot(row: Record<string, unknown>): RuntimeSnapshotRecord {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    runId: String(row.run_id),
    chapterId: String(row.chapter_id),
    snapshot: parseJson<NarrativeSnapshot>(row.snapshot_json, {
      projectSlug: String(row.project_slug),
      chapterId: String(row.chapter_id),
      chapterTitle: "",
      contextBlocks: [],
      summarySignals: [],
      ledgerSignals: [],
      knowledgeSignals: { factCount: 0, tripleCount: 0, indexedChapterCount: 0 },
      qualityRisks: [],
      createdAt: String(row.created_at)
    }),
    createdAt: String(row.created_at)
  };
}

function rowToKnowledgeRef(row: Record<string, unknown>): RuntimeKnowledgeRef {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug),
    runId: String(row.run_id),
    chapterId: String(row.chapter_id),
    kind: row.kind as RuntimeKnowledgeRef["kind"],
    refId: String(row.ref_id),
    label: String(row.label),
    score: typeof row.score === "number" ? row.score : undefined,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdAt: String(row.created_at)
  };
}

export function createRuntimeRun(input: {
  projectSlug: string;
  chapterId?: string;
  branchId?: string;
  command?: RuntimeCommandType;
  payload?: Record<string, unknown>;
}): RuntimeRun {
  const timestamp = nowIso();
  const run: RuntimeRun = {
    id: id("run"),
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    branchId: input.branchId,
    status: "queued",
    command: input.command || "start",
    input: input.payload || {},
    failureCount: 0,
    rewriteCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const database = openDatabase();
  try {
    database
      .prepare(
        `
        INSERT INTO runtime_runs (
          id, project_slug, chapter_id, branch_id, status, current_stage, command, input_json,
          result_json, error, failure_count, rewrite_count, quality_score, created_at, started_at, updated_at, finished_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        run.id,
        run.projectSlug,
        run.chapterId || null,
        run.branchId || null,
        run.status,
        run.currentStage || null,
        run.command,
        json(run.input),
        null,
        null,
        run.failureCount,
        run.rewriteCount,
        null,
        run.createdAt,
        null,
        run.updatedAt,
        null
      );
    return run;
  } finally {
    database.close();
  }
}

export function updateRuntimeRun(
  runId: string,
  patch: Partial<Pick<RuntimeRun, "status" | "currentStage" | "chapterId" | "branchId" | "result" | "error" | "failureCount" | "rewriteCount" | "qualityScore" | "startedAt" | "finishedAt">>
): RuntimeRun | null {
  const current = getRuntimeRun(runId);
  if (!current) return null;
  const updated: RuntimeRun = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };
  const database = openDatabase();
  try {
    database
      .prepare(
        `
        UPDATE runtime_runs SET
          chapter_id = ?, branch_id = ?, status = ?, current_stage = ?, result_json = ?, error = ?,
          failure_count = ?, rewrite_count = ?, quality_score = ?, started_at = ?, updated_at = ?, finished_at = ?
        WHERE id = ?
      `
      )
      .run(
        updated.chapterId || null,
        updated.branchId || null,
        updated.status,
        updated.currentStage || null,
        updated.result ? json(updated.result) : null,
        updated.error || null,
        updated.failureCount,
        updated.rewriteCount,
        typeof updated.qualityScore === "number" ? updated.qualityScore : null,
        updated.startedAt || null,
        updated.updatedAt,
        updated.finishedAt || null,
        updated.id
      );
    return updated;
  } finally {
    database.close();
  }
}

export function getRuntimeRun(runId: string): RuntimeRun | null {
  const database = openDatabase();
  try {
    const row = database.prepare("SELECT * FROM runtime_runs WHERE id = ?").get(runId);
    return row ? rowToRun(row) : null;
  } finally {
    database.close();
  }
}

export function listRuntimeRuns(projectSlug: string, limit = 20): RuntimeRun[] {
  const database = openDatabase();
  try {
    return database
      .prepare("SELECT * FROM runtime_runs WHERE project_slug = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?")
      .all(projectSlug, limit)
      .map(rowToRun);
  } finally {
    database.close();
  }
}

export function latestActiveRun(projectSlug: string): RuntimeRun | undefined {
  return listRuntimeRuns(projectSlug, 50).find((run) => ["queued", "running", "paused", "review_required"].includes(run.status));
}

export function enqueueRuntimeCommand(input: {
  projectSlug: string;
  runId?: string;
  type: RuntimeCommandType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): RuntimeCommand {
  const timestamp = nowIso();
  const command: RuntimeCommand = {
    id: id("cmd"),
    projectSlug: input.projectSlug,
    runId: input.runId,
    type: input.type,
    status: "pending",
    payload: input.payload || {},
    idempotencyKey: input.idempotencyKey,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const database = openDatabase();
  try {
    if (input.idempotencyKey) {
      const existing = database
        .prepare("SELECT * FROM runtime_write_commands WHERE idempotency_key = ?")
        .get(input.idempotencyKey);
      if (existing) return rowToCommand(existing);
    }
    database
      .prepare(
        `
        INSERT INTO runtime_write_commands (
          id, project_slug, run_id, type, status, payload_json, idempotency_key, error,
          created_at, claimed_at, finished_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        command.id,
        command.projectSlug,
        command.runId || null,
        command.type,
        command.status,
        json(command.payload),
        command.idempotencyKey || null,
        null,
        command.createdAt,
        null,
        null,
        command.updatedAt
      );
    return command;
  } finally {
    database.close();
  }
}

export function claimNextRuntimeCommand(): RuntimeCommand | null {
  const database = openDatabase();
  try {
    const row = database
      .prepare("SELECT * FROM runtime_write_commands WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1")
      .get();
    if (!row) return null;
    const timestamp = nowIso();
    database
      .prepare("UPDATE runtime_write_commands SET status = 'claimed', claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(timestamp, timestamp, row.id);
    const claimed = database.prepare("SELECT * FROM runtime_write_commands WHERE id = ?").get(row.id);
    return claimed ? rowToCommand(claimed) : null;
  } finally {
    database.close();
  }
}

export function recoverStaleRuntimeCommands(maxAgeMs = 10 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  const timestamp = nowIso();
  const database = openDatabase();
  try {
    const staleCommands = database
      .prepare("SELECT * FROM runtime_write_commands WHERE status = 'claimed'")
      .all()
      .filter((row) => {
        const claimedAt = typeof row.claimed_at === "string" ? Date.parse(row.claimed_at) : Number.NaN;
        const updatedAt = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : Number.NaN;
        const observedAt = Number.isFinite(claimedAt) ? claimedAt : updatedAt;
        return Number.isFinite(observedAt) && observedAt <= cutoff;
      });
    if (!staleCommands.length) return 0;

    const resetCommand = database.prepare(
      "UPDATE runtime_write_commands SET status = 'pending', claimed_at = NULL, updated_at = ? WHERE id = ? AND status = 'claimed'"
    );
    const resetRun = database.prepare(
      "UPDATE runtime_runs SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'running'"
    );
    for (const command of staleCommands) {
      resetCommand.run(timestamp, command.id);
      if (
        typeof command.run_id === "string" &&
        (command.type === "start" || command.type === "resume" || command.type === "rewrite")
      ) {
        resetRun.run(timestamp, command.run_id);
      }
    }
    return staleCommands.length;
  } finally {
    database.close();
  }
}

export function recoverStaleRuntimeRuns(maxAgeMs = 10 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  const timestamp = nowIso();
  const database = openDatabase();
  try {
    const staleRuns = database
      .prepare(
        `
        SELECT * FROM runtime_runs
        WHERE status = 'running'
          AND NOT EXISTS (
            SELECT 1 FROM runtime_write_commands
            WHERE runtime_write_commands.run_id = runtime_runs.id
              AND runtime_write_commands.status IN ('pending', 'claimed')
          )
      `
      )
      .all()
      .filter((row) => {
        const updatedAt = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : Number.NaN;
        const startedAt = typeof row.started_at === "string" ? Date.parse(row.started_at) : Number.NaN;
        const observedAt = Number.isFinite(updatedAt) ? updatedAt : startedAt;
        return Number.isFinite(observedAt) && observedAt <= cutoff;
      });
    if (!staleRuns.length) return 0;

    const updateRun = database.prepare(
      `
      UPDATE runtime_runs SET
        status = 'review_required',
        result_json = ?,
        error = ?,
        updated_at = ?,
        finished_at = ?
      WHERE id = ? AND status = 'running'
    `
    );
    const insertEvent = database.prepare(
      `
      INSERT INTO runtime_events (event_id, run_id, project_slug, type, stage, message, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const row of staleRuns) {
      const run = rowToRun(row);
      const result = {
        ...(run.result || {}),
        reason: "stale_runtime_recovery",
        previousStage: run.currentStage,
        recoveredAt: timestamp
      };
      updateRun.run(
        json(result),
        "Runtime worker stopped while this run was active; review before resuming.",
        timestamp,
        timestamp,
        run.id
      );
      insertEvent.run(
        id("evt"),
        run.id,
        run.projectSlug,
        "review",
        run.currentStage || null,
        "Runtime run recovered after worker restart",
        json({ reason: "stale_runtime_recovery", previousStage: run.currentStage }),
        timestamp
      );
    }
    return staleRuns.length;
  } finally {
    database.close();
  }
}

export function finishRuntimeCommand(commandId: string, status: Extract<RuntimeCommandStatus, "succeeded" | "failed" | "cancelled">, error?: string): void {
  const timestamp = nowIso();
  const database = openDatabase();
  try {
    database
      .prepare("UPDATE runtime_write_commands SET status = ?, error = ?, finished_at = ?, updated_at = ? WHERE id = ?")
      .run(status, error || null, timestamp, timestamp, commandId);
  } finally {
    database.close();
  }
}

export function appendRuntimeEvent(input: {
  projectSlug: string;
  runId?: string;
  type: RuntimeEventType;
  stage?: RuntimePipelineStage;
  message: string;
  payload?: Record<string, unknown>;
}): RuntimeEvent {
  const eventId = id("evt");
  const createdAt = nowIso();
  const database = openDatabase();
  try {
    database
      .prepare(
        `
        INSERT INTO runtime_events (event_id, run_id, project_slug, type, stage, message, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(eventId, input.runId || null, input.projectSlug, input.type, input.stage || null, input.message, json(input.payload || {}), createdAt);
    const row = database.prepare("SELECT * FROM runtime_events WHERE event_id = ?").get(eventId);
    return rowToEvent(row as Record<string, unknown>);
  } finally {
    database.close();
  }
}

export function listRuntimeEvents(projectSlug: string, afterId = 0, limit = 100): RuntimeEvent[] {
  const database = openDatabase();
  try {
    return database
      .prepare("SELECT * FROM runtime_events WHERE project_slug = ? AND id > ? ORDER BY id ASC LIMIT ?")
      .all(projectSlug, afterId, limit)
      .map(rowToEvent);
  } finally {
    database.close();
  }
}

export function insertRuntimeCheckpoint(checkpoint: RuntimeCheckpoint): RuntimeCheckpoint {
  const database = openDatabase();
  try {
    database
      .prepare(
        `
        INSERT OR REPLACE INTO runtime_checkpoints (id, project_slug, run_id, chapter_id, label, manifest_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        checkpoint.id,
        checkpoint.projectSlug,
        checkpoint.runId || null,
        checkpoint.chapterId || null,
        checkpoint.label,
        json(checkpoint.manifest),
        checkpoint.createdAt
      );
    return checkpoint;
  } finally {
    database.close();
  }
}

export function getRuntimeCheckpoint(checkpointId: string): RuntimeCheckpoint | null {
  const database = openDatabase();
  try {
    const row = database.prepare("SELECT * FROM runtime_checkpoints WHERE id = ?").get(checkpointId);
    return row ? rowToCheckpoint(row) : null;
  } finally {
    database.close();
  }
}

export function listRuntimeCheckpoints(projectSlug: string, limit = 20): RuntimeCheckpoint[] {
  const database = openDatabase();
  try {
    return database
      .prepare("SELECT * FROM runtime_checkpoints WHERE project_slug = ? ORDER BY created_at DESC LIMIT ?")
      .all(projectSlug, limit)
      .map(rowToCheckpoint);
  } finally {
    database.close();
  }
}

export function insertRuntimeSnapshot(input: {
  projectSlug: string;
  runId: string;
  chapterId: string;
  snapshot: NarrativeSnapshot;
}): RuntimeSnapshotRecord {
  const record: RuntimeSnapshotRecord = {
    id: id("snapshot"),
    projectSlug: input.projectSlug,
    runId: input.runId,
    chapterId: input.chapterId,
    snapshot: input.snapshot,
    createdAt: nowIso()
  };
  const database = openDatabase();
  try {
    database
      .prepare(
        "INSERT INTO runtime_snapshots (id, project_slug, run_id, chapter_id, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(record.id, record.projectSlug, record.runId, record.chapterId, json(record.snapshot), record.createdAt);
    return record;
  } finally {
    database.close();
  }
}

export function getLatestRuntimeSnapshot(projectSlug: string, runId?: string): RuntimeSnapshotRecord | undefined {
  const database = openDatabase();
  try {
    const row = runId
      ? database
          .prepare("SELECT * FROM runtime_snapshots WHERE project_slug = ? AND run_id = ? ORDER BY created_at DESC LIMIT 1")
          .get(projectSlug, runId)
      : database.prepare("SELECT * FROM runtime_snapshots WHERE project_slug = ? ORDER BY created_at DESC LIMIT 1").get(projectSlug);
    return row ? rowToSnapshot(row) : undefined;
  } finally {
    database.close();
  }
}

export function insertRuntimeKnowledgeRefs(
  refs: Array<Omit<RuntimeKnowledgeRef, "id" | "createdAt"> & { id?: string; createdAt?: string }>
): RuntimeKnowledgeRef[] {
  if (!refs.length) return [];
  const createdAt = nowIso();
  const records: RuntimeKnowledgeRef[] = refs.map((ref) => ({
    ...ref,
    id: ref.id || id("knowref"),
    createdAt: ref.createdAt || createdAt
  }));
  const database = openDatabase();
  try {
    const statement = database.prepare(
      `
      INSERT OR REPLACE INTO runtime_knowledge_refs (
        id, project_slug, run_id, chapter_id, kind, ref_id, label, score, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const record of records) {
      statement.run(
        record.id,
        record.projectSlug,
        record.runId,
        record.chapterId,
        record.kind,
        record.refId,
        record.label,
        typeof record.score === "number" ? record.score : null,
        json(record.payload),
        record.createdAt
      );
    }
    return records;
  } finally {
    database.close();
  }
}

export function listRuntimeKnowledgeRefs(projectSlug: string, runId?: string, limit = 30): RuntimeKnowledgeRef[] {
  const database = openDatabase();
  try {
    const rows = runId
      ? database
          .prepare("SELECT * FROM runtime_knowledge_refs WHERE project_slug = ? AND run_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(projectSlug, runId, limit)
      : database.prepare("SELECT * FROM runtime_knowledge_refs WHERE project_slug = ? ORDER BY created_at DESC LIMIT ?").all(projectSlug, limit);
    return rows.map(rowToKnowledgeRef);
  } finally {
    database.close();
  }
}

export function createRuntimeBranch(input: {
  projectSlug: string;
  baseRunId?: string;
  sourceChapterId?: string;
  type: RuntimeDerivativeBranch["type"];
  title: string;
  payload?: Record<string, unknown>;
}): RuntimeDerivativeBranch {
  const timestamp = nowIso();
  const branch: RuntimeDerivativeBranch = {
    id: id("branch"),
    projectSlug: input.projectSlug,
    baseRunId: input.baseRunId,
    sourceChapterId: input.sourceChapterId,
    type: input.type,
    title: input.title,
    status: "draft",
    payload: input.payload || {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const database = openDatabase();
  try {
    database
      .prepare(
        `
        INSERT INTO runtime_branches (
          id, project_slug, base_run_id, source_chapter_id, type, title, status, payload_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        branch.id,
        branch.projectSlug,
        branch.baseRunId || null,
        branch.sourceChapterId || null,
        branch.type,
        branch.title,
        branch.status,
        json(branch.payload),
        branch.createdAt,
        branch.updatedAt
      );
    return branch;
  } finally {
    database.close();
  }
}

export function getRuntimeBranch(branchId: string): RuntimeDerivativeBranch | null {
  const database = openDatabase();
  try {
    const row = database.prepare("SELECT * FROM runtime_branches WHERE id = ?").get(branchId);
    return row ? rowToBranch(row) : null;
  } finally {
    database.close();
  }
}

export function updateRuntimeBranch(
  branchId: string,
  patch: Partial<Pick<RuntimeDerivativeBranch, "status" | "payload">>
): RuntimeDerivativeBranch | null {
  const current = getRuntimeBranch(branchId);
  if (!current) return null;
  const updated: RuntimeDerivativeBranch = {
    ...current,
    ...patch,
    payload: patch.payload ? { ...current.payload, ...patch.payload } : current.payload,
    updatedAt: nowIso()
  };
  const database = openDatabase();
  try {
    database
      .prepare("UPDATE runtime_branches SET status = ?, payload_json = ?, updated_at = ? WHERE id = ?")
      .run(updated.status, json(updated.payload), updated.updatedAt, updated.id);
    return updated;
  } finally {
    database.close();
  }
}

export function listRuntimeBranches(projectSlug: string, limit = 20): RuntimeDerivativeBranch[] {
  const database = openDatabase();
  try {
    return database
      .prepare("SELECT * FROM runtime_branches WHERE project_slug = ? ORDER BY updated_at DESC LIMIT ?")
      .all(projectSlug, limit)
      .map(rowToBranch);
  } finally {
    database.close();
  }
}

export function insertRuntimeQualityScore(input: {
  projectSlug: string;
  runId: string;
  chapterId: string;
  score: number;
  payload?: Record<string, unknown>;
}): void {
  const database = openDatabase();
  try {
    database
      .prepare(
        "INSERT OR REPLACE INTO runtime_quality_scores (id, project_slug, run_id, chapter_id, score, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id("quality"), input.projectSlug, input.runId, input.chapterId, input.score, json(input.payload || {}), nowIso());
  } finally {
    database.close();
  }
}

export function runtimeStatus(projectSlug: string): RuntimeStatusSnapshot {
  const activeRun = latestActiveRun(projectSlug);
  const runs = listRuntimeRuns(projectSlug, 20);
  const runId = activeRun?.id || runs[0]?.id;
  return {
    activeRun,
    runs,
    events: listRuntimeEvents(projectSlug, 0, 100),
    checkpoints: listRuntimeCheckpoints(projectSlug, 20),
    branches: listRuntimeBranches(projectSlug, 20),
    latestSnapshot: getLatestRuntimeSnapshot(projectSlug, runId),
    knowledgeRefs: listRuntimeKnowledgeRefs(projectSlug, runId, 30)
  };
}

export function runtimeId(prefix: string): string {
  return id(prefix);
}

export function runtimeNow(): string {
  return nowIso();
}
