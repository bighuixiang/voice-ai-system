# PlotPilot 深度对比与小说平台创作闭环路线

> 对比对象：[shenminglinyi/PlotPilot](https://github.com/shenminglinyi/PlotPilot)  
> 本轮源码快照：`0011e503ce577489eac6e4ee8f4eeedc7f3bc2b5`  
> 本项目：`voice-ai-system` 创作生产平台  
> 目标：继续挖掘 PlotPilot 可迁移机制，并把我们的小说平台从“工作台”推进为“完整创作闭环”。

## 一句话结论

PlotPilot 最值得学习的地方，不是某个知识图谱页面，也不是某段提示词，而是它把长篇创作当作一个可观测、可暂停、可恢复、可审计的叙事运行时来设计。

我们项目已经有结构、正文、审稿、AI 操作、写作回顾、账本和故事总控，但这些能力还像一组模块。下一步要把它们串成闭环：写前装配状态，写中推进正文，审稿发现风险，章后抽取状态补丁，作者确认入账，下一章自动读取这些沉淀。

## 本轮新增可迁移学习

### 1. AI 阶段字典要成为前后端共享语言

PlotPilot 在 `application/ai/ai_call_stage.py` 中把 AI 调用拆成统一阶段，例如：

- `pipeline.chapter.prose`：正文撰写。
- `pipeline.chapter.validate`：策略校验。
- `pipeline.chapter.voice`：文风审计。
- `autopilot.post_chapter.pipeline`：章后管线。
- `world.knowledge.extract`：知识抽取。
- `analyst.tension.score`：张力评分。

启发：我们现在的 `taskProgress` 只有“准备上下文 / 调用执行器 / 解析结果”。后续应该升级为创作阶段字典，让前端、任务历史、日志和文档说同一种语言。

### 2. AIInvocationGateway 是“调用控制面”，不是简单请求封装

PlotPilot 的 `AIInvocationGateway` 统一处理：

- spec 解析。
- 变量解析。
- prompt snapshot 冻结。
- pre-call review。
- attempt 生成。
- acceptance review。
- adoption。
- commit。

启发：我们的 `runTask` 可以先继续保持轻量，但应该逐步补 `AiInvocationSession` 概念。一次 AI 任务不仅要有结果，还要留下：当时使用了哪些上下文、哪个 prompt 版本、是否等待人工确认、最终采纳了哪些内容。

### 3. 章后管线分“关键路径”和“辅助队列”

PlotPilot 的 `ChapterAftermathPipeline` 把章节保存后的工作分层：

- 关键路径：章间桥段、叙事同步、向量索引、伏笔、三元组、因果边、人物状态、叙事债务、张力。
- 辅助路径：护栏快照、演进快照、道具同步、汇流点检查等串行后台任务。

启发：我们做 `chapter.afterSave` 时，不应该一口气同步阻塞所有事情。第一阶段只做作者马上需要的摘要、事实、伏笔/风险/升级候选；更重的知识图谱、向量索引、质量曲线可以后台化。

### 4. 运行时快照比“日志列表”更适合驱动 UI

PlotPilot 的 `NarrativeRuntimeSnapshot` 只保留一帧运行状态：自动驾驶状态、当前阶段、写作子步骤、审计进度，并用 fingerprint 给 SSE / 轮询去重。

启发：我们的工作台也需要一帧“当前章创作状态”，而不是只显示历史任务。今天新增的 `CreationLoopStep` 就是这个方向的前端 MVP：它把当前章投影为结构、正文、审稿、回顾、账本、下一章六个阶段。

### 5. 张力评分是独立服务，不应混在万能审稿里

PlotPilot 把张力评分拆成独立 `TensionScoringService`，并明确情节张力、情绪张力、节奏张力三维输出。

启发：我们的 `ReviewQualityPanel` 已有质量体检入口，后续可以把张力、信息释放、文风漂移、AI 腔风险拆成可持久化指标，而不是一次性的审稿建议。

### 6. 工作台 UI 是叙事状态的投影

PlotPilot 截图里的 DAG、知识图谱、章节状态、自动驾驶面板，本质不是装饰，而是底层状态的可视化投影。

启发：我们的 UI 应该少做“更多按钮”，多做“状态雷达”。作者打开一章时，应该立刻知道：

- 结构有没有。
- 正文是否保存。
- 审稿有没有做。
- 章后回顾是否生成。
- 回顾是否入账。
- 下一章能否安全读取这些沉淀。

## 与我们当前能力的映射

| 闭环阶段 | 我们已有 | 当前短板 | 本轮处理 |
| --- | --- | --- | --- |
| 写前结构 | 章节仪表盘、场景卡、从正文反写 | 状态不够显眼 | 纳入创作闭环步骤 |
| 正文推进 | 专注写作、AI 续写、编辑器 | 写完后下一步不明确 | 闭环面板提示保存/审稿 |
| 审稿修写 | 质量体检、选区润色 | 质量结果未持久化曲线 | 先纳入阶段，后续落库 |
| 章后回顾 | `writing.recap`、回顾候选 | 入口分散，用户不知何时触发 | 闭环面板提示生成/入账 |
| 状态入账 | `acceptWritingRecap` 合并账本 | 只覆盖账本，未形成摘要链 | 后续补章节摘要链 |
| 下一章输入 | `contextAssembler.ts` 固定装配 | 缺摘要链、事实库、检索层 | 后续阶段建设 |

## 本轮已落地的第一步

新增章节创作闭环前端模型与面板：

- `CreationLoopStep`：结构、正文、审稿、章后回顾、账本、下一章。
- `creationLoopSteps`：由当前章节状态自动计算。
- `runCreationLoopAction`：统一调度保存正文、打开模式、质量体检、生成回顾、确认入账。
- `CreationLoopPanel`：显示每一步状态、指标和下一步动作。

这一步不是最终章后管线，但它先把“完整闭环”显性化，让作者不会迷失在模块之间。

## 下一批建议任务

### P0：章节摘要链

新增 `memory/chapter-summaries/*.json`，每章至少沉淀：

- 章节摘要。
- 关键事件。
- 新事实。
- 人物状态变化。
- 伏笔开启/推进/回收。
- 连续性风险。

接入 `contextAssembler.ts`，让 `chapter.plan`、`chapter.draft`、`writing.briefing` 自动读取相邻章节摘要和相关远章摘要。

### P0：章后状态补丁

把 `WritingRecapCandidate` 升级为可审阅状态补丁：

- `summaryPatch`
- `factPatches`
- `ledgerPatches`
- `characterStatePatches`
- `riskPatches`

作者确认后再合并，避免 AI 自动污染设定。

### P1：AI 调用会话审计

新增轻量 `AiInvocationSession`：

- session id。
- task type / stage key。
- prompt snapshot 摘要。
- context snapshot 摘要。
- attempt。
- adoption decision。
- accepted patches。
- commit result。

这会让自动化能力可解释、可回溯。

### P1：质量指标落库

把质量体检从 UI 状态升级为项目资产：

- `quality/chapter-<id>.json`
- `quality/series-metrics.json`

指标先做：综合分、冲突、节奏、情绪、信息释放、文风、钩子。后续再加张力曲线和文风漂移。

### P1：故事线图是投影，不是手工画布

新增 `story-graph/storyline.json`，从故事总控、场景卡、账本生成节点和边。第一阶段可先表格化，后续再引入图可视化。

### P2：检索记忆层

先做关键词/实体倒排，再做 embedding：

- `knowledge/facts.jsonl`
- `knowledge/triples.jsonl`
- `memory/chapter-index.json`

生成时按角色、地点、道具、伏笔、关键词召回远章事实。

## 设计原则沉淀

1. LLM 负责生成、判断和抽取；项目状态负责记忆真相。
2. 章节保存不是终点，而是章后状态补丁的起点。
3. 自动化必须有作者确认门禁，尤其是设定、账本和人物状态。
4. 前端不要只展示任务历史，要展示当前叙事运行时的一帧。
5. 知识图谱、DAG、张力曲线都应该从状态资产投影出来，而不是手工维护两套真相。
6. 先闭合轻量循环，再引入向量、图谱、自动驾驶。

## 源码锚点

PlotPilot：

- `application/ai/ai_call_stage.py`：统一 AI 阶段字典。
- `application/ai_invocation/gateway.py`：AI 调用控制面。
- `application/ai_invocation/autopilot/orchestrator.py`：自动驾驶调用编排和人工暂停点。
- `application/engine/services/chapter_aftermath_pipeline.py`：章后统一管线。
- `application/engine/narrative_projection/runtime_snapshot.py`：运行时快照。
- `application/analyst/services/tension_scoring_service.py`：独立张力评分。

本项目：

- `ui/src/types/novel.ts`：新增闭环步骤类型。
- `ui/src/stores/novel.ts`：新增闭环状态计算和动作调度。
- `ui/src/components/novel/CreationLoopPanel.vue`：新增创作闭环面板。
- `ui/src/components/novel/NovelWorkspace.vue`：工作台接入闭环面板。
