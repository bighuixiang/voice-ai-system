# AI Stage Dictionary UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Load the shared AI stage dictionary into the workspace and render readable stage labels beside stable audit stage keys.

**Architecture:** Reuse `api/src/aiStages.ts` and the existing `/api/novel/ai-stages` route as the source of truth. Add Pinia state and startup loading in the workspace, then pass definitions into task history so audit records stay machine-stable while the UI is readable. Keep task execution, invocation persistence, and audit report JSON schemas unchanged.

**Tech Stack:** TypeScript, Express, Vue 3, Pinia, Element Plus, Vitest.

---

### Task 1: Load AI Stage Dictionary In Store

**Files:**
- Modify: `ui/src/stores/novel.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write the failing store test**

Add a test that mocks `novelApi.readAiStages()` and verifies `store.loadAiStages()` writes the returned definitions to `store.aiStages`.

Expected assertion shape:

```ts
await store.loadAiStages();

expect(store.aiStages).toEqual([
  { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }
]);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix ui run test -- novel`

Expected: FAIL because `aiStages` and `loadAiStages` are not exposed by the store.

**Step 3: Implement store state and loader**

In `ui/src/stores/novel.ts`:

- Import `AiStageDefinition`.
- Add `const aiStages = ref<AiStageDefinition[]>([]);`.
- Add:

```ts
async function loadAiStages() {
  aiStages.value = await novelApi.readAiStages();
}
```

- Return both `aiStages` and `loadAiStages` from the store.

**Step 4: Run targeted tests**

Run: `npm --prefix ui run test -- novel`

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/stores/novel.ts ui/src/stores/novel.spec.ts
git commit -m "feat: load ai stage dictionary"
```

### Task 2: Load Stage Dictionary During Workspace Startup

**Files:**
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/NovelWorkspace.spec.ts`

**Step 1: Write the failing workspace test**

Update the workspace store mock so `loadAiStages` is a spy, then assert the initial route sync invokes it.

Expected assertion shape:

```ts
expect(store.loadAiStages).toHaveBeenCalled();
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix ui run test -- NovelWorkspace`

Expected: FAIL because startup currently loads projects, agents, platform AI config, and platform library, but not stage definitions.

**Step 3: Implement startup loading**

In `syncWorkspaceFromRoute()` call:

```ts
await store.loadAiStages().catch(() => {
  // AI stage labels are optional while the API service is booting.
});
```

Place it near the other platform/AI bootstrap calls.

**Step 4: Pass stage definitions into task history**

When rendering `TaskHistoryPanel`, pass:

```vue
:stages="store.aiStages"
```

**Step 5: Run targeted tests**

Run: `npm --prefix ui run test -- NovelWorkspace`

Expected: PASS.

**Step 6: Commit**

```bash
git add ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/NovelWorkspace.spec.ts
git commit -m "feat: bootstrap ai stage dictionary"
```

### Task 3: Render Readable Stage Labels In Task History

**Files:**
- Modify: `ui/src/components/novel/TaskHistoryPanel.vue`
- Test: `ui/src/components/novel/TaskHistoryPanel.spec.ts`

**Step 1: Write the failing component test**

Pass a `stages` prop with:

```ts
[{ key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }]
```

Assert the rendered text contains both:

- `Chapter prose drafting`
- `pipeline.chapter.prose`

**Step 2: Run test to verify it fails**

Run: `npm --prefix ui run test -- TaskHistoryPanel`

Expected: FAIL because the component only renders the raw stage key.

**Step 3: Implement label lookup**

In `TaskHistoryPanel.vue`:

- Add `AiStageDefinition` to the type import.
- Add optional prop `stages?: AiStageDefinition[]`.
- Build a computed `stageLabels` map from `props.stages`.
- Add:

```ts
function stageLabel(invocation: AiInvocationSession) {
  return stageLabels.value[invocation.stageKey] || invocation.stageKey;
}
```

- Update `auditSummary()` to start with `${stageLabel(invocation)} (${invocation.stageKey})`.
- Add a visible detail grid entry that keeps the stable stage key scannable.

**Step 4: Run targeted tests**

Run: `npm --prefix ui run test -- TaskHistoryPanel NovelWorkspace novel`

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/components/novel/TaskHistoryPanel.vue ui/src/components/novel/TaskHistoryPanel.spec.ts
git commit -m "feat: show ai stage labels in task history"
```

### Task 4: Document And Verify

**Files:**
- Modify: `docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md`

**Step 1: Update progress documentation**

Under `AI invocation audit`, add that the shared AI stage dictionary is loaded by the workspace and task history now shows readable labels beside stable stage keys.

Under `Recent Commits`, add the new commit hashes.

**Step 2: Run verification**

Run: `npm --prefix ui run test -- TaskHistoryPanel NovelWorkspace novel`

Expected: PASS.

If time allows, also run:

```bash
npm run verify
```

Expected: PASS, with existing warnings only.

**Step 3: Commit docs**

```bash
git add docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md docs/plans/2026-06-11-ai-stage-dictionary-ui.md
git commit -m "docs: plan ai stage dictionary ui"
```

If the plan file was committed before implementation, commit only the progress document in the final docs commit.
