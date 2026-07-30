# SDD 交付治理产物

本目录是《小说智能创作合伙人 SDD》的机器可检投影，不是小说项目数据，也不代表需求已经实现。

## 生成与校验

```powershell
node scripts/generate-spec-governance.mjs
node scripts/generate-q003-operational-baseline.mjs
node scripts/generate-spec-governance.mjs --check
node scripts/generate-q003-operational-baseline.mjs --check
```

前两条命令分别从 SDD/源码生成规格治理投影，以及从真实项目和运行库生成 Q-003 只读运营元数据基线；后两条只比较当前文件与确定性生成结果，任何缺失、源码证据漂移、运营证据漂移或生成物漂移都会以非零状态退出。规格生成器同时审计 Canon 写权威入口、“一句话 → 理解/提问 → 契约/大纲 → 正文/整书运行”的当前产品链路、“来源 → 工艺机制 → 试验 → 作者反馈 → 发布/撤回”的学习闭环、“计划标记 → 正文证据 → 回收/开放 → 完结证书”的伏笔跨表面链路、可执行大纲，以及字数/章数/卷数是否形成受义务与作者授权治理的篇幅契约。发现 `project.create`、结构快捷生成、问题交互、`autoContinue`、样例治理/注入、拒绝反馈持久化、学习实体、账本写权威、闭环证据、chapter.plan 消费、大纲候选、篇幅意图/预测或偏差决策语义变化时必须重新人工裁决。所有真实项目快照只输出匿名序号、哈希、字段/枚举、计数和数值分布，不输出项目名、创意、大纲/样例/伏笔/场景文本、小说正文、提示词或模型输出。Q-003 基线只读取章节状态、任务状态/类型/耗时、采纳枚举、质量分数和运行表白名单列，并通过临时数据库快照避免在工作区创建 WAL 旁车。Q-003 至 Q-009 已在规格层确认但均不代表运行时已实现；Q-009 已按作者委托选择“义务主导的弹性篇幅”，默认 15% 暂停线与显式硬锁优先级已获规格批准。ReleaseProfile 可以据此进入实施，但不得把选择本身当成运行时或发布证据。

## 权威边界

- SDD 是产品语义与人工裁决来源。
- `requirement-catalog.json` 是结构化追踪投影，不能反向覆盖 SDD。
- `release-profiles/*.json` 只定义当前发布分母、依赖、预算和明确排除；不表示业务代码已完成。
- `defer-decisions.jsonl` 保留 V4-V8 愿景需求的重新激活条件，避免延期等于遗忘。
- `convergence/*.json` 报告结构检查与剩余阻塞，不进入小说创作上下文。
- `reviews/*.json` 保存逐个 ReleaseProfile 的人工红蓝语义裁决、首切片验收和下沉理由。
- `objective-coverage.json` 从作者十项原始目标反向映射需求、验收与首切片；`specificationCovered` 不等于 `implementationVerified`。
- `goal-readiness.json` 把十项承诺分成规格、决策、现状、实现、端到端和发布证据；当前 SDD 文档交付和全部作者决策已获批准，但九项产品目标仍无实现/发布证明，不能把 `10/10 specificationCovered` 显示成产品完成度。
- `audits/current-q003-operational-baseline.json` 保存隐私最小化的现状事实、红蓝反证和运营未知项；Q-003 已确认 C 只锁定规格选择，不等于因果最优已证明、策略已实现或运行时已激活。
- `audits/current-low-input-journey.json` 逐步回链当前 UI/API/任务/runtime，证明哪些只是文案承诺、通用骨架、被动 questions 或传输字段；它推荐权威 `CreativeJourney`，但不表示该状态机已经实现。
- `audits/current-craft-learning-loop.json` 区分静态工艺规则、样例检索、机制观测与真正的受治理学习；它推荐权利感知的工艺实验室，但不表示已导入来源、完成实验或学会了任何风格。
- `audits/current-foreshadowing-closure.json` 对账 SceneCard、Dashboard、账本、recap/摘要、runtime 与图谱，区分计划引用、正文事实、合法回收和覆盖未知；它暴露匿名跨表面错配，但不表示伏笔已经迁移或闭环。
- `audits/current-executable-outline.json` 对账 roughIdea、创建/大纲/章规划任务、Markdown、StoryControl、Dashboard、SceneCard 和 runtime，区分文件库存、任务成功与真正的因果执行就绪；它不表示现有大纲已被采纳或验证。
- `audits/current-length-planning.json` 对账项目/章节模型、Dashboard、专注写作目标、导入分卷、章节树、runtime 与匿名项目计数，区分实际文本量、临时生产力目标、章节库存、展示分组和作者篇幅意图；它为已选 Q-009 提供现状基线，但不表示运行时已获自动扩缩能力。
- `policy-candidates/Q-009-length-elasticity.json` 保存固定计数、完全涌现和义务主导弹性篇幅的红蓝候选；作者已选择 `obligation-led-elastic-length`，但选择仍不能代替目标模型、测试、运行时或发布证据。

`directAcceptanceCandidates` 由同切片标题相似度产生，只是人工审阅入口。其状态在人工核对前始终是 `human-review-required`，不得作为需求覆盖、测试通过或发布完成的证据。

当前 RP0/V0 已有一条分阶段实现证据：[audits/rp0-capability-baseline-implementation.json](audits/rp0-capability-baseline-implementation.json)。该证据只覆盖只读能力基线端点及其 TDD 验收，不代表 RP0 的 38 条 MUST 已全部实现，也不代表用户发布或 V1 创作能力已激活。

RP1/V1 的原话捕获切片另有独立证据：[audits/rp1-capture-implementation.json](audits/rp1-capture-implementation.json)。它只证明会话原话的持久化、幂等和刷新恢复，不证明理解、契约、大纲、正文或 UI 主旅程已经完成。

`reviewedFirstSliceAcceptanceRefs` 只证明该需求在当前 `firstSlice` 的最小义务已经完成人工规格映射；若同时存在 `extensionMode = invariant-revalidation`，后续切片仍必须重新提供证据，不能把首切片通过解释为整条跨阶段需求已经全局完成。
