const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run42.js','utf8');
eval(src.replace(/await page\.screenshot\(\{path:'at-1\.png'\}\);[\s\S]*await browser\.close\(\);/, () => `
 await page.dragAndDrop('.card[data-bi="1"] .drag', '.card[data-bi="0"]', { targetPosition: { x: 10, y: 40 } }); await page.waitForTimeout(400);
 console.log('ORDRE:', await page.$$eval('#tiles .card h2, #tiles .card h3', x=>x.map(e=>e.textContent.trim()).join(' | ')));
 await browser.close();`));
