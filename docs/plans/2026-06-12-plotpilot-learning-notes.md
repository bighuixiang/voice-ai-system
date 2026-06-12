# PlotPilot 学习沉淀：叙事运行时机制

> 参考仓库：`shenminglinyi/PlotPilot`
> 本轮目标：继续吸收可迁移的优秀机制，优先挑低风险、能直接提升写作质量和稳定性的内容落地。

## 本轮已落地

### 1. 叙事承诺锁

来源：

- `.codex-reference/PlotPilot/application/world/services/narrative_promise.py`
- `.codex-reference/PlotPilot/application/engine/services/context_budget_allocator.py`

落地方式：

- 在 `api/src/contextAssembler.ts` 增加 `叙事承诺锁` 上下文块。
- 从项目 `title`、`genre`、`roughIdea` 中提取：
  - 书名承诺
  - 类型信号
  - 核心冲突
  - 开篇钩子
  - 关键词锚点
- 对前 12 章额外注入节奏约束：只加压、揭一角、留代价，避免过早平反、解谜或消耗核心敌人。

价值：

- AI 写正文时不会只看当前章节，而会持续对齐作品开局承诺。
- 对玄幻、悬疑、穿越、封印等强钩子题材尤其有用。
- 不引入新的用户操作，也不改变现有保存和任务流程。

验证：

- 新增 `contextAssembler` 单测覆盖承诺锁注入位置和内容。
- 已通过：`npm --prefix api run test -- contextAssembler`。

### 2. 宏观节奏护栏

来源：

- `.codex-reference/PlotPilot/engine/runtime/quality_guardrails/macro_pacing_guardrail.py`

落地方式：

- 在 `ui/src/stores/novel.ts` 的章节体检逻辑中加入轻量规则检测。
- 对前 12 章识别：
  - 真相释放过载
  - 终局感表达过多
  - 核心阻力无代价退场
- 命中后轻扣“信息”指标，并把具体原因写入 `fixes`。

价值：

- 不需要新接口，也不改正文。
- 能在作者体检章节时提示“早期不要过快兑现主线筹码”。
- 和叙事承诺锁配套：一个约束 AI 写作输入，一个检查正文输出。

验证：

- 新增 Pinia store 单测覆盖早期章节过度揭秘风险。

### 3. 情绪账本

来源：

- `.codex-reference/PlotPilot/engine/core/value_objects/emotion_ledger.py`
- `.codex-reference/PlotPilot/engine/infrastructure/memory/emotion_ledger_extractor.py`

落地方式：

- `ChapterSummary` 增加 `emotionLedger`。
- `WritingRecapCandidate` 增加 `emotionLedgerPatch`。
- `acceptWritingRecapPatches()` 接受 recap 时事务化合并：
  - wounds：情绪伤口、恐惧、羞耻、执念
  - boons：信任、承认、希望、治愈
  - powerShifts：关系和权力位置变化
  - openLoops：未闭合情绪问题、债务、承诺
- `contextAssembler` 会把情绪账本压缩进相邻/相关章节摘要。
- `WritingRecapPanel` 展示情绪账本补丁，方便作者确认。

价值：

- 下一章 AI 不只知道“事件发生了什么”，也知道“人物被留下了什么”。
- 对人物动机、关系推进、情绪回收更可靠。

### 4. 题材 Profile

来源：

- `.codex-reference/PlotPilot/application/engine/theme/theme_agent.py`
- `.codex-reference/PlotPilot/application/engine/theme/theme_registry.py`

落地方式：

- 在 `contextAssembler` 中按 `project.genre` 和 `roughIdea` 注入轻量题材 profile。
- 已覆盖玄幻、悬疑、仙侠、武侠、言情、科幻。
- 先采用固定规则，不引入注册系统和复杂插件。

价值：

- AI 写作时能获得题材专属执行约束。
- 与叙事承诺锁互补：承诺锁管“这本书答应读者什么”，题材 profile 管“这种题材该怎么兑现”。

### 5. 上下文预算日志

来源：

- `.codex-reference/PlotPilot/application/engine/services/context_budget_models.py`
- `.codex-reference/PlotPilot/application/engine/services/context_budget_policy.py`
- `.codex-reference/PlotPilot/application/engine/services/context_budget_allocator.py`

落地方式：

- `contextAssembler` 末尾追加 `上下文预算日志`。
- 记录：
  - blockCount
  - totalOriginalChars
  - totalFinalChars
  - truncatedBlocks
  - priorityHint

价值：

- 当上下文被压缩时，AI 和后续审计能知道哪些块发生了截断。
- 为后续 T0/T1/T2/T3 分层预算打基础。

### 6. 张力指标

来源：

- `.codex-reference/PlotPilot/application/analyst/services/tension_scoring_service.py`

落地方式：

- `QualityMetricKey` 增加 `tension`。
- 前端章节体检基于冲突、情绪、钩子、节奏生成“张力”分。
- 后端全书张力曲线优先使用 `tension` 指标，旧报告继续回退到加权公式。

价值：

- 张力从隐含信号变成可持久化质量指标。
- 全书质量趋势可以直接追踪张力波动。

## 值得继续迁移的机制

### 7. 上下文预算分层

来源：

- `.codex-reference/PlotPilot/application/engine/services/context_budget_models.py`
- `.codex-reference/PlotPilot/application/engine/services/context_budget_policy.py`
- `.codex-reference/PlotPilot/application/engine/services/context_budget_allocator.py`

建议迁移：

- 将当前上下文块标记为：
  - T0 critical：承诺锁、事实锁、人物状态
  - T1 compressible：相邻章节摘要、情绪账本
  - T2 dynamic：检索召回、故事图谱
  - T3 sacrificial：长正文片段、低优先级背景
- 输出 compression log，让 UI 或审计知道哪些内容被截断。

优先级：P1/P2。适合在上下文越来越大之后做。

### 8. AI 调用控制面

来源：

- `.codex-reference/PlotPilot/application/ai_invocation/gateway.py`

建议迁移：

- 在现有 `AiInvocationSession` 上继续补：
  - prompt version
  - variable plan
  - pre-call review
  - adoption decision
  - commit result

优先级：P1。我们已有任务历史和调用审计，可以逐步增强。

## 下一批建议顺序

1. 上下文预算分层：把当前预算日志升级成真正的 T0/T1/T2/T3 分配策略。
2. AI 调用控制面增强：继续补 prompt version、variable plan、pre-call review。
3. 题材 profile 外置化：把固定规则迁移到配置文件，允许项目级覆盖。
4. 情绪账本 UI 聚合：在状态雷达里显示未闭合伤口、关系变化和情绪债务。

## 2026-06-12 追加落地

### 7. 上下文预算分层

- `contextAssembler` 已从单一裁剪升级为 T0/T1/T2/T3 分层预算。
- `上下文预算日志` 现在输出 `context-budget:v2`、`tiers`、`blockPlan`、结构化 `truncatedBlocks`。
- T0 保留项目承诺和题材约束；T1 保留角色、世界、故事总控和章节记忆；T2 保留检索、账本和章纲；T3 压缩长正文和选区材料。

### 8. AI 调用控制面增强

- `AiInvocationSession` 增加 `promptVersion`、`variablePlan`、`preCallReview`。
- 任务历史 UI 展示 prompt 版本、调用前预检、目标变量、上下文 tier 计数和压缩块。
- 老的 `invocations.jsonl` 仍兼容，新任务会写入更完整审计字段。
- 审计报告 `aiInvocationSummary` 增加 prompt version 分布、pre-call warning 分布、上下文 tier 总量、压缩上下文块 Top 10。
- 审计报告 UI 新增 `AI Control Plane` 预览区，不需要下载 JSON 也能看到调用控制面健康度。

### 9. 情绪账本状态雷达

- `CreationLoopStep` 增加可选 `signals`。
- 创作闭环会显示 `情绪待入账`、`账本补丁`、`情绪已沉淀` 等信号。
- 目标是把 recap 的情绪债务提前投影到主工作流，而不是只藏在回顾详情里。

### 10. 题材 Profile 外置化

- 支持项目级 `bible/genre-profile.json` 覆盖内置题材规则。
- 覆盖文件可定义 `title`、`directives`、`risks`。
- 没有覆盖文件时继续使用内置玄幻、悬疑、仙侠、武侠、言情、科幻 Profile。
## 2026-06-12 追加落地：创作状态雷达增强

- `CreationLoopPanel` 顶部新增聚合雷达，把阻塞数、进行中数、未保存正文、后台任务状态、保存流水线状态、情绪账本信号集中展示。
- `creationLoopSteps` 会把质量趋势、知识索引、故事图谱的后台 job 运行/失败/取消状态投影到对应步骤。
- 保存流水线的 `save/recap/runtime/quality/knowledge/story` 状态会转成“保存处理中 / 质量后台队列 / 索引失败 / 图谱已跳过”等作者可读信号。
- 目标是减少按钮式巡检，让作者打开工作台时先看到“现在该处理什么”，再进入具体面板。
## 2026-06-12 追加落地：任务健康审计

- 审计报告 `latestTasks` 现在透出 `timeoutMs` 和 `cancelRequestedAt`，用于排查真实 AI 任务的超时与取消行为。
- 审计预览新增 `Task Health` 区块，集中展示失败/取消数量、设置了超时预算的任务数量，以及最近异常任务的状态、耗时、超时阈值和取消请求。
- 目标是让真实 Codex/Claude 卡住、被取消或失败时，不需要翻 JSONL 也能在 UI 内定位任务健康问题。

## 2026-06-12 追加落地：叙事债务 / 读者状态压力

来源：
- `.codex-reference/PlotPilot/domain/evolution/models.py`
- `.codex-reference/PlotPilot/domain/evolution/reducer.py`
- `.codex-reference/PlotPilot/domain/evolution/contracts.py`
- `.codex-reference/PlotPilot/application/prop/services/prop_context_builder.py`

落地方式：
- 新增 `NarrativeDebtSignal`，把开放伏笔、风险/连续性账本、情绪 open loop、逾期交付汇总为全书质量信号。
- `buildSeriesQualityMetrics()` 输出 `narrativeDebtSignals`，用于审稿面板看到章节级债务压力。
- `buildCreationRuntimeSnapshot()` 输出 `signals.narrativeDebt`，用于创作闭环雷达看到当前工作台的叙事压力。
- `ReviewQualityPanel` 展示叙事债务，`creationLoopSteps` 在 ledger/next 步骤注入状态信号。
- `diagnoseCurrentChapter()` 将叙事债务作为张力指标的软约束，提醒作者优先交付、延期或关闭未完成承诺。

价值：
- 借鉴 PlotPilot 的 schema-first evolution state/reducer 思路，但不引入完整状态机，避免冲击当前 file-backed 架构。
- 作者能看到“哪些伏笔、风险、情绪回路该交付或延期”，减少长篇创作状态散落在备注和临时想法里的问题。

## 2026-06-12 追加落地：知识图谱可视化增强

来源：
- `.codex-reference/PlotPilot/frontend/src/components/knowledge/KnowledgeGraphView.vue`
- `.codex-reference/PlotPilot/frontend/src/components/charts/GraphChart.vue`
- `.codex-reference/PlotPilot/frontend/src/utils/visToEcharts.ts`
- `.codex-reference/PlotPilot/application/world/services/knowledge_graph_service.py`

借鉴点：
- PlotPilot 将知识图谱视为一等读模型：三元组不仅用于检索，也用于图形化观察关系密度、实体邻接和章节证据。
- 前端图谱强调节点分类、关系边、点击聚焦、暗色主题适配，而不是只展示 JSON 或列表。
- 大图使用成熟图谱渲染组件，小图保持轻量交互，避免作者工作台首屏被复杂渲染拖慢。

落地方式：
- `StoryGraphNodeType` 增加 `knowledge`，`StoryGraphEdgeType` 增加 `asserts`。
- `buildStoryGraphProjection()` 读取 `knowledge/triples.jsonl`，把 subject/object 投影为知识节点，把 predicate 投影为关系边，并按 `chapterIds` 连接章节证据。
- `StoryGraphPanel` 增加暗色 SVG 网络视图：阶段、角色、事件、章节、台账、知识六类节点按列排布，点击节点后高亮相邻关系。
- 保留原来的分组节点列表和详情栏，避免图谱成为只能看、不能定位的装饰层。

取舍：
- 本轮暂不引入 ECharts/Vue Flow，先用零依赖 SVG 做稳定可读的工作台图谱。
- 后续当知识节点超过百级时，再迁移到 ECharts force graph 或 Vue Flow，并加入缩放、搜索、类型过滤和小地图。
