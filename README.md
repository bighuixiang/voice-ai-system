# 小说编写辅助

## Windows 快速启动

已安装依赖时，在项目根目录打开两个 PowerShell 窗口并分别执行：

```powershell
# 窗口 1：API 和 runtime worker
npm.cmd --prefix api run dev
```

```powershell
# 窗口 2：前端开发服务器
npm.cmd --prefix ui run dev
```

启动后访问 `http://127.0.0.1:5173`。

用以下命令确认后端已就绪：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

预期结果包含 `status: healthy`。前端或后端需要停止时，在各自的启动窗口按 `Ctrl+C`。

> 已于 2026-08-10 在 Windows 本机验证：UI 监听 `5173`，API 监听 `8787`，并且 API 的 `/health` 返回 HTTP 200。

## 启动项目

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
npm --prefix api install
npm --prefix ui install
```

### 2. 启动后端

在项目根目录执行：

```bash
npm --prefix api run dev
```

该命令会同时启动 API 服务和 runtime worker；如果只想单独调试，可分别使用：

```bash
npm --prefix api run dev:server
npm --prefix api run dev:worker
```

默认启动地址：

```text
http://127.0.0.1:8787
```

### 3. 启动前端

新开一个终端，在项目根目录执行：

```bash
npm --prefix ui run dev
```

默认访问地址：

```text
http://127.0.0.1:5173
```

### 4. 构建项目

在项目根目录执行：

```bash
npm run build
```
