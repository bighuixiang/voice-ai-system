# Stage-Aware AI Operation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show shared AI stage labels in the AI operation panel so task launch controls and task progress use the same stage language as invocation audit history.

**Architecture:** Keep the backend API unchanged and reuse the already-loaded `AiStageDefinition[]` from the workspace store. Pass stage definitions into `AIOperationPanel`, derive task-type to stage mappings locally, and render concise labels beside operation actions while preserving existing action events and task progress behavior.

**Tech Stack:** TypeScript, Vue 3, Pinia, Element Plus, Vitest.

---

### Task 1: Test Stage Labels In AI Operation Panel

**Files:**
- Modify: `ui/src/components/novel/AIOperationPanel.spec.ts`

**Step 1: Add the failing component test**

Mount `AIOperationPanel` with a `stages` prop:

```ts
const stages: AiStageDefinition[] = [
  { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] },
  { key: "autopilot.post_chapter.recap", label: "Post chapter recap", taskTypes: ["writing.recap"] }
];
```

Assert rendered text contains:

```ts
expect(wrapper.text()).toContain("Chapter prose drafting");
expect(wrapper.text()).toContain("pipeline.chapter.prose");
expect(wrapper.text()).toContain("Post chapter recap");
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix ui run test -- AIOperationPanel`

Expected: FAIL because the component does not accept or render stage definitions.

**Step 3: Commit is deferred**

Commit after the implementation passes.

### Task 2: Render Stage Labels In AI Operation Panel

**Files:**
- Modify: `ui/src/components/novel/AIOperationPanel.vue`

**Step 1: Add stage props and lookup**

Import `computed` and `AiStageDefinition`.

Add optional prop:

```ts
stages?: AiStageDefinition[];
```

Build a task type lookup:

```ts
const stageByTaskType = computed(() => {
  const entries = new Map<CodexTaskType, AiStageDefinition>();
  for (const stage of props.stages || []) {
    for (const taskType of stage.taskTypes) {
      entries.set(taskType, stage);
    }
  }
  return entries;
});
```

**Step 2: Render labels in action buttons**

Inside each action button, keep the icon and action label, then render:

```vue
<span v-if="stageForTask(action.type)" class="action-stage">
  {{ stageForTask(action.type)?.label }}
  <small>{{ stageForTask(action.type)?.key }}</small>
</span>
```

Use compact CSS so long stage keys wrap without changing button width unexpectedly.

**Step 3: Run targeted component tests**

Run: `npm --prefix ui run test -- AIOperationPanel`

Expected: PASS.

### Task 3: Wire Workspace Stage Data

**Files:**
- Modify: `ui/src/components/novel/NovelWorkspace.vue`
- Test: `ui/src/components/novel/NovelWorkspace.spec.ts`

**Step 1: Pass store stages into the panel**

Update the panel usage:

```vue
<AIOperationPanel
  :task="store.currentTask"
  :progress="store.taskProgress"
  :loading="store.isLoading"
  :stages="store.aiStages"
  @run-task="store.runTask"
  @apply-patches="store.applyTaskPatches"
/>
```

**Step 2: Add or update workspace test coverage**

Ensure the workspace store mock exposes `aiStages` and that mount does not regress.

**Step 3: Run workspace tests**

Run: `npm --prefix ui run test -- NovelWorkspace AIOperationPanel`

Expected: PASS.

### Task 4: Document, Verify, Commit

**Files:**
- Modify: `docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md`
- Modify: `docs/plans/2026-06-11-stage-aware-ai-operation.md`

**Step 1: Update progress docs**

Record that the shared AI stage dictionary is now visible in both task history and task launch controls.

**Step 2: Run verification**

Run: `npm --prefix ui run test -- AIOperationPanel NovelWorkspace TaskHistoryPanel novel`

Expected: PASS.

If targeted tests pass, run:

```bash
npm run verify
```

Expected: PASS with existing non-blocking warnings only.

**Step 3: Commit**

```bash
git add docs/plans/2026-06-11-stage-aware-ai-operation.md docs/plans/2026-06-11-plotpilot-runtime-upgrade-progress.md ui/src/components/novel/AIOperationPanel.vue ui/src/components/novel/AIOperationPanel.spec.ts ui/src/components/novel/NovelWorkspace.vue ui/src/components/novel/NovelWorkspace.spec.ts
git commit -m "feat: show ai stages in operation panel"
```
