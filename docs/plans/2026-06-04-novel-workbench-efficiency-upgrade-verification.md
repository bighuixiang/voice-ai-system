# Novel Workbench Efficiency Upgrade Verification

Date: 2026-06-04

## Commands Run

| Area | Command | Result |
| --- | --- | --- |
| API tests | `cd api; npm run test` | Pass. 10 test files passed, 1 integration file skipped. 38 tests passed, 1 skipped. |
| UI tests | `cd ui; npm run test` | Pass. 18 test files passed, 76 tests passed. Re-run after the layout fix also passed. |
| API build | `cd api; npm run build` | Pass. |
| UI build | `cd ui; npm run build` | Pass. Final build passed after the layout fix. |

## Local Server Check

- API expected URL: `http://127.0.0.1:8787`
- UI expected URL: `http://127.0.0.1:5173`
- `8787` was already occupied by an existing API dev server, and `GET /api/novel/projects` returned successfully.
- `5173` was already occupied by an existing Vite dev server and loaded the project workspace successfully.
- A temporary UI server started on `5174`, but API CORS correctly rejected `http://127.0.0.1:5174`; manual verification was continued on the expected `5173` origin.
- Temporary `5174` process was stopped after verification.

## Manual Flow Notes

Project used: `验收测试` (`novel-1780469894967`)

Verified:

- Opened project workspace from the project list.
- Opened chapter 1.
- Edited and saved chapter dashboard fields:
  - chapter goal
  - POV
  - main conflict
  - ending hook
- Added three scene cards.
- Filled scene title, location, POV, conflict, turn, and power progression fields.
- Reordered scene cards with the down arrow control.
- Saved scene cards.
- Edited chapter content and saved it.
- Switched modes:
  - `专注`: left and right rails hidden; dashboard summary and editor remained visible.
  - `结构`: dashboard, scene cards, editor, AI operations, context, platform library, and support files visible.
  - `审稿`: selection tools, task history, and structured ledger visible.
- Confirmed structure-mode English labels previously visible in dashboard/scene cards/ledger are now Chinese.

## Issue Found During Verification

During manual verification, three expanded scene cards overflowed over the chapter editor. The editor save button was physically blocked by the scene card panel.

Fix applied:

- `NovelWorkspace.vue` now lets the center writing column scroll.
- Non-editor panels in the center column no longer shrink under flex pressure.
- The editor keeps a stable 560px minimum height outside focus mode.

Post-fix browser check:

- Scene card panel no longer overlaps the editor.
- Editor height remained 560px after scrolling.
- Editor save button was clickable.
- UI tests and UI build passed after the fix.

## AI Task Verification

- `写前简报` button triggered the API task flow and displayed the expected progress steps:
  - preparing project context
  - invoking Codex CLI
  - parsing structured result
- The real Codex CLI invocation did not finish inside the observation window. The verification process stopped only the globally installed Codex process spawned by this manual run to avoid leaving a hanging background execution.
- Automated tests cover the task type, prompt template, UI action, recap candidate flow, and ledger acceptance behavior.

## Remaining Risks

- Real AI tasks currently have no explicit timeout or cancel path in `CodexProcessRunner`; a long-running Codex CLI can keep the UI in loading state.
- Manual `写后复盘` acceptance was not completed with a real Codex output because the real CLI run did not finish during verification.
- UI build still reports the existing Element Plus chunk-size warning.
- npm reports existing user-level project config warnings and Dart Sass legacy API warnings.

## Acceptance Checklist

- [x] Every project has dashboard, scenes, structured ledgers, and recap history files.
- [x] Opening a chapter loads dashboard, scene cards, and relevant ledger state.
- [x] Dashboard shows goal, POV, conflict, hook, word count, status, unresolved foreshadowing, and risks.
- [x] Scene cards can be created, edited, reordered, deleted, and saved.
- [x] Codex context includes dashboard, scene cards, and structured ledgers for relevant tasks.
- [x] `写前简报` task is available and reaches the API task flow.
- [x] `写后复盘` proposes ledger updates in automated coverage and does not auto-apply without confirmation.
- [x] Ledger panel edits real structured data instead of static placeholder text.
- [x] Rewrite comparison shows original text and AI suggestion side by side in automated coverage.
- [x] Focus, structure, and review modes reduce panel noise for the author.
- [x] API tests, UI tests, and builds pass.
- [x] Existing chapter editing, saving, project switching, and AI task flow entry points still work.
