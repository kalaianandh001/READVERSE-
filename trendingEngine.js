/**
 * src/engines/trendingEngine.js
 * Recalculates trending scores for all recent articles.
 *
 * Formula:
 *   trendingScore = (views * 1) + (bookmarks * 3) + (shares * 2)
 *                  * recencyMultiplier(ageHours)
 *
 * recencyMultiplier: 1.0 at 0h → 0.1 at 48h (exponential decay)
 * Articles with score > threshold get isTrending = true.
 */

'use strict';

const Article = require('../models/Article');

const TRENDING_THRESHOLD = 5; // minimum score to be "trending"

/**
 * Decay multiplier: newer articles score higher.
 * Returns 1.0 for brand new, approaches 0.1 after 48 hours.
 */
function recencyMultiplier(ageHours) {
  return Math.max(0.1, Math.exp(-0.05 * ageHours));
}

/**
 * Recalculate trending scores for all articles published in last 48h.
 * Called by cron every 30 minutes.
 */
async function recalcTrending() {
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000);

  const articles = await Article.find({ publishedAt: { $gte: cutoff } })
    .select('viewCount bookmarkCount shareCount publishedAt')
    .lean();

  const bulkOps = articles.map(a => {
    const ageHours = (Date.now() - new Date(a.publishedAt)) / 3600000;
    const decay    = recencyMultiplier(ageHours);
    const rawScore = (a.viewCount * 1) + (a.bookmarkCount * 3) + (a.shareCount * 2);
    const score    = parseFloat((rawScore * decay).toFixed(2));

    return {
      updateOne: {
        filter: { _id: a._id },
        update: {
          $set: {
            trendingScore: score,
            isTrending   : score >= TRENDING_THRESHOLD,
          },
        },
      },
    };
  });

  if (bulkOps.length > 0) {
    await Article.bulkWrite(bulkOps, { ordered: false });
    console.log(`[TRENDING] Updated scores for ${bulkOps.length} articles`);
  }
}

/**
 * Increment view count for a single article.
 * Called when a user opens an article.
 */
async function incrementView(articleId) {
  await Article.findByIdAndUpdate(articleId, { $inc: { viewCount: 1 } });
}

module.exports = { recalcTrending, incrementView };
