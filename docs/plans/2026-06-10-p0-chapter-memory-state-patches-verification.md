# P0 Chapter Memory And State Patches Verification

Date: 2026-06-11

## Scope

Verified P0 chapter memory and reviewable recap state patches:

- Per-chapter memory files under `memory/chapter-summaries/`.
- Safe missing-summary defaults.
- Accepted recap patches merge into chapter summaries and structured ledgers.
- Unaccepted recap candidates remain UI-only.
- Legacy recap arrays still parse.
- AI context receives adjacent and ledger-related distant chapter summaries.
- UI shows summary, fact, character-state, ledger, and risk patch categories before acceptance.

## Focused Tests

Command:

```powershell
cd api
npm run test -- novelProject writingCockpit contextAssembler taskTemplates app
```

Result: passed.

- 5 test files passed.
- 38 tests passed.

Command:

```powershell
cd ui
npm run test -- novelApi novel WritingRecapPanel
```

Result: passed.

- 23 test files passed.
- 128 tests passed.

Notes:

- UI test output includes existing Dart Sass legacy JS API deprecation warnings.

## Full Verification

Command:

```powershell
npm run verify
```

Result: passed.

- API tests: 11 files passed, 57 tests passed, 1 real Codex integration test skipped.
- UI tests: 26 files passed, 132 tests passed.
- API build: passed.
- UI build: passed.

Warnings:

- Node SQLite experimental warnings during API tests.
- Dart Sass legacy JS API deprecation warnings during UI tests/build.
- Vite chunk-size warning for the existing `ui` chunk over 500 kB.

## Server Check

Commands:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:5173 -UseBasicParsing -TimeoutSec 2
Invoke-WebRequest -Uri http://127.0.0.1:8787/api/novel/projects -UseBasicParsing -TimeoutSec 2
```

Result:

- UI returned HTTP 200.
- API project-list endpoint returned HTTP 200.

Manual AI generation was not rerun in this verification pass to avoid invoking an external model from the smoke check. The same flow is covered by focused route, store, context, prompt, and recap-panel tests.

## Acceptance Checklist

- [x] New projects include `memory/chapter-summaries/`.
- [x] Missing summary files return a safe default instead of crashing.
- [x] Accepted recaps update chapter memory and structured ledgers.
- [x] Unaccepted recap candidates do not mutate project state.
- [x] Legacy recap candidate outputs remain accepted by the UI.
- [x] `chapter.plan`, `chapter.draft`, `writing.briefing`, `writing.recap`, `continuity.check`, and `idea.suggest` read adjacent summary memory.
- [x] Relevant far summaries can be pulled through ledger chapter references.
- [x] UI shows pending summary/fact/character/ledger/risk patch categories before acceptance.
- [x] API tests, UI tests, API build, and UI build pass.

## Remaining Risks

- Recap acceptance is still file-backed and not transactional across all written assets.
- Far-summary relevance is heuristic and based on structured ledger `chapterIds`.
- Real AI output can still vary; prompt and parser support both new patch fields and legacy arrays.
