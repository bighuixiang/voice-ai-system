# 小说编写辅助

## 📋 系统要求

### 最低配置

- **CPU**: 4 核心
- **内存**: 8GB RAM
- **存储**: 10GB 可用空间
- **操作系统**: Linux, macOS, Windows (支持 Docker)

### 推荐配置

- **CPU**: 8 核心或更多
- **内存**: 16GB RAM 或更多
- **存储**: 20GB 可用空间（用于模型和数据存储）
- **GPU**: 可选，支持 CUDA 加速

## 🛠️ 快速开始

### 1. 环境准备

确保系统已安装以下软件：

```bash
# Docker 和 Docker Compose
docker --version
docker-compose --version

# Git
git --version
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd voice-ai-system
```

### 3. 环境配置

```bash
# 复制环境配置文件
cp .env.example .env

# 根据需要修改配置
nano .env
```

### 4. 一键部署

```bash
# 开发环境部署
docker-compose up -d

# 生产环境部署
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 5. 验证部署

```bash
# 检查服务状态
./scripts/health-check.sh

# 或手动检查
curl http://localhost:3000/health
curl http://localhost:8000/health
```

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Web Browser   │    │   API Client    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      Nginx Proxy          │
                    │   (Load Balancer)         │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │     NestJS API Service    │
                    │  - 文件上传处理            │
                    │  - 请求路由和验证          │
                    │  - 知识库管理              │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   Python AI Service       │
                    │  - Whisper 语音识别       │
                    │  - LLM 内容理解           │
                    │  - 知识库检索              │
                    └───────────────────────────┘
```

## 📚 API 文档

### 语音处理接口

#### 上传语音文件

```http
POST /api/process/voice
Content-Type: multipart/form-data

{
  "file": <audio_file>,
  "metadata": {
    "format": "wav",
    "language": "zh"
  }
}
```

#### 文本处理

```http
POST /api/process/text
Content-Type: application/json

{
  "text": "你好，请帮我分析一下市场趋势",
  "context": "financial_analysis"
}
```

### 知识库管理

#### 上传文档

```http
POST /api/knowledge/upload
Content-Type: multipart/form-data

{
  "file": <document_file>,
  "title": "文档标题",
  "category": "技术文档"
}
```

#### 搜索知识库

```http
GET /api/knowledge/search?q=关键词&limit=10
```

### 系统监控

#### 健康检查

```http
GET /health
```

#### 系统状态

```http
GET /api/system/status
```

## 🔧 配置说明

### 环境变量配置

| 变量名                 | 默认值                   | 说明             |
| ---------------------- | ------------------------ | ---------------- |
| `NODE_ENV`             | production               | 运行环境         |
| `API_PORT`             | 3000                     | API 服务端口     |
| `AI_SERVICE_PORT`      | 8000                     | AI 服务端口      |
| `WHISPER_MODEL`        | base                     | Whisper 模型版本 |
| `LLM_MODEL`            | Qwen/Qwen2-1.5B-Instruct | 语言模型         |
| `MAX_FILE_SIZE`        | 50MB                     | 最大文件大小     |
| `MAX_CONCURRENT_TASKS` | 2                        | 最大并发任务数   |

### 资源限制配置

```yaml
# docker-compose.yml 中的资源配置
deploy:
  resources:
    limits:
      memory: 4G
      cpus: "2.0"
    reservations:
      memory: 2G
      cpus: "1.0"
```

## 🚀 部署指南

### 开发环境部署

1. **克隆项目并安装依赖**

```bash
git clone <repository-url>
cd voice-ai-system
```

2. **配置环境变量**

```bash
cp .env.example .env
# 编辑 .env 文件，设置开发环境参数
```

3. **启动开发环境**

```bash
docker-compose up -d
```

4. **查看日志**

```bash
docker-compose logs -f
```

### 生产环境部署

1. **服务器准备**

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **优化系统配置**

```bash
# 运行优化脚本
./scripts/docker-optimize.sh
```

3. **生产环境部署**

```bash
# 设置生产环境变量
export NODE_ENV=production
export DEBUG=false

# 启动生产环境
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

4. **设置监控和日志**

```bash
# 设置定时健康检查
echo "*/5 * * * * /path/to/voice-ai-system/scripts/health-check.sh" | crontab -

# 配置日志轮转
sudo logrotate -d /etc/logrotate.d/docker-containers
```

### 扩展部署

#### 负载均衡部署

```yaml
# docker-compose.scale.yml
services:
  api-service:
    deploy:
      replicas: 3

  ai-service:
    deploy:
      replicas: 2
```

#### GPU 加速部署

```yaml
# docker-compose.gpu.yml
services:
  ai-service:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## 🔍 故障排除

### 常见问题

#### 1. 容器启动失败

```bash
# 检查容器状态
docker-compose ps

# 查看详细日志
docker-compose logs <service-name>

# 重启服务
docker-compose restart <service-name>
```

#### 2. 内存不足

```bash
# 检查内存使用
docker stats

# 调整内存限制
# 编辑 docker-compose.yml 中的 memory 配置
```

#### 3. 模型加载失败

```bash
# 检查模型文件
ls -la models/

# 重新下载模型
docker-compose exec ai-service python -c "import whisper; whisper.load_model('base')"
```

#### 4. 网络连接问题

```bash
# 检查网络配置
docker network ls
docker network inspect voice-ai-network

# 重建网络
docker-compose down
docker-compose up -d
```

### 性能优化

#### 1. 系统级优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化内核参数
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
sysctl -p
```

#### 2. Docker 优化

```bash
# 清理无用资源
docker system prune -f

# 优化镜像构建
docker build --no-cache -t voice-ai-api ./api
```

#### 3. 应用级优化

- 调整并发任务数量
- 优化模型加载策略
- 配置适当的缓存策略

### 监控和日志

#### 1. 系统监控

```bash
# 实时监控容器资源
docker stats

# 检查系统健康状态
./scripts/health-check.sh
```

#### 2. 日志管理

```bash
# 查看应用日志
docker-compose logs -f api-service
docker-compose logs -f ai-service

# 日志文件位置
# API 服务: /var/lib/docker/volumes/voice-ai-system_api_logs/_data
# AI 服务: /var/lib/docker/volumes/voice-ai-system_ai_logs/_data
```

## 🤝 开发指南

### 本地开发环境

1. **安装开发依赖**

```bash
# API 服务
cd api
npm install

# AI 服务
cd ai-service
pip install -r requirements.txt
```

2. **启动开发服务**

```bash
# API 服务
cd api
npm run start:dev

# AI 服务
cd ai-service
python main.py
```

### 代码贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 测试

```bash
# 运行单元测试
cd api && npm test
cd ai-service && python -m pytest

# 运行集成测试
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [OpenAI Whisper](https://github.com/openai/whisper) - 语音识别模型
- [Qwen](https://github.com/QwenLM/Qwen) - 语言模型
- [NestJS](https://nestjs.com/) - Node.js 框架
- [FastAPI](https://fastapi.tiangolo.com/) - Python API 框架

## 📞 支持

如果您遇到问题或有疑问，请：

1. 查看 [故障排除](#故障排除) 部分
2. 搜索现有的 [Issues](../../issues)
3. 创建新的 [Issue](../../issues/new)

---

**注意**: 本系统仍在积极开发中，功能和 API 可能会发生变化。建议在生产环境使用前进行充分测试。
