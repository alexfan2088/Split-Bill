@echo off
REM 数据库备份云函数部署脚本 (Windows)

echo 开始部署数据库备份云函数...

REM 检查是否已登录
tcb whoami >nul 2>&1
if errorlevel 1 (
    echo 请先登录腾讯云：
    echo tcb login
    exit /b 1
)

REM 部署备份云函数
echo 1. 部署 database-backup 云函数...
cd cloudfunctions\database-backup
if not exist "node_modules" (
    echo    安装依赖...
    call npm install
)
cd ..\..
call tcb fn deploy database-backup

REM 部署导入云函数
echo 2. 部署 database-import 云函数...
cd cloudfunctions\database-import
if not exist "node_modules" (
    echo    安装依赖...
    call npm install
)
cd ..\..
call tcb fn deploy database-import

echo.
echo 部署完成！
echo.
echo 下一步：
echo 1. 在腾讯云开发控制台配置定时触发器
echo 2. 触发器配置：每天凌晨3:00 (Cron: 0 3 * * *)
echo 3. 详细说明请查看 README_数据库备份.md

pause

