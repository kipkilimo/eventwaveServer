import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import { ICacheService } from '../../types/services';
import { ServiceError } from '../../types/services';

/**
 * Redis Cache Service Implementation
 * Provides caching functionality with Redis backend
 */
export class RedisCache implements ICacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private defaultTTL = 3600; // 1 hour in seconds

  /**
   * Connect to Redis server
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      console.log('[RedisCache] Already connected to Redis');
      return;
    }

    try {
      const redisOptions: RedisClientOptions = {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries: number) => {
            // Exponential backoff with max delay of 10 seconds
            const delay = Math.min(retries * 100, 10000);
            console.log(`[RedisCache] Reconnecting in ${delay}ms...`);
            return delay;
          },
        },
      };

      // Add password if provided
      if (process.env.REDIS_PASSWORD) {
        redisOptions.password = process.env.REDIS_PASSWORD;
      }

      // Create Redis client
      this.client = createClient(redisOptions);

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await this.client.connect();
      
      this.isConnected = true;
      console.log('[RedisCache] Connected to Redis successfully');
    } catch (error) {
      console.error('[RedisCache] Failed to connect to Redis:', error);
      throw new ServiceError(
        'REDIS_CONNECTION_FAILED',
        'Failed to connect to Redis',
        error
      );
    }
  }

  /**
   * Disconnect from Redis server
   */
  async disconnect(): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.log('[RedisCache] Not connected to Redis');
      return;
    }

    try {
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
      console.log('[RedisCache] Disconnected from Redis');
    } catch (error) {
      console.error('[RedisCache] Error disconnecting from Redis:', error);
      throw new ServiceError(
        'REDIS_DISCONNECT_FAILED',
        'Failed to disconnect from Redis',
        error
      );
    }
  }

  /**
   * Set up Redis client event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('[RedisCache] Redis client connecting...');
    });

    this.client.on('ready', () => {
      console.log('[RedisCache] Redis client ready');
    });

    this.client.on('end', () => {
      console.log('[RedisCache] Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('error', (error) => {
      console.error('[RedisCache] Redis client error:', error);
    });

    this.client.on('reconnecting', () => {
      console.log('[RedisCache] Redis client reconnecting...');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    await this.ensureConnection();

    try {
      const value = await this.client!.get(key);
      
      if (!value) {
        return null;
      }

      // Try to parse as JSON, fall back to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      console.error(`[RedisCache] Error getting key "${key}":`, error);
      throw new ServiceError(
        'REDIS_GET_ERROR',
        `Failed to get value for key: ${key}`,
        error
      );
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.ensureConnection();

    try {
      const stringValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);
      
      const actualTTL = ttl || this.defaultTTL;
      
      if (actualTTL > 0) {
        await this.client!.setEx(key, actualTTL, stringValue);
      } else {
        await this.client!.set(key, stringValue);
      }
      
      console.log(`[RedisCache] Set key "${key}" with TTL ${actualTTL}s`);
    } catch (error) {
      console.error(`[RedisCache] Error setting key "${key}":`, error);
      throw new ServiceError(
        'REDIS_SET_ERROR',
        `Failed to set value for key: ${key}`,
        error
      );
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    await this.ensureConnection();

    try {
      const result = await this.client!.del(key);
      console.log(`[RedisCache] Deleted key "${key}" (${result} keys removed)`);
    } catch (error) {
      console.error(`[RedisCache] Error deleting key "${key}":`, error);
      throw new ServiceError(
        'REDIS_DELETE_ERROR',
        `Failed to delete key: ${key}`,
        error
      );
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    await this.ensureConnection();

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[RedisCache] Error checking existence of key "${key}":`, error);
      throw new ServiceError(
        'REDIS_EXISTS_ERROR',
        `Failed to check existence of key: ${key}`,
        error
      );
    }
  }

  /**
   * Increment value (for counters)
   */
  async increment(key: string, by: number = 1): Promise<number> {
    await this.ensureConnection();

    try {
      const result = await this.client!.incrBy(key, by);
      console.log(`[RedisCache] Incremented key "${key}" by ${by}, new value: ${result}`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error incrementing key "${key}":`, error);
      throw new ServiceError(
        'REDIS_INCREMENT_ERROR',
        `Failed to increment key: ${key}`,
        error
      );
    }
  }

  /**
   * Decrement value (for counters)
   */
  async decrement(key: string, by: number = 1): Promise<number> {
    await this.ensureConnection();

    try {
      const result = await this.client!.decrBy(key, by);
      console.log(`[RedisCache] Decremented key "${key}" by ${by}, new value: ${result}`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error decrementing key "${key}":`, error);
      throw new ServiceError(
        'REDIS_DECREMENT_ERROR',
        `Failed to decrement key: ${key}`,
        error
      );
    }
  }

  /**
   * Add member to set
   */
  async sAdd(key: string, member: string | string[]): Promise<number> {
    await this.ensureConnection();

    try {
      const members = Array.isArray(member) ? member : [member];
      const result = await this.client!.sAdd(key, members);
      console.log(`[RedisCache] Added ${members.length} member(s) to set "${key}"`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error adding to set "${key}":`, error);
      throw new ServiceError(
        'REDIS_SADD_ERROR',
        `Failed to add to set: ${key}`,
        error
      );
    }
  }

  /**
   * Remove member from set
   */
  async sRem(key: string, member: string | string[]): Promise<number> {
    await this.ensureConnection();

    try {
      const members = Array.isArray(member) ? member : [member];
      const result = await this.client!.sRem(key, members);
      console.log(`[RedisCache] Removed ${members.length} member(s) from set "${key}"`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error removing from set "${key}":`, error);
      throw new ServiceError(
        'REDIS_SREM_ERROR',
        `Failed to remove from set: ${key}`,
        error
      );
    }
  }

  /**
   * Get all members of set
   */
  async sMembers(key: string): Promise<string[]> {
    await this.ensureConnection();

    try {
      const members = await this.client!.sMembers(key);
      return members;
    } catch (error) {
      console.error(`[RedisCache] Error getting set members for "${key}":`, error);
      throw new ServiceError(
        'REDIS_SMEMBERS_ERROR',
        `Failed to get set members: ${key}`,
        error
      );
    }
  }

  /**
   * Check if member exists in set
   */
  async sIsMember(key: string, member: string): Promise<boolean> {
    await this.ensureConnection();

    try {
      const result = await this.client!.sIsMember(key, member);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error checking set membership for "${key}":`, error);
      throw new ServiceError(
        'REDIS_SISMEMBER_ERROR',
        `Failed to check set membership: ${key}`,
        error
      );
    }
  }

  /**
   * Get set size
   */
  async sCard(key: string): Promise<number> {
    await this.ensureConnection();

    try {
      const size = await this.client!.sCard(key);
      return size;
    } catch (error) {
      console.error(`[RedisCache] Error getting set size for "${key}":`, error);
      throw new ServiceError(
        'REDIS_SCARD_ERROR',
        `Failed to get set size: ${key}`,
        error
      );
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    await this.ensureConnection();

    try {
      const keys = await this.client!.keys(pattern);
      return keys;
    } catch (error) {
      console.error(`[RedisCache] Error getting keys for pattern "${pattern}":`, error);
      throw new ServiceError(
        'REDIS_KEYS_ERROR',
        `Failed to get keys for pattern: ${pattern}`,
        error
      );
    }
  }

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    await this.ensureConnection();

    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client!.del(keys);
      console.log(`[RedisCache] Deleted ${result} keys matching pattern "${pattern}"`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error deleting keys for pattern "${pattern}":`, error);
      throw new ServiceError(
        'REDIS_DELETE_PATTERN_ERROR',
        `Failed to delete keys for pattern: ${pattern}`,
        error
      );
    }
  }

  /**
   * Set hash field value
   */
  async hSet(key: string, field: string, value: any): Promise<void> {
    await this.ensureConnection();

    try {
      const stringValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);
      
      await this.client!.hSet(key, field, stringValue);
      console.log(`[RedisCache] Set hash field "${field}" for key "${key}"`);
    } catch (error) {
      console.error(`[RedisCache] Error setting hash field "${field}" for key "${key}":`, error);
      throw new ServiceError(
        'REDIS_HSET_ERROR',
        `Failed to set hash field: ${key}.${field}`,
        error
      );
    }
  }

  /**
   * Get hash field value
   */
  async hGet<T>(key: string, field: string): Promise<T | null> {
    await this.ensureConnection();

    try {
      const value = await this.client!.hGet(key, field);
      
      if (!value) {
        return null;
      }

      // Try to parse as JSON, fall back to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      console.error(`[RedisCache] Error getting hash field "${field}" for key "${key}":`, error);
      throw new ServiceError(
        'REDIS_HGET_ERROR',
        `Failed to get hash field: ${key}.${field}`,
        error
      );
    }
  }

  /**
   * Get all hash fields and values
   */
  async hGetAll(key: string): Promise<Record<string, any>> {
    await this.ensureConnection();

    try {
      const hash = await this.client!.hGetAll(key);
      const result: Record<string, any> = {};

      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }

      return result;
    } catch (error) {
      console.error(`[RedisCache] Error getting all hash fields for key "${key}":`, error);
      throw new ServiceError(
        'REDIS_HGETALL_ERROR',
        `Failed to get all hash fields: ${key}`,
        error
      );
    }
  }

  /**
   * Delete hash field
   */
  async hDel(key: string, field: string | string[]): Promise<number> {
    await this.ensureConnection();

    try {
      const fields = Array.isArray(field) ? field : [field];
      const result = await this.client!.hDel(key, fields);
      console.log(`[RedisCache] Deleted ${fields.length} field(s) from hash "${key}"`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error deleting hash field(s) from key "${key}":`, error);
      throw new ServiceError(
        'REDIS_HDEL_ERROR',
        `Failed to delete hash field(s): ${key}`,
        error
      );
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    await this.ensureConnection();

    try {
      const ttl = await this.client!.ttl(key);
      return ttl;
    } catch (error) {
      console.error(`[RedisCache] Error getting TTL for key "${key}":`, error);
      throw new ServiceError(
        'REDIS_TTL_ERROR',
        `Failed to get TTL for key: ${key}`,
        error
      );
    }
  }

  /**
   * Set TTL for key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    await this.ensureConnection();

    try {
      const result = await this.client!.expire(key, ttl);
      console.log(`[RedisCache] Set TTL ${ttl}s for key "${key}"`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error setting TTL for key "${key}":`, error);
      throw new ServiceError(
        'REDIS_EXPIRE_ERROR',
        `Failed to set TTL for key: ${key}`,
        error
      );
    }
  }

  /**
   * Remove TTL from key (make persistent)
   */
  async persist(key: string): Promise<boolean> {
    await this.ensureConnection();

    try {
      const result = await this.client!.persist(key);
      console.log(`[RedisCache] Made key "${key}" persistent`);
      return result;
    } catch (error) {
      console.error(`[RedisCache] Error making key "${key}" persistent:`, error);
      throw new ServiceError(
        'REDIS_PERSIST_ERROR',
        `Failed to make key persistent: ${key}`,
        error
      );
    }
  }

  /**
   * Flush all cache data
   */
  async flushAll(): Promise<void> {
    await this.ensureConnection();

    try {
      await this.client!.flushAll();
      console.log('[RedisCache] Flushed all cache data');
    } catch (error) {
      console.error('[RedisCache] Error flushing cache:', error);
      throw new ServiceError(
        'REDIS_FLUSH_ERROR',
        'Failed to flush cache',
        error
      );
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keysCount: number;
    memoryUsage: number;
    uptime: number;
  }> {
    await this.ensureConnection();

    try {
      const info = await this.client!.info();
      const lines = info.split('\r\n');
      const stats: Record<string, any> = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        connected: this.isConnected,
        keysCount: parseInt(stats['db0']?.match(/keys=(\d+)/)?.[1] || '0'),
        memoryUsage: parseInt(stats['used_memory'] || '0'),
        uptime: parseInt(stats['uptime_in_seconds'] || '0')
      };
    } catch (error) {
      console.error('[RedisCache] Error getting stats:', error);
      return {
        connected: this.isConnected,
        keysCount: 0,
        memoryUsage: 0,
        uptime: 0
      };
    }
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure Redis connection is established
   */
  private async ensureConnection(): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }

    // Double-check connection
    if (!this.isConnected) {
      throw new ServiceError(
        'REDIS_NOT_CONNECTED',
        'Redis cache is not connected'
      );
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}