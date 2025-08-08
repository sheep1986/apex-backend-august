import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

/**
 * Distributed Locking Service
 * Based on Redis Redlock algorithm recommended by GPT5 and Claude 4.1
 */

export class DistributedLock {
  private redis: Redis;
  private defaultTTL: number = 60000; // 60 seconds default

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  /**
   * Acquire a distributed lock
   * @param key - The resource key to lock
   * @param ttl - Time to live in milliseconds
   * @returns Lock token if acquired, null if not
   */
  async acquire(key: string, ttl: number = this.defaultTTL): Promise<string | null> {
    const token = uuidv4();
    const lockKey = `lock:${key}`;
    
    try {
      // SET key value NX PX ttl
      const result = await this.redis.set(
        lockKey,
        token,
        'PX',
        ttl,
        'NX'
      );
      
      return result === 'OK' ? token : null;
    } catch (error) {
      console.error(`❌ Failed to acquire lock for ${key}:`, error);
      return null;
    }
  }

  /**
   * Release a distributed lock
   * @param key - The resource key to unlock
   * @param token - The lock token to verify ownership
   */
  async release(key: string, token: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    // Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.redis.eval(script, 1, lockKey, token);
      return result === 1;
    } catch (error) {
      console.error(`❌ Failed to release lock for ${key}:`, error);
      return false;
    }
  }

  /**
   * Extend a lock's TTL
   * @param key - The resource key
   * @param token - The lock token
   * @param ttl - New TTL in milliseconds
   */
  async extend(key: string, token: string, ttl: number): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    // Lua script to extend only if we own the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.redis.eval(script, 1, lockKey, token, ttl);
      return result === 1;
    } catch (error) {
      console.error(`❌ Failed to extend lock for ${key}:`, error);
      return false;
    }
  }

  /**
   * Try to acquire lock with retries
   * @param key - The resource key
   * @param maxAttempts - Maximum number of attempts
   * @param retryDelay - Delay between retries in ms
   */
  async acquireWithRetry(
    key: string,
    maxAttempts: number = 3,
    retryDelay: number = 1000,
    ttl: number = this.defaultTTL
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const token = await this.acquire(key, ttl);
      
      if (token) {
        return token;
      }
      
      if (attempt < maxAttempts) {
        console.log(`⏳ Lock busy for ${key}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    console.log(`❌ Failed to acquire lock for ${key} after ${maxAttempts} attempts`);
    return null;
  }

  /**
   * Execute a function with a distributed lock
   * @param key - The resource key
   * @param fn - The function to execute
   * @param ttl - Lock TTL in milliseconds
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T | null> {
    const token = await this.acquire(key, ttl);
    
    if (!token) {
      console.log(`⚠️ Could not acquire lock for ${key}`);
      return null;
    }
    
    try {
      console.log(`🔒 Lock acquired for ${key}`);
      const result = await fn();
      return result;
    } finally {
      await this.release(key, token);
      console.log(`🔓 Lock released for ${key}`);
    }
  }

  /**
   * Check if a lock exists
   * @param key - The resource key
   */
  async isLocked(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const exists = await this.redis.exists(lockKey);
    return exists === 1;
  }

  /**
   * Force release a lock (use with caution)
   * @param key - The resource key
   */
  async forceRelease(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const result = await this.redis.del(lockKey);
    return result === 1;
  }

  /**
   * Get remaining TTL for a lock
   * @param key - The resource key
   */
  async getTTL(key: string): Promise<number> {
    const lockKey = `lock:${key}`;
    const ttl = await this.redis.pttl(lockKey);
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let lockInstance: DistributedLock | null = null;

export function getLockService(): DistributedLock {
  if (!lockInstance) {
    lockInstance = new DistributedLock();
  }
  return lockInstance;
}

export default DistributedLock;