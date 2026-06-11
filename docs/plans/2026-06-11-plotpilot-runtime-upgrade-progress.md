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

- AI invocation audit:
  - AI tasks append `tasks/invocations.jsonl`.
  - Invocation sessions capture stage key, agent/model, prompt snapshot, context snapshot, patch targets, and adoption state.
  - Applying patches can mark the matching invocation accepted.
  - Task history now exposes expandable audit details.

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
  - Save pipeline state tracks save, recap, quality, knowledge, and runtime steps.
  - The pipeline is opt-in and visible in the workspace near the creation loop.
  - Chapter content saves can automatically request a reviewable `writing.recap`, rebuild series quality, rebuild the knowledge index, and refresh the runtime snapshot.
  - Outline/support saves do not trigger the automatic pipeline.
  - Pipeline failures mark the failed step and preserve the saved chapter content.

## Verification

Latest full verification passed:

- API tests: 80 passed, 1 real Codex integration skipped.
- UI tests: 164 passed.
- API build passed.
- UI build passed.
- Runtime smoke: `http://127.0.0.1:5173` returned HTTP 200.
- Runtime smoke: `http://127.0.0.1:8787/health` returned HTTP 200 with `status: healthy`.

Known warnings remain unchanged:

- Node SQLite experimental warning.
- Dart Sass legacy JS API warning.
- Vite chunk size warning for the UI bundle.

Latest targeted P0 extension verification:

- `npm --prefix api run test -- backgroundJobs app`: 23 passed.
- `npm --prefix api run build`: passed.
- `npm --prefix ui run test -- NovelWorkspace novel SavePipelinePanel`: 160 passed.

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

Earlier supporting commits in this branch:

- `5e20881 feat: surface series quality metrics`
- `6d03f63 feat: mark accepted ai invocation patches`
- `d92f8f0 feat: persist story graph projection`
- `6a89cc8 feat: fingerprint creation runtime snapshots`

## Remaining Work

- Tune production embedding provider settings after a real provider and model are selected.

## Optional Embedding Configuration

- `KNOWLEDGE_EMBEDDING_PROVIDER=openai-compatible`
- `KNOWLEDGE_EMBEDDING_API_KEY=<key>` or `OPENAI_API_KEY=<key>`
- `KNOWLEDGE_EMBEDDING_BASE_URL=https://api.openai.com/v1` by default
- `KNOWLEDGE_EMBEDDING_MODEL=text-embedding-3-small` by default
