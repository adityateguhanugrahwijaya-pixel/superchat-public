@echo off
rem =================================================================
rem ⚡ SuperChat Automatic Updater Launcher for Windows
rem =================================================================

title SuperChat Auto-Updater Execution

echo.
echo =================================================================
echo    ⚡ SuperChat Auto-Updater Execution Script
echo =================================================================
echo.

echo ⏳ Waiting 2 seconds for main SuperChat process to release file locks...
timeout /t 2 /nobreak >nul

set "UPDATE_FILE=.updates\latest.zip"

if not exist "%UPDATE_FILE%" (
    echo ❌ Update package file (%UPDATE_FILE%) not found.
    pause
    exit /b 1
)

echo 📦 Extracting update package...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%UPDATE_FILE%' -DestinationPath '.' -Force"

if exist "delete.txt" (
    echo 🧹 Processing deleted files manifest (delete.txt)...
    for /f "usebackq tokens=*" %%A in ("delete.txt") do (
        set "LINE=%%A"
        if not "!LINE:~0,1!"=="#" (
            if exist "%%A" (
                echo   - Removing deprecated file: %%A
                del /f /q "%%A"
            )
        )
    )
    del /f /q delete.txt
)

echo 🧹 Cleaning up temporary update directory...
if exist .updates rmdir /s /q .updates

echo ✓ Update files applied successfully!
echo 🚀 Restarting SuperChat...

if exist start.bat (
    call start.bat
) else (
    npm run start
)
