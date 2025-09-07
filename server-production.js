#!/usr/bin/env node

// Production server startup
console.log('🚀 Starting Apex AI Backend in production mode...');

// Set production environment
process.env.NODE_ENV = 'production';

// Check if we should use compiled JavaScript or TypeScript
const fs = require('fs');
const path = require('path');

const distServerPath = path.join(__dirname, 'dist', 'server.js');

if (fs.existsSync(distServerPath)) {
  // Use compiled JavaScript if available
  console.log('✅ Running compiled JavaScript from dist/server.js');
  require(distServerPath);
} else {
  // Fallback to TypeScript with ts-node in transpile-only mode
  console.log('⚠️ Compiled files not found, using ts-node with transpile-only mode');
  
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      target: 'es2020',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: false,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: false,
      resolveJsonModule: true,
      noImplicitAny: false,
      moduleResolution: 'node'
    }
  });
  
  require('./server.ts');
}