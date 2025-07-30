# 快速开始指南

本指南将帮助您在 5 分钟内快速部署和运行 Voice AI Decision System。

## 🚀 一键部署

### 前提条件

确保您的系统已安装：
- Docker (20.10+)
- Docker Compose (2.0+)
- Git

### 快速部署步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd voice-ai-system
```

2. **一键启动**
```bash
# 复制环境配置
cp .env.example .env

# 启动所有服务
docker-compose up -d
```

3. **验证部署**
```bash
# 等待服务启动（约 2-3 分钟）
sleep 180

# 检查服务状态
curl http://localhost:3000/health
curl http://localhost:8000/health
```

4. **测试功能**
```bash
# 测试文本处理
curl -X POST http://localhost:3000/api/process/text \
  -H "Content-Type: application/json" \
  -d '{"text": "你好，请帮我分析一下今天的天气"}'

# 测试语音上传（需要准备音频文件）
curl -X POST http://localhost:3000/api/process/voice \
  -F "file=@test-audio.wav"
```

## 🎯 核心功能演示

### 1. 文本处理

```bash
# 基础文本理解
curl -X POST http://localhost:3000/api/process/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "请帮我制定下个月的工作计划",
    "context": "work_planning"
  }'
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "understanding": {
      "intent": "planning",
      "entities": [
        {"type": "time_period", "value": "下个月"},
        {"type": "task_type", "value": "工作计划"}
      ]
    },
    "actions": [
      {
        "type": "create_plan",
        "parameters": {"plan_type": "work", "time_frame": "next_month"}
      }
    ]
  }
}
```

### 2. 语音处理

```bash
# 创建测试音频文件（需要 ffmpeg）
echo "你好，这是一个测试音频" | \
  espeak -v zh -s 150 -w test-audio.wav

# 上传语音文件
curl -X POST http://localhost:3000/api/process/voice \
  -F "file=@test-audio.wav" \
  -F "language=zh"
```

### 3. 知识库管理

```bash
# 上传文档
echo "这是一个测试文档，包含重要的技术信息。" > test-doc.txt
curl -X POST http://localhost:3000/api/knowledge/upload \
  -F "file=@test-doc.txt" \
  -F "title=测试文档" \
  -F "category=技术文档"

# 搜索知识库
curl "http://localhost:3000/api/knowledge/search?q=技术信息&limit=5"
```

## 🔧 常用配置

### 开发环境配置

```bash
# 创建开发环境配置
cat > .env.local << EOF
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
MAX_CONCURRENT_TASKS=1
AI_MEMORY_LIMIT=2G
EOF

# 使用开发配置启动
docker-compose --env-file .env.local up -d
```

### 生产环境配置

```bash
# 创建生产环境配置
cat > .env.prod << EOF
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
MAX_CONCURRENT_TASKS=4
AI_MEMORY_LIMIT=4G
CORS_ORIGIN=https://yourdomain.com
EOF

# 使用生产配置启动
docker-compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 📊 监控和管理

### 查看服务状态

```bash
# 查看所有容器状态
docker-compose ps

# 查看资源使用情况
docker stats

# 查看服务日志
docker-compose logs -f api-service
docker-compose logs -f ai-service
```

### 性能监控

```bash
# 运行健康检查
./scripts/health-check.sh

# 查看详细系统状态
curl http://localhost:3000/api/system/status | jq
```

## 🛠️ 自定义配置

### 修改 AI 模型

```bash
# 使用更小的模型（适合低配置环境）
export WHISPER_MODEL=tiny
export LLM_MODEL=Qwen/Qwen2-0.5B-Instruct

# 使用更大的模型（适合高配置环境）
export WHISPER_MODEL=small
export LLM_MODEL=Qwen/Qwen2-7B-Instruct

# 重启服务应用配置
docker-compose restart ai-service
```

### 调整资源限制

```bash
# 低配置环境
export AI_MEMORY_LIMIT=2G
export AI_CPU_LIMIT=1.0
export MAX_CONCURRENT_TASKS=1

# 高配置环境
export AI_MEMORY_LIMIT=8G
export AI_CPU_LIMIT=4.0
export MAX_CONCURRENT_TASKS=8

# 应用配置
docker-compose up -d
```

## 🧪 测试和验证

### 功能测试脚本

创建测试脚本 `test-system.sh`：

```bash
#!/bin/bash
set -e

echo "🧪 开始系统功能测试..."

# 测试 API 健康状态
echo "1. 测试 API 健康状态..."
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo "✅ API 服务正常"
else
    echo "❌ API 服务异常"
    exit 1
fi

# 测试 AI 服务健康状态
echo "2. 测试 AI 服务健康状态..."
if curl -f -s http://localhost:8000/health > /dev/null; then
    echo "✅ AI 服务正常"
else
    echo "❌ AI 服务异常"
    exit 1
fi

# 测试文本处理
echo "3. 测试文本处理功能..."
response=$(curl -s -X POST http://localhost:3000/api/process/text \
  -H "Content-Type: application/json" \
  -d '{"text": "测试文本处理功能"}')

if echo "$response" | grep -q '"success":true'; then
    echo "✅ 文本处理功能正常"
else
    echo "❌ 文本处理功能异常"
    echo "响应: $response"
    exit 1
fi

# 测试知识库上传
echo "4. 测试知识库上传功能..."
echo "这是一个测试文档" > /tmp/test-doc.txt
response=$(curl -s -X POST http://localhost:3000/api/knowledge/upload \
  -F "file=@/tmp/test-doc.txt" \
  -F "title=测试文档")

if echo "$response" | grep -q '"success":true'; then
    echo "✅ 知识库上传功能正常"
else
    echo "❌ 知识库上传功能异常"
    echo "响应: $response"
fi

# 测试知识库搜索
echo "5. 测试知识库搜索功能..."
response=$(curl -s "http://localhost:3000/api/knowledge/search?q=测试")

if echo "$response" | grep -q '"success":true'; then
    echo "✅ 知识库搜索功能正常"
else
    echo "❌ 知识库搜索功能异常"
    echo "响应: $response"
fi

echo "🎉 所有测试通过！系统运行正常。"
```

运行测试：
```bash
chmod +x test-system.sh
./test-system.sh
```

### 性能基准测试

```bash
# 安装 Apache Bench（如果未安装）
sudo apt-get install apache2-utils

# 测试 API 性能
ab -n 100 -c 10 http://localhost:3000/health

# 测试文本处理性能
ab -n 50 -c 5 -p test-data.json -T application/json http://localhost:3000/api/process/text
```

## 🔍 故障排除

### 常见问题快速解决

1. **服务启动失败**
```bash
# 检查端口占用
netstat -tulpn | grep -E ':(3000|8000|80)'

# 清理并重启
docker-compose down
docker system prune -f
docker-compose up -d
```

2. **内存不足**
```bash
# 检查内存使用
free -h
docker stats

# 使用更小的模型
export WHISPER_MODEL=tiny
export AI_MEMORY_LIMIT=1G
docker-compose restart ai-service
```

3. **模型下载失败**
```bash
# 手动下载模型
docker-compose exec ai-service python -c "
import whisper
model = whisper.load_model('base')
print('Model downloaded successfully')
"
```

### 获取帮助

如果遇到问题：

1. 查看日志：`docker-compose logs -f`
2. 运行健康检查：`./scripts/health-check.sh`
3. 查看故障排除指南：`docs/TROUBLESHOOTING.md`
4. 提交 Issue：[GitHub Issues 页面]

## 📚 下一步

现在您已经成功部署了 Voice AI Decision System，可以：

1. **阅读完整文档**：
   - [API 文档](API.md) - 了解所有可用接口
   - [部署指南](DEPLOYMENT.md) - 生产环境部署
   - [故障排除](TROUBLESHOOTING.md) - 问题解决方案

2. **自定义配置**：
   - 修改 AI 模型配置
   - 调整资源限制
   - 配置知识库

3. **集成开发**：
   - 开发前端界面
   - 集成到现有系统
   - 扩展功能插件

4. **生产部署**：
   - 配置 SSL 证书
   - 设置监控告警
   - 实施备份策略

---

🎉 **恭喜！** 您已经成功部署了 Voice AI Decision System。开始探索 AI 驱动的语音处理和智能决策功能吧！