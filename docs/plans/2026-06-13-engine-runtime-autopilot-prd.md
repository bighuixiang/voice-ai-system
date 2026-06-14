# PlotPilot Engine Runtime 自动驾驶小说引擎需求说明

状态：Draft
日期：2026-06-13
参考项目：shenminglinyi/PlotPilot
适用范围：小说创作工作台、自动驾驶写作、衍生剧情生产

## 1. 背景

当前工作台已经具备章节编辑、故事总控、上下文组装、质量报告、知识索引、运行快照和后台任务等能力，但核心链路仍偏向“用户点一个功能，系统执行一个功能”。这会导致长篇小说生产依赖用户频繁切换页面、人工判断下一步、手动触发复盘/质检/索引，无法真正进入“用户只审稿和给方向，系统持续推进”的自动驾驶模式。

PlotPilot 的核心玩法不是单点 AI 写作，而是把小说生产抽象为一个长期运行的剧情引擎：运行时持有完整叙事状态，按规划、写作、审计、沉淀、推进的闭环持续工作。我们需要吸收这套玩法，建设自己的 Engine Runtime。

## 2. 产品目标

建设一个“守护进程式小说生产线”，让系统能够在用户设定方向后自动完成：

- 宏观规划：从题材、目标章节、卖点生成部 / 卷 / 幕 / 章规划。
- 章节生产：自动找到下一章，装配上下文，生成正文。
- 质量审计：检查连续性、人物状态、文风漂移、剧情密度、爽点/张力。
- 状态沉淀：生成章级摘要、事件、伏笔、人物变化、知识三元组、质量曲线。
- 自动推进：根据审计结果继续、重写、暂停待审，或进入下一阶段。
- 衍生剧情：基于主线 canon 创建分支剧情、番外、短剧、游戏任务线，并保持设定一致。

产品初衷必须保持清晰：系统负责全自动生产和全方位考虑，用户主要做审稿、方向修正和关键决策。

## 3. PlotPilot 可学习点

### 3.1 单一生产入口

PlotPilot 将生产入口收敛到 `EngineDaemon`，由启动脚本构造依赖并启动长期运行的 runner。我们的系统也需要一个明确的运行时入口，避免规划、写作、审计、索引散落在多个互不知情的接口里。

需求：新增 `AutopilotRuntime` 作为后端统一入口，所有自动驾驶生产任务必须通过它调度。

### 3.2 章节管线化

PlotPilot 的 `BaseStoryPipeline` 将单章生产拆成稳定步骤：定位下一章、治理准备、章节计划、上下文装配、LLM 生成、内容验证、保存、文风审计、章后管线、张力评分、收尾推进。

需求：本项目的章节写作必须从“生成正文按钮”升级为“可观测、可恢复、可审计的章节流水线”。

### 3.3 叙事状态机

PlotPilot 不依赖模型记忆，而是每次生成前从 Story Bible、章级摘要、事件流、故事线、伏笔、人物状态动态装配上下文。

需求：运行时必须维护 `NarrativeSnapshot`，它是每次章节生成的唯一状态依据。

### 3.4 章后消化系统

PlotPilot 在章节保存后继续抽取摘要、事件、三元组、伏笔、因果边、人物状态、叙事债务，并更新向量索引和质量曲线。

需求：保存正文不是终点。每次正文落盘后必须自动触发章后沉淀，否则下一章上下文不可用。

### 3.5 运行安全

PlotPilot 使用心跳、熔断、停止信号、检查点、单写者持久化队列等机制，保证长任务不会把项目写坏。

需求：自动驾驶必须支持暂停、恢复、失败诊断、检查点回滚和串行写入。

## 4. 用户故事

### US-1 自动推进长篇

作为作者，我只输入题材、主角、目标读者、核心爽点和大概走向，系统自动规划并持续生成章节。

验收标准：

- 用户可以启动“自动驾驶写作”。
- 系统能显示当前阶段、当前章节、当前步骤、最近错误和下一步动作。
- 每章完成后自动进入章后复盘和状态沉淀。
- 没有阻断问题时，系统可继续推进下一章。

### US-2 用户只在关键节点审稿

作为作者，我不希望每一步都手动确认，只希望系统在重大风险、低质量或关键转折点暂停让我审。

验收标准：

- 运行时根据质量阈值自动决定继续、重写、暂停待审。
- 暂停时必须给出明确原因、证据和建议操作。
- 用户可选择接受、要求重写、补充方向、恢复运行。

### US-3 可靠恢复

作为作者，我不希望长任务失败后丢失状态或重复写同一章。

验收标准：

- 每个稳定阶段创建检查点。
- 重启后能从最后稳定阶段继续。
- 同一章节不会因后台任务延迟被重复生成。
- 失败次数超过阈值后自动熔断并保留诊断。

### US-4 衍生剧情生产

作为作者，我希望从主线小说自动派生番外、短剧、游戏剧情和角色支线。

验收标准：

- 用户可选择主线 canon、衍生类型和约束。
- 系统能创建独立 `DerivativeBranch`。
- 衍生内容必须引用主线设定、人物状态和事件边界。
- 衍生分支不能污染主线状态，除非用户显式合并。

## 5. 核心架构需求

### 5.1 AutopilotRuntime

职责：

- 管理运行生命周期：start、pause、resume、stop、recover。
- 轮询或订阅待处理项目。
- 将项目交给 `StoryPipelineRunner`。
- 记录心跳、阶段、错误、耗时、token、成本。
- 向前端推送运行事件。

关键状态：

- `idle`：未运行。
- `planning`：宏观规划中。
- `writing`：章节生产中。
- `post_chapter`：章后沉淀中。
- `review_required`：需要用户审稿。
- `paused`：用户暂停。
- `failed`：失败或熔断。
- `completed`：目标完成。

### 5.2 StoryPipelineRunner

职责：

- 执行章节级生产管线。
- 为每一步创建可观测事件。
- 对失败步骤做有限重试。
- 把稳定结果交给持久化层。

推荐步骤：

1. `find_next_chapter`：定位下一章或下一段衍生剧情。
2. `prepare_governance`：读取写作预算、节奏目标、人物登场调度、风险约束。
3. `prepare_chapter_plan`：生成或修正本章执行剧本。
4. `assemble_context`：基于叙事快照和检索结果装配上下文。
5. `generate_draft`：调用 LLM 生成正文。
6. `validate_content`：检查连续性、设定、人物、禁忌、字数、结构。
7. `save_chapter`：保存正文草稿或正式稿。
8. `validate_voice`：检测文风漂移，必要时触发定向修写。
9. `run_aftermath`：生成摘要、事件、伏笔、三元组、人物变化、知识索引。
10. `score_quality`：更新张力、节奏、剧情密度、风险曲线。
11. `finalize`：创建检查点，推进状态机，决定继续 / 重写 / 暂停。

### 5.3 NarrativeSnapshot

每次生成前必须构造完整叙事快照，禁止直接依赖模型历史记忆。

字段建议：

- `project_profile`：题材、目标读者、篇幅、风格、禁区。
- `story_bible`：人物、地点、世界观、力量体系、POV 边界。
- `chapter_summary_chain`：已完成章节的压缩摘要。
- `event_stream`：关键事件、因果关系、时间线。
- `storyline_graph`：主线、支线、汇合点、分歧点。
- `foreshadowing_ledger`：伏笔的开启、悬置、推进、回收。
- `character_state`：人物关系、能力、伤口、目标、秘密。
- `quality_state`：张力曲线、文风基准、风险、叙事债务。
- `retrieval_hits`：语义召回的历史章节、事实、三元组。
- `derivative_constraints`：衍生分支与主线 canon 的约束。

### 5.4 Context Assembly Budget

本项目已有 `contextAssembler.ts` 的 T0/T1/T2/T3 分层思路，应升级为运行时标准。

规则：

- T0：不可压缩，包含项目承诺、硬设定、用户最新方向、当前任务。
- T1：高优先级，可轻度压缩，包含人物、世界观、章级记忆。
- T2：动态召回，包含相关远章摘要、伏笔、事实、三元组、风险。
- T3：可牺牲，包含长正文、参考材料、选区上下文。

验收标准：

- 每次生成都输出上下文预算日志。
- 日志必须包含原始长度、最终长度、截断块、召回理由。
- 用户可在调试视图中查看“本次 AI 为什么知道这些信息”。

### 5.5 Write Dispatch

所有运行时写操作必须串行化，避免自动驾驶、用户编辑、后台索引同时写同一批文件。

需求：

- 新增项目级写入队列。
- 每个写入命令必须有 `idempotencyKey`。
- 写入命令必须记录输入、输出、错误和耗时。
- 对章节正文、运行状态、检查点、知识索引采用原子写入。

### 5.6 Checkpoint

检查点用于恢复、回滚、审稿对比和分支派生。

触发时机：

- 自动驾驶启动前。
- 章节生成前。
- 正文保存后。
- 章后沉淀完成后。
- 用户接受审稿后。
- 创建衍生分支前。

字段建议：

- `checkpointId`
- `projectSlug`
- `branchId`
- `chapterId`
- `runtimeRunId`
- `stage`
- `snapshotRef`
- `changedFiles`
- `createdAt`
- `reason`

### 5.7 Circuit Breaker

熔断保护防止系统在 API 限流、提示词错误、上下文损坏时连续消耗成本。

规则：

- 同一项目连续失败 3 次进入 `review_required`。
- 同一 provider 连续失败 5 次进入全局冷却。
- 低质量重写最多 2 次，仍不达标则暂停待审。
- 熔断必须输出诊断：失败阶段、错误类型、最近输入、建议处理。

### 5.8 SSE / Runtime Events

前端需要实时看到自动驾驶状态，不应该靠刷新。

事件类型：

- `runtime.started`
- `runtime.heartbeat`
- `pipeline.stage.started`
- `pipeline.stage.completed`
- `pipeline.stage.failed`
- `llm.call.started`
- `llm.call.completed`
- `draft.streaming`
- `quality.signal`
- `checkpoint.created`
- `state.committed`
- `review.required`
- `runtime.paused`
- `runtime.resumed`
- `runtime.failed`
- `runtime.completed`

前端展示：

- 当前章节和阶段。
- 当前步骤进度。
- 实时正文流。
- token / 成本 / 耗时。
- 质量信号和暂停原因。
- 检查点列表与恢复入口。

## 6. 数据模型需求

### RuntimeRun

- `id`
- `projectSlug`
- `branchId`
- `mode`: `mainline | derivative`
- `status`
- `currentStage`
- `currentChapterId`
- `startedAt`
- `updatedAt`
- `finishedAt`
- `error`
- `costSummary`

### PipelineStage

- `id`
- `runtimeRunId`
- `name`
- `status`
- `startedAt`
- `finishedAt`
- `inputRef`
- `outputRef`
- `error`
- `retryCount`

### RuntimeEvent

- `id`
- `runtimeRunId`
- `projectSlug`
- `type`
- `payload`
- `createdAt`

### NarrativeSnapshot

- `id`
- `projectSlug`
- `branchId`
- `chapterId`
- `contextBudget`
- `stateRefs`
- `retrievalRefs`
- `createdAt`

### QualitySignal

- `id`
- `projectSlug`
- `chapterId`
- `kind`: `tension | style_drift | continuity | character | pacing | cliché | risk`
- `score`
- `severity`
- `evidence`
- `suggestedAction`

### DerivativeBranch

- `id`
- `projectSlug`
- `sourceBranchId`
- `sourceCheckpointId`
- `type`: `extra | short_drama | game_quest | character_arc | alternate`
- `canonPolicy`: `read_only | propose_merge | isolated`
- `constraints`
- `status`

## 7. API 需求

建议新增 `/api/novel/projects/:slug/runtime` 命名空间。

- `POST /start`：启动自动驾驶。
- `POST /pause`：暂停。
- `POST /resume`：恢复。
- `POST /stop`：停止。
- `GET /status`：获取当前运行状态。
- `GET /events`：SSE 事件流。
- `GET /runs`：运行历史。
- `GET /runs/:runId`：运行详情。
- `GET /checkpoints`：检查点列表。
- `POST /checkpoints/:checkpointId/restore`：恢复检查点。
- `POST /derivatives`：创建衍生分支。
- `POST /review/accept`：接受当前审稿门。
- `POST /review/rewrite`：要求系统按反馈重写。
- `POST /direction`：追加用户方向，进入下一次上下文装配。

## 8. 前端需求

### 8.1 自动驾驶控制台

在小说工作区中新增“自动驾驶”主视图，核心不是展示一堆功能卡，而是展示系统当前在做什么。

必须展示：

- 运行状态：运行中、暂停、待审、失败、完成。
- 当前目标：正在写第几章 / 哪个衍生分支。
- 当前步骤：规划、上下文、生成、审计、沉淀、推进。
- 下一步动作：继续、重写、等待审稿、恢复检查点。
- 最近质量信号。
- 检查点与恢复按钮。

### 8.2 审稿门

当运行时进入 `review_required`，前端必须给用户一个短路径：

- 查看正文。
- 查看问题证据。
- 给方向。
- 接受并继续。
- 要求重写。
- 停止本轮。

### 8.3 衍生剧情工作台

用户可以基于当前主线创建衍生剧情：

- 选择衍生类型。
- 选择源检查点。
- 选择 canon 策略。
- 填写简短方向。
- 启动衍生运行时。

## 9. 非功能需求

- 可靠性：运行时崩溃后可恢复，不能重复生成已完成章节。
- 可观测性：每个阶段必须有事件、日志和耗时。
- 成本控制：记录 token、模型、重试次数、成本估算。
- 性能：前端事件更新不阻塞编辑器；长列表和日志需虚拟化或分页。
- 数据安全：所有文件写入必须经过路径安全校验。
- 可测试性：每个 pipeline stage 可独立单测；运行时状态机需有恢复测试。

## 10. 分阶段落地

### P0：运行时骨架

- 新增 `AutopilotRuntime` 服务。
- 新增运行状态、运行事件、基础 API。
- 将现有章节生成、保存流水线、运行快照、后台任务串起来。
- 前端展示自动驾驶状态和审稿门。

验收：用户可以启动一轮自动驾驶，系统完成单章“生成 -> 保存 -> 复盘 -> 快照 -> 待审/继续”。

### P1：可靠生产线

- 引入检查点。
- 引入项目级写入队列。
- 引入 SSE。
- 引入熔断、恢复和重试策略。
- 章后沉淀自动写入摘要、知识索引、故事图、质量报告。

验收：连续生成多章时，系统不会重复写同一章；失败后可恢复到最近稳定点。

### P2：叙事状态机增强

- 完整 `NarrativeSnapshot`。
- 故事线 DAG、事件流、伏笔注册表结构化。
- 召回理由和上下文预算可视化。
- 人物登场频率、POV 防火墙、叙事债务治理。

验收：下一章生成能稳定使用远章摘要、伏笔和人物状态，减少“失忆”和设定漂移。

### P3：衍生剧情自动驾驶

- 新增 `DerivativeBranch`。
- 支持番外、短剧、游戏任务线、角色支线。
- 支持从检查点创建分支。
- 支持分支隔离和合并建议。

验收：系统能基于主线生成不污染主线的衍生内容，并明确引用 canon 约束。

## 11. 风险与约束

- 过早追求完整 PlotPilot 复刻会拖慢落地，P0 应先打通单章闭环。
- 自动驾驶不能绕过用户审稿门，尤其是设定大改、主角行为失真、质量低谷。
- 上下文装配必须可解释，否则用户很难信任系统为什么这么写。
- 写入队列和检查点优先级高于 UI 丰富度，因为它们决定长任务是否可靠。

## 12. 参考来源

- PlotPilot 仓库：https://github.com/shenminglinyi/PlotPilot
- 运行入口：`scripts/start_daemon.py`
- 守护入口：`engine/runtime/engine_daemon.py`
- 运行器：`engine/runtime/runner.py`
- 章节管线：`engine/pipeline/base.py`
- 守护循环：`engine/runtime/daemon_loop.py`
- 宿主能力：`engine/runtime/daemon_host.py`

## 13. PRD 自评

质量评分：92 / 100

扣分点：

- 目前是产品与工程需求，不是详细技术设计；具体表结构、迁移脚本和服务类拆分需要下一步设计。
- 对现有后端模块的复用路径已标出，但还需要结合代码实现进一步拆任务。

