# 重启API服务脚本

Write-Host "🔄 重启API服务..." -ForegroundColor Yellow

# 查找并停止API服务进程
$apiProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node"} | Where-Object {
    $port = netstat -ano | findstr ":3000" | Select-String "LISTENING" | ForEach-Object {
        ($_ -split '\s+')[4]
    }
    if ($port) {
        $pid = ($port -split '\s+')[-1]
        $_.Id -eq $pid
    }
}

if ($apiProcesses) {
    Write-Host "⏹️ 停止现有API服务进程..." -ForegroundColor Red
    $apiProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# 切换到API目录并启动服务
Write-Host "🚀 启动API服务..." -ForegroundColor Green
Set-Location -Path "api"

# 检查是否有package.json
if (Test-Path "package.json") {
    Write-Host "📦 找到package.json，启动开发服务器..." -ForegroundColor Cyan
    Start-Process -FilePath "npm" -ArgumentList "run", "start:dev" -NoNewWindow
    
    # 等待服务启动
    Write-Host "⏳ 等待服务启动..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # 检查服务是否启动成功
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ API服务启动成功！" -ForegroundColor Green
            Write-Host "🌐 服务地址: http://localhost:3000" -ForegroundColor Cyan
            Write-Host "🔍 健康检查: http://localhost:3000/health" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "❌ API服务启动失败或未响应" -ForegroundColor Red
        Write-Host "请手动检查服务状态" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ 未找到package.json文件" -ForegroundColor Red
}

# 返回原目录
Set-Location -Path ".."