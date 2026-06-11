# P0 Chapter Memory And State Patches Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Completed and verified on 2026-06-11. See `docs/plans/2026-06-10-p0-chapter-memory-state-patches-verification.md`.

**Goal:** Build the P0 creation-loop backend: persist per-chapter summaries under `memory/chapter-summaries/`, inject them into future AI context, and upgrade post-save recaps into reviewable state patches that only merge after author approval.

**Architecture:** Keep the existing file-backed project model. Add typed memory JSON files and a narrow accept-recaps API that merges approved patches into chapter summaries and structured ledgers. Preserve the current `WritingRecapCandidate` fields for compatibility, but prefer the new patch fields once present.

**Tech Stack:** TypeScript, Express, Vue 3, Pinia, Vite, Vitest, file-backed JSON/JSONL project data.

---

## Scope

P0 includes:

- `memory/chapter-summaries/<chapterId>.json` as the canonical chapter memory asset.
- Context injection for `chapter.plan`, `chapter.draft`, `writing.briefing`, `writing.recap`, `continuity.check`, and `idea.suggest`.
- A reviewable post-save recap schema with `summaryPatch`, `factPatches`, `ledgerPatches`, `characterStatePatches`, and `riskPatches`.
- An explicit accept path that writes summary memory and ledgers only after author confirmation.
- UI display that makes the pending patch categories visible before acceptance.

Out of scope:

- Embeddings or vector search.
- Knowledge graph/triples.
- Automatic background after-save pipelines.
- AI invocation session audit. That is P1.

## Data Contracts

Add these contracts to both `api/src/types.ts` and `ui/src/types/novel.ts`.

```ts
export type RecapPatchStatus = "pending" | "accepted" | "rejected";

export interface ChapterFactPatch {
  id: string;
  chapterId: string;
  fact: string;
  relatedEntities: string[];
  sourceAnchor?: string;
  status: RecapPatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterStatePatch {
  id: string;
  chapterId: string;
  characterId?: string;
  characterName: string;
  before?: string;
  after: string;
  cause: string;
  relatedEntities: string[];
  status: RecapPatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
  newFacts: ChapterFactPatch[];
  characterStateChanges: CharacterStatePatch[];
  foreshadowingUpdates: LedgerEntry[];
  continuityRisks: LedgerEntry[];
  powerProgressionUpdates: LedgerEntry[];
  acceptedRecapIds: string[];
  updatedAt: string;
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
  summaryPatch?: Partial<ChapterSummary>;
  factPatches?: ChapterFactPatch[];
  ledgerPatches?: LedgerEntry[];
  characterStatePatches?: CharacterStatePatch[];
  riskPatches?: LedgerEntry[];
}
```

Compatibility rule:

- Existing AI outputs that only return `newFacts`, `characterStateChanges`, `foreshadowingUpdates`, `continuityRisks`, and `powerProgressionUpdates` must still parse.
- New outputs should use patch fields.
- Acceptance should merge both forms by normalizing legacy fields into patch objects when patch fields are missing.

## Task 1: Add Shared P0 Memory Types

**Files:**

- Modify: `api/src/types.ts`
- Modify: `ui/src/types/novel.ts`
- Test: `api/src/novelProject.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing type fixture tests**

Add fixture usage for `ChapterSummary`, `ChapterFactPatch`, and `CharacterStatePatch`.

Run:

```powershell
cd api
npm run test -- novelProject
cd ..\ui
npm run test -- novel
```

Expected: TypeScript fails until the contracts exist.

**Step 2: Add the contracts**

Add the interfaces from the Data Contracts section. Keep union values identical between API and UI.

**Step 3: Verify**

Run the same two commands.

Expected: tests compile and pass.

**Step 4: Commit**

```powershell
git add api/src/types.ts ui/src/types/novel.ts api/src/novelProject.spec.ts ui/src/stores/novel.spec.ts
git commit -m "feat: add chapter memory patch contracts"
```

## Task 2: Create Chapter Summary Files In Project Skeletons

**Files:**

- Modify: `api/src/novelProject.ts`
- Modify: `api/src/novelProject.spec.ts`

**Step 1: Write failing skeleton test**

Extend the existing skeleton test to assert:

- `memory/chapter-summaries/` exists.
- Every default chapter has a JSON file.
- `chapter-001.json` contains a safe empty `ChapterSummary`.

Expected shape:

```ts
expect(summary).toMatchObject({
  chapterId: "chapter-001",
  summary: "",
  keyEvents: [],
  newFacts: [],
  characterStateChanges: [],
  foreshadowingUpdates: [],
  continuityRisks: [],
  powerProgressionUpdates: [],
  acceptedRecapIds: []
});
```

Run:

```powershell
cd api
npm run test -- novelProject
```

Expected: fail because the memory directory/files are not created yet.

**Step 2: Add default summary creation**

In `api/src/novelProject.ts`:

- Add `"memory/chapter-summaries"` to the directory list.
- Add a `createDefaultChapterSummary(chapterId)` helper.
- During `createProjectFiles`, write `memory/chapter-summaries/${chapter.id}.json` for each chapter.

**Step 3: Verify**

Run:

```powershell
cd api
npm run test -- novelProject
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/novelProject.ts api/src/novelProject.spec.ts
git commit -m "feat: create chapter summary memory files"
```

## Task 3: Add Memory Helpers And Recap Acceptance Merge

**Files:**

- Modify: `api/src/writingCockpit.ts`
- Modify: `api/src/writingCockpit.spec.ts`

**Step 1: Write failing helper tests**

Add tests for:

- `readChapterSummary(root, chapterId)` returns the default summary when missing.
- `saveChapterSummary(root, summary)` writes a normalized summary and rejects unsafe chapter IDs through `resolveInside`.
- `acceptWritingRecapPatches(root, recap)` merges:
  - `summaryPatch` into `memory/chapter-summaries/<chapterId>.json`
  - `factPatches` into summary `newFacts`
  - `characterStatePatches` into summary `characterStateChanges`
  - `ledgerPatches` into their ledger files
  - `riskPatches` into the risk ledger
  - legacy `foreshadowingUpdates`, `continuityRisks`, and `powerProgressionUpdates` when patch fields are absent
  - the raw candidate into `tasks/recaps.jsonl`

Run:

```powershell
cd api
npm run test -- writingCockpit
```

Expected: fail because helpers do not exist.

**Step 2: Implement the helpers**

Add these exports:

```ts
export async function readChapterSummary(root: string, chapterId: string): Promise<ChapterSummary>;
export async function saveChapterSummary(root: string, summary: ChapterSummary): Promise<ChapterSummary>;
export async function acceptWritingRecapPatches(root: string, recap: WritingRecapCandidate): Promise<ChapterSummary>;
```

Merge behavior:

- Use IDs for de-duplication.
- Set accepted patch statuses to `"accepted"`.
- Preserve existing summary data when a recap only adds one category.
- Append the recap candidate to `tasks/recaps.jsonl` after successful file writes.

**Step 3: Verify**

Run:

```powershell
cd api
npm run test -- writingCockpit
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/writingCockpit.ts api/src/writingCockpit.spec.ts
git commit -m "feat: merge accepted writing recap patches"
```

## Task 4: Expose Summary And Recap Acceptance API Routes

**Files:**

- Modify: `api/src/app.ts`
- Modify: `api/src/app.spec.ts`

**Step 1: Write failing route tests**

Add tests for:

- `GET /api/novel/projects/:projectId/memory/chapter-summaries/:chapterId`
- `PUT /api/novel/projects/:projectId/memory/chapter-summaries/:chapterId`
- `POST /api/novel/projects/:projectId/recaps/accept`

The accept route body should be:

```json
{
  "recap": {
    "chapterId": "chapter-001",
    "summary": "The protagonist pays a cost.",
    "newFacts": [],
    "characterStateChanges": [],
    "foreshadowingUpdates": [],
    "continuityRisks": [],
    "powerProgressionUpdates": [],
    "createdAt": "2026-06-10T00:00:00.000Z",
    "summaryPatch": {
      "summary": "The protagonist pays a cost.",
      "keyEvents": ["The seal weakens."]
    },
    "ledgerPatches": []
  }
}
```

Expected response:

```ts
expect(response.data.summary).toMatchObject({
  chapterId: "chapter-001",
  summary: "The protagonist pays a cost."
});
```

Run:

```powershell
cd api
npm run test -- app
```

Expected: fail because routes do not exist.

**Step 2: Implement routes**

Import the new helpers from `writingCockpit.ts`.

Add routes near existing dashboard/scenes/ledger routes:

```ts
app.get("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", ...)
app.put("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", ...)
app.post("/api/novel/projects/:projectId/recaps/accept", ...)
```

**Step 3: Verify**

Run:

```powershell
cd api
npm run test -- app
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/app.ts api/src/app.spec.ts
git commit -m "feat: expose chapter memory recap APIs"
```

## Task 5: Inject Chapter Summaries Into AI Context

**Files:**

- Modify: `api/src/contextAssembler.ts`
- Modify: `api/src/contextAssembler.spec.ts`

**Step 1: Write failing context tests**

Add tests that create:

- `memory/chapter-summaries/chapter-001.json`
- `memory/chapter-summaries/chapter-002.json`
- `memory/chapter-summaries/chapter-010.json`
- structured ledger entries that reference both the target chapter and `chapter-010`

Assert `assembleContext("chapter.draft", ...)` includes:

- `相邻章节摘要`
- `相关远章摘要`

Run:

```powershell
cd api
npm run test -- contextAssembler
```

Expected: fail because summaries are not injected.

**Step 2: Implement summary selection**

In `contextAssembler.ts`:

- Add `readOptionalJson`.
- Resolve target chapter index from `project.chapters`.
- Read previous 2 chapters and next 1 chapter summaries.
- Read far summaries for chapter IDs referenced by structured ledger entries that also include the target chapter.
- Limit each summary block to `trimContext`.

Suggested block titles:

- `相邻章节摘要`
- `相关远章摘要`

Context types to include:

```ts
const memoryContextTypes: CodexTaskType[] = [
  "chapter.plan",
  "chapter.draft",
  "writing.briefing",
  "writing.recap",
  "continuity.check",
  "idea.suggest"
];
```

**Step 3: Verify**

Run:

```powershell
cd api
npm run test -- contextAssembler
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/contextAssembler.ts api/src/contextAssembler.spec.ts
git commit -m "feat: inject chapter summaries into task context"
```

## Task 6: Upgrade Prompt Contract For State Patches

**Files:**

- Modify: `api/src/taskTemplates.ts`
- Modify: `api/src/taskTemplates.spec.ts`

**Step 1: Write failing prompt test**

Update the `writing.recap` prompt test to assert it mentions:

- `summaryPatch`
- `factPatches`
- `ledgerPatches`
- `characterStatePatches`
- `riskPatches`
- author approval before merge

Run:

```powershell
cd api
npm run test -- taskTemplates
```

Expected: fail until prompt contract is updated.

**Step 2: Update the contract**

In `buildTaskContract("writing.recap")`, replace the current one-line contract with the new schema and explicit merge rule.

Required wording:

- Return a `WritingRecapCandidate`.
- Prefer patch fields over legacy arrays.
- Do not claim accepted state.
- Do not auto-apply project memory, bible, summary, or ledger updates.

**Step 3: Verify**

Run:

```powershell
cd api
npm run test -- taskTemplates
```

Expected: pass.

**Step 4: Commit**

```powershell
git add api/src/taskTemplates.ts api/src/taskTemplates.spec.ts
git commit -m "feat: request reviewable recap state patches"
```

## Task 7: Add UI API Client Methods

**Files:**

- Modify: `ui/src/services/novelApi.ts`
- Modify: `ui/src/services/novelApi.spec.ts`

**Step 1: Write failing client tests**

Add tests for:

- `readChapterSummary(projectId, chapterId)`
- `saveChapterSummary(projectId, summary)`
- `acceptWritingRecap(projectId, recap)`

Run:

```powershell
cd ui
npm run test -- novelApi
```

Expected: fail until methods exist.

**Step 2: Implement client methods**

Add imports for `ChapterSummary` and `WritingRecapCandidate`.

Add methods:

```ts
async readChapterSummary(projectId: string, chapterId: string): Promise<ChapterSummary>
async saveChapterSummary(projectId: string, summary: ChapterSummary): Promise<ChapterSummary>
async acceptWritingRecap(projectId: string, recap: WritingRecapCandidate): Promise<ChapterSummary>
```

**Step 3: Verify**

Run:

```powershell
cd ui
npm run test -- novelApi
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/novelApi.ts ui/src/services/novelApi.spec.ts
git commit -m "feat: add chapter memory api client"
```

## Task 8: Normalize Recap Patches In Pinia Store

**Files:**

- Modify: `ui/src/stores/novel.ts`
- Modify: `ui/src/stores/novel.spec.ts`

**Step 1: Write failing store tests**

Add tests that prove:

- `parseRecapCandidate` keeps new patch fields.
- legacy recap arrays are still accepted.
- `acceptWritingRecap` calls `novelApi.acceptWritingRecap`.
- accepted recap clears `recapCandidate`.
- active ledger state is reloaded after acceptance.

Run:

```powershell
cd ui
npm run test -- novel
```

Expected: fail until store is updated.

**Step 2: Update parsing and acceptance**

In `parseRecapCandidate`:

- Preserve `summaryPatch`, `factPatches`, `ledgerPatches`, `characterStatePatches`, and `riskPatches`.
- Default missing arrays to empty arrays.

In `acceptWritingRecap`:

- Replace direct client-side ledger merging with `novelApi.acceptWritingRecap`.
- Reload active ledger entries afterward.
- Keep `recapCandidate` untouched if the API call fails.

**Step 3: Verify**

Run:

```powershell
cd ui
npm run test -- novel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/stores/novel.ts ui/src/stores/novel.spec.ts
git commit -m "feat: accept recap patches through project memory"
```

## Task 9: Show Patch Categories In Writing Recap Panel

**Files:**

- Modify: `ui/src/components/novel/WritingRecapPanel.vue`
- Modify: `ui/src/components/novel/WritingRecapPanel.spec.ts`

**Step 1: Write failing component test**

Add a candidate with:

- `summaryPatch.keyEvents`
- two `factPatches`
- one `characterStatePatch`
- one `ledgerPatch`
- one `riskPatch`

Assert the panel renders each category count and representative text.

Run:

```powershell
cd ui
npm run test -- WritingRecapPanel
```

Expected: fail until the panel renders patch fields.

**Step 2: Update UI**

Keep the compact panel style. Add sections:

- 摘要补丁
- 事实补丁
- 人物状态补丁
- 账本补丁
- 风险补丁

Show legacy arrays when patch arrays are empty.

**Step 3: Verify**

Run:

```powershell
cd ui
npm run test -- WritingRecapPanel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/WritingRecapPanel.vue ui/src/components/novel/WritingRecapPanel.spec.ts
git commit -m "feat: preview writing recap state patches"
```

## Task 10: Full P0 Verification

**Files:**

- Create: `docs/plans/2026-06-10-p0-chapter-memory-state-patches-verification.md`

**Step 1: Run focused tests**

```powershell
cd api
npm run test -- novelProject writingCockpit contextAssembler taskTemplates app
cd ..\ui
npm run test -- novelApi novel WritingRecapPanel
```

Expected: all pass.

**Step 2: Run full verification**

```powershell
npm run verify
```

Expected: API tests, UI tests, API build, and UI build pass.

**Step 3: Manual server check**

If the dev servers are not already running:

```powershell
cd api
npm run dev
cd ..\ui
npm run dev
```

Manual flow:

1. Open `http://127.0.0.1:5173/`.
2. Open a project and a drafted chapter.
3. Run `写后复盘`.
4. Confirm the recap panel shows patch categories.
5. Accept the recap.
6. Confirm `memory/chapter-summaries/<chapterId>.json` was updated.
7. Run `写前简报` or `chapter.draft` for the next chapter.
8. Confirm backend prompt context includes adjacent chapter summaries.

**Step 4: Save verification record**

Record:

- exact commands run
- pass/fail result
- manual flow notes
- remaining risks

**Step 5: Commit**

```powershell
git add docs/plans/2026-06-10-p0-chapter-memory-state-patches-verification.md
git commit -m "docs: verify p0 chapter memory state patches"
```

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

## Known Risks

- File-backed acceptance is not transactional. Keep merge order deterministic and tests strict; if this becomes painful, add a small backup file before writing multiple assets.
- Real AI output may still return legacy fields for a while. Do not remove legacy parser support in this P0.
- Far-summary relevance is heuristic. P0 should use ledger chapter references and explicit payload IDs only; embedding search belongs to P2.
