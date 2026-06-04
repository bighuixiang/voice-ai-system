# Novel Workbench Efficiency Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the novel workbench from an AI-assisted editor into a production writing cockpit that preserves chapter intent, scene structure, continuity ledgers, and writer focus.

**Architecture:** Extend the existing file-backed novel project model instead of adding a database. Store chapter dashboards, scene cards, and ledger entries as typed JSON/Markdown files inside each `novels/<slug>/` project, expose them through the existing Express API, keep Pinia as the UI state owner, and reuse the current Codex task runner for AI-assisted checks and ledger updates.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Element Plus, Vite, Express, file-backed Markdown/JSON project data, Vitest.

---

## Scope

P0 implementation:

- Chapter writing dashboard: chapter goal, POV, conflict, hook, word count, status, unresolved foreshadowing, continuity risks.
- Scene card workflow: create, edit, reorder, and use scene cards as the structure source for chapter planning and drafting.
- Pre-writing briefing and post-save recap: show what the author must remember before writing; produce review candidates after saving.
- Operational ledger data model: foreshadowing, continuity, power progression, character state, and risks as structured entries.
- Diff-based selected rewrite review: original/new text side-by-side with safer accept behavior.
- Writing mode switcher: focus, structure, review.

P1 follow-up hooks prepared but not fully built:

- Quick reference lookup for characters, locations, props, and terms.
- Chapter rhythm and character arc summaries.

Out of scope for this plan:

- Real vector search.
- Multi-user collaboration.
- Rich text editor migration.
- Desktop packaging.
- Automatic patch application without author confirmation.

## Existing Surface To Reuse

- UI shell: `ui/src/components/novel/NovelWorkspace.vue`
- Editor: `ui/src/components/novel/ChapterEditor.vue`
- Chapter list: `ui/src/components/novel/ChapterTree.vue`
- AI actions: `ui/src/components/novel/AIOperationPanel.vue`
- Rewrite result panel: `ui/src/components/novel/RewriteComparison.vue`
- Support files: `ui/src/components/novel/SupportFilePanel.vue`
- Store: `ui/src/stores/novel.ts`
- Front-end API client: `ui/src/services/novelApi.ts`
- Shared UI types: `ui/src/types/novel.ts`
- API types: `api/src/types.ts`
- API routes: `api/src/app.ts`
- Project file helpers: `api/src/novelProject.ts`
- Context assembly: `api/src/contextAssembler.ts`
- Prompt templates: `api/src/taskTemplates.ts`
- Path safety: `api/src/pathSafety.ts`

## Data Files

Add these files to each project skeleton:

```text
dashboard/chapter-001.json
scenes/chapter-001.json
ledger/foreshadowing.json
ledger/continuity.json
ledger/power-progression.json
ledger/character-state.json
ledger/risks.json
tasks/recaps.jsonl
```

Keep the existing Markdown files as author-editable prose and canon:

```text
chapters/chapter-001.md
outline/chapter-001.md
bible/characters.md
bible/world.md
bible/power-system.md
style/style-guide.md
```

## Data Contracts

Add matching types to `api/src/types.ts` and `ui/src/types/novel.ts`:

```ts
export interface ChapterDashboard {
  chapterId: string;
  goal: string;
  pov: string;
  mainConflict: string;
  endingHook: string;
  wordCount: number;
  status: "empty" | "planned" | "drafting" | "drafted" | "reviewing" | "checked";
  unresolvedForeshadowingIds: string[];
  continuityRiskIds: string[];
  updatedAt: string;
}

export interface SceneCard {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  time: string;
  location: string;
  pov: string;
  characters: string[];
  conflict: string;
  turn: string;
  informationReleased: string[];
  foreshadowingIds: string[];
  powerProgression: string;
  draftAnchor?: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  kind: "foreshadowing" | "continuity" | "power" | "character" | "risk";
  title: string;
  status: "open" | "watch" | "resolved" | "blocked";
  severity: "low" | "medium" | "high";
  chapterIds: string[];
  relatedEntities: string[];
  note: string;
  expectedResolutionChapterId?: string;
  updatedAt: string;
}

export interface WritingBriefing {
  chapterId: string;
  previousChapterEnding: string;
  currentGoal: string;
  povLimits: string[];
  mustRemember: string[];
  mustNotReveal: string[];
  unresolvedForeshadowing: LedgerEntry[];
  risks: LedgerEntry[];
}

export interface WritingRecapCandidate {
  chapterId: string;
  summary: string;
  newFacts: string[];
  characterStateChanges: string[];
  foreshadowingUpdates: LedgerEntry[];
  continuityRisks: LedgerEntry[];
  powerProgressionUpdates: LedgerEntry[];
  createdAt: string;
}
```

## Task 1: Add Shared Writing Cockpit Types

**Files:**
- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Test: `api/src/novelProject.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing type usage tests**

Add test fixtures that construct a `ChapterDashboard`, `SceneCard`, `LedgerEntry`, `WritingBriefing`, and `WritingRecapCandidate`.

Run:

```powershell
cd api
npm run test -- novelProject
cd ..\ui
npm run test -- novel
```

Expected: fail until the new exported types exist.

**Step 2: Add the shared types**

Add the contracts from the Data Contracts section to both type files. Keep string union values identical across API and UI.

**Step 3: Run tests**

```powershell
cd api
npm run test -- novelProject
cd ..\ui
npm run test -- novel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/types.ts ui/src/types/novel.ts api/src/novelProject.spec.ts ui/src/stores/novel.spec.ts
git commit -m "feat: add writing cockpit data types"
```

## Task 2: Create Project Skeleton Files For Dashboards And Ledgers

**Files:**
- Modify: `api/src/novelProject.ts`
- Test: `api/src/novelProject.spec.ts`

**Step 1: Write failing skeleton test**

Test that a new or imported project includes:

- `dashboard/chapter-001.json`
- `scenes/chapter-001.json`
- `ledger/foreshadowing.json`
- `ledger/continuity.json`
- `ledger/power-progression.json`
- `ledger/character-state.json`
- `ledger/risks.json`
- `tasks/recaps.jsonl`

Run:

```powershell
cd api
npm run test -- novelProject
```

Expected: fail because these files are not created yet.

**Step 2: Implement default file creation**

Use existing safe path helpers. Default dashboard values should be empty strings, `wordCount: 0`, `status: "empty"`, and empty ID arrays. Default scene file should contain an empty array.

**Step 3: Run tests**

```powershell
cd api
npm run test -- novelProject
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/novelProject.ts api/src/novelProject.spec.ts
git commit -m "feat: create writing cockpit project files"
```

## Task 3: Add API File Helpers For Cockpit Data

**Files:**
- Create: `api/src/writingCockpit.ts`
- Test: `api/src/writingCockpit.spec.ts`

**Step 1: Write failing tests**

Cover:

- read missing dashboard returns a safe default
- save dashboard rejects path traversal
- read scene cards sorts by `order`
- save scene cards normalizes order
- read ledger entries returns an empty array for missing files
- append recap writes one JSON object per line

Run:

```powershell
cd api
npm run test -- writingCockpit
```

Expected: fail because the module does not exist.

**Step 2: Implement helper functions**

Implement:

```ts
readChapterDashboard(root, chapterId)
saveChapterDashboard(root, dashboard)
readSceneCards(root, chapterId)
saveSceneCards(root, chapterId, cards)
readLedgerEntries(root, kind)
saveLedgerEntries(root, kind, entries)
appendWritingRecap(root, recap)
```

Use `resolveInside` from `api/src/pathSafety.ts` for every file path.

**Step 3: Run tests**

```powershell
cd api
npm run test -- writingCockpit
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/writingCockpit.ts api/src/writingCockpit.spec.ts
git commit -m "feat: add writing cockpit file helpers"
```

## Task 4: Expose Cockpit API Routes

**Files:**
- Modify: `api/src/app.ts`
- Test: `api/src/app.spec.ts`

**Step 1: Write failing route tests**

Add tests for:

- `GET /api/novel/projects/:slug/dashboard/:chapterId`
- `PUT /api/novel/projects/:slug/dashboard/:chapterId`
- `GET /api/novel/projects/:slug/scenes/:chapterId`
- `PUT /api/novel/projects/:slug/scenes/:chapterId`
- `GET /api/novel/projects/:slug/ledger/:kind`
- `PUT /api/novel/projects/:slug/ledger/:kind`

Run:

```powershell
cd api
npm run test -- app
```

Expected: fail with 404 responses.

**Step 2: Add routes**

Reuse the current project lookup and error style in `api/src/app.ts`. Return payload keys:

- `{ dashboard }`
- `{ scenes }`
- `{ entries }`

**Step 3: Run tests**

```powershell
cd api
npm run test -- app
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/app.ts api/src/app.spec.ts
git commit -m "feat: expose writing cockpit api"
```

## Task 5: Add UI API Client Methods

**Files:**
- Modify: `ui/src/services/novelApi.ts`
- Test: `ui/src/services/novelApi.spec.ts`

**Step 1: Write failing client tests**

Mock `fetch` and cover:

- `readChapterDashboard`
- `saveChapterDashboard`
- `readSceneCards`
- `saveSceneCards`
- `readLedgerEntries`
- `saveLedgerEntries`

Run:

```powershell
cd ui
npm run test -- novelApi
```

Expected: fail until methods exist.

**Step 2: Implement client methods**

Add methods matching the API routes from Task 4. Keep JSON request bodies explicit and reuse the existing `request<T>()` helper.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- novelApi
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/novelApi.ts ui/src/services/novelApi.spec.ts
git commit -m "feat: add writing cockpit api client"
```

## Task 6: Extend Pinia Store With Cockpit State

**Files:**
- Modify: `ui/src/stores/novel.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing store tests**

Cover:

- opening a chapter loads its dashboard and scene cards
- updating content recalculates `wordCount`
- saving content preserves dashboard word count
- switching workspaces caches dashboard and scene card state
- ledger entries load for the current project

Run:

```powershell
cd ui
npm run test -- novel
```

Expected: fail until the store exposes cockpit state and actions.

**Step 2: Add state and actions**

Add:

```ts
currentDashboard
sceneCards
ledgerEntries
isSavingDashboard
isSavingScenes
loadChapterCockpit(chapterId)
updateDashboard(patch)
saveCurrentDashboard()
updateSceneCards(cards)
saveCurrentSceneCards()
loadLedger(kind)
saveLedger(kind, entries)
```

Update `openChapter` to call `loadChapterCockpit`.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- novel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/stores/novel.ts ui/src/stores/novel.spec.ts
git commit -m "feat: manage writing cockpit state"
```

## Task 7: Build Chapter Dashboard Panel

**Files:**
- Create: `ui/src/components/novel/ChapterDashboardPanel.vue`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/ChapterDashboardPanel.spec.ts`

**Step 1: Write failing component tests**

Assert the panel renders:

- chapter goal
- POV
- main conflict
- ending hook
- word count
- unresolved foreshadowing count
- continuity risk count
- save button disabled until dirty

Run:

```powershell
cd ui
npm run test -- ChapterDashboardPanel
```

Expected: fail because the component does not exist.

**Step 2: Implement component**

Use compact Element Plus form controls. Keep it dense and work-focused, not a marketing card. Emit:

```ts
"update:dashboard"
"save"
```

**Step 3: Mount in workspace**

Place the dashboard above `ChapterEditor` or as the first right-rail panel, depending on viewport. The author should see it before starting a chapter.

**Step 4: Run tests**

```powershell
cd ui
npm run test -- ChapterDashboardPanel NovelWorkspace
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/components/novel/ChapterDashboardPanel.vue ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/ChapterDashboardPanel.spec.ts
git commit -m "feat: add chapter writing dashboard"
```

## Task 8: Build Scene Card Panel

**Files:**
- Create: `ui/src/components/novel/SceneCardPanel.vue`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/SceneCardPanel.spec.ts`

**Step 1: Write failing tests**

Cover:

- adding a scene
- editing title, location, POV, conflict, turn, and power progression
- moving a scene up/down
- deleting a scene with confirmation callback
- saving emits normalized scene cards

Run:

```powershell
cd ui
npm run test -- SceneCardPanel
```

Expected: fail because the component does not exist.

**Step 2: Implement component**

Use a compact list with editable expanded rows. Stable controls:

- plus icon button for new scene
- arrow icons for reorder
- trash icon for delete
- save button for scene file

Do not place cards inside another decorative card.

**Step 3: Mount in workspace**

Place it near the chapter outline/editor switch, so the writer can plan scenes and then draft.

**Step 4: Run tests**

```powershell
cd ui
npm run test -- SceneCardPanel NovelWorkspace
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/components/novel/SceneCardPanel.vue ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/SceneCardPanel.spec.ts
git commit -m "feat: add scene card workflow"
```

## Task 9: Feed Dashboard And Scenes Into Codex Context

**Files:**
- Modify: `api/src/contextAssembler.ts`
- Modify: `api/src/taskTemplates.ts`
- Test: `api/src/contextAssembler.spec.ts`
- Test: `api/src/taskTemplates.spec.ts`

**Step 1: Write failing context tests**

Assert:

- `chapter.plan` includes the current dashboard and scene cards
- `chapter.draft` includes scene cards before target正文
- `continuity.check` includes structured ledgers
- `idea.suggest` includes unresolved risks and open foreshadowing

Run:

```powershell
cd api
npm run test -- contextAssembler taskTemplates
```

Expected: fail until new context blocks exist.

**Step 2: Add context blocks**

Read:

- `dashboard/<chapterId>.json`
- `scenes/<chapterId>.json`
- JSON ledger files

Add block titles:

- `章节仪表盘`
- `场景卡`
- `结构化伏笔账本`
- `结构化连续性风险`
- `结构化升级节奏`

**Step 3: Update prompts**

Update `chapter.plan`, `chapter.draft`, `continuity.check`, and `idea.suggest` task goals to instruct Codex to respect scene cards and dashboard boundaries.

**Step 4: Run tests**

```powershell
cd api
npm run test -- contextAssembler taskTemplates
```

Expected: pass.

**Step 5: Commit**

```powershell
git add api/src/contextAssembler.ts api/src/taskTemplates.ts api/src/contextAssembler.spec.ts api/src/taskTemplates.spec.ts
git commit -m "feat: include cockpit context in codex tasks"
```

## Task 10: Add Pre-Writing Briefing Task

**Files:**
- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Modify: `api/src/taskTemplates.ts`
- Modify: `ui/src/components/novel/AIOperationPanel.vue`
- Test: `api/src/taskTemplates.spec.ts`
- Test: `ui/src/components/novel/AIOperationPanel.spec.ts`

**Step 1: Write failing tests**

Add task type:

```ts
"writing.briefing"
```

Assert the AI panel has a `写前简报` button and the task template asks for:

- previous chapter ending
- current chapter goal
- POV limits
- must remember
- must not reveal
- unresolved foreshadowing
- risks

Run:

```powershell
cd api
npm run test -- taskTemplates
cd ..\ui
npm run test -- AIOperationPanel
```

Expected: fail until task type and UI action exist.

**Step 2: Implement task type and button**

Add the task type to both type files and the AI action list.

**Step 3: Run tests**

```powershell
cd api
npm run test -- taskTemplates
cd ..\ui
npm run test -- AIOperationPanel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/types.ts ui/src/types/novel.ts api/src/taskTemplates.ts ui/src/components/novel/AIOperationPanel.vue api/src/taskTemplates.spec.ts ui/src/components/novel/AIOperationPanel.spec.ts
git commit -m "feat: add prewriting briefing task"
```

## Task 11: Add Post-Save Recap Candidate Flow

**Files:**
- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Modify: `api/src/taskTemplates.ts`
- Modify: `ui/src/stores/novel.ts`
- Create: `ui/src/components/novel/WritingRecapPanel.vue`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `api/src/taskTemplates.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`
- Test: `ui/src/components/novel/WritingRecapPanel.spec.ts`

**Step 1: Write failing tests**

Add task type:

```ts
"writing.recap"
```

Cover:

- saving chapter can request a recap candidate
- recap panel shows new facts, character changes, foreshadowing updates, risks, power progression updates
- accepting recap updates ledger entries through store actions
- rejecting recap clears the candidate without changing files

Run:

```powershell
cd api
npm run test -- taskTemplates
cd ..\ui
npm run test -- novel WritingRecapPanel
```

Expected: fail until recap flow exists.

**Step 2: Implement task template**

Prompt Codex to output JSON that maps cleanly to `WritingRecapCandidate`. It must not auto-write ledgers.

**Step 3: Implement store flow**

Add:

```ts
recapCandidate
requestWritingRecap()
acceptWritingRecap()
rejectWritingRecap()
```

**Step 4: Implement panel**

Render candidate sections with accept/reject actions. Keep the panel review-oriented and compact.

**Step 5: Run tests**

```powershell
cd api
npm run test -- taskTemplates
cd ..\ui
npm run test -- novel WritingRecapPanel NovelWorkspace
```

Expected: pass.

**Step 6: Commit**

```powershell
git add api/src/types.ts ui/src/types/novel.ts api/src/taskTemplates.ts ui/src/stores/novel.ts ui/src/components/novel/WritingRecapPanel.vue ui/src/components/novel/NovelWorkspace.vue api/src/taskTemplates.spec.ts ui/src/stores/novel.spec.ts ui/src/components/novel/WritingRecapPanel.spec.ts
git commit -m "feat: add post-save writing recap flow"
```

## Task 12: Replace Static Ledger Panel With Operational Ledgers

**Files:**
- Modify: `ui/src/components/novel/LedgerPanel.vue`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/LedgerPanel.spec.ts`

**Step 1: Write failing tests**

Cover:

- shows ledger kind tabs
- renders structured entries
- filters open/high-severity risks
- edits status and note
- saves entries

Run:

```powershell
cd ui
npm run test -- LedgerPanel
```

Expected: fail until `LedgerPanel` accepts real data and emits updates.

**Step 2: Implement panel props and emits**

Props:

```ts
entries: LedgerEntry[]
activeKind: LedgerEntry["kind"]
loading?: boolean
```

Emits:

```ts
"change-kind"
"update:entries"
"save"
```

**Step 3: Wire to store**

Load ledger entries when project opens and when the user switches kind.

**Step 4: Run tests**

```powershell
cd ui
npm run test -- LedgerPanel NovelWorkspace novel
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/components/novel/LedgerPanel.vue ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/LedgerPanel.spec.ts ui/src/stores/novel.ts ui/src/stores/novel.spec.ts
git commit -m "feat: make writing ledgers operational"
```

## Task 13: Upgrade Rewrite Comparison To Side-By-Side Diff

**Files:**
- Modify: `ui/src/components/novel/RewriteComparison.vue`
- Modify: `ui/src/stores/novel.ts`
- Test: `ui/src/components/novel/RewriteComparison.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing tests**

Cover:

- selected original text is shown beside AI result
- accept replaces only the active selection
- reject keeps original content
- accept is disabled when no active selection exists
- patch application stays separate from selected rewrite acceptance

Run:

```powershell
cd ui
npm run test -- RewriteComparison novel
```

Expected: fail until original selection is passed to the component.

**Step 2: Add original selection prop**

Pass `store.selection?.selectedText` from `NovelWorkspace.vue` into `RewriteComparison`.

**Step 3: Implement side-by-side layout**

Use two scrollable panels labelled `原文` and `建议稿`. Avoid a heavy diff dependency for now.

**Step 4: Run tests**

```powershell
cd ui
npm run test -- RewriteComparison novel
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/components/novel/RewriteComparison.vue ui/src/components/novel/NovelWorkspace.vue ui/src/stores/novel.ts ui/src/components/novel/RewriteComparison.spec.ts ui/src/stores/novel.spec.ts
git commit -m "feat: show side by side rewrite comparison"
```

## Task 14: Add Writing Mode Switcher

**Files:**
- Create: `ui/src/components/novel/WritingModeSwitcher.vue`
- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/WritingModeSwitcher.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing tests**

Cover modes:

- `focus`: editor, dashboard summary, save state
- `structure`: dashboard, scene cards, outline, editor
- `review`: rewrite comparison, ledgers, risks, task history

Run:

```powershell
cd ui
npm run test -- WritingModeSwitcher novel NovelWorkspace
```

Expected: fail until mode state and component exist.

**Step 2: Implement store mode**

Add:

```ts
writingMode: "focus" | "structure" | "review"
setWritingMode(mode)
```

**Step 3: Implement switcher and conditional layout**

Use segmented control with icons. Keep keyboard and focus states accessible.

**Step 4: Run tests**

```powershell
cd ui
npm run test -- WritingModeSwitcher novel NovelWorkspace
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/components/novel/WritingModeSwitcher.vue ui/src/stores/novel.ts ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/WritingModeSwitcher.spec.ts ui/src/stores/novel.spec.ts
git commit -m "feat: add writing mode switcher"
```

## Task 15: Add Focus Writing Polish

**Files:**
- Modify: `ui/src/components/novel/ChapterEditor.vue`
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/ChapterEditor.spec.ts`
- Test: `ui/src/components/novel/NovelWorkspace.spec.ts`

**Step 1: Write failing tests**

Cover:

- focus mode hides non-essential panels
- editor keeps save button and word count visible
- textarea has stable height and no horizontal overflow at 390px width
- selecting text still updates selection state

Run:

```powershell
cd ui
npm run test -- ChapterEditor NovelWorkspace
```

Expected: fail until focus-mode layout is implemented.

**Step 2: Implement focus layout**

Keep the UI quiet: no decorative hero, no nested cards, no instruction-heavy text. Preserve existing editor behavior.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- ChapterEditor NovelWorkspace
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/ChapterEditor.vue ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/ChapterEditor.spec.ts ui/src/components/novel/NovelWorkspace.spec.ts
git commit -m "feat: refine focus writing mode"
```

## Task 16: Full Verification

**Files:**
- Create: `docs/plans/2026-06-04-novel-workbench-efficiency-upgrade-verification.md`

**Step 1: Run API tests**

```powershell
cd api
npm run test
```

Expected: all API tests pass.

**Step 2: Run UI tests**

```powershell
cd ui
npm run test
```

Expected: all UI tests pass.

**Step 3: Run builds**

```powershell
cd api
npm run build
cd ..\ui
npm run build
```

Expected: both builds pass.

**Step 4: Start local servers**

```powershell
cd api
npm run dev
```

In another shell:

```powershell
cd ui
npm run dev
```

Expected:

- API at `http://127.0.0.1:8787`
- UI at Vite dev URL, usually `http://127.0.0.1:5173`

**Step 5: Manual flow**

Verify:

1. Open a project.
2. Open chapter 1.
3. Edit dashboard goal, POV, conflict, and hook.
4. Add three scene cards and reorder them.
5. Run `写前简报`.
6. Draft or edit chapter content.
7. Save chapter.
8. Run `写后复盘`.
9. Accept one ledger update.
10. Select text and verify side-by-side rewrite comparison.
11. Switch focus, structure, and review modes.

**Step 6: Save verification notes**

Create the verification doc with:

- commands run
- pass/fail results
- manual screenshots or notes
- remaining risks

**Step 7: Commit**

```powershell
git add docs/plans/2026-06-04-novel-workbench-efficiency-upgrade-verification.md
git commit -m "docs: verify novel workbench efficiency upgrade"
```

## Acceptance Checklist

- [ ] Every project has dashboard, scenes, structured ledgers, and recap history files.
- [ ] Opening a chapter loads dashboard, scene cards, and relevant ledger state.
- [ ] The dashboard shows goal, POV, conflict, hook, word count, status, unresolved foreshadowing, and risks.
- [ ] Scene cards can be created, edited, reordered, deleted, and saved.
- [ ] Codex context includes dashboard, scene cards, and structured ledgers for relevant tasks.
- [ ] `写前简报` tells the author what to remember and what not to reveal.
- [ ] `写后复盘` proposes ledger updates but never applies them without author confirmation.
- [ ] Ledger panel edits real structured data instead of showing static placeholder text.
- [ ] Rewrite comparison shows original text and AI suggestion side by side.
- [ ] Focus, structure, and review modes reduce panel noise for the author.
- [ ] API tests, UI tests, and builds pass.
- [ ] Existing chapter editing, saving, project switching, and AI task flows still work.

## Execution Notes

- Use TDD for each task.
- Keep each commit narrow.
- Do not replace the textarea editor in this plan.
- Do not introduce a new database.
- Do not auto-apply AI text or ledger changes.
- Preserve current project file editability so authors can still open Markdown/JSON files directly.
