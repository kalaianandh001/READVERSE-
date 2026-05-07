/**
 * src/models/Article.js
 * Mongoose schema for news articles.
 * Every field is documented so you know exactly what each stores.
 */

'use strict';

const { Schema, model } = require('mongoose');

const ArticleSchema = new Schema({

  // ── Identity ──────────────────────────────────────────────
  guid: {
    type    : String,
    unique  : true,       // RSS GUID or generated hash — used for deduplication
    required: true,
    index   : true,
  },

  // ── Content ───────────────────────────────────────────────
  title: { type: String, required: true, maxlength: 512 },
  description: { type: String, default: '' },  // short excerpt
  content: { type: String, default: '' },       // full article text if scraped
  url: { type: String, required: true },
  imageUrl: { type: String, default: '' },

  // ── Classification ────────────────────────────────────────
  category: {
    type   : String,
    default: 'General',
    index  : true,
    // Valid values: Technology, Business, Sports, Health, Entertainment,
    // World, Science, Tamil Nadu, Politics, Crypto, Cricket
  },
  subcategory: { type: String, default: '' },
  tags: [{ type: String }],   // extracted keywords/entities

  // ── Source ────────────────────────────────────────────────
  source: { type: String, required: true },     // e.g. "BBC News"
  sourceUrl: { type: String, default: '' },     // e.g. "https://bbc.com"
  sourceTrustScore: { type: Number, default: 75, min: 0, max: 100 },
  // Trust score: 0–100 based on source whitelist + credibility signals

  // ── AI-Generated fields (100% local, no paid API) ─────────
  summary: {
    quickRead : { type: String, default: '' },  // 1-sentence punchy summary
    bullets   : [{ type: String }],             // 3–4 key bullet points
    whyMatters: { type: String, default: '' },  // "Why it matters" statement
    keywords  : [{ type: String }],             // TF-IDF top keywords
    readingTime: { type: Number, default: 1 },  // estimated minutes to read
  },

  // ── Sentiment & Credibility ───────────────────────────────
  sentiment: {
    score      : { type: Number, default: 0 }, // -1 (negative) to +1 (positive)
    label      : { type: String, default: 'neutral' }, // positive|negative|neutral
    comparative: { type: Number, default: 0 },
  },
  credibilityScore: { type: Number, default: 50, min: 0, max: 100 },
  // Credibility: 0–100. Based on: source trust, cross-source verification,
  // clickbait detection, all-caps ratio, exclamation overuse, etc.

  // ── Engagement ────────────────────────────────────────────
  viewCount   : { type: Number, default: 0 },
  bookmarkCount: { type: Number, default: 0 },
  shareCount  : { type: Number, default: 0 },
  trendingScore: { type: Number, default: 0, index: true },
  // trendingScore = viewCount * recencyMultiplier + bookmarkCount * 3 + shareCount * 2

  // ── Flags ─────────────────────────────────────────────────
  isBreaking  : { type: Boolean, default: false, index: true },
  isTrending  : { type: Boolean, default: false },
  isTamilNadu : { type: Boolean, default: false }, // TN local news flag
  language    : { type: String, default: 'en' },   // 'en' or 'ta'
  region      : { type: String, default: 'global' },

  // ── Timestamps ────────────────────────────────────────────
  publishedAt : { type: Date, default: Date.now, index: true },
  fetchedAt   : { type: Date, default: Date.now },

}, {
  timestamps: true,   // adds createdAt and updatedAt
  toJSON: { virtuals: true },
});

// ── Compound indexes for fast queries ─────────────────────────
ArticleSchema.index({ category: 1, publishedAt: -1 });
ArticleSchema.index({ isTrending: 1, publishedAt: -1 });
ArticleSchema.index({ isBreaking: 1, publishedAt: -1 });
ArticleSchema.index({ isTamilNadu: 1, publishedAt: -1 });

// ── Virtual: age in minutes (for recency signals) ─────────────
ArticleSchema.virtual('ageMinutes').get(function () {
  return Math.floor((Date.now() - this.publishedAt) / 60000);
});

// ── Static: purge articles older than N days ──────────────────
ArticleSchema.statics.pruneOld = async function (days = 3) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const { deletedCount } = await this.deleteMany({ publishedAt: { $lt: cutoff } });
  if (deletedCount > 0) console.log(`[DB] 🗑  Pruned ${deletedCount} old articles`);
};

module.exports = model('Article', ArticleSchema);
