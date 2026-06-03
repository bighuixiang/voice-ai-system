# 小说 Codex 创作工作台 MVP 验收记录

日期：2026-06-03

## 自动化验证

已执行：

```powershell
cd api
npm run test
npm run build
```

结果：

- `api` 测试：5 个测试文件、12 个测试通过。
- `api` 构建：TypeScript 编译通过。

已执行：

```powershell
cd ui
npm run test
npm run build
```

结果：

- `ui` 当前工作台测试：4 个测试文件、7 个测试通过。
- `ui` 构建：`vue-tsc -p tsconfig.app.json` 和 `vite build` 通过。
- 构建存在 Element Plus 大 chunk 警告，不影响 MVP 功能。

## 功能验收范围

已完成：

- 创建小说项目骨架，保存到 `novels/<project-slug>/`。
- 生成默认 `project.json`、故事圣经、文风、卷纲、章节、伏笔账本、连续性账本、升级节奏账本和任务历史文件。
- 后端所有文件读写都经过路径安全校验。
- Codex CLI 可用性检测和 `codex exec` 执行器已实现。
- 七类任务模板已注册：`project.create`、`outline.generate`、`chapter.plan`、`chapter.draft`、`selection.polish`、`continuity.check`、`idea.suggest`。
- Codex 结果支持纯 JSON、Markdown fenced JSON 和非法 JSON 解析失败保留。
- 前端首屏是小说工作台，包含章节树、正文编辑器、AI 操作、选区润色、资料账本和任务历史。
- 选区润色不会自动覆盖正文；接受后只替换原选区，拒绝后正文保持不变。
- 资料与账本面板支持编辑故事圣经、大纲、文风、伏笔、连续性和升级节奏 Markdown 文件。

## 实际页面验证

已启动：

- API 进程：`80012`
- UI 进程：`48676`

已验证：

- `GET http://127.0.0.1:8787/health` 返回 `healthy`，Codex CLI 可用，版本为 `codex-cli 0.133.0`。
- `GET http://127.0.0.1:5173` 返回 `200`，页面标题为“小说 Codex 创作工作台”。
- 通过浏览器创建测试项目“验收测试”，页面进入完整工作台。
- 磁盘生成项目目录：`novels/novel-1780469894967/`，包含 `project.json`、`bible/`、`outline/`、`chapters/`、`ledger/`、`style/`、`tasks/`。

## 手工启动步骤

```powershell
cd api
npm run dev
```

```powershell
cd ui
npm run dev
```

打开 `http://127.0.0.1:5173`，按以下流程验收：

1. 输入一个测试创意并创建项目。
2. 确认 `novels/<project-slug>/` 下生成项目文件。
3. 编辑故事圣经或升级节奏并保存。
4. 选择第一章，手动编辑正文并保存。
5. 运行生成大纲、规划章节、起草正文、补灵感或连续性检查。
6. 选中一段正文执行润色，拒绝一次确认正文不变，再接受一次确认只替换选区。
7. 检查右侧任务历史和 `tasks/history.jsonl`。

## 备注

- 本轮验证未依赖真实模型输出；Codex 相关自动化测试使用 mock runner。
- 若真实 Codex 输出不是合法 JSON，工作台会展示解析失败和原始输出，作者可以重试。
