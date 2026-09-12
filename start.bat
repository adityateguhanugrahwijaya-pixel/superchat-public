@echo off
title SuperChat Launcher
cls

echo =================================================================
echo    SuperChat - Private AI Workspace and LLM Router Client
echo =================================================================
echo.

:: 1. Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 goto NO_NODE
goto CHECK_DEPS

:NO_NODE
echo [X] Node.js is not installed.
echo     Please install Node.js v18 or higher from https://nodejs.org/
pause
exit /b 1

:CHECK_DEPS
if exist "node_modules\" goto CHECK_CONFIG
echo.
echo Installing project dependencies with npm install...
call npm install

:CHECK_CONFIG
if exist ".env.local" goto BUILD_APP
if exist "appconfig.json" goto BUILD_APP

echo.
echo =================================================================
echo   FIRST-TIME SETUP WIZARD
echo =================================================================
echo.
echo Need a Bynara AI Router API Key?
echo Visit: https://router.bynara.id/register?ref=VTP3U9TU to sign up and copy your API key.
echo.

set "ADMIN_EMAIL=admin@superchat.local"
set "ADMIN_NAME=SuperChat Admin"
set "ADMIN_PASSWORD=AdminPassword123!"
set "BYNARA_KEY="
set /p "INPUT_EMAIL=Enter Admin Email [default: admin@superchat.local]: "
if not "%INPUT_EMAIL%"=="" set "ADMIN_EMAIL=%INPUT_EMAIL%"

set /p "INPUT_NAME=Enter Admin Name [default: SuperChat Admin]: "
if not "%INPUT_NAME%"=="" set "ADMIN_NAME=%INPUT_NAME%"

set /p "INPUT_PASS=Enter Admin Password [default: AdminPassword123!]: "
if not "%INPUT_PASS%"=="" set "ADMIN_PASSWORD=%INPUT_PASS%"

:PROMPT_KEY
set "INPUT_KEY="
set /p "INPUT_KEY=Enter Bynara API Key (Required): "
if "%INPUT_KEY%"=="" (
    echo [X] Bynara API Key is required to connect to AI models! Get key at: https://router.bynara.id/register?ref=VTP3U9TU
    goto PROMPT_KEY
)
set "BYNARA_KEY=%INPUT_KEY%"

(
    echo {
    echo   "admin": {
    echo     "email": "%ADMIN_EMAIL%",
    echo     "name": "%ADMIN_NAME%",
    echo     "password": "%ADMIN_PASSWORD%"
    echo   }
    echo }
) > appconfig.json
echo [OK] Created appconfig.json (Admin account configuration).

set "AUTH_SECRET=superchat_secret_key_bynara_auth_32bytes_random_hex_secret"
for /f "tokens=*" %%a in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2^>nul') do set "AUTH_SECRET=%%a"

(
    echo # SuperChat Environment Configuration
    echo BYNARA_API_KEY=%BYNARA_KEY%
    echo BETTER_AUTH_SECRET=%AUTH_SECRET%
    echo BETTER_AUTH_URL=http://localhost:3000
    echo SQLITE_PATH=local.db
) > .env.local
echo [OK] Created .env.local (API Key & Auth Secret configuration).

:BUILD_APP
if exist ".next\BUILD_ID" goto LAUNCH_APP
echo.
echo Building production app (npm run build)...
call npm run build

:LAUNCH_APP
echo.
echo =================================================================
echo   Launching SuperChat server on http://localhost:3000
echo =================================================================
echo.

start "" "http://localhost:3000"
call npm run start
pause
