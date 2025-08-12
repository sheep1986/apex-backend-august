#!/usr/bin/env node

// Production server startup with transpile-only mode
console.log('🚀 Starting Apex AI Backend in production mode...');

// Set production environment
process.env.NODE_ENV = 'production';

// Register ts-node with transpile-only for production
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
    noImplicitAny: false
  }
});

// Start the server
require('./server.ts');