@echo off
cd /d %~dp0
if not exist node_modules (
  echo 正在安装依赖...
  call npm install
)
echo 正在打包并启动术语本：http://127.0.0.1:3780
call npm run build
call npm start
