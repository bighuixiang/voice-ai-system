# 故障排除指南

本文档提供了 Voice AI Decision System 常见问题的诊断和解决方案。

## 🚨 快速诊断

### 系统健康检查

首先运行系统健康检查脚本：

```bash
# 运行健康检查
./scripts/health-check.sh

# 或手动检查各服务
curl http://localhost:3000/health
curl http://localhost:8000/health
curl http://localhost:80/nginx-health
```

### 查看服务状态

```bash
# 检查容器状态
docker-compose ps

# 查看容器日志
docker-compose logs -f api-service
docker-compose logs -f ai-service
docker-compose logs -f nginx

# 检查资源使用
docker stats
```

## 🔧 常见问题解决

### 1. 服务启动问题

#### 问题：容器无法启动

**症状**：
- `docker-compose up` 失败
- 容器状态显示 `Exited`
- 端口冲突错误

**诊断步骤**：
```bash
# 检查端口占用
netstat -tulpn | grep :3000
netstat -tulpn | grep :8000
netstat -tulpn | grep :80

# 查看详细错误日志
docker-compose logs <service-name>

# 检查 Docker 守护进程状态
sudo systemctl status docker
```

**解决方案**：

1. **端口冲突**：
```bash
# 修改端口配置
export API_PORT=3001
export AI_SERVICE_PORT=8001
export NGINX_PORT=8080

# 或编辑 .env 文件
nano .env
```

2. **权限问题**：
```bash
# 修复目录权限
sudo chown -R $USER:$USER ./api/uploads
sudo chown -R $USER:$USER ./ai-service/vector_db
sudo chown -R $USER:$USER ./models
```

3. **Docker 守护进程问题**：
```bash
# 重启 Docker 服务
sudo systemctl restart docker

# 清理 Docker 资源
docker system prune -f
```

#### 问题：镜像构建失败

**症状**：
- `docker build` 命令失败
- 依赖安装错误
- 网络连接超时

**解决方案**：

1. **网络问题**：
```bash
# 使用国内镜像源
# 编辑 api/Dockerfile
FROM node:18-alpine
RUN npm config set registry https://registry.npmmirror.com

# 编辑 ai-service/Dockerfile
FROM python:3.11-slim
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

2. **清理构建缓存**：
```bash
# 清理构建缓存
docker builder prune -f

# 强制重新构建
docker-compose build --no-cache
```

### 2. AI 服务问题

#### 问题：模型加载失败

**症状**：
- AI 服务启动后立即退出
- 日志显示模型下载或加载错误
- 内存不足错误

**诊断步骤**：
```bash
# 检查模型文件
ls -la models/
du -sh models/*

# 检查内存使用
free -h
docker stats ai-service

# 查看 AI 服务日志
docker-compose logs ai-service | grep -i error
```

**解决方案**：

1. **内存不足**：
```bash
# 调整内存限制
# 编辑 docker-compose.yml
deploy:
  resources:
    limits:
      memory: 6G  # 增加内存限制
    reservations:
      memory: 3G
```

2. **模型文件缺失**：
```bash
# 手动下载模型
docker-compose exec ai-service python -c "
import whisper
model = whisper.load_model('base')
print('Whisper model loaded successfully')
"

# 检查模型文件
docker-compose exec ai-service ls -la /app/models/
```

3. **使用更小的模型**：
```bash
# 修改环境变量使用更小的模型
export WHISPER_MODEL=tiny
export LLM_MODEL=Qwen/Qwen2-0.5B-Instruct
```

#### 问题：推理速度过慢

**症状**：
- API 响应时间超过 30 秒
- 处理队列积压
- CPU 使用率持续 100%

**解决方案**：

1. **优化并发设置**：
```bash
# 减少并发任务数
export MAX_CONCURRENT_TASKS=1
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
```

2. **启用 GPU 加速**（如果有 GPU）：
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
    environment:
      - DEVICE=cuda
```

3. **模型量化**：
```python
# 在 AI 服务中启用模型量化
import torch
model = model.half()  # 使用 FP16 精度
```

### 3. API 服务问题

#### 问题：文件上传失败

**症状**：
- 413 Payload Too Large 错误
- 文件上传中断
- 超时错误

**解决方案**：

1. **调整文件大小限制**：
```bash
# 修改环境变量
export MAX_FILE_SIZE=100MB

# 修改 Nginx 配置
# nginx/nginx.conf
client_max_body_size 100M;
```

2. **增加超时时间**：
```bash
# 修改 Nginx 超时配置
proxy_connect_timeout 120s;
proxy_send_timeout 600s;
proxy_read_timeout 600s;
```

3. **检查磁盘空间**：
```bash
# 检查磁盘使用情况
df -h

# 清理临时文件
docker-compose exec api-service rm -rf /app/uploads/temp/*
```

#### 问题：数据库连接失败

**症状**：
- 500 Internal Server Error
- 数据库连接超时
- 知识库搜索失败

**解决方案**：

1. **检查数据库服务**：
```bash
# 如果使用外部数据库
ping your-database-host
telnet your-database-host 5432

# 检查连接配置
docker-compose exec api-service env | grep DATABASE
```

2. **重启相关服务**：
```bash
# 重启 API 服务
docker-compose restart api-service

# 重建数据库连接
docker-compose exec api-service npm run db:migrate
```

### 4. 网络和代理问题

#### 问题：Nginx 代理错误

**症状**：
- 502 Bad Gateway
- 504 Gateway Timeout
- 上游服务连接失败

**诊断步骤**：
```bash
# 检查上游服务状态
curl http://api-service:3000/health
curl http://ai-service:8000/health

# 检查 Nginx 配置
docker-compose exec nginx nginx -t

# 查看 Nginx 日志
docker-compose logs nginx | grep error
```

**解决方案**：

1. **修复上游连接**：
```nginx
# nginx/nginx.conf
upstream api_backend {
    server api-service:3000 max_fails=3 fail_timeout=30s;
    # 添加备用服务器
    server api-service-backup:3000 backup;
}
```

2. **调整超时设置**：
```nginx
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

3. **重新加载配置**：
```bash
# 重新加载 Nginx 配置
docker-compose exec nginx nginx -s reload

# 或重启 Nginx 服务
docker-compose restart nginx
```

#### 问题：跨域 (CORS) 错误

**症状**：
- 浏览器控制台显示 CORS 错误
- OPTIONS 请求失败
- 前端无法访问 API

**解决方案**：

1. **配置 CORS 头**：
```nginx
# nginx/nginx.conf
add_header Access-Control-Allow-Origin $http_origin always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE" always;
add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
add_header Access-Control-Allow-Credentials true always;
```

2. **处理 OPTIONS 请求**：
```nginx
if ($request_method = 'OPTIONS') {
    add_header Access-Control-Allow-Origin $http_origin;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE";
    add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization";
    add_header Access-Control-Max-Age 1728000;
    add_header Content-Type 'text/plain charset=UTF-8';
    add_header Content-Length 0;
    return 204;
}
```

### 5. 性能问题

#### 问题：系统响应缓慢

**症状**：
- API 响应时间超过 10 秒
- 系统负载过高
- 内存使用率接近 100%

**诊断步骤**：
```bash
# 检查系统资源
top
htop
iostat -x 1

# 检查容器资源使用
docker stats --no-stream

# 分析慢查询
docker-compose logs api-service | grep "slow"
```

**解决方案**：

1. **优化资源配置**：
```yaml
# docker-compose.yml
services:
  api-service:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
    environment:
      - NODE_OPTIONS=--max-old-space-size=1024
```

2. **启用缓存**：
```typescript
// 在 API 服务中启用 Redis 缓存
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600, // 1小时
      max: 1000, // 最大缓存条目
    }),
  ],
})
```

3. **数据库优化**：
```sql
-- 添加索引
CREATE INDEX idx_knowledge_content ON knowledge_documents USING gin(to_tsvector('english', content));

-- 分析查询性能
EXPLAIN ANALYZE SELECT * FROM knowledge_documents WHERE content LIKE '%keyword%';
```

#### 问题：内存泄漏

**症状**：
- 内存使用持续增长
- 容器被 OOM Killer 终止
- 系统变得不稳定

**解决方案**：

1. **监控内存使用**：
```bash
# 持续监控内存
watch -n 5 'docker stats --no-stream | grep voice-ai'

# 分析内存使用模式
docker-compose exec api-service node --inspect=0.0.0.0:9229 dist/main.js
```

2. **配置内存限制**：
```yaml
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M
```

3. **定期重启服务**：
```bash
# 设置定时重启（生产环境谨慎使用）
echo "0 2 * * * docker-compose restart api-service" | crontab -
```

### 6. 数据问题

#### 问题：知识库搜索不准确

**症状**：
- 搜索结果不相关
- 搜索结果为空
- 搜索性能差

**解决方案**：

1. **重建搜索索引**：
```bash
# 重建知识库索引
docker-compose exec api-service npm run knowledge:reindex

# 或手动重建
curl -X POST http://localhost:3000/api/knowledge/reindex
```

2. **优化搜索算法**：
```python
# 在 AI 服务中改进搜索算法
from sentence_transformers import SentenceTransformer

# 使用语义搜索替代关键词匹配
model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(documents)
```

3. **清理数据**：
```bash
# 清理重复或无效数据
docker-compose exec api-service npm run knowledge:cleanup
```

## 🔍 高级诊断

### 日志分析

#### 收集系统日志
```bash
# 创建日志收集脚本
#!/bin/bash
mkdir -p logs/$(date +%Y%m%d_%H%M%S)
cd logs/$(date +%Y%m%d_%H%M%S)

# 收集容器日志
docker-compose logs --no-color api-service > api-service.log
docker-compose logs --no-color ai-service > ai-service.log
docker-compose logs --no-color nginx > nginx.log

# 收集系统信息
docker stats --no-stream > docker-stats.log
docker-compose ps > docker-ps.log
df -h > disk-usage.log
free -h > memory-usage.log

echo "日志已收集到 logs/$(date +%Y%m%d_%H%M%S)/"
```

#### 日志分析工具
```bash
# 分析错误模式
grep -i error logs/*.log | sort | uniq -c | sort -nr

# 分析响应时间
grep "response_time" logs/api-service.log | awk '{print $NF}' | sort -n

# 分析访问模式
grep "GET\|POST" logs/nginx.log | awk '{print $7}' | sort | uniq -c | sort -nr
```

### 性能分析

#### CPU 性能分析
```bash
# 使用 perf 分析 CPU 使用
sudo perf top -p $(docker inspect --format '{{.State.Pid}}' voice-ai-python)

# 生成火焰图
sudo perf record -p $(docker inspect --format '{{.State.Pid}}' voice-ai-python) -g sleep 30
sudo perf script | ./FlameGraph/stackcollapse-perf.pl | ./FlameGraph/flamegraph.pl > cpu-flamegraph.svg
```

#### 内存分析
```bash
# 使用 valgrind 检查内存泄漏
docker run --rm -v $(pwd):/app valgrind --tool=memcheck --leak-check=full python /app/main.py

# Node.js 内存分析
docker-compose exec api-service node --inspect=0.0.0.0:9229 --heap-prof dist/main.js
```

### 网络诊断

#### 网络连通性测试
```bash
# 测试容器间网络
docker-compose exec api-service ping ai-service
docker-compose exec api-service telnet ai-service 8000

# 测试外部网络
docker-compose exec api-service ping 8.8.8.8
docker-compose exec api-service curl -I https://www.google.com
```

#### 网络性能测试
```bash
# 使用 iperf3 测试网络带宽
docker run --rm --network voice-ai-system_voice-ai-network iperf3 -c ai-service -p 5201

# 测试 HTTP 性能
ab -n 1000 -c 10 http://localhost:3000/health
```

## 📊 监控和预警

### 设置监控

#### Prometheus 监控配置
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'voice-ai-api'
    static_configs:
      - targets: ['api-service:3000']
    metrics_path: '/metrics'
    
  - job_name: 'voice-ai-python'
    static_configs:
      - targets: ['ai-service:8000']
    metrics_path: '/metrics'
```

#### Grafana 仪表板
```json
{
  "dashboard": {
    "title": "Voice AI System Monitoring",
    "panels": [
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
```

### 自动化故障恢复

#### 健康检查和自动重启
```yaml
# docker-compose.yml
services:
  api-service:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

#### 自动扩缩容
```bash
# 基于 CPU 使用率自动扩容
#!/bin/bash
CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" voice-ai-api | sed 's/%//')
if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
    docker-compose up -d --scale api-service=3
fi
```

## 📞 获取帮助

### 收集诊断信息

运行以下脚本收集完整的诊断信息：

```bash
#!/bin/bash
# collect-diagnostics.sh

echo "=== Voice AI System Diagnostics ==="
echo "Timestamp: $(date)"
echo "System: $(uname -a)"
echo

echo "=== Docker Information ==="
docker version
docker-compose version
echo

echo "=== Container Status ==="
docker-compose ps
echo

echo "=== Resource Usage ==="
docker stats --no-stream
echo

echo "=== Recent Logs ==="
echo "--- API Service ---"
docker-compose logs --tail=50 api-service
echo
echo "--- AI Service ---"
docker-compose logs --tail=50 ai-service
echo
echo "--- Nginx ---"
docker-compose logs --tail=50 nginx
echo

echo "=== System Resources ==="
free -h
df -h
echo

echo "=== Network Configuration ==="
docker network ls
docker network inspect voice-ai-system_voice-ai-network
```

### 联系支持

在联系技术支持时，请提供：

1. **系统信息**：操作系统、Docker 版本、硬件配置
2. **错误描述**：具体的错误信息和复现步骤
3. **日志文件**：相关服务的日志文件
4. **配置文件**：docker-compose.yml 和 .env 文件（隐藏敏感信息）
5. **诊断报告**：运行 `collect-diagnostics.sh` 的输出

**支持渠道**：
- 📧 邮箱：support@voice-ai-system.com
- 🐛 GitHub Issues：[项目 Issues 页面]
- 📚 文档：[在线文档地址]

---

**注意**：在生产环境中进行故障排除时，请务必先在测试环境中验证解决方案，避免对生产服务造成影响。