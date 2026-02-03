import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a gradient background with SVG
const width = 1200;
const height = 630;

const svgBackground = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="50%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="20%" r="40%">
      <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:0.4"/>
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="80%" r="40%">
      <stop offset="0%" style="stop-color:#a855f7;stop-opacity:0.4"/>
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow1)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>
  
  <!-- FlyWheel logo -->
  <text x="80" y="100" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">FlyWheel</text>
  
  <!-- Tagline -->
  <text x="80" y="200" font-family="Arial, sans-serif" font-size="80" font-weight="900" fill="#ffffff">Click.</text>
  <text x="80" y="300" font-family="Arial, sans-serif" font-size="80" font-weight="900" fill="#06b6d4">Post.</text>
  <text x="80" y="400" font-family="Arial, sans-serif" font-size="80" font-weight="900" fill="#ffffff">Fly.</text>
  
  <!-- Subtitle -->
  <text x="80" y="480" font-family="Arial, sans-serif" font-size="28" fill="#9ca3af">Pay-as-you-go product promotion</text>
</svg>
`;

// Load Stella and resize
const stellaPath = path.join(__dirname, 'public', 'squad', 'stella.png');
const stella = await sharp(stellaPath)
  .resize(380, 380, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

// Create the composite image
await sharp(Buffer.from(svgBackground))
  .composite([
    {
      input: stella,
      left: 750,
      top: 125
    }
  ])
  .png()
  .toFile(path.join(__dirname, 'public', 'og-image.png'));

console.log('OG image created at public/og-image.png');
