#!/bin/bash

# Kill any existing simple-server.js processes
echo "🔍 Checking for simple-server.js processes..."
if pgrep -f "simple-server.js" > /dev/null; then
    echo "⚠️  Found simple-server.js running - killing it..."
    pkill -f "simple-server.js"
    sleep 2
fi

# Kill any existing TypeScript server processes
if pgrep -f "ts-node.*server.ts" > /dev/null; then
    echo "⚠️  Found existing TypeScript server - restarting..."
    pkill -f "ts-node.*server.ts"
    sleep 2
fi

# Start the correct server
echo "🚀 Starting TypeScript development server..."
pnpm dev