// Renders build/icon.svg to build/icon.png (1024x1024) using the bundled Chromium.
const path = require('path');
const fs = require('fs');
(async () => {
  const { chromium } = require('playwright');
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, 'icon.png'), omitBackground: true });
  await browser.close();
  console.log('icon.png written');
})();
