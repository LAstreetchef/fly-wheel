// server/lib/cache.js
// In-memory cache with TTL, stats tracking, and size limits
// TODO: Swap to Redis when you add a Redis instance on Render ($7/mo or free via Upstash)

class Cache {
  constructor({ maxSize = 500, defaultTTL = 3600 } = {}) {
    this.store = new Map();
    this.defaultTTL = defaultTTL * 1000; // convert to ms
    this.maxSize = maxSize;
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
      this.stats.evictions++;
    }

    const ttl = (ttlSeconds || this.defaultTTL / 1000) * 1000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });
    this.stats.sets++;
  }

  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  // Clean up expired entries (call periodically)
  prune() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.store.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) + '%' : 'N/A',
    };
  }
}

// --- Shared cache instances ---

// Blog search results: cache for 24 hours (blogs don't change fast)
export const blogCache = new Cache({ maxSize: 200, defaultTTL: 86400 });

// Generated content: cache for 7 days (same inputs = same output)
export const contentCache = new Cache({ maxSize: 300, defaultTTL: 604800 });

// Twitter rate limit tracking
export const twitterRateCache = new Cache({ maxSize: 50, defaultTTL: 900 });

// Prune expired entries every 10 minutes
setInterval(() => {
  blogCache.prune();
  contentCache.prune();
  twitterRateCache.prune();
}, 10 * 60 * 1000);

// Legacy exports for backwards compatibility with existing server.js
export function getCached(key) {
  return blogCache.get(key);
}

export function setCache(key, value, ttl = 3600000) {
  blogCache.set(key, value, ttl / 1000);
}

export { Cache };
