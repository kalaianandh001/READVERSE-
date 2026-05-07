/**
 * src/utils/database.js
 * MongoDB connection manager using Mongoose.
 * Supports Atlas (cloud) and local MongoDB.
 */

'use strict';

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB. Called once at server start.
 * Reuses connection in serverless environments.
 */
async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment variables.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS : 10000,
      socketTimeoutMS          : 45000,
      maxPoolSize              : 10,
    });

    isConnected = true;

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] ⚠️  MongoDB disconnected. Attempting reconnect...');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[DB] ✅ MongoDB reconnected');
      isConnected = true;
    });

    console.log('[DB] ✅ Connected to MongoDB:', mongoose.connection.host);
  } catch (err) {
    console.error('[DB] ❌ Connection failed:', err.message);
    throw err;
  }
}

/**
 * Gracefully close the database connection.
 * Used in tests and graceful shutdown.
 */
async function closeDB() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  console.log('[DB] 🔌 Connection closed');
}

module.exports = { connectDB, closeDB };
