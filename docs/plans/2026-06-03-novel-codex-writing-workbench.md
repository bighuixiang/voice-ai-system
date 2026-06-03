# Novel Codex Writing Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local novel writing workbench that calls Codex CLI to help authors create outlines, plan chapters, draft prose, polish selected text, suggest ideas, and check continuity.

**Architecture:** Use the existing Vue UI as the front-end base and add a local writing task API that manages project files, assembles writing context, invokes Codex CLI, and parses structured results. Store novel projects as Markdown/JSON files so authors can edit them directly and keep them under version control.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite, Node child processes or the existing API layer, Markdown project files, mock Codex CLI for tests.

---

## Scope

First MVP:

- Create a novel project from a rough idea.
- Save story bible, outline, chapters, ledgers, and task history.
- Generate outline and chapter plan through Codex CLI task templates.
- Draft a chapter from a chapter plan.
- Polish selected text with diff-style accept/reject.
- Run a continuity check.

Out of scope for MVP:

- Desktop packaging.
- Multi-user collaboration.
- Real vector database.
- Full timeline graph visualization.
- Batch writing many chapters without author confirmation.

## Task 1: Confirm Current Technical Surface

**Files:**
- Read: `ui/src/App.vue`
- Read: `ui/src/services/api.ts`
- Read: `ui/src/stores/`
- Create: `docs/plans/2026-06-03-novel-codex-technical-scan.md`

**Step 1: Inspect current UI structure**

Run:

```powershell
Get-Content -Path ui/src/App.vue -TotalCount 220
Get-ChildItem -Recurse -Depth 2 ui/src | Select-Object FullName
```

Expected: identify reusable layout, API service, stores, and style conventions.

**Step 2: Inspect package scripts**

Run:

```powershell
Get-Content -Path ui/package.json
```

Expected: identify test, build, and dev commands.

**Step 3: Write the scan**

Create `docs/plans/2026-06-03-novel-codex-technical-scan.md` with:

- reusable modules
- modules to replace
- needed backend surface
- recommended MVP entry point

**Step 4: Commit**

```powershell
git add docs/plans/2026-06-03-novel-codex-technical-scan.md
git commit -m "docs: scan novel workbench technical surface"
```

## Task 2: Add Novel Project File Model

**Files:**
- Create: `ui/src/types/novel.ts`
- Create: `ui/src/services/novelProject.ts`
- Test: `ui/src/services/novelProject.spec.ts`

**Step 1: Write failing tests**

Test creating a project model from a rough idea, generating safe file paths, and rejecting unsafe paths like `../secret`.

**Step 2: Run test to verify failure**

```powershell
cd ui
npm run test -- novelProject
```

Expected: fail because module does not exist.

**Step 3: Implement minimal model**

Define:

- `NovelProject`
- `NovelFile`
- `NovelChapter`
- `NovelLedger`
- `createProjectSkeleton(input)`
- `assertSafeNovelPath(path)`

**Step 4: Run tests**

```powershell
cd ui
npm run test -- novelProject
```

Expected: pass.

**Step 5: Commit**

```powershell
git add ui/src/types/novel.ts ui/src/services/novelProject.ts ui/src/services/novelProject.spec.ts
git commit -m "feat: add novel project file model"
```

## Task 3: Add Codex CLI Configuration Detection

**Files:**
- Create: `ui/src/services/codexConfig.ts`
- Test: `ui/src/services/codexConfig.spec.ts`

**Step 1: Write failing tests**

Cover:

- default command is `codex`
- custom path is accepted
- missing command returns a clear unavailable state

**Step 2: Implement config**

Add:

- `CodexConfig`
- `resolveCodexCommand(config)`
- `validateCodexAvailability(runner)`

Use dependency injection for command runner so tests do not call real Codex.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- codexConfig
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/codexConfig.ts ui/src/services/codexConfig.spec.ts
git commit -m "feat: add codex cli configuration detection"
```

## Task 4: Implement Writing Task Templates

**Files:**
- Create: `ui/src/services/writingTaskTemplates.ts`
- Test: `ui/src/services/writingTaskTemplates.spec.ts`

**Step 1: Write failing tests**

For each task type, assert the generated prompt includes:

- task objective
- selected context blocks
- output JSON contract
- no unrelated full-project dump

**Step 2: Implement templates**

Support:

- `project.create`
- `outline.generate`
- `chapter.plan`
- `chapter.draft`
- `selection.polish`
- `continuity.check`
- `idea.suggest`

**Step 3: Run tests**

```powershell
cd ui
npm run test -- writingTaskTemplates
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/writingTaskTemplates.ts ui/src/services/writingTaskTemplates.spec.ts
git commit -m "feat: add writing task templates"
```

## Task 5: Implement Context Assembly

**Files:**
- Create: `ui/src/services/novelContext.ts`
- Test: `ui/src/services/novelContext.spec.ts`

**Step 1: Write failing tests**

Cover:

- chapter draft includes chapter plan, story bible, adjacent summaries, style guide
- selection polish includes selected text and small surrounding context
- continuity check includes ledgers and adjacent chapter facts

**Step 2: Implement assembler**

Add:

- `assembleContext(taskType, project, target)`
- context size guard
- deterministic section ordering

**Step 3: Run tests**

```powershell
cd ui
npm run test -- novelContext
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/novelContext.ts ui/src/services/novelContext.spec.ts
git commit -m "feat: assemble novel writing context"
```

## Task 6: Implement Mockable Codex Task Runner

**Files:**
- Create: `ui/src/services/codexTaskRunner.ts`
- Test: `ui/src/services/codexTaskRunner.spec.ts`

**Step 1: Write failing tests**

Cover successful run, non-zero exit, timeout, cancellation, and task history entry.

**Step 2: Implement runner**

Use an injected process runner interface first. If the backend is separate, move this service to the backend during implementation.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- codexTaskRunner
```

Expected: pass with mock runner.

**Step 4: Commit**

```powershell
git add ui/src/services/codexTaskRunner.ts ui/src/services/codexTaskRunner.spec.ts
git commit -m "feat: add mockable codex task runner"
```

## Task 7: Implement Structured Result Parsing

**Files:**
- Create: `ui/src/services/codexResultParser.ts`
- Test: `ui/src/services/codexResultParser.spec.ts`

**Step 1: Write failing tests**

Cover:

- plain JSON
- JSON inside Markdown code fence
- invalid JSON
- missing optional fields

**Step 2: Implement parser**

Return:

- `summary`
- `content`
- `changes`
- `risks`
- `questions`
- `patches`
- `rawOutput`
- `parseError`

**Step 3: Run tests**

```powershell
cd ui
npm run test -- codexResultParser
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/services/codexResultParser.ts ui/src/services/codexResultParser.spec.ts
git commit -m "feat: parse codex writing results"
```

## Task 8: Build Novel Workspace UI Shell

**Files:**
- Create: `ui/src/components/novel/NovelWorkspace.vue`
- Create: `ui/src/components/novel/ChapterTree.vue`
- Create: `ui/src/components/novel/ContextPanel.vue`
- Modify: `ui/src/App.vue`
- Test: `ui/src/components/novel/NovelWorkspace.spec.ts`

**Step 1: Write component tests**

Assert the shell renders:

- chapter tree
- editor area
- AI operation panel
- context panel

**Step 2: Implement minimal UI**

Use existing styles and keep the layout work-focused, dense, and editor-like.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- NovelWorkspace
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel ui/src/App.vue
git commit -m "feat: add novel workspace shell"
```

## Task 9: Add Project Creation Flow

**Files:**
- Create: `ui/src/components/novel/ProjectCreatePanel.vue`
- Create: `ui/src/stores/novel.ts`
- Test: `ui/src/components/novel/ProjectCreatePanel.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Step 1: Write tests**

Assert rough idea input triggers `project.create`, stores result, and creates project skeleton.

**Step 2: Implement store and panel**

Use mock task runner for tests.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- novel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/ProjectCreatePanel.vue ui/src/stores/novel.ts ui/src/**/*.spec.ts
git commit -m "feat: add novel project creation flow"
```

## Task 10: Add Chapter Editor and Save Flow

**Files:**
- Create: `ui/src/components/novel/ChapterEditor.vue`
- Test: `ui/src/components/novel/ChapterEditor.spec.ts`

**Step 1: Write tests**

Cover loading chapter content, editing, unsaved state, and saving.

**Step 2: Implement editor**

Start with textarea or existing editor dependency. Do not introduce a heavy editor until selection handling requires it.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- ChapterEditor
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/ChapterEditor.vue ui/src/components/novel/ChapterEditor.spec.ts
git commit -m "feat: add chapter editor"
```

## Task 11: Add Selection Polish Flow

**Files:**
- Create: `ui/src/components/novel/SelectionToolbar.vue`
- Create: `ui/src/components/novel/RewriteComparison.vue`
- Test: `ui/src/components/novel/SelectionToolbar.spec.ts`
- Test: `ui/src/components/novel/RewriteComparison.spec.ts`

**Step 1: Write tests**

Cover selecting text, choosing polish mode, showing comparison, accepting, rejecting, and retrying.

**Step 2: Implement flow**

Modes:

- polish
- expand
- compress
- reduce exaggeration
- strengthen tension
- fix logic jump
- POV check

**Step 3: Run tests**

```powershell
cd ui
npm run test -- SelectionToolbar RewriteComparison
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/SelectionToolbar.vue ui/src/components/novel/RewriteComparison.vue ui/src/components/novel/*.spec.ts
git commit -m "feat: add selection rewrite flow"
```

## Task 12: Add Outline, Chapter Plan, and Draft Actions

**Files:**
- Create: `ui/src/components/novel/AIOperationPanel.vue`
- Test: `ui/src/components/novel/AIOperationPanel.spec.ts`

**Step 1: Write tests**

Cover buttons and task dispatch for:

- generate outline
- plan chapter
- draft chapter
- suggest ideas
- check continuity

**Step 2: Implement operation panel**

Show task progress, result summary, risks, questions, and apply buttons.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- AIOperationPanel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/AIOperationPanel.vue ui/src/components/novel/AIOperationPanel.spec.ts
git commit -m "feat: add novel ai operation panel"
```

## Task 13: Add Continuity and Progression Ledgers

**Files:**
- Create: `ui/src/components/novel/LedgerPanel.vue`
- Test: `ui/src/components/novel/LedgerPanel.spec.ts`

**Step 1: Write tests**

Cover rendering foreshadowing, continuity issues, and power progression entries.

**Step 2: Implement panel**

Support viewing and editing ledger Markdown.

**Step 3: Run tests**

```powershell
cd ui
npm run test -- LedgerPanel
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/components/novel/LedgerPanel.vue ui/src/components/novel/LedgerPanel.spec.ts
git commit -m "feat: add novel ledgers panel"
```

## Task 14: Add End-to-End Mock Flow

**Files:**
- Create: `ui/src/test/mockCodex.ts`
- Create: `ui/src/components/novel/NovelWorkspace.integration.spec.ts`

**Step 1: Write integration test**

Flow:

1. create project from rough idea
2. generate outline
3. plan chapter
4. draft chapter
5. polish selection
6. run continuity check

**Step 2: Implement mocks**

Mock Codex results with structured JSON.

**Step 3: Run integration test**

```powershell
cd ui
npm run test -- NovelWorkspace.integration
```

Expected: pass.

**Step 4: Commit**

```powershell
git add ui/src/test/mockCodex.ts ui/src/components/novel/NovelWorkspace.integration.spec.ts
git commit -m "test: cover novel workbench mock flow"
```

## Task 15: Manual Verification

**Files:**
- Create: `docs/plans/2026-06-03-novel-codex-manual-verification.md`

**Step 1: Run unit and integration tests**

```powershell
cd ui
npm run test
```

Expected: all tests pass.

**Step 2: Start dev server**

```powershell
cd ui
npm run dev
```

Expected: local Vite URL starts.

**Step 3: Verify UI manually**

Record:

- project creation result
- generated outline result
- chapter plan result
- draft result
- selection polish result
- continuity check result

**Step 4: Commit verification doc**

```powershell
git add docs/plans/2026-06-03-novel-codex-manual-verification.md
git commit -m "docs: verify novel workbench mvp flow"
```

## Acceptance Checklist

- [ ] Requirements, design, and tasks are saved under `.kiro/specs/novel-codex-writing-workbench/`.
- [ ] Implementation plan is saved under `docs/plans/`.
- [ ] Codex CLI calls are mockable in tests.
- [ ] Project files are safe from path traversal.
- [ ] Selection rewrite never auto-applies without author confirmation.
- [ ] Continuity checks include POV, foreshadowing, power progression, and adjacent chapter facts.
- [ ] MVP can run from rough idea to chapter draft to selected-text polish.
