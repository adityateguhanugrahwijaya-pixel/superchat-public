@echo off
title SuperChat Launcher
cls

echo =================================================================
echo    ⚡ SuperChat - Private AI Workspace & LLM Router Client
echo =================================================================
echo.

:: 1. Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed.
    echo    Please install Node.js (v18 or higher) from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check dependencies
if not exist "node_modules\" (
    echo.
    echo 📦 Installing project dependencies (npm install)...
    call npm install
) else (
    echo ✓ Dependencies already installed.
)

:: 3. Setup Wizard if neither .env.local nor appconfig.json exists
if not exist ".env.local" if not exist "appconfig.json" (
    echo.
    echo =================================================================
    echo ⚙️  FIRST-TIME SETUP WIZARD
    echo =================================================================
    echo.
    echo 🔑 Need a Bynara AI Router API Key?
    echo 👉 Visit: https://router.bynara.id/ to sign up and copy your API key.
    echo.
    
    set "ADMIN_EMAIL=admin@superchat.local"
    set "ADMIN_NAME=SuperChat Admin"
    set "ADMIN_PASSWORD=AdminPassword123!"
    set "BYNARA_KEY="
    set "CHOICE=1"

    echo Select Configuration Format:
    echo   1) .env.local (Environment Variables File - Recommended)
    echo   2) appconfig.json (JSON Configuration File)
    echo   3) Both (.env.local + appconfig.json)
    set /p "CHOICE=Select choice [1-3, default: 1]: "

    set /p "INPUT_EMAIL=Enter Admin Email [default: admin@superchat.local]: "
    if not "%INPUT_EMAIL%"=="" set "ADMIN_EMAIL=%INPUT_EMAIL%"

    set /p "INPUT_NAME=Enter Admin Name [default: SuperChat Admin]: "
    if not "%INPUT_NAME%"=="" set "ADMIN_NAME=%INPUT_NAME%"

    set /p "INPUT_PASS=Enter Admin Password [default: AdminPassword123!]: "
    if not "%INPUT_PASS%"=="" set "ADMIN_PASSWORD=%INPUT_PASS%"

    set /p "INPUT_KEY=Enter Bynara API Key (Optional - press Enter to skip): "
    if not "%INPUT_KEY%"=="" set "BYNARA_KEY=%INPUT_KEY%"

    if "%CHOICE%"=="1" goto CREATE_ENV
    if "%CHOICE%"=="3" goto CREATE_ENV
    goto CREATE_JSON

:CREATE_ENV
    (
        echo # SuperChat Environment Configuration
        echo ADMIN_EMAIL=%ADMIN_EMAIL%
        echo ADMIN_NAME=%ADMIN_NAME%
        echo ADMIN_PASSWORD=%ADMIN_PASSWORD%
        echo BYNARA_API_KEY=%BYNARA_KEY%
        echo SQLITE_PATH=local.db
        echo BETTER_AUTH_URL=http://localhost:3000
    ) > .env.local
    echo ✓ Created .env.local configuration file.
    if "%CHOICE%"=="1" goto DONE_CONFIG

:CREATE_JSON
    (
        echo {
        echo   "admin": {
        echo     "email": "%ADMIN_EMAIL%",
        echo     "name": "%ADMIN_NAME%",
        echo     "password": "%ADMIN_PASSWORD%"
        echo   },
        echo   "bynaraApiKey": "%BYNARA_KEY%",
        echo   "sqlitePath": "local.db"
        echo }
    ) > appconfig.json
    echo ✓ Created appconfig.json configuration file.

:DONE_CONFIG
    echo.
) else (
    echo ✓ Configuration found (.env.local / appconfig.json).
)

:: 4. Build application if missing
if not exist ".next\" (
    echo.
    echo 🔨 Building production app (npm run build)...
    call npm run build
)

:: 5. Launch app & open browser
echo.
echo =================================================================
echo 🎉 Launching SuperChat server on http://localhost:3000
echo =================================================================
echo.

start "" "http://localhost:3000"
call npm run start
pause
