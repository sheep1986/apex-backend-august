#!/bin/bash

# Script to run the monitor with proper environment variables

echo "🚀 Starting Apex Call Monitor..."
echo "This will monitor all incoming calls and show AI processing status"
echo "Press Ctrl+C to stop"
echo ""

# Change to backend directory
cd /Users/seanwentz/Desktop/Apex/apps/backend

# Export environment variables
export $(grep -v '^#' .env | xargs)

# Run the monitor
node api/test-automation-check.js