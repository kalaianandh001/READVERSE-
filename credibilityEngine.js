/**
 * src/engines/credibilityEngine.js
 * ══════════════════════════════════════════════════════════════
 * Scores article credibility 0–100.
 * Signals used (no paid AI required):
 *   + Source trust base score (from RSS source config)
 *   + Cross-source verification bonus (same story multiple sources)
 *   - Clickbait title patterns
 *   - ALL CAPS ratio in title
 *   - Excessive exclamation/question marks
 *   - Sensationalist vocabulary
 *   - Missing description (thin content)
 *   + Has image (visual sourcing)
 *   + Contains specific numbers/dates (verifiable facts)
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

// Words that often appear in low-credibility / clickbait content
const CLICKBAIT_WORDS = [
  'you won\'t believe','shocking','bombshell','exposed','secret','conspiracy',
  'they don\'t want you','what they\'re hiding','this will blow','leaked',
  'miracle','cure','banned','censored','wake up','truth about',
  'doctors hate','one weird trick','urgent warning',
];

const SENSATIONAL_WORDS = [
  'insane','crazy','unbelievable','outrageous','disgusting','terrifying',
  'mind-blowing','epic fail','destroyed','obliterated','slammed','crushed',
];

/**
 * Score credibility of an article.
 * @param {string} title
 * @param {string} description
 * @param {number} sourceTrust - base trust from source config (0–100)
 * @param {boolean} hasImage
 * @returns {number} credibility score 0–100
 */
function scoreCredibility(title = '', description = '', sourceTrust = 75, hasImage = false) {
  let score = sourceTrust; // start from source's base trust score

  const titleLower = title.toLowerCase();
  const descLower  = description.toLowerCase();
  const combined   = titleLower + ' ' + descLower;

  // ── Penalties ─────────────────────────────────────────────
  // Clickbait phrases
  for (const phrase of CLICKBAIT_WORDS) {
    if (combined.includes(phrase)) { score -= 15; break; }
  }

  // Sensationalist vocabulary
  let sensCount = 0;
  for (const word of SENSATIONAL_WORDS) {
    if (combined.includes(word)) sensCount++;
  }
  score -= Math.min(sensCount * 4, 20);

  // ALL CAPS ratio in title (>40% = suspicious)
  const capsRatio = (title.replace(/[^A-Z]/g, '').length) / Math.max(title.length, 1);
  if (capsRatio > 0.4) score -= 15;
  else if (capsRatio > 0.25) score -= 7;

  // Excessive punctuation
  const exclamations = (title.match(/!/g) || []).length;
  const questions    = (title.match(/\?/g) || []).length;
  if (exclamations > 1) score -= 8;
  if (questions > 1)    score -= 5;

  // Thin content (very short description)
  if (description.length < 50) score -= 10;

  // ── Bonuses ───────────────────────────────────────────────
  // Has image
  if (hasImage) score += 3;

  // Contains specific numbers/statistics (verifiable claims)
  if (/\d{4}|\d+%|\$[\d,]+|₹[\d,]+|\d+ (people|deaths|cases|km|kg)/.test(combined)) score += 5;

  // Has a quoted source or named person
  if (/"[^"]{10,}"/.test(title + description)) score += 5;

  // Reasonable description length (substance)
  if (description.length > 200) score += 5;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { scoreCredibility };
