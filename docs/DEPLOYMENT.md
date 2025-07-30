# 部署指南

本文档提供了Voice AI Decision System的详细部署指南，包括不同环境的部署方案和最佳实践。

## 📋 部署前准备

### 系统要求

#### 最低配置
- **CPU**: 4核心 (x86_64)
- **内存**: 8GB RAM
- **存储**: 20GB 可用空间
- **网络**: 稳定的互联网连接（用于下载模型）

#### 推荐配置
- **CPU**: 8核心或更多
- **内存**: 16GB RAM或更多
- **存储**: 50GB 可用空间（SSD推荐）
- **GPU**: NVIDIA GPU（可选，用于加速推理）

### 软件依赖

```bash
# Docker (版本 20.10+)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose (版本 2.0+)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

## 🚀 部署方案

### 1. 单机部署（推荐用于开发和小规模生产）

#### 步骤1: 获取代码
```bash
git clone <repository-url>
cd voice-ai-system
```

#### 步骤2: 环境配置
```bash
# 复制环境配置模板
cp .env.example .env

# 编辑配置文件
nano .env
```

#### 步骤3: 系统优化
```bash
# 运行优化脚本
chmod +x scripts/docker-optimize.sh
./scripts/docker-optimize.sh
```

#### 步骤4: 启动服务
```bash
# 开发环境
docker-compose up -d

# 生产环境
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 步骤5: 验证部署
```bash
# 运行健康检查
chmod +x scripts/health-check.sh
./scripts/health-check.sh

# 手动验证
curl http://localhost:3000/health
curl http://localhost:8000/health
```

### 2. 分布式部署

#### 架构设计
```
┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Load Balancer │
│    (Nginx)      │    │    (Nginx)      │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
    ┌─────┴─────┐          ┌─────┴─────┐
    │ API Node 1│          │ API Node 2│
    └─────┬─────┘          └─────┬─────┘
          │                      │
    ┌─────┴──────────────────────┴─────┐
    │         AI Service Cluster       │
    │  ┌─────────┐  ┌─────────┐       │
    │  │AI Node 1│  │AI Node 2│       │
    │  └─────────┘  └─────────┘       │
    └──────────────────────────────────┘
```

#### Docker Swarm 部署
```bash
# 初始化 Swarm
docker swarm init

# 部署 Stack
docker stack deploy -c docker-compose.yml -c docker-compose.swarm.yml voice-ai-stack
```

#### Kubernetes 部署
```bash
# 应用 Kubernetes 配置
kubectl apply -f k8s/
```

### 3. 云平台部署

#### AWS 部署
```bash
# 使用 ECS
aws ecs create-cluster --cluster-name voice-ai-cluster

# 使用 EKS
eksctl create cluster --name voice-ai-cluster --region us-west-2
```

#### Azure 部署
```bash
# 使用 Container Instances
az container create --resource-group myResourceGroup --name voice-ai-system --image voice-ai:latest
```

#### Google Cloud 部署
```bash
# 使用 Cloud Run
gcloud run deploy voice-ai-system --image gcr.io/PROJECT-ID/voice-ai:latest
```

## ⚙️ 配置管理

### 环境变量配置

#### 基础配置
```bash
# 应用环境
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info

# 服务端口
API_PORT=3000
AI_SERVICE_PORT=8000
NGINX_PORT=80
```

#### 性能配置
```bash
# 并发控制
MAX_CONCURRENT_TASKS=2
TASK_TIMEOUT=300

# 资源限制
AI_MEMORY_LIMIT=4G
AI_CPU_LIMIT=2.0
```

#### 安全配置
```bash
# CORS 设置
CORS_ORIGIN=https://yourdomain.com

# 文件上传限制
MAX_FILE_SIZE=50MB
MAX_AUDIO_SIZE=52428800
```

### 配置文件管理

#### 开发环境配置
```bash
# .env.development
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
MAX_CONCURRENT_TASKS=1
```

#### 生产环境配置
```bash
# .env.production
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
MAX_CONCURRENT_TASKS=4
```

#### 测试环境配置
```bash
# .env.test
NODE_ENV=test
DEBUG=false
LOG_LEVEL=error
MAX_CONCURRENT_TASKS=1
```

## 🔒 安全配置

### SSL/TLS 配置

#### 使用 Let's Encrypt
```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### 自签名证书（开发环境）
```bash
# 生成证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/nginx.key \
  -out nginx/ssl/nginx.crt
```

### 防火墙配置
```bash
# UFW 配置
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 访问控制
```nginx
# Nginx 配置
location /api/ {
    # IP 白名单
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
    
    # 基本认证
    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

## 📊 监控和日志

### 监控配置

#### Prometheus + Grafana
```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

#### 健康检查监控
```bash
# 设置定时健康检查
echo "*/5 * * * * /path/to/voice-ai-system/scripts/health-check.sh >> /var/log/health-check.log 2>&1" | crontab -
```

### 日志管理

#### 日志轮转配置
```bash
# /etc/logrotate.d/voice-ai-system
/var/lib/docker/volumes/voice-ai-system_*_logs/_data/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
}
```

#### 集中日志收集
```yaml
# ELK Stack 配置
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.0
  
  logstash:
    image: docker.elastic.co/logstash/logstash:7.15.0
  
  kibana:
    image: docker.elastic.co/kibana/kibana:7.15.0
```

## 🔧 性能优化

### 系统级优化

#### 内核参数调优
```bash
# /etc/sysctl.conf
vm.max_map_count=262144
vm.swappiness=10
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
```

#### 文件描述符限制
```bash
# /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536
```

### Docker 优化

#### 镜像优化
```dockerfile
# 多阶段构建
FROM node:18-alpine AS builder
# ... 构建阶段

FROM node:18-alpine AS production
# ... 生产阶段
```

#### 容器资源限制
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2.0'
    reservations:
      memory: 2G
      cpus: '1.0'
```

### 应用级优化

#### 缓存策略
```typescript
// Redis 缓存配置
const cacheConfig = {
  host: 'redis',
  port: 6379,
  ttl: 3600, // 1小时
  max: 1000  // 最大缓存条目
};
```

#### 连接池配置
```python
# 数据库连接池
DATABASE_CONFIG = {
    'pool_size': 20,
    'max_overflow': 30,
    'pool_timeout': 30,
    'pool_recycle': 3600
}
```

## 🚨 故障恢复

### 备份策略

#### 数据备份
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/voice-ai-system"

# 备份数据卷
docker run --rm -v voice-ai-system_models_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/models_$DATE.tar.gz -C /data .
docker run --rm -v voice-ai-system_vector_db_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/vector_db_$DATE.tar.gz -C /data .
```

#### 配置备份
```bash
# 备份配置文件
tar czf config_backup_$DATE.tar.gz .env docker-compose.yml nginx/
```

### 灾难恢复

#### 快速恢复脚本
```bash
#!/bin/bash
# restore.sh
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# 停止服务
docker-compose down

# 恢复数据
tar xzf $BACKUP_FILE

# 重启服务
docker-compose up -d
```

#### 高可用配置
```yaml
# docker-compose.ha.yml
services:
  api-service:
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
```

## 📈 扩展部署

### 水平扩展

#### API 服务扩展
```bash
# 扩展 API 服务实例
docker-compose up -d --scale api-service=3
```

#### AI 服务扩展
```bash
# 扩展 AI 服务实例
docker-compose up -d --scale ai-service=2
```

### 垂直扩展

#### 资源升级
```yaml
# 增加资源配置
deploy:
  resources:
    limits:
      memory: 8G
      cpus: '4.0'
```

### 混合云部署

#### 多云架构
```
┌─────────────────┐    ┌─────────────────┐
│   AWS Region    │    │  Azure Region   │
│                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │
│  │API Service│  │    │  │AI Service │  │
│  └───────────┘  │    │  └───────────┘  │
└─────────────────┘    └─────────────────┘
          │                      │
          └──────────┬───────────┘
                     │
            ┌─────────────────┐
            │  Load Balancer  │
            │   (CloudFlare)  │
            └─────────────────┘
```

## 🔍 故障排除

### 常见部署问题

#### 1. 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 修改端口配置
export API_PORT=3001
```

#### 2. 内存不足
```bash
# 检查内存使用
free -h
docker stats

# 调整内存限制
# 编辑 docker-compose.yml 中的 memory 配置
```

#### 3. 磁盘空间不足
```bash
# 清理 Docker 资源
docker system prune -a -f

# 清理日志文件
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

#### 4. 网络连接问题
```bash
# 检查网络配置
docker network ls
docker network inspect voice-ai-network

# 重建网络
docker-compose down
docker network prune
docker-compose up -d
```

### 性能问题诊断

#### 1. CPU 使用率过高
```bash
# 检查进程 CPU 使用
top -p $(docker inspect --format '{{.State.Pid}}' voice-ai-python)

# 调整并发任务数
export MAX_CONCURRENT_TASKS=1
```

#### 2. 内存泄漏
```bash
# 监控内存使用趋势
docker stats --format "table {{.Container}}\t{{.MemUsage}}\t{{.MemPerc}}" --no-stream

# 重启服务释放内存
docker-compose restart ai-service
```

#### 3. 响应时间过长
```bash
# 检查服务响应时间
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# 优化配置
export TASK_TIMEOUT=180
```

## 📝 部署检查清单

### 部署前检查
- [ ] 系统资源满足最低要求
- [ ] Docker 和 Docker Compose 已安装
- [ ] 网络端口可用
- [ ] 存储空间充足
- [ ] 环境变量已配置

### 部署后验证
- [ ] 所有容器正常运行
- [ ] 健康检查通过
- [ ] API 接口可访问
- [ ] 日志输出正常
- [ ] 监控系统工作

### 生产环境额外检查
- [ ] SSL 证书已配置
- [ ] 防火墙规则已设置
- [ ] 备份策略已实施
- [ ] 监控告警已配置
- [ ] 文档已更新

---

本部署指南涵盖了从开发环境到生产环境的完整部署流程。如有问题，请参考故障排除部分或联系技术支持。