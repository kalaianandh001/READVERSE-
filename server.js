/**
 * ============================================================
 * READVERSE — Autonomous Global News Intelligence Platform
 * src/utils/database.js — MongoDB + Resilience Layer
 * ============================================================
 * Author: READVERSE Team
 * Node.js >= 18 required
 * ============================================================
 */

'use strict';

// ── Core imports ──────────────────────────────────────────────
const mongoose = require('mongoose');
require('dotenv').config();

// ── Config ────────────────────────────────────────────────────
const MAX_RETRIES        = parseInt(process.env.DB_MAX_RETRIES || '5', 10);
const RETRY_DELAY_MS     = parseInt(process.env.DB_RETRY_DELAY || '5000', 10);
const CONNECTION_TIMEOUT = parseInt(process.env.DB_TIMEOUT || '10000', 10);

let retryCount = 0;

/**
 * ============================================================
 * Utility: Delay for retry logic
 * ============================================================
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ============================================================
 * Validate MongoDB URI
 * ============================================================
 */
function validateMongoURI(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is missing in environment variables');
  }

  if (
    !uri.startsWith('mongodb://') &&
    !uri.startsWith('mongodb+srv://')
  ) {
    throw new Error('Invalid MongoDB URI format');
  }
}

/**
 * ============================================================
 * Connect to MongoDB
 * ============================================================
 */
async function connectDB() {
  try {
    const mongoURI = process.env.MONGO_URI;

    // ── Validate URI ──────────────────────────────────────────
    validateMongoURI(mongoURI);

    console.log('[DB] 🌍 Connecting to MongoDB...');

    // ── MongoDB Connection ────────────────────────────────────
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS : CONNECTION_TIMEOUT,
      socketTimeoutMS          : 45000,
      maxPoolSize              : 10,
      autoIndex                : true,
    });

    retryCount = 0;

    console.log('[DB] ✅ MongoDB connected successfully');
    console.log(`[DB] 📦 Host: ${mongoose.connection.host}`);
    console.log(`[DB] 🗄️ Database: ${mongoose.connection.name}`);

    /**
     * ========================================================
     * Connection Events
     * ========================================================
     */

    mongoose.connection.on('connected', () => {
      console.log('[DB] 🔗 MongoDB connection established');
    });

    mongoose.connection.on('disconnected', async () => {
      console.warn('[DB] ⚠️ MongoDB disconnected');

      if (retryCount < MAX_RETRIES) {
        retryCount++;

        console.log(
          `[DB] 🔄 Retry attempt ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s...`
        );

        await delay(RETRY_DELAY_MS);

        return connectDB();
      }

      console.error('[DB] ❌ Max retry attempts reached');
      process.exit(1);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[DB] 🔄 MongoDB reconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[DB] ❌ MongoDB runtime error:', err.message);
    });

  } catch (err) {
    console.error('[DB] ❌ MongoDB connection failed:', err.message);

    if (retryCount < MAX_RETRIES) {
      retryCount++;

      console.log(
        `[DB] 🔄 Retrying connection ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s...`
      );

      await delay(RETRY_DELAY_MS);

      return connectDB();
    }

    console.error('[DB] 💥 Fatal DB startup failure');
    process.exit(1);
  }
}

/**
 * ============================================================
 * Close MongoDB Gracefully
 * ============================================================
 */
async function closeDB() {
  try {
    await mongoose.connection.close();

    console.log('[DB] 🛑 MongoDB connection closed gracefully');

  } catch (err) {
    console.error('[DB] ❌ Error closing MongoDB:', err.message);
  }
}

/**
 * ============================================================
 * Health Check
 * ============================================================
 */
function getDBStatus() {
  return {
    readyState : mongoose.connection.readyState,
    host       : mongoose.connection.host || null,
    name       : mongoose.connection.name || null,
  };
}

/**
 * ============================================================
 * Process Termination Hooks
 * ============================================================
 */

process.on('SIGINT', async () => {
  console.log('[SYS] ⚠️ SIGINT received');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[SYS] ⚠️ SIGTERM received');
  await closeDB();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  console.error('[SYS] 💥 Uncaught Exception:', err.message);
  await closeDB();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('[SYS] 💥 Unhandled Rejection:', reason);
  await closeDB();
  process.exit(1);
});

/**
 * ============================================================
 * Exports
 * ============================================================
 */
module.exports = {
  connectDB,
  closeDB,
  getDBStatus,
};
