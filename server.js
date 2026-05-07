/**
 * ============================================================
 * READVERSE — Autonomous Global News Intelligence Platform
 * server.js — Main Express Entry Point
 * ============================================================
 * Author: READVERSE Team
 * Node.js >= 18 required
 * ============================================================
 */

'use strict';

// ── Core imports ──────────────────────────────────────────────
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const compression   = require('compression');
const morgan        = require('morgan');
const cron          = require('node-cron');
const path          = require('path');
require('dotenv').config();

// ── Internal modules ──────────────────────────────────────────
const { connectDB }         = require('./src/utils/database');
const { initCache }         = require('./src/utils/cache');
const aggregatorJob         = require('./src/aggregators/rssAggregator');
const { getArticles }       = require('./src/routes/articles');
const { getCategories }     = require('./src/routes/categories');
const { getTrending }       = require('./src/routes/trending');
const { getBreaking }       = require('./src/routes/breaking');
const { authRouter }        = require('./src/routes/auth');
const { bookmarkRouter }    = require('./src/routes/bookmarks');
const { adminRouter }       = require('./src/routes/admin');
const { searchRouter }      = require('./src/routes/search');
const { digestRouter }      = require('./src/routes/digest');
const errorHandler          = require('./src/middleware/errorHandler');
const botDetect             = require('./src/middleware/botDetect');

// ── App init ──────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts in dev
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS — allow frontend origins ─────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5500').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,  // 15 minutes
  max      : 300,              // 300 requests per window
  message  : { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders  : false,
});
app.use('/api/', apiLimiter);

// ── General middleware ────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(botDetect);

// ── Serve static frontend files ───────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

// ── Health check (for Render / Railway uptime pings) ─────────
app.get('/health', (_req, res) => res.json({
  status  : 'ok',
  version : '2.0.0',
  uptime  : Math.floor(process.uptime()),
  time    : new Date().toISOString(),
}));

// ── API Routes ────────────────────────────────────────────────
app.get('/api/articles',    getArticles);
app.get('/api/categories',  getCategories);
app.get('/api/trending',    getTrending);
app.get('/api/breaking',    getBreaking);
app.use('/api/auth',        authRouter);
app.use('/api/bookmarks',   bookmarkRouter);
app.use('/api/admin',       adminRouter);
app.use('/api/search',      searchRouter);
app.use('/api/digest',      digestRouter);

// ── Sitemap (dynamic SEO) ─────────────────────────────────────
app.get('/sitemap.xml', require('./src/routes/sitemap'));

// ── Catch-all: serve frontend SPA ────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ══════════════════════════════════════════════════════════════
//  CRON JOBS — Self-updating news intelligence
// ══════════════════════════════════════════════════════════════

/**
 * Every 15 minutes: fetch + aggregate RSS feeds from all sources.
 * This is the core autonomous loop that keeps READVERSE live.
 */
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] 🔄 Aggregating RSS feeds...');
  try {
    await aggregatorJob.run();
    console.log('[CRON] ✅ Feed refresh complete');
  } catch (err) {
    console.error('[CRON] ❌ Feed refresh error:', err.message);
  }
});

/**
 * Every 30 minutes: recalculate trending scores based on
 * view counts, time decay, and social signals.
 */
cron.schedule('*/30 * * * *', async () => {
  console.log('[CRON] 📈 Recalculating trending scores...');
  try {
    const { recalcTrending } = require('./src/engines/trendingEngine');
    await recalcTrending();
  } catch (err) {
    console.error('[CRON] ❌ Trending error:', err.message);
  }
});

/**
 * Daily at 6 AM IST (00:30 UTC): generate daily digest email summaries.
 */
cron.schedule('30 0 * * *', async () => {
  console.log('[CRON] 📧 Generating daily digest...');
  try {
    const { generateDigest } = require('./src/engines/digestEngine');
    await generateDigest();
  } catch (err) {
    console.error('[CRON] ❌ Digest error:', err.message);
  }
});

// ── Bootstrap ─────────────────────────────────────────────────
// await connectDB();
// initCache();
// await aggregatorJob.run();
async function bootstrap() {
  try {
    console.log('[BOOT] 🚀 Safe mode starting...');

    // Database disabled temporarily
    // await connectDB();

    // Cache disabled temporarily
    // initCache();

    // Initial aggregator disabled temporarily
    // await aggregatorJob.run();

    app.listen(PORT, () => {
      console.log(`[BOOT] 🌐 READVERSE running on port ${PORT}`);
      console.log(`[BOOT] 🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (err) {
    console.error('[BOOT] 💥 Fatal startup error:', err);
    process.exit(1);
  }
}


module.exports = app; // for testing
