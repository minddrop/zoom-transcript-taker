@echo off
setlocal
cd /d "%~dp0"
title Zoom Workplace Auto-Transcript Companion (Windows 11)
color 0B

echo ===================================================================
echo   Zoom Workplace (v7.1.5 Windows 11) Auto-Transcript Suite
echo ===================================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (LTS version) from https://nodejs.org/
    pause
    exit /b 1
)

:: Check dependencies
if not exist node_modules (
    echo [SETUP] Installing required dependencies...
    call npm install
    echo.
)

:: Ensure transcripts folder exists
if not exist transcripts (
    mkdir transcripts
)

echo [START] Starting Zoom Companion Daemon on http://127.0.0.1:3000 ...
echo [INFO] Auto-saving transcripts to: %cd%\transcripts
echo.

:: Open Dashboard in default Windows 11 browser
start http://127.0.0.1:3000/dashboard

:: Start server
node server.js

pause
