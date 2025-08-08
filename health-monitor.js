import { spawn, exec } from 'child_process';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const BACKEND_URL = 'http://localhost:3001/api/health';
const CHECK_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RESTART_DELAY = 5000; // 5 seconds

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let backendProcess = null;
let retryCount = 0;

async function checkBackendHealth() {
  try {
    const response = await axios.get(BACKEND_URL, { timeout: 5000 });
    if (response.status === 200) {
      console.log(`✅ ${new Date().toLocaleTimeString()} - Backend is healthy`);
      retryCount = 0;
      return true;
    }
  } catch (error) {
    console.error(`❌ ${new Date().toLocaleTimeString()} - Backend health check failed:`, error.message);
    retryCount++;
  }
  return false;
}

async function startBackend() {
  console.log('🚀 Starting backend server...');
  
  return new Promise((resolve, reject) => {
    backendProcess = spawn('npm', ['run', 'dev'], {
      cwd: '/Users/seanwentz/Desktop/Apex/apps/backend',
      stdio: 'inherit',
      shell: true
    });
    
    backendProcess.on('error', (error) => {
      console.error('❌ Failed to start backend:', error);
      reject(error);
    });
    
    // Give it time to start
    setTimeout(() => {
      console.log('⏳ Waiting for backend to initialize...');
      resolve();
    }, 10000); // 10 seconds
  });
}

async function restartBackend() {
  console.log('🔄 Restarting backend...');
  
  // Kill existing process
  if (backendProcess) {
    console.log('🛑 Stopping existing backend process...');
    backendProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Start new process
  await startBackend();
}

async function logHealthEvent(status, message) {
  try {
    await supabase
      .from('system_health_logs')
      .insert({
        service: 'backend',
        status,
        message,
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log health event:', error);
  }
}

async function monitorLoop() {
  console.log('🏥 Starting health monitor...\n');
  
  while (true) {
    const isHealthy = await checkBackendHealth();
    
    if (!isHealthy) {
      if (retryCount >= MAX_RETRIES) {
        console.log(`⚠️  Backend failed ${MAX_RETRIES} times. Attempting restart...`);
        await logHealthEvent('error', `Backend unresponsive after ${MAX_RETRIES} attempts`);
        
        try {
          await restartBackend();
          await logHealthEvent('recovery', 'Backend restarted successfully');
          retryCount = 0;
        } catch (error) {
          console.error('❌ Failed to restart backend:', error);
          await logHealthEvent('critical', 'Failed to restart backend');
        }
      }
    }
    
    // Also check recent calls processing
    const { data: recentCalls } = await supabase
      .from('calls')
      .select('id, created_at, status, transcript')
      .eq('status', 'processing')
      .gt('created_at', new Date(Date.now() - 300000).toISOString()) // Last 5 minutes
      .order('created_at', { ascending: false });
    
    if (recentCalls && recentCalls.length > 0) {
      console.log(`📞 ${recentCalls.length} calls currently processing`);
    }
    
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down health monitor...');
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Start monitoring
monitorLoop().catch(console.error);