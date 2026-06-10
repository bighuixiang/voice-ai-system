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
  - Metrics include averages, weakest chapters, rhythm signals, character arc signals, and quality trend points.

- Story graph projection:
  - New projects create `story-graph/storyline.json`.
  - Story graph is rebuilt from story control, scenes, chapters, and ledgers.
  - UI can inspect the generated projection.

- Searchable memory layer:
  - Knowledge facts and triples persist under `knowledge/facts.jsonl` and `knowledge/triples.jsonl`.
  - Chapter memory index persists under `memory/chapter-index.json`.
  - UI supports knowledge search and a quick reference lookup across characters, locations, terms, and facts.

- Runtime snapshot:
  - Creation runtime snapshots include a stable fingerprint.
  - UI shows the current creation-loop snapshot and fingerprint.

- Project audit export:
  - `/api/novel/projects/:projectId/audit-report` returns a JSON audit report.
  - Reports include chapters, persisted quality metrics and trends, task summaries, and AI invocation adoption summaries.
  - Task history UI can download the report as JSON.

## Verification

Latest full verification passed:

- API tests: 71 passed, 1 real Codex integration skipped.
- UI tests: 142 passed.
- API build passed.
- UI build passed.

Known warnings remain unchanged:

- Node SQLite experimental warning.
- Dart Sass legacy JS API warning.
- Vite chunk size warning for the UI bundle.

## Recent Commits

- `9e084b9 feat: add quick reference lookup`
- `167cce7 feat: summarize rhythm and character arcs`
- `7fb0af1 feat: expand ai invocation audit details`

Earlier supporting commits in this branch:

- `5e20881 feat: surface series quality metrics`
- `6d03f63 feat: mark accepted ai invocation patches`
- `d92f8f0 feat: persist story graph projection`
- `6a89cc8 feat: fingerprint creation runtime snapshots`

## Remaining Work

- P2 real vector search or embedding-backed recall.
- Tension curve and style-drift metrics beyond the current persisted quality trend.
- Larger graph visualization for story relations.
- Background job orchestration for heavy indexing and analysis.
