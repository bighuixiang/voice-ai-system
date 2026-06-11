# Audit Preview, Embedding Config, Job Controls, And Save Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add in-app audit report preview, make knowledge embedding configuration editable in the AI settings UI, support background job retry/cancel controls, and run the post-save recap/quality/index pipeline from chapter saves.

**Architecture:** Keep the current file-backed project model and existing Express/Vue/Pinia boundaries. Extend existing API contracts instead of adding parallel systems: project audit stays at `/audit-report`, embedding settings live in `platform/ai-config.json`, background jobs remain `tasks/background-jobs.jsonl`, and save automation is orchestrated in the Pinia store using existing task and background-job APIs.

**Tech Stack:** TypeScript, Express, Vue 3, Pinia, Element Plus, Vite, Vitest, file-backed JSON/JSONL project data.

---

## Guardrails

- Do not commit generated novel runtime data unless a task explicitly targets fixtures.
- Keep each task independently verifiable and commit after it passes.
- Preserve manual controls; automatic save pipeline must be visible and non-destructive.
- Do not store API keys in committed code. The UI can save a configured key into local `platform/ai-config.json`, which is already local runtime configuration.
- Existing warnings are acceptable unless a task introduces new failures:
  - Node SQLite experimental warning.
  - Dart Sass legacy JS API warning.
  - Vite chunk-size warning.

## Task 1: Add In-App Audit Report Preview

**Files:**

- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/services/novelApi.spec.ts`
- Modify: `ui/src/stores/novel.spec.ts`
- Modify: `ui/src/types/novel.ts` only if helper display types are needed
- Create: `ui/src/components/novel/AuditReportPanel.vue`
- Create: `ui/src/components/novel/AuditReportPanel.spec.ts`
- Modify: `ui/src/components/novel/TaskHistoryPanel.vue`
- Modify: `ui/src/components/novel/TaskHistoryPanel.spec.ts`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`

**Step 1: Write the store test**

Add a test in `ui/src/stores/novel.spec.ts` that:

- Mocks `novelApi.readProjectAuditReport`.
- Calls a new `store.previewProjectAuditReport()`.
- Expects `store.auditReportPreview` to equal the returned report.
- Expects `store.isLoadingAuditReportPreview` to return to `false`.

Run:

```powershell
npm --prefix ui run test -- novel
```

Expected: FAIL because the store state/action does not exist.

**Step 2: Implement store state and actions**

In `ui/src/stores/novel.ts` add:

- `const auditReportPreview = ref<ProjectAuditReport | null>(null);`
- `const isLoadingAuditReportPreview = ref(false);`
- `async function previewProjectAuditReport()`
- `function clearAuditReportPreview()`

Keep `exportProjectAuditReport()` as-is for JSON download.

Expose these in the returned store object.

Run:

```powershell
npm --prefix ui run test -- novel
```

Expected: PASS.

**Step 3: Write the component test**

Create `ui/src/components/novel/AuditReportPanel.spec.ts`.

Test that a sample `ProjectAuditReport` renders:

- chapter count
- quality average/report count
- task total
- AI invocation total
- knowledge vector provider/entry count
- runtime blocked count and active-step counts
- background job total

Run:

```powershell
npm --prefix ui run test -- AuditReportPanel
```

Expected: FAIL because the component does not exist.

**Step 4: Implement AuditReportPanel**

Create `ui/src/components/novel/AuditReportPanel.vue`.

UI requirements:

- Compact operational dashboard, not a landing page.
- Use full-width sections or compact panels; do not nest cards inside cards.
- Show high-signal summaries first:
  - chapters
  - average quality
  - task totals
  - AI invocation adoption
  - knowledge/vector status
  - runtime status
  - latest background jobs
- Include one button event: `download`.
- Include one button event: `refresh`.

Run:

```powershell
npm --prefix ui run test -- AuditReportPanel
```

Expected: PASS.

**Step 5: Wire preview controls into TaskHistoryPanel**

In `TaskHistoryPanel.vue`:

- Rename visible button text from “导出报告” to “审计报告”.
- Add a small secondary button for direct JSON download if needed.
- Emit:
  - `preview-report`
  - `export-report`

Update `TaskHistoryPanel.spec.ts`.

Run:

```powershell
npm --prefix ui run test -- TaskHistoryPanel
```

Expected: PASS.

**Step 6: Mount preview dialog in NovelWorkspace**

In `NovelWorkspace.vue`:

- Import `AuditReportPanel`.
- Add `auditReportDialogOpen`.
- Wire `preview-report` to:
  - open dialog
  - call `store.previewProjectAuditReport()`
- Keep `export-report` wired to `store.exportProjectAuditReport`.
- Render `AuditReportPanel` in an `el-dialog`.

Run:

```powershell
npm --prefix ui run test -- NovelWorkspace
```

Expected: PASS.

**Step 7: Commit**

Run:

```powershell
npm --prefix ui run test -- AuditReportPanel TaskHistoryPanel NovelWorkspace novel
git add ui/src/stores/novel.ts ui/src/stores/novel.spec.ts ui/src/components/novel/AuditReportPanel.vue ui/src/components/novel/AuditReportPanel.spec.ts ui/src/components/novel/TaskHistoryPanel.vue ui/src/components/novel/TaskHistoryPanel.spec.ts ui/src/components/novel/NovelWorkspace.vue
git diff --cached --check
git commit -m "feat: preview audit report in workspace"
```

## Task 2: Add Embedding Configuration To AI Settings

**Files:**

- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Modify: `api/src/platformAiConfig.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/app.spec.ts`
- Modify: `api/src/knowledgeIndex.ts`
- Modify: `api/src/knowledgeIndex.spec.ts`
- Modify: `ui/src/components/novel/AiConfigPanel.vue`
- Modify: `ui/src/components/novel/AiConfigPanel.spec.ts`
- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/stores/novel.spec.ts`

**Step 1: Add shared config types**

Add to both type files:

```ts
export type KnowledgeEmbeddingProvider = "local" | "openai-compatible";

export interface KnowledgeEmbeddingConfig {
  provider: KnowledgeEmbeddingProvider;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
  apiKey?: string;
}
```

Extend `PlatformAiConfig`:

```ts
knowledgeEmbedding: KnowledgeEmbeddingConfig;
```

**Step 2: Write API config tests**

In `api/src/app.spec.ts`, extend the platform AI config test:

- GET returns default `knowledgeEmbedding.provider === "local"`.
- PUT accepts:
  - provider `openai-compatible`
  - base URL
  - model
  - API key
- GET after PUT returns `apiKeyConfigured: true` but does not return raw `apiKey`.
- PUT rejects unsupported provider.

Run:

```powershell
npm --prefix api run test -- app
```

Expected: FAIL.

**Step 3: Implement config persistence and sanitization**

In `api/src/platformAiConfig.ts`:

- Default provider: env `KNOWLEDGE_EMBEDDING_PROVIDER` or `local`.
- Default base URL/model from existing env names.
- Preserve saved API key locally, but never expose it in API responses.
- Add a helper:

```ts
export function publicPlatformAiConfig(config: PlatformAiConfig): PlatformAiConfig
```

that removes `knowledgeEmbedding.apiKey` and sets `apiKeyConfigured`.

In `api/src/app.ts`:

- Return public config on GET and PUT.
- Validate embedding provider and URL shape.

Run:

```powershell
npm --prefix api run test -- app
```

Expected: PASS.

**Step 4: Make knowledgeIndex use saved config**

In `api/src/knowledgeIndex.ts`:

- Read `readPlatformAiConfig()` when selecting embedding provider.
- Prefer saved `knowledgeEmbedding` settings over env variables.
- Fallback to env variables when saved config is missing.
- Keep existing fallback details when provider fails.

Update `api/src/knowledgeIndex.spec.ts`:

- Saved openai-compatible config drives request URL/model.
- Saved key is used for Authorization.
- Existing env-based tests still pass.

Run:

```powershell
npm --prefix api run test -- knowledgeIndex app
```

Expected: PASS.

**Step 5: Add UI controls**

In `AiConfigPanel.vue`, add a “知识向量” section inside the existing AI settings surface:

- segmented/select provider: local / openai-compatible
- base URL input
- model input
- API key password input
- status text from `apiKeyConfigured`

Rules:

- Disable base URL/model/API key inputs when provider is `local`.
- Do not display the saved raw key after reload.
- If the user leaves API key blank and `apiKeyConfigured` is true, preserve the existing key on save by omitting `apiKey`.

Update `AiConfigPanel.spec.ts`:

- Renders embedding controls.
- Emits config with edited provider/model/base URL.
- Does not leak raw API key from props.

Run:

```powershell
npm --prefix ui run test -- AiConfigPanel novel
```

Expected: PASS.

**Step 6: Commit**

Run:

```powershell
npm --prefix api run test -- app knowledgeIndex
npm --prefix ui run test -- AiConfigPanel novel
git add api/src/types.ts ui/src/types/novel.ts api/src/platformAiConfig.ts api/src/app.ts api/src/app.spec.ts api/src/knowledgeIndex.ts api/src/knowledgeIndex.spec.ts ui/src/components/novel/AiConfigPanel.vue ui/src/components/novel/AiConfigPanel.spec.ts ui/src/stores/novel.ts ui/src/stores/novel.spec.ts
git diff --cached --check
git commit -m "feat: configure knowledge embeddings in settings"
```

## Task 3: Add Background Job Retry And Cancel

**Files:**

- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Modify: `api/src/backgroundJobs.ts`
- Modify: `api/src/backgroundJobs.spec.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/app.spec.ts`
- Modify: `ui/src/services/novelApi.ts`
- Modify: `ui/src/services/novelApi.spec.ts`
- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/stores/novel.spec.ts`
- Modify: `ui/src/components/novel/BackgroundJobPanel.vue`
- Modify: `ui/src/components/novel/BackgroundJobPanel.spec.ts`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`

**Step 1: Extend job contract**

Change `BackgroundJobStatus` in API/UI types:

```ts
export type BackgroundJobStatus = "pending" | "running" | "success" | "error" | "cancelled";
```

Add fields to `BackgroundJob`:

```ts
retryOf?: string;
cancelRequestedAt?: string;
```

**Step 2: Write backend job tests**

In `api/src/backgroundJobs.spec.ts`:

- Starts a pending/running job and cancels it.
- Cancelled job persists to `tasks/background-jobs.jsonl`.
- Retrying an error job creates a new job with same type/project and `retryOf`.

Run:

```powershell
npm --prefix api run test -- backgroundJobs
```

Expected: FAIL.

**Step 3: Implement cancel/retry primitives**

In `api/src/backgroundJobs.ts` add:

- `cancelBackgroundJob(root, projectId, id)`
- `retryBackgroundJob(project, root, id, handlerFactory)`

Pragmatic cancellation model:

- If job is pending: mark `cancelled`, never run if possible.
- If job is running: mark `cancelRequestedAt`; because handlers are short synchronous rebuilds, final status may become `cancelled` only if checked before success, otherwise result may complete. This must be documented in output summary.
- `waitForBackgroundJob()` should treat `cancelled` as terminal.

Run:

```powershell
npm --prefix api run test -- backgroundJobs
```

Expected: PASS.

**Step 4: Add API routes**

In `api/src/app.ts` add:

- `POST /api/novel/projects/:projectId/jobs/:jobId/cancel`
- `POST /api/novel/projects/:projectId/jobs/:jobId/retry`

Refactor the job handler selection in `/jobs` into a helper so retry can reuse it.

Update `api/src/app.spec.ts`:

- Cancelling a job returns terminal/cancel-requested job.
- Retrying an error job returns 202 and a new job.

Run:

```powershell
npm --prefix api run test -- app backgroundJobs
```

Expected: PASS.

**Step 5: Add UI client/store methods**

In `novelApi.ts`:

- `cancelBackgroundJob(projectId, jobId)`
- `retryBackgroundJob(projectId, jobId)`

In `novel.ts` store:

- `cancelBackgroundJob(jobId)`
- `retryBackgroundJob(jobId)`

Update tests.

Run:

```powershell
npm --prefix ui run test -- novelApi novel
```

Expected: PASS.

**Step 6: Add BackgroundJobPanel controls**

In `BackgroundJobPanel.vue`:

- Show cancel button for `pending`/`running`.
- Show retry button for `error`/`cancelled`.
- Emit:
  - `cancel`
  - `retry`

Use icon buttons with tooltips.

Update `BackgroundJobPanel.spec.ts`.

Run:

```powershell
npm --prefix ui run test -- BackgroundJobPanel NovelWorkspace
```

Expected: PASS.

**Step 7: Commit**

Run:

```powershell
npm --prefix api run test -- backgroundJobs app
npm --prefix ui run test -- novelApi novel BackgroundJobPanel NovelWorkspace
git add api/src/types.ts ui/src/types/novel.ts api/src/backgroundJobs.ts api/src/backgroundJobs.spec.ts api/src/app.ts api/src/app.spec.ts ui/src/services/novelApi.ts ui/src/services/novelApi.spec.ts ui/src/stores/novel.ts ui/src/stores/novel.spec.ts ui/src/components/novel/BackgroundJobPanel.vue ui/src/components/novel/BackgroundJobPanel.spec.ts ui/src/components/novel/NovelWorkspace.vue
git diff --cached --check
git commit -m "feat: control background job retries and cancellation"
```

## Task 4: Add Post-Save Recap / Quality / Index Pipeline

**Files:**

- Modify: `ui/src/types/novel.ts`
- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/stores/novel.spec.ts`
- Create: `ui/src/components/novel/SavePipelinePanel.vue`
- Create: `ui/src/components/novel/SavePipelinePanel.spec.ts`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Modify: `ui/src/components/novel/CreationLoopPanel.vue` only if a status chip is needed there
- Modify: `docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md`

**Step 1: Add pipeline state types**

In `ui/src/types/novel.ts` add:

```ts
export type SavePipelineStepId = "save" | "recap" | "quality" | "knowledge" | "runtime";
export type SavePipelineStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface SavePipelineStep {
  id: SavePipelineStepId;
  label: string;
  status: SavePipelineStepStatus;
  detail?: string;
}
```

**Step 2: Write store tests for opt-in auto pipeline**

In `ui/src/stores/novel.spec.ts` add tests:

- By default, `saveCurrentContent()` only saves content/dashboard as today.
- When `store.setAutoRunSavePipeline(true)` is enabled and current document is chapter content:
  - save calls `runTask("writing.recap")`
  - starts `quality.series.rebuild`
  - starts `knowledge.index.rebuild`
  - reloads runtime snapshot
- Auto pipeline does not run for outline/support files.
- If recap fails, save remains successful and pipeline step is marked error.

Run:

```powershell
npm --prefix ui run test -- novel
```

Expected: FAIL.

**Step 3: Implement save pipeline orchestration**

In `ui/src/stores/novel.ts` add:

- `const autoRunSavePipeline = ref(false);`
- `const savePipelineSteps = ref<SavePipelineStep[]>([])`
- `function setAutoRunSavePipeline(value: boolean)`
- `async function runPostSavePipeline(previousContent: string)`

Pipeline behavior:

1. Save content and dashboard as today.
2. If auto pipeline disabled, stop.
3. If not editing current chapter content, stop.
4. Run `writing.recap` with payload:
   - `mode: "chapter.save.pipeline"`
   - `previousTail`
   - `currentTail`
   - `changedCharCount`
5. Start background `quality.series.rebuild`.
6. Start background `knowledge.index.rebuild`.
7. Refresh runtime snapshot.

Important:

- Do not auto-accept recap; it should populate `recapCandidate` for author review.
- Pipeline errors should set `error.value` but should not roll back saved content.
- Avoid running two pipelines simultaneously.

Run:

```powershell
npm --prefix ui run test -- novel
```

Expected: PASS.

**Step 4: Add SavePipelinePanel**

Create `SavePipelinePanel.vue`.

UI requirements:

- Compact horizontal/vertical step list.
- Toggle: auto run after chapter save.
- Manual button: run now.
- Show latest step statuses.

Events:

- `update:auto-run`
- `run`

Tests:

- Renders steps.
- Emits toggle.
- Emits manual run.
- Shows error/skipped state.

Run:

```powershell
npm --prefix ui run test -- SavePipelinePanel
```

Expected: PASS.

**Step 5: Wire panel into workspace**

In `NovelWorkspace.vue`:

- Place `SavePipelinePanel` near `CreationLoopPanel` or in the review/focus control area.
- Pass:
  - `auto-run`
  - `steps`
  - `is-running`
- Wire:
  - toggle to `store.setAutoRunSavePipeline`
  - manual run to `store.runPostSavePipelineFromCurrentContent`

Run:

```powershell
npm --prefix ui run test -- NovelWorkspace novel SavePipelinePanel
```

Expected: PASS.

**Step 6: Update progress docs**

In `docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md` add:

- Audit report preview.
- Embedding config UI.
- Background retry/cancel.
- Opt-in post-save pipeline.

**Step 7: Commit**

Run:

```powershell
npm --prefix ui run test -- novel SavePipelinePanel NovelWorkspace
git add ui/src/types/novel.ts ui/src/stores/novel.ts ui/src/stores/novel.spec.ts ui/src/components/novel/SavePipelinePanel.vue ui/src/components/novel/SavePipelinePanel.spec.ts ui/src/components/novel/NovelWorkspace.vue docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md
git diff --cached --check
git commit -m "feat: orchestrate post-save chapter pipeline"
```

## Task 5: Full Verification And Runtime Smoke Check

**Files:**

- Modify: `docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md`

**Step 1: Run full verification**

Run:

```powershell
npm run verify
```

Expected:

- API tests pass.
- UI tests pass.
- API build passes.
- UI build passes.

**Step 2: Check running services**

Run:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:5173 -UseBasicParsing -TimeoutSec 5
Invoke-WebRequest -Uri http://127.0.0.1:8787/health -UseBasicParsing -TimeoutSec 5
```

Expected:

- UI returns HTTP 200.
- API returns HTTP 200 with `status: healthy`.

**Step 3: Update progress doc verification**

Record:

- latest test counts
- known warnings
- new commit hashes
- any manual smoke result

**Step 4: Commit docs**

Run:

```powershell
git add docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md
git diff --cached --check
git commit -m "docs: update runtime upgrade verification"
```

## Execution Order

1. Task 1: Audit preview. Lowest risk, UI-only.
2. Task 2: Embedding config. API/UI contract work, but isolated.
3. Task 3: Background retry/cancel. Backend state-machine change.
4. Task 4: Post-save pipeline. Highest workflow impact; do after job controls exist.
5. Task 5: Full verification and documentation.

## Open Decisions

- API-key storage: this plan stores the key in local `platform/ai-config.json` and never returns it from GET/PUT responses. This is acceptable for local workstation config, but not for a multi-user hosted deployment.
- Cancellation: rebuild jobs are short and not currently interruptible inside the handler. This plan implements best-effort cancellation with terminal UI state; deep cooperative cancellation can be a later enhancement if rebuilds become long-running.
- Auto pipeline default: this plan keeps it off by default and makes it opt-in from the UI to avoid surprising model calls after ordinary saves.

## Final Verification Command Set

```powershell
npm --prefix api run test -- app backgroundJobs knowledgeIndex
npm --prefix ui run test -- novelApi novel AiConfigPanel BackgroundJobPanel AuditReportPanel SavePipelinePanel NovelWorkspace TaskHistoryPanel
npm run verify
```
