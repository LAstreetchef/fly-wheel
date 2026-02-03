import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({ 
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });

const htmlPath = path.join(__dirname, 'public', 'og-image.html');
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

await page.screenshot({ 
  path: path.join(__dirname, 'public', 'og-image.png'),
  type: 'png'
});

console.log('Screenshot saved to public/og-image.png');
await browser.close();
