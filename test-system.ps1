# Voice AI Decision System - 系统测试脚本
# 用于验证系统各项功能是否正常

param(
    [switch]$Verbose = $false
)

# 颜色输出函数
function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Success,
        [string]$Details = ""
    )
    
    if ($Success) {
        Write-Host "✅ $TestName" -ForegroundColor Green
    } else {
        Write-Host "❌ $TestName" -ForegroundColor Red
    }
    
    if ($Verbose -and $Details) {
        Write-Host "   详情: $Details" -ForegroundColor Gray
    }
}

function Write-Status {
    param([string]$Message)
    Write-Host "[测试] $Message" -ForegroundColor Cyan
}

# 显示测试开始信息
Write-Host @"
🧪 Voice AI Decision System - 系统功能测试
============================================
"@ -ForegroundColor Blue

$totalTests = 0
$passedTests = 0

# 测试 1: Docker 服务检查
Write-Status "检查 Docker 服务..."
$totalTests++
try {
    docker info | Out-Null
    Write-TestResult "Docker 服务运行正常" $true
    $passedTests++
} catch {
    Write-TestResult "Docker 服务检查失败" $false "Docker 可能未启动"
}

# 测试 2: 容器状态检查
Write-Status "检查容器状态..."
$totalTests++
try {
    $containers = docker-compose ps --services
    $runningContainers = docker-compose ps --filter "status=running" --services
    
    if ($containers.Count -eq $runningContainers.Count -and $containers.Count -gt 0) {
        Write-TestResult "所有容器运行正常" $true "运行中的容器: $($runningContainers.Count)"
        $passedTests++
    } else {
        Write-TestResult "容器状态异常" $false "期望: $($containers.Count), 运行中: $($runningContainers.Count)"
    }
} catch {
    Write-TestResult "容器状态检查失败" $false
}

# 测试 3: API 服务健康检查
Write-Status "测试 API 服务健康状态..."
$totalTests++
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-TestResult "API 服务健康检查通过" $true "状态码: $($response.StatusCode)"
        $passedTests++
    } else {
        Write-TestResult "API 服务健康检查失败" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "API 服务连接失败" $false "无法连接到 http://localhost:3000/health"
}

# 测试 4: AI 服务健康检查
Write-Status "测试 AI 服务健康状态..."
$totalTests++
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-TestResult "AI 服务健康检查通过" $true "状态码: $($response.StatusCode)"
        $passedTests++
    } else {
        Write-TestResult "AI 服务健康检查失败" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "AI 服务连接失败" $false "无法连接到 http://localhost:8000/health"
}

# 测试 5: 文本处理功能
Write-Status "测试文本处理功能..."
$totalTests++
try {
    $body = @{
        text = "这是一个测试文本，用于验证系统功能"
        context = "test"
    } | ConvertTo-Json -Compress

    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/process/text" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 30 `
        -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        $result = $response.Content | ConvertFrom-Json
        if ($result.success) {
            Write-TestResult "文本处理功能正常" $true
            $passedTests++
        } else {
            Write-TestResult "文本处理功能异常" $false "API 返回失败状态"
        }
    } else {
        Write-TestResult "文本处理请求失败" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "文本处理功能测试失败" $false $_.Exception.Message
}

# 测试 6: 知识库上传功能
Write-Status "测试知识库上传功能..."
$totalTests++
try {
    # 创建临时测试文件
    $testContent = "这是一个测试文档，用于验证知识库上传功能。包含一些测试关键词：人工智能、机器学习、自然语言处理。"
    $testFile = [System.IO.Path]::GetTempFileName() + ".txt"
    Set-Content -Path $testFile -Value $testContent -Encoding UTF8

    # 准备表单数据
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test-doc.txt`"",
        "Content-Type: text/plain",
        "",
        $testContent,
        "--$boundary",
        "Content-Disposition: form-data; name=`"title`"",
        "",
        "测试文档",
        "--$boundary",
        "Content-Disposition: form-data; name=`"category`"",
        "",
        "测试分类",
        "--$boundary--"
    )
    
    $body = $bodyLines -join $LF
    
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/knowledge/upload" `
        -Method POST `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Body $body `
        -TimeoutSec 30 `
        -UseBasicParsing

    # 清理临时文件
    Remove-Item $testFile -Force -ErrorAction SilentlyContinue

    if ($response.StatusCode -eq 200) {
        $result = $response.Content | ConvertFrom-Json
        if ($result.success) {
            Write-TestResult "知识库上传功能正常" $true
            $passedTests++
        } else {
            Write-TestResult "知识库上传功能异常" $false "API 返回失败状态"
        }
    } else {
        Write-TestResult "知识库上传请求失败" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "知识库上传功能测试失败" $false $_.Exception.Message
}

# 测试 7: 知识库搜索功能
Write-Status "测试知识库搜索功能..."
$totalTests++
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/knowledge/search?q=测试&limit=5" `
        -Method GET `
        -TimeoutSec 15 `
        -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        $result = $response.Content | ConvertFrom-Json
        if ($result.success) {
            Write-TestResult "知识库搜索功能正常" $true "找到 $($result.data.results.Count) 个结果"
            $passedTests++
        } else {
            Write-TestResult "知识库搜索功能异常" $false "API 返回失败状态"
        }
    } else {
        Write-TestResult "知识库搜索请求失败" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "知识库搜索功能测试失败" $false $_.Exception.Message
}

# 测试 8: Nginx 代理功能
Write-Status "测试 Nginx 代理功能..."
$totalTests++
try {
    $response = Invoke-WebRequest -Uri "http://localhost/health" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-TestResult "Nginx 代理功能正常" $true
        $passedTests++
    } else {
        Write-TestResult "Nginx 代理功能异常" $false "状态码: $($response.StatusCode)"
    }
} catch {
    Write-TestResult "Nginx 代理连接失败" $false "可能 Nginx 服务未启动"
}

# 显示测试结果汇总
Write-Host "`n" + "="*50 -ForegroundColor Blue
Write-Host "📊 测试结果汇总" -ForegroundColor Blue
Write-Host "="*50 -ForegroundColor Blue

$successRate = [math]::Round(($passedTests / $totalTests) * 100, 1)

if ($passedTests -eq $totalTests) {
    Write-Host "🎉 所有测试通过！系统运行完全正常。" -ForegroundColor Green
} elseif ($passedTests -ge ($totalTests * 0.8)) {
    Write-Host "⚠️  大部分测试通过，系统基本正常。" -ForegroundColor Yellow
} else {
    Write-Host "❌ 多项测试失败，系统可能存在问题。" -ForegroundColor Red
}

Write-Host "通过率: $passedTests/$totalTests ($successRate%)" -ForegroundColor Cyan

# 提供故障排除建议
if ($passedTests -lt $totalTests) {
    Write-Host "`n🔧 故障排除建议:" -ForegroundColor Yellow
    Write-Host "1. 检查容器状态: docker-compose ps" -ForegroundColor Gray
    Write-Host "2. 查看服务日志: docker-compose logs -f" -ForegroundColor Gray
    Write-Host "3. 重启服务: docker-compose restart" -ForegroundColor Gray
    Write-Host "4. 检查端口占用: netstat -an | findstr `":3000 :8000 :80`"" -ForegroundColor Gray
    Write-Host "5. 查看详细错误: .\test-system.ps1 -Verbose" -ForegroundColor Gray
}

Write-Host "`n测试完成！" -ForegroundColor Blue