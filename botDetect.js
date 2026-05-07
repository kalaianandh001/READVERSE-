/**
 * src/middleware/botDetect.js
 * Basic bot/scraper detection.
 * Blocks obvious headless scrapers while allowing legitimate crawlers.
 */
'use strict';

// Known bad bot user-agent patterns
const BAD_BOTS = [
  /sqlmap/i, /nikto/i, /masscan/i, /nmap/i,
  /python-requests\/[01]\./i, // very old requests versions used in attacks
  /curl\/[67]\.0\.[0-4]/,    // very old curl
];

// Paths that should never be bot-accessible
const PROTECTED_PATHS = ['/api/auth', '/api/admin'];

function botDetect(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  // Allow known good bots (Google, Bing, etc.)
  if (/Googlebot|Bingbot|Slurp|DuckDuckBot|facebookexternalhit/.test(ua)) {
    return next();
  }

  // Block bad bots on sensitive paths
  if (PROTECTED_PATHS.some(p => req.path.startsWith(p))) {
    for (const pattern of BAD_BOTS) {
      if (pattern.test(ua)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
  }

  next();
}

module.exports = botDetect;
