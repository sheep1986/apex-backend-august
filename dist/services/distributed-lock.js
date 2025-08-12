"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedLock = void 0;
exports.getLockService = getLockService;
const ioredis_1 = __importDefault(require("ioredis"));
const uuid_1 = require("uuid");
class DistributedLock {
    constructor() {
        this.defaultTTL = 60000;
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => Math.min(times * 50, 2000),
        });
    }
    async acquire(key, ttl = this.defaultTTL) {
        const token = (0, uuid_1.v4)();
        const lockKey = `lock:${key}`;
        try {
            const result = await this.redis.set(lockKey, token, 'PX', ttl, 'NX');
            return result === 'OK' ? token : null;
        }
        catch (error) {
            console.error(`❌ Failed to acquire lock for ${key}:`, error);
            return null;
        }
    }
    async release(key, token) {
        const lockKey = `lock:${key}`;
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
        }
        catch (error) {
            console.error(`❌ Failed to release lock for ${key}:`, error);
            return false;
        }
    }
    async extend(key, token, ttl) {
        const lockKey = `lock:${key}`;
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
        }
        catch (error) {
            console.error(`❌ Failed to extend lock for ${key}:`, error);
            return false;
        }
    }
    async acquireWithRetry(key, maxAttempts = 3, retryDelay = 1000, ttl = this.defaultTTL) {
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
    async withLock(key, fn, ttl = this.defaultTTL) {
        const token = await this.acquire(key, ttl);
        if (!token) {
            console.log(`⚠️ Could not acquire lock for ${key}`);
            return null;
        }
        try {
            console.log(`🔒 Lock acquired for ${key}`);
            const result = await fn();
            return result;
        }
        finally {
            await this.release(key, token);
            console.log(`🔓 Lock released for ${key}`);
        }
    }
    async isLocked(key) {
        const lockKey = `lock:${key}`;
        const exists = await this.redis.exists(lockKey);
        return exists === 1;
    }
    async forceRelease(key) {
        const lockKey = `lock:${key}`;
        const result = await this.redis.del(lockKey);
        return result === 1;
    }
    async getTTL(key) {
        const lockKey = `lock:${key}`;
        const ttl = await this.redis.pttl(lockKey);
        return ttl > 0 ? ttl : 0;
    }
    async close() {
        await this.redis.quit();
    }
}
exports.DistributedLock = DistributedLock;
let lockInstance = null;
function getLockService() {
    if (!lockInstance) {
        lockInstance = new DistributedLock();
    }
    return lockInstance;
}
exports.default = DistributedLock;
