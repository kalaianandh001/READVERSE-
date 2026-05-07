/**
 * src/utils/cache.js
 * Lightweight in-memory cache using node-cache.
 * Used to avoid hammering MongoDB on every API request.
 */

'use strict';

const NodeCache = require('node-cache');

// TTL in seconds (default 15 min)
const TTL = parseInt(process.env.CACHE_TTL, 10) || 900;

let cache;

/** Initialize the cache singleton */
function initCache() {
  cache = new NodeCache({
    stdTTL       : TTL,
    checkperiod  : 120,     // check for expired keys every 2 min
    useClones    : false,   // faster — don't deep-clone values
    deleteOnExpire: true,
  });
  console.log(`[CACHE] Initialized with TTL=${TTL}s`);
}

/** Get value by key. Returns undefined if not found or expired. */
function cacheGet(key) {
  if (!cache) return undefined;
  return cache.get(key);
}

/** Set a value. Optional custom TTL in seconds. */
function cacheSet(key, value, ttl = TTL) {
  if (!cache) return false;
  return cache.set(key, value, ttl);
}

/** Delete a key immediately */
function cacheDel(key) {
  if (!cache) return;
  cache.del(key);
}

/** Flush everything (used after news refresh) */
function cacheFlush() {
  if (!cache) return;
  cache.flushAll();
  console.log('[CACHE] 🧹 Cache flushed');
}

/** Get cache statistics (used in admin dashboard) */
function cacheStats() {
  if (!cache) return {};
  return cache.getStats();
}

module.exports = { initCache, cacheGet, cacheSet, cacheDel, cacheFlush, cacheStats };
