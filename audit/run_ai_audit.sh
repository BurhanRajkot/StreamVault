#!/bin/bash

# Configuration
CONFIG_PATH="./audit/promptfoo.yaml"
EVAL_SERVER="./audit/scripts/eval-server.ts"
REDTEAM_OUT="./audit/redteam.yaml"

echo "🚀 Starting StreamVault AI Red Team Audit..."

# 1. Start the evaluation server in the background
echo "📡 Starting Mock Evaluation Server..."
bun $EVAL_SERVER > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
sleep 3

# 2. Run the Red Team scan
echo "🕵️  Running Promptfoo Red Team Scan (Whole App)..."
npx promptfoo@latest redteam run --config $CONFIG_PATH

# 3. Cleanup
echo "🧹 Cleaning up..."
kill $SERVER_PID

echo "✅ AI Audit Complete! View results using: npx promptfoo@latest view"
