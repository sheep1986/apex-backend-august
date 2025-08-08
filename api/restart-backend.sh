#!/bin/bash

# Kill existing backend process
echo "🛑 Stopping backend server..."
pkill -f "node.*backend.*server.ts"

# Wait a moment
sleep 2

# Start backend from the correct directory
echo "🚀 Starting backend server..."
cd /Users/seanwentz/Desktop/Apex && pnpm dev

echo "✅ Backend restart complete!"