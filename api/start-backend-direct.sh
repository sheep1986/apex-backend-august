#!/bin/bash

echo "🚀 Starting backend server directly..."

# Kill any existing processes on port 3001
lsof -ti:3001 | xargs kill -9 2>/dev/null

# Navigate to backend directory
cd /Users/seanwentz/Desktop/Apex/apps/backend

# Start the server in background
nohup pnpm run dev > backend.log 2>&1 &

# Get the PID
BACKEND_PID=$!

echo "✅ Backend started with PID: $BACKEND_PID"
echo "📝 Logs are in: /Users/seanwentz/Desktop/Apex/apps/backend/backend.log"

# Wait a bit for server to start
sleep 5

# Check if it's running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend is running!"
    echo "🔍 Testing health endpoint..."
    curl -s http://localhost:3001/api/health | head -1
else
    echo "❌ Backend failed to start. Check backend.log for errors"
    tail -20 /Users/seanwentz/Desktop/Apex/apps/backend/backend.log
fi