const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('c:\\\\MVP_SPORTTIPS\\\\BetTracker\\\\betano_html.txt', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const cards = document.querySelectorAll('[data-qa="bet-activity-card"]');
console.log("Found pure cards:", cards.length);

const sideCards = document.querySelectorAll(
  '#my-bets-section [data-qa="bet-activity-card"], ' +
  'aside [data-qa="sidebar-mybets-list"] > div, ' +
  'aside [class*="sidebar"] > div'
);
console.log("Found sideCards:", sideCards.length);

cards.forEach((c, idx) => {
  console.log(`Card ${idx} matches querySelector:`, c.matches('#my-bets-section [data-qa="bet-activity-card"]'));
});

