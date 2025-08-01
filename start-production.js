#!/usr/bin/env node

// Simple production start script that uses the existing compiled files
console.log('🚀 Starting Apex AI Backend in production mode...');

// Set production environment
process.env.NODE_ENV = 'production';

// Start the server
require('./dist/server.js');