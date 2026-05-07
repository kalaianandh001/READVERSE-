/**
 * src/routes/bookmarks.js  — cloud bookmarks (requires auth)
 * src/routes/admin.js      — admin dashboard stats
 * src/routes/digest.js     — daily digest
 * src/routes/sitemap.js    — dynamic XML sitemap
 */

'use strict';

const express = require('express');
const Article = require('../models/Article');
const User    = require('../models/User');
const { requireAuth } = require('../middleware/requireAuth');
const { cacheStats }  = require('../utils/cache');
const { SOURCES }     = require('../aggregators/rssAggregator');

// ══════════════════════════════════════════════════════════════
//  BOOKMARKS  /api/bookmarks
// ══════════════════════════════════════════════════════════════
const bookmarkRouter = express.Router();

// GET — fetch all bookmarked articles for logged-in user
bookmarkRouter.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path   : 'bookmarks',
      select : 'title category source publishedAt url imageUrl summary',
      options: { sort: { publishedAt: -1 } },
    });
    res.json(user?.bookmarks || []);
  } catch {
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// POST — add bookmark
bookmarkRouter.post('/:articleId', requireAuth, async (req, res) => {
  try {
    const { articleId } = req.params;
    await User.findByIdAndUpdate(req.userId, { $addToSet: { bookmarks: articleId } });
    await Article.findByIdAndUpdate(articleId, { $inc: { bookmarkCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Bookmark failed' });
  }
});

// DELETE — remove bookmark
bookmarkRouter.delete('/:articleId', requireAuth, async (req, res) => {
  try {
    const { articleId } = req.params;
    await User.findByIdAndUpdate(req.userId, { $pull: { bookmarks: articleId } });
    await Article.findByIdAndUpdate(articleId, { $inc: { bookmarkCount: -1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Remove bookmark failed' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN  /api/admin  (admin only)
// ══════════════════════════════════════════════════════════════
const adminRouter = express.Router();

adminRouter.use(requireAuth);

adminRouter.use(async (req, res, next) => {
  const user = await User.findById(req.userId).select('isAdmin');
  if (!user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
});

// GET /api/admin/stats
adminRouter.get('/stats', async (req, res) => {
  try {
    const [totalArticles, totalUsers, breaking, trending, catDist] = await Promise.all([
      Article.countDocuments(),
      User.countDocuments(),
      Article.countDocuments({ isBreaking: true }),
      Article.countDocuments({ isTrending: true }),
      Article.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    res.json({
      articles : { total: totalArticles, breaking, trending },
      users    : totalUsers,
      cache    : cacheStats(),
      sources  : SOURCES.length,
      categories: catDist,
      uptime   : Math.floor(process.uptime()),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// POST /api/admin/refresh — manually trigger feed refresh
adminRouter.post('/refresh', async (req, res) => {
  try {
    const aggregator = require('../aggregators/rssAggregator');
    setImmediate(() => aggregator.run()); // run in background
    res.json({ ok: true, message: 'Feed refresh triggered' });
  } catch {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// ══════════════════════════════════════════════════════════════
//  DIGEST  /api/digest
// ══════════════════════════════════════════════════════════════
const digestRouter = express.Router();

// GET /api/digest — top 10 articles of the day grouped by category
digestRouter.get('/', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const articles = await Article.find({ publishedAt: { $gte: since } })
      .sort({ trendingScore: -1, publishedAt: -1 })
      .limit(10)
      .select('title category source publishedAt url summary.quickRead imageUrl')
      .lean();
    res.json({ date: new Date().toISOString(), articles });
  } catch {
    res.status(500).json({ error: 'Digest unavailable' });
  }
});

// ══════════════════════════════════════════════════════════════
//  SITEMAP  /sitemap.xml
// ══════════════════════════════════════════════════════════════
async function sitemapHandler(req, res) {
  try {
    const siteUrl = process.env.SITE_URL || 'https://readverse.app';
    const articles = await Article.find()
      .sort({ publishedAt: -1 })
      .limit(1000)
      .select('_id publishedAt category')
      .lean();

    const urls = articles.map(a => `
  <url>
    <loc>${siteUrl}/article/${a._id}</loc>
    <lastmod>${new Date(a.publishedAt).toISOString()}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch {
    res.status(500).send('Sitemap error');
  }
}

module.exports = { bookmarkRouter, adminRouter, digestRouter, searchRouter: require('./categories').searchRouter, sitemapHandler };
