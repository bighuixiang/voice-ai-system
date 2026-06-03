# 小说 Codex 创作工作台使用说明

## 启动

安装依赖：

```powershell
cd api
npm install
cd ..\ui
npm install
```

启动本地 API：

```powershell
cd api
npm run dev
```

启动前端：

```powershell
cd ui
npm run dev
```

默认地址：

- API：`http://127.0.0.1:8787`
- UI：`http://127.0.0.1:5173`

## Codex CLI 配置

默认使用系统命令 `codex`。可以通过环境变量覆盖：

```powershell
$env:CODEX_COMMAND="codex"
$env:CODEX_MODEL="gpt-5"
```

API 调用方式固定为：

```text
codex exec --cd <projectDir> --sandbox read-only --ask-for-approval never --output-last-message <tmpfile> -
```

Codex 只负责返回结构化结果，不直接写项目文件。

## 基本流程

1. 打开 UI 后，在“从一个粗略想法开始”输入作品名、题材和创意。
2. 创建后，项目会保存到 `novels/<project-slug>/`。
3. 在章节树选择章节，正文编辑器支持 Markdown 编辑和保存。
4. 在“资料与账本”维护角色、世界观、力量体系、地点、文风、卷纲、伏笔、连续性和升级节奏。
5. 在“AI 操作”生成大纲、规划章节、起草正文、补灵感或运行连续性检查。
6. 在正文中选中文字，通过“选区润色”选择润色模式；结果不会自动替换，点击接受后只替换原选区。
7. 对 Codex 返回的 patches，点击“应用补丁”后才会写入文件。

## 常见问题

- Codex 不可用：访问 `GET /api/novel/codex` 或 `GET /health` 查看命令、版本和错误。
- JSON 解析失败：工作台会显示解析失败并保留原始输出，可调整 prompt 后重试。
- 上下文过长：后端按任务类型截断章节和周边上下文，优先保留故事圣经、章纲、账本和选区附近文本。
- 文件路径错误：接口会拒绝 `../secret`、绝对路径和反斜杠逃逸路径。
- 旧 Voice AI 测试失败：默认 `npm run test` 已切到小说工作台验收范围；旧测试可用 `npm run test:legacy` 单独排查。
