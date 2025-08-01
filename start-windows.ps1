# Voice AI Decision System - Windows 一键启动脚本
# 适用于 Windows 系统的快速部署脚本
param(
    [switch]$Production = $false,
    [switch]$Clean = $false,
    [switch]$Help = $false
)

# 显示帮助信息
if ($Help) {
    Write-Host @"
Voice AI Decision System - Windows 一键启动脚本

用法:
  .\start-windows.ps1                    # 开发环境启动
  .\start-windows.ps1 -Production        # 生产环境启动
  .\start-windows.ps1 -Clean             # 清理后启动
  .\start-windows.ps1 -Help              # 显示帮助

选项:
  -Production    使用生产环境配置启动
  -Clean         清理旧容器和镜像后启动
  -Help          显示此帮助信息

"@ -ForegroundColor Green
    exit 0
}

# 颜色输出函数
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Cyan
}

# 显示欢迎信息
Write-Host @"
🚀 Voice AI Decision System - Windows 一键启动
================================================
"@ -ForegroundColor Blue

# 1. 检查系统要求
Write-Status "检查系统要求..."

# 检查 Docker
try {
    $dockerVersion = docker --version
    Write-Status "Docker 已安装: $dockerVersion"
} catch {
    Write-Error "Docker 未安装或未启动，请先安装 Docker Desktop"
    Write-Host "下载地址: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# 检查 Docker Compose
try {
    $composeVersion = docker-compose --version
    Write-Status "Docker Compose 已安装: $composeVersion"
} catch {
    Write-Error "Docker Compose 未安装"
    exit 1
}

# 检查 Docker 是否运行
try {
    docker info | Out-Null
    Write-Status "Docker 服务正在运行"
} catch {
    Write-Error "Docker 服务未运行，请启动 Docker Desktop"
    exit 1
}

# 2. 环境配置
Write-Status "配置环境变量..."

if (!(Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Status "已创建 .env 配置文件"
    } else {
        Write-Error "未找到 .env.example 文件"
        exit 1
    }
} else {
    Write-Status ".env 配置文件已存在"
}

# 3. 创建必要目录
Write-Status "创建必要目录..."
$directories = @(
    "models",
    "api\uploads", 
    "api\knowledge",
    "ai-service\vector_db",
    "ai-service\logs",
    "api\logs"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Status "创建目录: $dir"
    }
}

# 4. 清理旧资源（如果需要）
if ($Clean) {
    Write-Status "清理旧的 Docker 资源..."
    docker-compose down --remove-orphans
    docker system prune -f
    docker volume prune -f
    Write-Status "清理完成"
}

# 5. 构建和启动服务
Write-Status "构建和启动服务..."

if ($Production) {
    Write-Status "使用生产环境配置启动..."
    
    # 检查生产环境配置文件
    if (!(Test-Path "docker-compose.prod.yml")) {
        Write-Warning "未找到 docker-compose.prod.yml，使用默认配置"
        docker-compose up -d --build
    } else {
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
    }
} else {
    Write-Status "使用开发环境配置启动..."
    docker-compose up -d --build
}
# 6. 等待服务启动

Write-Status "等待服务启动..."
Start-Sleep -Seconds 30

# 7. 健康检查
Write-Status "执行健康检查..."

$maxRetries = 12
$retryCount = 0
$allHealthy = $false

while ($retryCount -lt $maxRetries -and !$allHealthy) {
    $retryCount++
    Write-Status "健康检查 ($retryCount/$maxRetries)..."
    
    $apiHealthy = $false
    $aiHealthy = $false
    
    # 检查 API 服务
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $apiHealthy = $true
            Write-Status "✅ API 服务健康"
        }
    } catch {
        Write-Warning "⏳ API 服务尚未就绪..."
    }
    
    # 检查 AI 服务
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $aiHealthy = $true
            Write-Status "✅ AI 服务健康"
        }
    } catch {
        Write-Warning "⏳ AI 服务尚未就绪..."
    }
    
    if ($apiHealthy -and $aiHealthy) {
        $allHealthy = $true
        break
    }
    
    if ($retryCount -lt $maxRetries) {
        Start-Sleep -Seconds 15
    }
}

# 8. 显示结果
Write-Host "`n" + "="*50 -ForegroundColor Blue

if ($allHealthy) {
    Write-Success "🎉 系统启动成功！"
    
    Write-Host @"

📋 服务信息:
- API 服务:     http://localhost:3000
- AI 服务:      http://localhost:8000  
- Nginx 代理:   http://localhost:80
- 健康检查:     http://localhost:3000/health

🧪 快速测试:
# 测试文本处理
curl -X POST http://localhost:3000/api/process/text -H "Content-Type: application/json" -d '{\"text\": \"你好，这是一个测试\"}'

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

🛠️ 管理命令:
# 停止服务
docker-compose down

# 重启服务  
docker-compose restart

# 查看资源使用
docker stats

"@ -ForegroundColor Green

} else {
    Write-Error "❌ 系统启动失败，部分服务不健康"
    
    Write-Host @"

🔍 故障排除:
1. 查看服务状态: docker-compose ps
2. 查看日志: docker-compose logs -f
3. 检查端口占用: netstat -an | findstr ":3000 :8000 :80"
4. 重启服务: docker-compose restart

"@ -ForegroundColor Yellow
}

# 9. 显示容器状态
Write-Status "当前容器状态:"
docker-compose ps

Write-Host "`n" + "="*50 -ForegroundColor Blue
Write-Host "脚本执行完成！" -ForegroundColor Blue