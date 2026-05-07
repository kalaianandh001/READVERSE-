/**
 * src/engines/categorizationEngine.js
 * Classifies an article into a category using keyword matching.
 * No ML model needed — fast, accurate, zero dependencies.
 */

'use strict';

const RULES = [
  { cat: 'Cricket',       keywords: ['cricket','ipl','bcci','test match','odi','t20','wicket','batting','bowling','virat','rohit','dhoni','rcb','csk','mi ','kkr','srh'] },
  { cat: 'Sports',        keywords: ['football','soccer','tennis','basketball','nba','nfl','fifa','formula 1','f1','olympics','athlete','league','tournament','championship','medal','goal','match','player','coach','transfer'] },
  { cat: 'Technology',    keywords: ['ai','artificial intelligence','software','hardware','startup','apple','google','microsoft','meta','amazon','openai','smartphone','chip','semiconductor','cybersecurity','hack','algorithm','robot','machine learning','cloud','saas','app','tech','silicon'] },
  { cat: 'Business',      keywords: ['stock','market','economy','gdp','inflation','rbi','sebi','sensex','nifty','rupee','dollar','ipo','merger','acquisition','profit','revenue','quarterly','fiscal','trade','export','import','investment','fund','venture','startup','ceo','earnings'] },
  { cat: 'Crypto',        keywords: ['bitcoin','ethereum','crypto','blockchain','nft','defi','web3','binance','coinbase','altcoin','token','wallet','mining','solana','dogecoin','usdt','stablecoin'] },
  { cat: 'Health',        keywords: ['health','hospital','doctor','medicine','vaccine','virus','pandemic','cancer','diabetes','surgery','drug','fda','who','clinical','patient','disease','mental health','nutrition','fitness','covid','dengue','malaria'] },
  { cat: 'Science',       keywords: ['nasa','space','planet','asteroid','climate','research','study','scientists','discovery','experiment','physics','chemistry','biology','genome','fossil','quantum','telescope','satellite','rocket','climate change','carbon','emissions'] },
  { cat: 'Entertainment', keywords: ['movie','film','bollywood','hollywood','kollywood','actor','actress','director','music','album','concert','award','oscar','grammy','celebrity','series','netflix','ott','release','trailer','box office','streaming'] },
  { cat: 'Tamil Nadu',    keywords: ['tamil nadu','chennai','coimbatore','madurai','trichy','salem','tirunelveli','dmk','aiadmk','mk stalin','edappadi','jayalalithaa','kamal','rajinikanth','vijay','tamilnadu','tn govt','cmda','tangedco','aavin'] },
  { cat: 'Politics',      keywords: ['election','vote','parliament','congress','bjp','modi','rahul gandhi','lok sabha','rajya sabha','government','minister','policy','bill','act','law','constitution','party','campaign','manifesto','president','pm','cabinet'] },
  { cat: 'World',         keywords: ['ukraine','russia','china','usa','biden','trump','nato','un','united nations','war','conflict','sanctions','diplomacy','g20','g7','imf','world bank','israel','gaza','middle east','europe','africa'] },
];

/**
 * Classify article into a category.
 * @param {string} title
 * @param {string} description
 * @param {string} defaultCat - fallback from source config
 * @returns {string} category name
 */
function categorize(title = '', description = '', defaultCat = 'General') {
  const text = (title + ' ' + description).toLowerCase();

  // Score each category by how many keywords match
  let best = { cat: defaultCat, score: 0 };

  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        // Title matches count more than description
        score += title.toLowerCase().includes(kw) ? 3 : 1;
      }
    }
    if (score > best.score) {
      best = { cat: rule.cat, score };
    }
  }

  return best.cat;
}

module.exports = { categorize };
