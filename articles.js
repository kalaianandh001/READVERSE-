/**
 * src/routes/articles.js
 * GET /api/articles
 *
 * Query params:
 *   category   - filter by category (e.g. Technology)
 *   tab        - 'breaking' | 'trending' | 'tn' | 'all'
 *   page       - page number (default 1)
 *   limit      - articles per page (default 20, max 50)
 *   lang       - 'en' | 'ta'
 */

'use strict';

const Article = require('../models/Article');
const { cacheGet, cacheSet } = require('../utils/cache');

async function getArticles(req, res) {
  try {
    const {
      category,
      tab    = 'all',
      page   = 1,
      limit  = 20,
      lang,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * pageSize;

    // Build cache key from query params
    const cacheKey = `articles:${tab}:${category || 'all'}:${lang || 'all'}:p${pageNum}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // Build MongoDB query
    const query = {};
    if (category) query.category = category;
    if (lang)     query.language = lang;

    if (tab === 'breaking') query.isBreaking  = true;
    if (tab === 'trending') query.isTrending  = true;
    if (tab === 'tn')       query.isTamilNadu = true;

    // Fetch from DB
    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('-content -__v')  // exclude heavy fields
        .lean(),
      Article.countDocuments(query),
    ]);

    const response = {
      articles,
      pagination: {
        page    : pageNum,
        limit   : pageSize,
        total,
        pages   : Math.ceil(total / pageSize),
        hasNext : pageNum * pageSize < total,
      },
      fetchedAt: new Date().toISOString(),
    };

    cacheSet(cacheKey, response, 300); // cache 5 min
    res.json(response);

  } catch (err) {
    console.error('[API] /articles error:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
}

module.exports = { getArticles };
