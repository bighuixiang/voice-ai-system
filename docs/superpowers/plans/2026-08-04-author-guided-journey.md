# 作者创作引导链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让作者从录入想法到确认故事蓝图时，始终获得阶段进度、唯一主操作和中文下一步指引。

**Architecture:** 后端以原始会话、问题事件、决策记录、故事设定候选和蓝图候选为事实来源，生成权威的创作引导投影。前端仅保存短暂操作状态，并依据投影展示五阶段进度、当前动作和恢复提示；蓝图以独立候选版本保存，编辑和重新生成不会覆盖已有版本。

**Tech Stack:** Node.js + TypeScript + Express、Vue 3 + Pinia、Vitest、文件型 JSON/JSONL 存储。

## 全局约束

- 所有作者可见文案必须使用中文；仅保留必要的技术标识、模型名、接口字段、文件扩展名和错误码。
- 原始输入、理解快照、问题事件和决策记录不可原地修改或破坏其校验信息。
- 同一时刻只能有一个高亮主操作；次要操作必须说明对已确认内容的影响。
- 回答成功后自动生成并切换到下一题；十题完成后自动生成故事蓝图。
- 蓝图编辑必须生成新候选版本；只有显式确认后才能进入大纲。
- 不暂存或提交本功能以外的现有工作区改动。

---

### Task 1: 后端权威问题序列与自动推进

**Files:**
- Create: `api/src/understandingQuestionSequence.ts`
- Create: `api/src/understandingJourneyService.ts`
- Modify: `api/src/app.ts:521-625, 2448-2504, 6929-6978`
- Modify: `api/src/creativeJourney.ts:5-95`
- Test: `api/src/app.spec.ts`
- Test: `api/src/creativeJourney.spec.ts`

**Interfaces:**
- Consumes: `answerDialogueQuestion(root, input)`, `createDialogueQuestion(root, input)`, `readDecisionRecords(root)`, `compileContractCandidate(root, decisionId)`。
- Produces: `UNDERSTANDING_QUESTION_SEQUENCE`、`advanceUnderstandingAfterConfirmedAnswer(input)` 和扩展后的 `CreativeJourneyProjection`。

- [ ] **Step 1: 写出失败的后端测试**

在 `app.spec.ts` 建立作者会话、冻结上下文并创建第一题；提交第一题答案后断言响应包含第二题，重新读取问题列表后仅第二题为 `active`，重新读取引导投影后显示已完成 `1/10` 和“第 2/10 个关键问题”。

```ts
expect(answer.status).toBe(201);
expect(answer.body.nextQuestion.questionId).toBe("question-core-conflict");
expect((await questions.json()).questions.filter((item) => item.status === "active")).toHaveLength(1);
expect(journey.body.journey.progress).toMatchObject({ completed: 1, total: 10, current: 2 });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec vitest -- run src/app.spec.ts --pool=forks --maxWorkers=1 --minWorkers=1`

Expected: 新断言失败，因为普通答案接口尚未创建下一问题和进度字段。

- [ ] **Step 3: 抽取问题序列并实现推进服务**

将 `app.ts` 中的十个中文问题常量移至 `understandingQuestionSequence.ts`，导出 `UNDERSTANDING_QUESTION_SEQUENCE` 和 `nextUnansweredQuestion(decisions)`。创建 `advanceUnderstandingAfterConfirmedAnswer`：仅当回答状态为 `recorded` 时读取决策，创建下一题；没有下一题时编译最后一条决策对应的故事设定候选，并返回 `completed: true`。普通答案接口和运行时主操作接口都调用该服务，消除两条接口在自动推进上的差异。

```ts
export async function advanceUnderstandingAfterConfirmedAnswer(input: AdvanceInput) {
  if (input.answer.decision?.status !== "recorded") return { completed: false };
  const decisions = await readDecisionRecords(input.root);
  const next = nextUnansweredQuestion(decisions);
  if (next) return { completed: false, nextQuestion: await createQuestion(input.root, input.projectSlug, next, input.snapshotFingerprint) };
  return { completed: true, contract: await compileContractCandidate(input.root, input.answer.decision.decisionId) };
}
```

- [ ] **Step 4: 扩展创作引导投影**

为 `CreativeJourneyProjection` 增加 `progress: { completed: number; total: number; current: number | null }`、`nextInstruction` 和阶段枚举 `capture | understanding | blueprint-review | ready-for-outline`。根据会话、活跃问题、已记录决定和后续任务返回单一 `primaryAction`；不再由 UI 推测第几题或下一步。

- [ ] **Step 5: 运行后端测试**

Run: `npm exec vitest -- run src/app.spec.ts src/creativeJourney.spec.ts --pool=forks --maxWorkers=1 --minWorkers=1`

Expected: 原有创作链路测试和新增自动推进测试全部通过。

### Task 2: 故事蓝图候选、版本和确认接口

**Files:**
- Create: `api/src/storyBlueprint.ts`
- Create: `api/src/storyBlueprint.spec.ts`
- Modify: `api/src/app.ts:79-125, 1983-1997, 2504-2541`
- Modify: `ui/src/types/novel.ts:1315-1388`

**Interfaces:**
- Consumes: `StoryContractCandidate`、`DecisionRecord[]` 和项目标题。
- Produces: `StoryBlueprintCandidate`、`StoryBlueprintConfirmation`，以及读取、生成、编辑、确认接口。

- [ ] **Step 1: 写出失败的蓝图存储测试**

在 `storyBlueprint.spec.ts` 以完整故事设定候选生成蓝图，断言蓝图包含主角愿望、冲突、代价、世界规则、读者承诺和结局方向。编辑蓝图后断言得到不同 `blueprintId`、`revisedFrom` 指向旧版本且旧版本内容不变；确认后断言读取到独立确认记录。

```ts
const revised = await reviseStoryBlueprint(root, draft.blueprintId, { expectedFingerprint: draft.fingerprint, content: { ...draft.content, premise: "修改后的故事前提" } });
expect(revised.revisedFrom).toBe(draft.blueprintId);
expect((await readStoryBlueprint(root, draft.blueprintId))?.content.premise).not.toBe(revised.content.premise);
expect((await confirmStoryBlueprint(root, revised.blueprintId)).blueprintId).toBe(revised.blueprintId);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec vitest -- run src/storyBlueprint.spec.ts`

Expected: FAIL，因为蓝图模块尚不存在。

- [ ] **Step 3: 实现候选资产与不可覆盖版本**

在 `sessions/story-blueprints/<id>.json` 保存不可变 `StoryBlueprintCandidate`；字段包括 `blueprintId`、`projectSlug`、`sourceContractCandidateId`、`sourceFingerprint`、`decisionIds`、`content`、`revisedFrom`、`createdAt`、`fingerprint`。在 `sessions/story-blueprint-confirmations/<blueprintId>.json` 保存确认记录。`generateStoryBlueprint` 从设定候选的十项字段生成中文一页蓝图；`reviseStoryBlueprint` 必须校验源指纹并写入新候选；`confirmStoryBlueprint` 只确认当前版本。

- [ ] **Step 4: 暴露蓝图接口并接入最终问题完成事件**

新增以下接口，所有失败响应返回中文可恢复信息和稳定错误码：

```text
GET  /api/novel/projects/:projectId/session/story-blueprints/latest
POST /api/novel/projects/:projectId/session/story-blueprints/generate
POST /api/novel/projects/:projectId/session/story-blueprints/:blueprintId/revise
POST /api/novel/projects/:projectId/session/story-blueprints/:blueprintId/confirm
```

第十题确认后自动基于最新故事设定候选调用 `generateStoryBlueprint`。引导投影检测到未确认蓝图时进入 `blueprint-review`，检测到确认记录时进入 `ready-for-outline`。

- [ ] **Step 5: 运行蓝图与接口测试**

Run: `npm exec vitest -- run src/storyBlueprint.spec.ts src/app.spec.ts --pool=forks --maxWorkers=1 --minWorkers=1`

Expected: 蓝图生成、编辑版本、确认、最终问题自动生成蓝图和原有接口测试通过。

### Task 3: 前端状态、接口客户端和仓库动作

**Files:**
- Modify: `ui/src/types/novel.ts:1160-1388`
- Modify: `ui/src/services/novelApi.ts:489-590`
- Modify: `ui/src/stores/novel.ts:323-405, 3394-3444, 4794-5046`
- Test: `ui/src/services/novelApi.spec.ts`
- Test: `ui/src/stores/novel.spec.ts`

**Interfaces:**
- Consumes: 扩展后的 `CreativeJourneyProjection`，蓝图四个接口，以及答案接口返回的 `nextQuestion`/`blueprint`。
- Produces: `activeStoryBlueprint`、`isAdvancingAuthorJourney`、`authorJourneyError`、`reviseStoryBlueprint`、`confirmStoryBlueprint`。

- [ ] **Step 1: 写出失败的前端仓库测试**

模拟答案接口返回 `nextQuestion`，断言仓库在请求期间 `isAdvancingAuthorJourney` 为真，成功后加载问题和引导投影并使活跃题变为第二题。模拟最终答案返回蓝图，断言 `activeStoryBlueprint` 已更新且引导阶段为 `blueprint-review`。模拟失败时断言错误为中文恢复说明，且原回答草稿不由仓库清空。

```ts
await store.answerDialogueQuestion("夺回王位");
expect(store.activeDialogueQuestion?.questionId).toBe("question-core-conflict");
expect(store.creativeJourney?.progress).toEqual({ completed: 1, total: 10, current: 2 });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec vitest -- run src/stores/novel.spec.ts src/services/novelApi.spec.ts`

Expected: FAIL，因为客户端和仓库不存在蓝图状态和自动刷新行为。

- [ ] **Step 3: 扩展类型与 API 客户端**

在 `types/novel.ts` 添加与后端一致的 `AuthorJourneyProgress`、`StoryBlueprintContent`、`StoryBlueprintCandidate`、`StoryBlueprintConfirmation`。在 `novelApi.ts` 添加 `readLatestStoryBlueprint`、`generateStoryBlueprint`、`reviseStoryBlueprint`、`confirmStoryBlueprint`，并让 `answerDialogueQuestion` 返回可选的 `nextQuestion` 和 `blueprint`。

- [ ] **Step 4: 实现仓库单一推进动作**

新增短暂状态 `isAdvancingAuthorJourney` 和 `authorJourneyError`。`captureAuthorMessage` 成功后依次刷新会话、预览和引导投影；`answerDialogueQuestion` 在成功后刷新问题、引导投影和蓝图。对“上下文已更新”“保存失败”“蓝图生成失败”映射为中文、具体且可恢复的提示，不暴露对象字符串或技术标识作为主文案。

- [ ] **Step 5: 运行前端状态测试**

Run: `npm exec vitest -- run src/stores/novel.spec.ts src/services/novelApi.spec.ts`

Expected: 新增状态过渡、蓝图加载和失败恢复测试与原有测试通过。

### Task 4: 作者进度界面、蓝图确认界面与端到端回归

**Files:**
- Create: `ui/src/components/novel/AuthorJourneyProgress.vue`
- Create: `ui/src/components/novel/AuthorJourneyProgress.spec.ts`
- Create: `ui/src/components/novel/StoryBlueprintPanel.vue`
- Create: `ui/src/components/novel/StoryBlueprintPanel.spec.ts`
- Modify: `ui/src/components/novel/CreativeSessionPanel.vue`
- Modify: `ui/src/components/novel/CreativeSessionPanel.spec.ts`
- Modify: `ui/src/components/novel/NovelWorkspace.vue:105-130`

**Interfaces:**
- Consumes: `CreativeJourneyProjection`、活动问题、蓝图候选和仓库的加载/推进/错误状态。
- Produces: 统一阶段条、唯一主操作、蓝图编辑/重生/确认事件。

- [ ] **Step 1: 写出失败的组件测试**

`AuthorJourneyProgress.spec.ts` 挂载 `question` 阶段，断言五阶段均可见、第二阶段为当前状态、文案含“已完成 3/10 项”和“下一步：回答当前问题”。挂载 `blueprint-review` 阶段，断言主提示为“请确认或修改故事蓝图”。

`StoryBlueprintPanel.spec.ts` 输入修改文本后点击“保存修改”断言只发出 `revise`；点击“确认蓝图并开始大纲”断言发出 `confirm`；编辑态显示“重新生成会基于当前设定创建新版本”。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm exec vitest -- run src/components/novel/AuthorJourneyProgress.spec.ts src/components/novel/StoryBlueprintPanel.spec.ts src/components/novel/CreativeSessionPanel.spec.ts`

Expected: FAIL，因为引导和蓝图组件尚不存在，旧面板仍显示竞争操作。

- [ ] **Step 3: 实现阶段条与单一主操作**

`AuthorJourneyProgress.vue` 固定展示“记录想法、整理素材、补全设定、故事蓝图、制定大纲”。当前阶段使用高亮，已完成阶段使用“已完成”，未开始阶段使用“待开始”。`CreativeSessionPanel.vue` 将技术状态放入可展开的“查看处理详情”；删除并合并“冻结完整原始输入”“生成唯一问题”等竞争入口，仅根据投影显示一个高亮操作和一条“下一步”说明。保存、整理和回答期间禁用主操作并展示中文进行状态。

- [ ] **Step 4: 实现蓝图确认面板并接线**

`StoryBlueprintPanel.vue` 以可编辑字段展示故事前提、开场画面、主角目标、核心冲突、失败代价、世界规则、读者承诺和结局方向。未确认蓝图提供“保存修改”“重新生成”“确认蓝图并开始大纲”；已确认蓝图提供“开始制定大纲”。在 `NovelWorkspace.vue` 将仓库状态、蓝图和事件接入创作区域；补充素材为次要入口，并提示会重新整理蓝图但保留历史版本。

- [ ] **Step 5: 运行组件、构建和完整回归**

Run:

```powershell
Set-Location ui
npm exec vitest -- run src/components/novel/AuthorJourneyProgress.spec.ts src/components/novel/StoryBlueprintPanel.spec.ts src/components/novel/CreativeSessionPanel.spec.ts src/stores/novel.spec.ts src/services/novelApi.spec.ts
npm run build
Set-Location ..\api
npm exec vitest -- run src/app.spec.ts src/storyBlueprint.spec.ts --pool=forks --maxWorkers=1 --minWorkers=1
npm run build
```

Expected: 所有测试和两个构建成功；作者从首条输入到第十题、蓝图生成、编辑和确认的每个阶段都有中文状态和唯一下一步。
