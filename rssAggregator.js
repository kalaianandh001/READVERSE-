/**
 * src/aggregators/rssAggregator.js
 * ══════════════════════════════════════════════════════════════
 * READVERSE RSS Aggregation Engine
 * ──────────────────────────────────────────────────────────────
 * Fetches, parses, deduplicates, classifies, and stores
 * news from 25+ free RSS sources across all categories.
 * No paid APIs required.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const RSSParser  = require('rss-parser');
const crypto     = require('crypto');
const Article    = require('../models/Article');
const { categorize }       = require('../engines/categorizationEngine');
const { summarize }        = require('../engines/summarizerEngine');
const { scoreSentiment }   = require('../engines/sentimentEngine');
const { scoreCredibility } = require('../engines/credibilityEngine');
const { cacheFlush }       = require('../utils/cache');

// ── RSS Parser with custom fields and timeout ─────────────────
const parser = new RSSParser({
  timeout   : 15000,  // 15 seconds per feed
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['dc:creator', 'creator'],
    ],
  },
});

// ══════════════════════════════════════════════════════════════
//  NEWS SOURCES — All free, public RSS feeds
//  Format: { name, url, defaultCat, trustScore, region, isTN }
// ══════════════════════════════════════════════════════════════
const SOURCES = [

  // ── World / General ───────────────────────────────────────
  { name: 'BBC News',        url: 'https://feeds.bbci.co.uk/news/rss.xml',                    defaultCat: 'World',        trustScore: 95, region: 'global' },
  { name: 'Reuters',         url: 'https://feeds.reuters.com/reuters/topNews',                 defaultCat: 'World',        trustScore: 95, region: 'global' },
  { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',                defaultCat: 'World',        trustScore: 85, region: 'global' },
  { name: 'Google News',     url: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',   defaultCat: 'General',      trustScore: 80, region: 'india' },
  { name: 'AP News',         url: 'https://rsshub.app/apnews/topics/ap-top-news',             defaultCat: 'World',        trustScore: 95, region: 'global' },

  // ── India ─────────────────────────────────────────────────
  { name: 'The Hindu',       url: 'https://www.thehindu.com/feeder/default.rss',              defaultCat: 'General',      trustScore: 90, region: 'india' },
  { name: 'Times of India',  url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', defaultCat: 'General',   trustScore: 80, region: 'india' },
  { name: 'NDTV',            url: 'https://feeds.feedburner.com/ndtvnews-top-stories',        defaultCat: 'General',      trustScore: 80, region: 'india' },
  { name: 'India Today',     url: 'https://www.indiatoday.in/rss/1206578',                    defaultCat: 'General',      trustScore: 78, region: 'india' },
  { name: 'Economic Times',  url: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', defaultCat: 'Business',  trustScore: 82, region: 'india' },
  { name: 'The Hindu Business', url: 'https://www.thehindubusinessline.com/feeder/default.rss', defaultCat: 'Business',  trustScore: 88, region: 'india' },

  // ── Tamil Nadu / Tamil ────────────────────────────────────
  { name: 'The Hindu Tamil Nadu', url: 'https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss', defaultCat: 'Tamil Nadu', trustScore: 90, region: 'tn', isTN: true },
  { name: 'Dinamani',        url: 'https://www.dinamani.com/rss/topic/Tamil+Nadu/',           defaultCat: 'Tamil Nadu',   trustScore: 78, region: 'tn', isTN: true, lang: 'ta' },
  { name: 'Vikatan',         url: 'https://www.vikatan.com/rss/news/',                        defaultCat: 'Tamil Nadu',   trustScore: 75, region: 'tn', isTN: true, lang: 'ta' },
  { name: 'Puthiyathalaimurai', url: 'https://www.puthiyathalaimurai.com/rss.xml',            defaultCat: 'Tamil Nadu',   trustScore: 70, region: 'tn', isTN: true },
  { name: 'Tamil Guardian',  url: 'https://www.tamilguardian.com/rss.xml',                   defaultCat: 'Tamil Nadu',   trustScore: 68, region: 'tn', isTN: true },

  // ── Technology ────────────────────────────────────────────
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/',                             defaultCat: 'Technology',   trustScore: 85, region: 'global' },
  { name: 'The Verge',       url: 'https://www.theverge.com/rss/index.xml',                   defaultCat: 'Technology',   trustScore: 83, region: 'global' },
  { name: 'Ars Technica',    url: 'https://feeds.arstechnica.com/arstechnica/index',          defaultCat: 'Technology',   trustScore: 88, region: 'global' },
  { name: 'Wired',           url: 'https://www.wired.com/feed/rss',                           defaultCat: 'Technology',   trustScore: 86, region: 'global' },

  // ── Sports / Cricket ─────────────────────────────────────
  { name: 'ESPN Cricinfo',   url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', defaultCat: 'Cricket',    trustScore: 90, region: 'global' },
  { name: 'ESPN India',      url: 'https://www.espn.in/espn/rss/news',                        defaultCat: 'Sports',       trustScore: 88, region: 'india' },
  { name: 'Sportskeeda',     url: 'https://www.sportskeeda.com/feed',                         defaultCat: 'Sports',       trustScore: 72, region: 'india' },

  // ── Health / Science ──────────────────────────────────────
  { name: 'WHO News',        url: 'https://www.who.int/rss-feeds/news-english.xml',           defaultCat: 'Health',       trustScore: 97, region: 'global' },
  { name: 'Science Daily',   url: 'https://www.sciencedaily.com/rss/top/science.xml',         defaultCat: 'Science',      trustScore: 90, region: 'global' },

  // ── Business / Finance ────────────────────────────────────
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home/uk',                           defaultCat: 'Business',     trustScore: 93, region: 'global' },
  { name: 'Bloomberg',       url: 'https://feeds.bloomberg.com/markets/news.rss',             defaultCat: 'Business',     trustScore: 93, region: 'global' },

  // ── Entertainment ─────────────────────────────────────────
  { name: 'Variety',         url: 'https://variety.com/feed/',                                defaultCat: 'Entertainment', trustScore: 80, region: 'global' },
  { name: 'Bollywood Hungama', url: 'https://www.bollywoodhungama.com/rss/',                  defaultCat: 'Entertainment', trustScore: 68, region: 'india' },
];

// ── Breaking news keywords (any match = isBreaking) ───────────
const BREAKING_KEYWORDS = [
  'breaking', 'urgent', 'alert', 'just in', 'developing',
  'emergency', 'live:', 'update:', 'flash:', 'live update',
  'earthquake', 'explosion', 'crash', 'attack', 'arrested',
];

// ── Generate a stable GUID from URL (deduplication key) ───────
function makeGuid(url) {
  return crypto.createHash('sha256').update(url.trim()).digest('hex').slice(0, 32);
}

// ── Extract best image from an RSS item ───────────────────────
function extractImage(item) {
  if (item.mediaContent?.$.url) return item.mediaContent.$.url;
  if (item.mediaThumbnail?.$.url) return item.mediaThumbnail.$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  // Try parsing out <img> from content
  const imgMatch = (item.content || item['content:encoded'] || '').match(/<img[^>]+src="([^"]+)"/i);
  if (imgMatch) return imgMatch[1];
  return '';
}

// ── Strip HTML tags from description ──────────────────────────
function stripHtml(str = '') {
  return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

// ── Check if title/desc signals breaking news ─────────────────
function detectBreaking(text = '') {
  const lower = text.toLowerCase();
  return BREAKING_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Fetch + parse a single RSS source ─────────────────────────
async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).slice(0, parseInt(process.env.MAX_ARTICLES_PER_SOURCE, 10) || 20);

    const articles = items.map(item => {
      const title = stripHtml(item.title || '');
      const description = stripHtml(item.contentSnippet || item.summary || item.content || '');
      const url = item.link || item.guid || '';

      if (!title || !url) return null;

      const guid = makeGuid(url);
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

      // Category: trust the source default, but also run classifier
      const category = categorize(title, description, source.defaultCat);

      // AI engines (all local)
      const summaryData   = summarize(title, description, category);
      const sentimentData = scoreSentiment(title + ' ' + description);
      const credScore     = scoreCredibility(title, description, source.trustScore);

      const isBreaking = detectBreaking(title) || detectBreaking(description);

      return {
        guid,
        title,
        description  : description.slice(0, 600),
        content      : description,
        url,
        imageUrl     : extractImage(item),
        category,
        tags         : summaryData.keywords || [],
        source       : source.name,
        sourceUrl    : source.sourceUrl || new URL(source.url).origin,
        sourceTrustScore: source.trustScore,
        summary      : {
          quickRead   : summaryData.quickRead,
          bullets     : summaryData.bullets,
          whyMatters  : summaryData.whyMatters,
          keywords    : summaryData.keywords,
          readingTime : summaryData.readingTime,
        },
        sentiment        : sentimentData,
        credibilityScore : credScore,
        isBreaking,
        isTrending   : false,  // set later by trending engine
        isTamilNadu  : !!source.isTN,
        language     : source.lang || 'en',
        region       : source.region || 'global',
        publishedAt,
        fetchedAt    : new Date(),
        trendingScore: 0,
      };
    }).filter(Boolean);

    return { source: source.name, count: articles.length, articles };
  } catch (err) {
    console.warn(`[RSS] ⚠️  Failed to fetch "${source.name}": ${err.message}`);
    return { source: source.name, count: 0, articles: [] };
  }
}

// ── Save articles to MongoDB (upsert = no duplicates) ─────────
async function saveArticles(articles) {
  if (!articles.length) return 0;

  const ops = articles.map(a => ({
    updateOne: {
      filter: { guid: a.guid },
      update: { $setOnInsert: a },  // only insert if new — preserve view counts
      upsert: true,
    },
  }));

  try {
    const result = await Article.bulkWrite(ops, { ordered: false });
    return result.upsertedCount;
  } catch (err) {
    console.error('[RSS] ❌ DB save error:', err.message);
    return 0;
  }
}

// ── Main aggregation job ───────────────────────────────────────
async function run() {
  const start = Date.now();
  let totalNew = 0;

  console.log(`[RSS] Starting aggregation of ${SOURCES.length} sources...`);

  // Fetch all sources in parallel (but limit concurrency to avoid bans)
  const CONCURRENCY = 5;
  for (let i = 0; i < SOURCES.length; i += CONCURRENCY) {
    const batch = SOURCES.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchSource));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { source, articles, count } = result.value;
        if (count > 0) {
          const saved = await saveArticles(articles);
          totalNew += saved;
          console.log(`[RSS] ✅ ${source}: fetched ${count}, saved ${saved} new`);
        }
      }
    }

    // Small delay between batches to be polite to servers
    if (i + CONCURRENCY < SOURCES.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Prune old articles (keep DB lean)
  await Article.pruneOld(3);

  // Flush cache so next API request gets fresh data
  cacheFlush();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[RSS] 🎉 Aggregation complete: ${totalNew} new articles in ${elapsed}s`);

  return totalNew;
}

module.exports = { run, SOURCES };
