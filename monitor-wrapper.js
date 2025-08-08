#!/usr/bin/env node

// Load environment variables
require('dotenv').config({ path: __dirname + '/.env' });

// Now run the monitor
require('./api/test-automation-check.js');