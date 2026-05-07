/**
 * src/engines/sentimentEngine.js
 * Scores the emotional tone of an article.
 * Uses the 'sentiment' npm package (AFINN word list) — free, local.
 */

'use strict';

const Sentiment = require('sentiment');
const analyzer  = new Sentiment();

/**
 * Score sentiment of text.
 * @param {string} text
 * @returns {{ score: number, label: string, comparative: number }}
 */
function scoreSentiment(text = '') {
  try {
    const result = analyzer.analyze(text);
    const label =
      result.comparative > 0.05  ? 'positive' :
      result.comparative < -0.05 ? 'negative' : 'neutral';

    return {
      score      : parseFloat(result.comparative.toFixed(3)),
      label,
      comparative: result.comparative,
    };
  } catch {
    return { score: 0, label: 'neutral', comparative: 0 };
  }
}

module.exports = { scoreSentiment };
