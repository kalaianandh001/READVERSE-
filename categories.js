/**
 * src/routes/categories.js  — GET /api/categories
 * src/routes/trending.js    — GET /api/trending
 * src/routes/breaking.js    — GET /api/breaking
 * src/routes/search.js      — GET /api/search?q=...
 *
 * All in one file for brevity. Split into separate files if preferred.
 */

'use strict';

const express = require('express');
const Article = require('../models/Article');
const { cacheGet, cacheSet } = require('../utils/cache');
const { incrementView } = require('../engines/trendingEngine');

// ── GET /api/categories ───────────────────────────────────────
async function getCategories(req, res) {
  try {
    const cached = cacheGet('categories');
    if (cached) return res.json(cached);

    // Aggregate article counts per category
    const cats = await Article.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const result = cats.map(c => ({ name: c._id, count: c.count }));
    cacheSet('categories', result, 600);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

// ── GET /api/trending ─────────────────────────────────────────
async function getTrending(req, res) {
  try {
    const limit  = Math.min(20, parseInt(req.query.limit, 10) || 10);
    const cacheKey = `trending:${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const articles = await Article.find({ isTrending: true })
      .sort({ trendingScore: -1, publishedAt: -1 })
      .limit(limit)
      .select('title category source publishedAt trendingScore imageUrl url')
      .lean();

    cacheSet(cacheKey, articles, 300);
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trending' });
  }
}

// ── GET /api/breaking ─────────────────────────────────────────
async function getBreaking(req, res) {
  try {
    const cached = cacheGet('breaking');
    if (cached) return res.json(cached);

    // Breaking = isBreaking flag OR published in last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const articles = await Article.find({
      $or: [
        { isBreaking: true },
        { publishedAt: { $gte: twoHoursAgo } },
      ],
    })
      .sort({ publishedAt: -1 })
      .limit(15)
      .select('title category source publishedAt url isBreaking')
      .lean();

    cacheSet('breaking', articles, 120); // short 2 min cache for breaking
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch breaking news' });
  }
}

// ── Search Router — GET /api/search?q=...&category=...  ───────
const searchRouter = express.Router();

searchRouter.get('/', async (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const category = req.query.category;
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit    = 20;

    if (!q) return res.json({ articles: [], total: 0 });
    if (q.length < 2) return res.status(400).json({ error: 'Query too short' });

    const filter = {
      $text: { $search: q },
    };
    if (category) filter.category = category;

    // MongoDB text search requires a text index (created below)
    const [articles, total] = await Promise.all([
      Article.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-content -__v')
        .lean(),
      Article.countDocuments(filter),
    ]);

    res.json({ articles, total, page, q });
  } catch (err) {
    // Fallback: regex search if text index not yet built
    try {
      const q = (req.query.q || '').trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const articles = await Article.find({
        $or: [{ title: regex }, { description: regex }],
      })
        .sort({ publishedAt: -1 })
        .limit(20)
        .select('-content -__v')
        .lean();
      res.json({ articles, total: articles.length, page: 1, q: req.query.q });
    } catch (e) {
      res.status(500).json({ error: 'Search failed' });
    }
  }
});

// ── POST /api/articles/:id/view — Track article views ─────────
searchRouter.post('/view/:id', async (req, res) => {
  try {
    await incrementView(req.params.id);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// Create MongoDB text index (run once on startup)
async function ensureTextIndex() {
  try {
    await Article.collection.createIndex(
      { title: 'text', description: 'text', tags: 'text' },
      { name: 'article_text_search', weights: { title: 3, description: 1, tags: 2 } }
    );
    console.log('[DB] ✅ Text search index ready');
  } catch {
    // Index already exists — fine
  }
}

// Run index creation in background
setImmediate(ensureTextIndex);

module.exports = { getCategories, getTrending, getBreaking, searchRouter };
