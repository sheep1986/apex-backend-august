const serverless = require('serverless-http');

// Load the simple server app
const app = require('../../simple-server');

// Export handler for Netlify Functions
exports.handler = serverless(app);