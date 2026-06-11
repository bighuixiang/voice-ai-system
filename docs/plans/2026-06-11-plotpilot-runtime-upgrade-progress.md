# PlotPilot Runtime Upgrade Progress

## Scope

This note tracks the post-P0 implementation work after the PlotPilot comparison gap analysis. It records what is now implemented in the local codebase and what remains a future enhancement.

## Implemented

- Chapter memory chain:
  - Per-chapter summaries live under `memory/chapter-summaries/`.
  - Missing summary files return safe defaults.
  - Accepted writing recaps merge summary, facts, character state changes, ledger patches, and risk patches.
  - AI context can pull adjacent summaries and relevant far summaries.

- Reviewable state patches:
  - `WritingRecapCandidate` supports `summaryPatch`, `factPatches`, `ledgerPatches`, `characterStatePatches`, and `riskPatches`.
  - UI shows patch categories before author acceptance.
  - Legacy recap outputs remain accepted.
  - Accepting recap patches now stages summary, ledger, and recap-log writes before committing them with temporary files and rename.
  - If a recap accept write fails after replacing a file, replaced files are restored from backups.

- AI invocation audit:
  - AI tasks append `tasks/invocations.jsonl`.
  - Invocation sessions capture stage key, agent/model, prompt snapshot, context snapshot, patch targets, and adoption state.
  - Applying patches can mark the matching invocation accepted.
  - Task history now exposes expandable audit details.
  - Workspace startup loads the shared AI stage dictionary and task history shows readable stage labels beside stable stage keys.
  - AI operation controls now show the same shared stage labels and stable keys beside matching task launch actions.
  - Running AI progress now carries the active task type so the progress panel can show the matching stage label and stable key.
  - AI task execution now supports an async lifecycle with start, list, poll, and cancel API routes while preserving the original synchronous route.
  - Codex and Claude child processes accept `AbortSignal` and timeout options; the default timeout is `AI_TASK_TIMEOUT_MS || 600000`.
  - Task history is deduplicated by latest `taskId` state so running and terminal records do not double-count in task summaries.
  - Workspace AI operations now start async tasks, poll to terminal state, and expose a running-task cancel control.
  - If the API process restarts while an async task is running, later task reads reconcile the orphaned running history into an unrecoverable `error` record instead of leaving the UI permanently running.

- Quality persistence:
  - Chapter quality reports persist under `quality/<chapterId>.json`.
  - Project-level metrics persist under `quality/series-metrics.json`.
  - Metrics include averages, weakest chapters, rhythm signals, tension curve points, style-drift signals, character arc signals, and quality trend points.

- Story graph projection:
  - New projects create `story-graph/storyline.json`.
  - Story graph is rebuilt from story control, scenes, chapters, and ledgers.
  - UI can inspect the generated projection.
  - UI now groups graph nodes by type and shows selected-node adjacent relations.

- Searchable memory layer:
  - Knowledge facts and triples persist under `knowledge/facts.jsonl` and `knowledge/triples.jsonl`.
  - Chapter memory index persists under `memory/chapter-index.json`.
  - Local vector recall persists under `knowledge/vectors.json` and contributes `vectorScore` to search results.
  - Optional OpenAI-compatible embedding providers can populate `knowledge/vectors.json` when `KNOWLEDGE_EMBEDDING_PROVIDER=openai-compatible` and an API key are configured.
  - Workspace AI settings can edit the knowledge embedding provider, base URL, model, and local API key configuration without exposing the raw saved key.
  - Knowledge index responses expose vector provider, dimensions, entry count, and fallback details so provider issues are visible in the workspace.
  - UI supports knowledge search and a quick reference lookup across characters, locations, terms, and facts.

- Runtime snapshot:
  - Creation runtime snapshots include a stable fingerprint.
  - UI shows the current creation-loop snapshot and fingerprint.

- Project audit export:
  - `/api/novel/projects/:projectId/audit-report` returns a JSON audit report.
  - Reports include chapters, persisted quality metrics and trends, task summaries, and AI invocation adoption summaries.
  - Reports include background job totals, status counts, and recent job history.
  - Reports include knowledge fact/triple counts, indexed chapter counts, keyword counts, and vector provider status.
  - Reports include per-chapter runtime fingerprints, active creation steps, blocked-step counts, and runtime signals.
  - Task history UI can download the report as JSON.
  - Task history UI can also open an in-workspace audit preview dialog before downloading JSON.

- Background job orchestration:
  - `/api/novel/projects/:projectId/jobs` starts and lists project background jobs.
  - Jobs support knowledge index rebuilds, series quality rebuilds, and story graph rebuilds.
  - UI API clients can start jobs and poll job status.
  - Workspace knowledge-index rebuilds now use background jobs before refreshing the index.
  - Workspace quality overview and story graph rebuilds can also run through background jobs.
  - Story control now shows recent background jobs with status, output summary, duration, and manual refresh.
  - Background job history persists under `tasks/background-jobs.jsonl` and can be listed after the in-memory cache is cleared.
  - Jobs can be cancelled or retried from API routes and the workspace background job panel.
  - Cancelled jobs are terminal and retry jobs retain `retryOf` lineage for auditability.

- Post-save chapter pipeline:
  - Save pipeline state tracks save, recap, runtime, quality, knowledge, and story graph steps.
  - The pipeline is opt-in and visible in the workspace near the creation loop.
  - Chapter content saves automatically keep the critical path short: save the file, request a reviewable `writing.recap`, and refresh the runtime snapshot.
  - Series quality, knowledge index, and story graph rebuilds are enqueued as background jobs after the critical path completes.
  - The save pipeline panel marks deferred rebuild steps as queued so the author can keep writing while background jobs finish later.
  - Outline/support saves do not trigger the automatic pipeline.
  - Pipeline failures mark the failed step and preserve the saved chapter content.
  - If the recap task is cancelled or errors, later runtime, quality, knowledge, and story graph steps are skipped with the failure reason surfaced in the panel.

- Theme consistency:
  - Novel workspace panels use dark theme tokens instead of hardcoded light panel colors.
  - Root tests run a theme-token guard that rejects hardcoded hex colors and light backgrounds in novel workspace component styles.

- Workflow smoke coverage:
  - `scripts/mock-codex-agent.cjs` provides Codex-compatible deterministic JSON for smoke runs.
  - Playwright workflow smoke creates a temporary project, writes a chapter, enables the save pipeline, saves, waits for recap/quality/index/runtime artifacts, previews the audit report in the UI, and deletes the temporary project.
  - `smoke:all` now runs the workflow smoke alongside the existing runtime UI smoke.
  - Playwright starts isolated API/UI services on `18787`/`15173` by default so the mock agent environment is guaranteed and local `8787`/`5173` dev servers are not disturbed.
  - Set `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` only when intentionally reusing local services.

## Verification

Latest full verification passed after the P0 reliability extension:

- Theme token check: 31 novel workspace Vue components passed.
- API tests: 90 passed, 1 real Codex integration skipped.
- UI tests: 171 passed.
- API build passed.
- UI build passed.
- Runtime smoke: `http://127.0.0.1:5173` returned HTTP 200.
- Runtime smoke: `http://127.0.0.1:8787/health` returned HTTP 200 with `status: healthy`.
- Runtime smoke script: `npm run smoke:runtime` passed for `novel-1780911338197` / `chapter-001` with 198 chapters, 198 indexed chapters, local embeddings, 244 vector entries, and stable fingerprint `455526bce1beb72b`.
- Browser UI smoke: `npm run smoke:ui` passed through Playwright, covering the project hub, real workspace load, save pipeline panel, embedding config dialog, background job panel, audit report preview, workflow save pipeline, and dark theme backgrounds.
- Full smoke: `npm run smoke:all` passed, including runtime smoke and 2 Playwright UI smoke tests.
- Commit guard: `npm run check:runtime-staged` passed and blocks staged generated runtime state or local platform config.

Known warnings remain unchanged:

- Node SQLite experimental warning.
- Dart Sass legacy JS API warning.
- Vite chunk size warning for the UI bundle.

Latest targeted P0 extension verification:

- `npm --prefix api run test -- codexRunner taskService app writingCockpit`: 48 passed.
- `npm --prefix api run test -- taskService app`: 33 passed.
- `npm --prefix ui run test -- novelApi novel AIOperationPanel NovelWorkspace`: 167 passed.
- `npx playwright test tests/e2e/workflow-smoke.spec.ts`: 1 passed.
- `npm run verify`: passed.
- `npm run smoke:all`: passed.
- `npm --prefix api run test -- backgroundJobs app`: 23 passed.
- `npm --prefix api run build`: passed.
- `npm --prefix ui run test -- NovelWorkspace novel SavePipelinePanel`: 160 passed.
- `npm --prefix ui run test -- TaskHistoryPanel NovelWorkspace novel`: 162 passed.
- `npm --prefix ui run test -- AIOperationPanel NovelWorkspace`: 19 passed.
- `npm --prefix ui run test -- AIOperationPanel NovelWorkspace TaskHistoryPanel novel`: 163 passed.
- `npm --prefix ui run test -- AIOperationPanel NovelWorkspace novel`: 164 passed.
- `npm --prefix ui run test -- AiConfigPanel BackgroundJobPanel SavePipelinePanel KnowledgeIndexPanel QuickReferencePanel StoryGraphPanel StoryControlPanel NovelWorkspace`: 29 passed.
- `npm --prefix ui run build`: passed.
- `npm run test:theme`: passed.
- `npm --prefix ui run test -- novel SavePipelinePanel`: 167 passed.
- `npm run verify`: passed after the save pipeline critical/background split.
- `npm run smoke:all`: passed after the workflow smoke was updated to expect 3 critical-path done steps and 3 queued background rebuilds.

## Recent Commits

- `9e084b9 feat: add quick reference lookup`
- `167cce7 feat: summarize rhythm and character arcs`
- `7fb0af1 feat: expand ai invocation audit details`
- `4319452 feat: flag style drift in quality metrics`
- `497c52e feat: add series tension curve`
- `08e6c46 feat: export project audit report`
- `b71198d feat: project quality trends`
- `1c67938 feat: expand story graph visualization`
- `617e60d feat: orchestrate project background jobs`
- `e644a79 feat: add local vector recall`
- `54a05b1 feat: rebuild knowledge index in background`
- `b09d915 feat: support external knowledge embeddings`
- `de71927 feat: surface background rebuild actions`
- `381c866 feat: show background job status`
- `fc5e477 feat: persist background job history`
- `153f677 feat: include background jobs in audit report`
- `808d368 feat: surface knowledge vector status`
- `4c32890 feat: include knowledge index in audit report`
- `f307a70 feat: include runtime snapshots in audit report`
- `58b6e09 feat: preview audit report in workspace`
- `0c2b485 feat: configure knowledge embeddings in settings`
- `60cad36 feat: control background job retries and cancellation`
- `fa936c8 feat: orchestrate post-save chapter pipeline`
- `3d552cc docs: plan ai stage dictionary ui`
- `8ce7e92 feat: load ai stage dictionary`
- `3153ad0 feat: bootstrap ai stage dictionary`
- `c829403 feat: show ai stage labels in task history`
- `c03eb73 feat: show ai stages in operation panel`
- `8352fd3 docs: update stage operation progress`
- `64fe61d feat: show active ai stage progress`
- `b2dc378 docs: record active stage progress`
- `3c01ce9 fix: align novel panels with dark theme`
- `83e7b7b test: guard novel theme tokens`
- `2d71553 fix: count indexed chapters in audit report`
- `beccfc0 chore: add runtime acceptance smoke`
- `1dd71d9 test: add runtime ui smoke`

Earlier supporting commits in this branch:

- `5e20881 feat: surface series quality metrics`
- `6d03f63 feat: mark accepted ai invocation patches`
- `d92f8f0 feat: persist story graph projection`
- `6a89cc8 feat: fingerprint creation runtime snapshots`

## Remaining Work

- Tune production embedding provider settings after a real provider and model are selected.
- Run one manual real-model save pipeline pass after `CODEX_COMMAND`/provider credentials are configured; automated smoke intentionally uses the deterministic mock agent. The repeatable checklist lives in `docs/ops/runtime-acceptance.md`.
- Full async AI task recovery across API process restarts remains out of scope; current behavior marks orphaned running tasks as unrecoverable errors on read.

## Optional Embedding Configuration

- `KNOWLEDGE_EMBEDDING_PROVIDER=openai-compatible`
- `KNOWLEDGE_EMBEDDING_API_KEY=<key>` or `OPENAI_API_KEY=<key>`
- `KNOWLEDGE_EMBEDDING_BASE_URL=https://api.openai.com/v1` by default
- `KNOWLEDGE_EMBEDDING_MODEL=text-embedding-3-small` by default
