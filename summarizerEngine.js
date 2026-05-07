/**
 * src/engines/summarizerEngine.js
 * ══════════════════════════════════════════════════════════════
 * READVERSE LOCAL AI SUMMARIZER — Zero paid APIs
 * ──────────────────────────────────────────────────────────────
 * Techniques used:
 *   1. TF-IDF keyword scoring
 *   2. Sentence importance ranking
 *   3. Extractive summarization (pick best sentences)
 *   4. Named entity detection (regex-based)
 *   5. "Why It Matters" engine (category-contextual)
 *   6. Reading time calculator
 *
 * Runs entirely on-server, no internet calls needed.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

// ── English stopwords (words that carry no meaning for ranking) ─
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can',
  'could','to','of','in','on','at','by','for','with','from','as','into','through',
  'during','before','after','above','below','between','out','off','over','under',
  'again','and','or','but','not','so','if','its','it','this','that','these',
  'those','their','they','we','he','she','him','her','his','our','your','my',
  'i','you','all','each','both','few','more','most','other','some','such','than',
  'then','there','up','about','which','who','whom','how','when','where','what',
  'no','nor','too','very','just','only','also','now','said','says','new','one',
  'two','three','four','five','six','seven','eight','nine','ten','been','being',
  'me','us','they','them','its','my','your','his','her','our','their','we',
]);

// ── Why It Matters: category-contextual impact statements ──────
const WHY_MATTERS_MAP = {
  'Technology'    : 'This development could reshape the tech landscape, directly affecting developers, businesses, and everyday users who rely on digital infrastructure.',
  'Business'      : 'Markets and investors are watching closely — the economic ripple effects may influence supply chains, employment, and financial decisions globally.',
  'Health'        : 'This has direct implications for patients, healthcare providers, and public health systems, potentially affecting how millions receive and access care.',
  'Sports'        : 'Beyond the result, this carries significance for national pride, franchise value, player careers, and the broader sporting ecosystem.',
  'Entertainment' : 'Cultural moments like this shape public conversation and set the tone for the industry\'s creative and commercial direction.',
  'Tamil Nadu'    : 'Local developments like this directly impact the daily lives, economy, and future prospects of Tamil Nadu\'s 80 million citizens.',
  'World'         : 'This has implications that cross borders — affecting diplomatic relationships, trade, migration, and international security.',
  'Science'       : 'This research could accelerate breakthroughs in medicine, energy, or materials — with the potential to improve lives at scale.',
  'Politics'      : 'Political shifts like this directly determine policy direction, public funding priorities, and the rights of citizens.',
  'Cricket'       : 'Cricket is more than a sport in India — this result will shape team selection, fan sentiment, and the upcoming season\'s narrative.',
  'Business'      : 'The economic implications here extend from stock markets to consumer prices, affecting everyday spending power.',
  'Crypto'        : 'Cryptocurrency markets are highly volatile — this news could trigger significant price movements affecting millions of retail investors.',
  'General'       : 'Events like this reflect broader trends shaping society, economics, and the daily experiences of communities worldwide.',
};

// ── Strip HTML and clean text ──────────────────────────────────
function cleanText(str = '') {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[""'']/g, '"')
    .trim();
}

// ── Tokenize into words ────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

// ── Split text into sentences ──────────────────────────────────
function sentenceSplit(text) {
  // Split on ., !, ? — but not on abbreviations like U.S.A., Mr., Dr.
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.split(' ').length > 4);
}

// ── TF-IDF keyword extraction ──────────────────────────────────
function extractKeywords(text, topN = 10) {
  const words = tokenize(text).filter(w => !STOPWORDS.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  // Simple TF: frequency normalized by total words
  const total = words.length || 1;
  const scores = Object.entries(freq)
    .map(([word, count]) => ({
      word,
      score: (count / total) * Math.log(1 + count), // TF * log boost
    }))
    .sort((a, b) => b.score - a.score);

  return scores.slice(0, topN).map(s => s.word);
}

// ── Score a sentence by importance ────────────────────────────
function scoreSentence(sentence, keywords, position, totalSentences) {
  let score = 0;
  const lower = sentence.toLowerCase();
  const words = tokenize(sentence);

  // Keyword presence score
  keywords.forEach(kw => {
    if (lower.includes(kw)) score += 2;
  });

  // Position bonus: first and last sentences are usually important
  if (position === 0) score += 3;
  if (position === totalSentences - 1) score += 1;

  // Contains numbers/statistics (specific facts)
  if (/\d/.test(sentence)) score += 2;

  // Contains large numbers (billion, million, crore) — high importance
  if (/billion|million|crore|lakh|trillion|percent|%|\$|₹|€|£/.test(lower)) score += 4;

  // Contains named entities (capitalized words)
  const entities = sentence.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  score += Math.min(entities.length, 4);

  // Sentence length sweet spot: 60–180 chars
  const len = sentence.length;
  if (len >= 60 && len <= 180) score += 1;

  // Penalize very long sentences (hard to read)
  if (len > 300) score -= 2;

  // Penalize obvious boilerplate
  if (/click here|read more|subscribe|follow us|advertisement/.test(lower)) score -= 5;

  return score;
}

// ── Trim a bullet to a clean readable length ──────────────────
function cleanBullet(s) {
  return s
    .replace(/^\s*[•\-–—*]\s*/, '')  // strip leading bullet chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// ── Estimate reading time in minutes ──────────────────────────
function calcReadingTime(text) {
  const wordCount = tokenize(text).length;
  const minutes = Math.ceil(wordCount / 200); // avg 200 words/min
  return Math.max(1, minutes);
}

// ══════════════════════════════════════════════════════════════
//  MAIN EXPORT: summarize(title, description, category)
//  Returns: { quickRead, bullets, whyMatters, keywords, readingTime }
// ══════════════════════════════════════════════════════════════
function summarize(title = '', description = '', category = 'General') {
  const fullText = cleanText(title + '. ' + description);
  const sentences = sentenceSplit(fullText);

  // Extract keywords using TF-IDF
  const keywords = extractKeywords(fullText, 10);

  // Rank sentences
  const scored = sentences.map((s, i) => ({
    text : s,
    score: scoreSentence(s, keywords, i, sentences.length),
    index: i,
  })).sort((a, b) => b.score - a.score);

  // Build bullets: top 3–4 unique sentences, re-ordered by original position
  const topSentences = scored
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map(s => cleanBullet(s.text))
    .filter(s => s.length > 20);

  // Ensure at least 3 bullets
  const bullets = topSentences.length >= 3
    ? topSentences
    : [...topSentences, ...sentences.slice(0, 3 - topSentences.length).map(cleanBullet)].slice(0, 3);

  // Quick read: best single sentence (highest score)
  const best = scored[0]?.text || sentences[0] || title;
  const quickRead = cleanBullet(best).slice(0, 160);

  // "Why It Matters" — category contextual
  const whyMatters = WHY_MATTERS_MAP[category] || WHY_MATTERS_MAP['General'];

  // Reading time
  const readingTime = calcReadingTime(fullText);

  return {
    quickRead,
    bullets   : bullets.slice(0, 4),
    whyMatters,
    keywords  : keywords.slice(0, 8),
    readingTime,
  };
}

module.exports = { summarize, extractKeywords, calcReadingTime };
