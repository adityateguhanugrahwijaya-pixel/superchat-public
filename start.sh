#!/usr/bin/env bash

# =================================================================
# 🚀 SuperChat 1-Click Installer & Launcher for Linux & macOS
# =================================================================

set -e

echo ""
echo "================================================================="
echo "   ⚡ SuperChat - Private AI Workspace and LLM Router Client"
echo "================================================================="
echo ""

# 1. Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js (v18 or higher) from https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✓ Node.js $(node -v) detected."

# 2. Check and install dependencies
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing project dependencies (npm install)..."
    npm install
else
    echo "✓ Dependencies already installed."
fi

# 3. Environment & AppConfig Wizard
if [ ! -f ".env.local" ] && [ ! -f "appconfig.json" ]; then
    echo ""
    echo "================================================================="
    echo "⚙️  FIRST-TIME SETUP WIZARD"
    echo "================================================================="
    echo ""
    echo "🔑 Need a Bynara AI Router API Key?"
    echo "👉 Visit: https://router.bynara.id/register?ref=VTP3U9TU to sign up and copy your API key."
    echo ""
    echo ""
    read -p "Enter Admin Email [default: admin@superchat.local]: " INPUT_EMAIL
    ADMIN_EMAIL=${INPUT_EMAIL:-admin@superchat.local}

    read -p "Enter Admin Name [default: SuperChat Admin]: " INPUT_NAME
    ADMIN_NAME=${INPUT_NAME:-SuperChat Admin}

    read -p "Enter Admin Password [default: AdminPassword123!]: " INPUT_PASS
    ADMIN_PASSWORD=${INPUT_PASS:-AdminPassword123!}

    BYNARA_KEY=""
    while [ -z "$BYNARA_KEY" ]; do
        read -p "Enter Bynara API Key (Required): " BYNARA_KEY
        if [ -z "$BYNARA_KEY" ]; then
            echo "❌ Bynara API Key is required to connect to AI models! Get your key at https://router.bynara.id/register?ref=VTP3U9TU"
        fi
    done

    AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "superchat_secret_key_bynara_auth_32bytes_min")

    cat <<EOF > appconfig.json
{
  "admin": {
    "email": "${ADMIN_EMAIL}",
    "name": "${ADMIN_NAME}",
    "password": "${ADMIN_PASSWORD}"
  }
}
EOF
    echo "✓ Created appconfig.json (Admin account configuration)."

    cat <<EOF > .env.local
# SuperChat Environment Configuration
BYNARA_API_KEY=${BYNARA_KEY}
BETTER_AUTH_SECRET=${AUTH_SECRET}
BETTER_AUTH_URL=http://localhost:3000
SQLITE_PATH=local.db
EOF
    echo "✓ Created .env.local (API Key & Auth Secret configuration)."
else
    echo "✓ Configuration file found (.env.local / appconfig.json)."
fi

# 4. Build application if missing or incomplete
if [ ! -f ".next/BUILD_ID" ]; then
    echo ""
    echo "🔨 Building production app (npm run build)..."
    npm run build
fi

# 5. Start SuperChat production server
echo ""
echo "================================================================="
echo "🎉 Launching SuperChat server on http://localhost:3000"
echo "================================================================="
echo ""

if command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open http://localhost:3000) &
elif command -v open &> /dev/null; then
    (sleep 2 && open http://localhost:3000) &
fi

npm run start
