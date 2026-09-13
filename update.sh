#!/usr/bin/env sh

# =================================================================
# ⚡ SuperChat Automatic Updater Launcher for Linux & macOS & Termux
# =================================================================

set -e

echo ""
echo "================================================================="
echo "   ⚡ SuperChat Auto-Updater Execution Script"
echo "================================================================="
echo ""

echo "⏳ Waiting 2 seconds for main SuperChat process to release file locks..."
sleep 2

UPDATE_FILE=".updates/latest.zip"

if [ ! -f "$UPDATE_FILE" ]; then
    echo "❌ Update package file ($UPDATE_FILE) not found."
    exit 1
fi

echo "📦 Extracting update package..."
if command -v unzip >/dev/null 2>&1; then
    unzip -o "$UPDATE_FILE" -d .
else
    echo "⚠️ unzip command not found; using python zipfile module..."
    python3 -c "import zipfile; zipfile.ZipFile('$UPDATE_FILE').extractall('.')"
fi

echo "🧹 Processing deleted files manifest (delete.txt)..."
if [ -f "delete.txt" ]; then
    while read -r file || [ -n "$file" ]; do
        # Ignore comments and empty lines
        case "$file" in
            \#*|"") continue ;;
        esac
        if [ -f "$file" ]; then
            echo "  - Removing deprecated file: $file"
            rm -f "$file"
        fi
    done < delete.txt
    rm -f delete.txt
fi

echo "🧹 Cleaning up temporary update directory..."
rm -rf .updates

echo "✓ Update files applied successfully!"
echo "🚀 Restarting SuperChat..."

if [ -f "start.sh" ]; then
    chmod +x start.sh
    exec ./start.sh
else
    exec npm run start
fi
