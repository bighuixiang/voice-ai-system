# 小说 Codex 创作工作台设计文档

## 总体设计

小说 Codex 创作工作台采用“前端写作界面 + 本地后端任务服务 + Codex CLI 写作代理”的结构。前端负责项目管理、章节编辑、选区操作、结果对比和任务状态展示；后端负责组织上下文、调用 Codex CLI、解析输出、保存文件和记录任务历史。

第一版优先做成本地 Web 工作台，后续可以封装为 Electron/Tauri 桌面应用，或扩展为 VS Code 插件。这样既能快速复用现有 Vue 测试 UI 基础，也能为大纲墙、伏笔账本、升级节奏和任务队列保留足够界面空间。

## 架构

```text
┌──────────────────────────────────────────────┐
│                  Web UI                       │
│  章节树 | 正文编辑器 | AI 操作面板 | 上下文面板 │
└───────────────────────┬──────────────────────┘
                        │ HTTP / SSE / WebSocket
┌───────────────────────▼──────────────────────┐
│              Writing Task API                 │
│  项目文件管理 | 上下文组装 | Codex 调用 | 结果解析 │
└───────────────────────┬──────────────────────┘
                        │ child_process
┌───────────────────────▼──────────────────────┐
│                 Codex CLI                     │
│  outline.generate / chapter.draft / polish ...│
└───────────────────────┬──────────────────────┘
                        │ read/write
┌───────────────────────▼──────────────────────┐
│              Novel Project Files              │
│  bible/ | outline/ | chapters/ | ledger/       │
└──────────────────────────────────────────────┘
```

## 项目文件模型

每个小说项目使用文件夹保存，便于版本管理和人工修改。

```text
novels/<project-slug>/
  project.json
  style/style-guide.md
  bible/characters.md
  bible/world.md
  bible/power-system.md
  bible/locations.md
  outline/volume-01.md
  outline/chapter-001.md
  chapters/chapter-001.md
  ledger/foreshadowing.md
  ledger/continuity.md
  ledger/power-progression.md
  tasks/history.jsonl
```

`project.json` 记录作品名称、题材、默认语言、Codex 模型配置、章节目录和最近打开状态。正文和设定使用 Markdown，方便作者直接编辑，也方便 Codex CLI 读取。

## Codex 任务模板

后端将作者操作映射为固定任务类型，避免每次临时拼 prompt。

| 任务类型 | 用途 | 输入 | 输出 |
| --- | --- | --- | --- |
| `project.create` | 从粗略想法创建项目 | 作者想法、偏好 | 项目信息、故事圣经、大纲草案 |
| `outline.generate` | 生成或重写大纲 | 故事圣经、作者目标 | 卷纲、章纲、情节链 |
| `chapter.plan` | 规划单章 | 目标章节、前后文、伏笔 | 场景卡、本章目标、结尾钩子 |
| `chapter.draft` | 起草正文 | 章纲、风格、相邻章节 | 正文、风险、修改建议 |
| `selection.polish` | 选区润色 | 选区、少量前后文、操作模式 | 改写文本、变更说明 |
| `continuity.check` | 连续性检查 | 当前章节、设定、账本 | 问题列表、严重程度、修复建议 |
| `idea.suggest` | 灵感补充 | 当前卡点、故事状态 | 候选事件、反转、伏笔和场景 |

Codex 输出统一要求包含：

```json
{
  "summary": "本次结果摘要",
  "content": "正文或主要结果",
  "changes": ["变更点"],
  "risks": ["潜在风险"],
  "questions": ["需要作者确认的问题"],
  "patches": [
    {
      "target": "chapters/chapter-001.md",
      "mode": "replace-selection",
      "content": "可应用内容"
    }
  ]
}
```

## 上下文组装策略

系统每次调用 Codex CLI 前，按任务类型选择上下文，避免把整个项目无差别塞入 prompt。

- 项目创建：只使用作者输入和默认小说模板。
- 大纲生成：使用故事核心、世界观、角色、力量体系和作者反馈。
- 单章规划：使用当前卷纲、前后 2-3 章摘要、伏笔账本、升级进度。
- 正文起草：使用本章章纲、当前 POV 角色、相邻章节摘要、文风规则。
- 选区润色：使用选区、前后各少量正文、当前章节目标、POV 限制。
- 连续性检查：使用当前章节、故事圣经、伏笔账本、升级进度和相邻章节。

## 前端界面

第一版界面分为四个主要区域：

1. **章节树**：显示卷、章、草稿状态、检查状态。
2. **正文编辑器**：支持 Markdown、选区、对比替换和撤销。
3. **AI 操作面板**：展示大纲、规划、润色、查错、灵感等操作。
4. **上下文面板**：显示当前章纲、角色状态、伏笔、升级阶段。

选区操作是高频功能，应支持右键菜单或浮动工具条。结果需要以 diff 方式展示，作者确认后才替换正文。

## 后端接口草案

```http
POST /api/novel/projects
POST /api/novel/projects/:projectId/tasks
GET  /api/novel/projects/:projectId/tasks/:taskId
GET  /api/novel/projects/:projectId/files
GET  /api/novel/projects/:projectId/files/*path
PUT  /api/novel/projects/:projectId/files/*path
POST /api/novel/projects/:projectId/selection/polish
POST /api/novel/projects/:projectId/continuity/check
```

长任务可以先用轮询，后续改为 SSE 或 WebSocket。

## 错误处理

- Codex CLI 不存在：提示安装或配置 Codex CLI 路径。
- Codex CLI 调用失败：记录命令、退出码、stderr 摘要和上下文文件。
- 输出 JSON 解析失败：保留原始输出，允许用户查看并重试。
- 文件写入冲突：提示用户当前文件已变化，要求重新加载或手动合并。
- 上下文过长：自动压缩章节摘要，并提示本次使用了压缩上下文。

## 测试策略

第一版测试重点放在本地确定性逻辑，不直接依赖真实 Codex 结果。

- 单元测试：任务模板生成、上下文选择、文件路径安全、输出解析。
- 集成测试：使用 mock Codex CLI 验证完整任务流程。
- 前端测试：选区润色、结果对比、接受/拒绝、任务状态。
- 手工验证：创建项目、生成大纲、规划章节、起草正文、选区润色、连续性检查。
