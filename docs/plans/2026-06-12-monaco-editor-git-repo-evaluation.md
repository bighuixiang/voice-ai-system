# Monaco Editor 后续 Git repo 化评估

## 结论
本轮不启用真实 Git repo 化。当前优先级是让 Monaco 编辑、保存前快照 Diff、Tab inline suggestion 稳定工作；Git diff / commit / branch 等能力等快照 Diff 和 AI 建议体验稳定后再接入。

## 当前已满足的前置能力
- 正文和章纲已经由 Monaco Editor 承载，保留 textarea 降级。
- 保存正文/章纲前会写入 file-backed snapshot。
- 版本对比面板可查看历史快照与当前文件的整体 Diff。
- Tab ghost text 建议已经接入编辑器 dirty buffer，不自动保存。

## 暂不启用 Git 的原因
- 运行态文件较多，直接 repo 化容易把 `novels/**/quality`、`story-graph`、`tasks`、`versions`、`platform/*.json` 等运行产物混入作者版本历史。
- 自动 commit 策略尚未确定，过早提交会把“每次保存”变成噪音历史。
- AI patch、recap 接受、质量索引后台任务还会改多类文件，需要先明确哪些是作者资产，哪些是可重建缓存。

## 后续接入条件
- 建立作者资产白名单：章节正文、章纲、bible、ledger、style、outline。
- 建立运行态排除清单：quality、story-graph、runtime、tasks、versions、platform 运行配置。
- 明确 commit 粒度：手动快照、章节保存、AI 建议接受、recap 入账分别如何命名。
- 先让现有快照 Diff 支持稳定预览，再评估是否替换为 Git diff。

## 推荐下一步
保留当前 file-backed snapshots 作为轻量版本层；等 Monaco/Diff/Tab 建议在真实写作工作流里稳定后，再新增一个独立 `git-versioning` 开关，不默认启用。
