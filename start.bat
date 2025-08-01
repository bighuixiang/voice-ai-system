@echo off
chcp 65001 >nul
title Voice AI Decision System - 一键启动

echo.
echo ========================================
echo   Voice AI Decision System 一键启动
echo ========================================
echo.

REM 检查 PowerShell 是否可用
powershell -Command "Get-Host" >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] PowerShell 不可用，请使用 Windows 10 或更高版本
    pause
    exit /b 1
)

REM 检查是否存在启动脚本
if not exist "start-windows.ps1" (
    echo [错误] 未找到 start-windows.ps1 脚本文件
    pause
    exit /b 1
)

echo [信息] 正在启动系统...
echo.

REM 执行 PowerShell 脚本
powershell -ExecutionPolicy Bypass -File "start-windows.ps1"

echo.
echo 按任意键退出...
pause >nul