# 小说 Codex 创作工作台技术盘点

日期：2026-06-03

## 现有基础

- `ui/` 已是 Vue 3 + TypeScript + Pinia + Element Plus + SCSS，可继续作为第一版工作台前端。
- `ui/src/App.vue` 原先是 Voice AI 测试首页，和小说写作目标不匹配，适合替换为新入口。
- `ui/src/services/api.ts`、`ui/src/stores/api.ts` 仍保留给旧测试能力；小说工作台新增独立 `novelApi` 和 `novel` store，不混用旧接口。
- 仓库没有可承接小说文件读写和 Codex CLI 调用的 Node API，因此新增 `api/` 本地服务。

## 改造结论

- 前端入口：`ui/src/App.vue` 直接渲染 `NovelWorkspace`，首屏就是编辑器优先的工作台。
- 后端入口：新增 Express + TypeScript 服务，默认端口 `8787`。
- 文件模型：小说项目固定保存在 `novels/<project-slug>/`，使用 Markdown/JSON 文件，便于版本控制和人工修订。
- Codex 策略：后端通过 `codex exec` 只读取项目上下文并返回结构化 JSON；实际文件写入由本地 API 在作者确认后执行。
- Vite 代理：`/api/novel` 转发到 `127.0.0.1:8787`，旧 `/api` 到 `8000` 暂保留。

## 新增模块

- `api/src/novelProject.ts`：项目骨架、默认文件、章节路径。
- `api/src/pathSafety.ts`：路径归一化和目录边界校验。
- `api/src/codexConfig.ts`：Codex CLI 命令解析和可用性检测。
- `api/src/taskTemplates.ts`：七类写作任务 prompt 模板。
- `api/src/contextAssembler.ts`：故事圣经、章纲、章节、账本上下文组装。
- `api/src/codexRunner.ts`：`codex exec` 子进程执行器。
- `api/src/resultParser.ts`：结构化 JSON 输出解析。
- `ui/src/components/novel/`：工作台、章节树、编辑器、选区润色、AI 操作、资料账本和历史面板。
- `ui/src/stores/novel.ts`：小说项目、章节、选区、任务、资料文件和未保存状态。

## 风险与处理

- 真实 Codex 输出不可控：统一要求 JSON 输出，解析失败保留原始文本并标记错误。
- 路径逃逸：所有项目文件读写都经过 `resolveInside`，拒绝 `../`、绝对路径和反斜杠逃逸。
- 自动覆盖风险：选区润色只生成候选，作者点击接受后才替换；Codex patches 也必须手动应用。
- 旧测试噪声：旧 Voice AI 测试保留在仓库中，默认 `ui` 测试命令收敛到当前小说工作台；旧套件可用 `npm run test:legacy` 单独运行。
