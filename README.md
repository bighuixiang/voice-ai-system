# 小说编写辅助

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
