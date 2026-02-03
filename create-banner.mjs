import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Twitter header: 1500x500
const width = 1500;
const height = 500;

const svgBackground = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="50%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <radialGradient id="glow1" cx="15%" cy="50%" r="30%">
      <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="50%" r="30%">
      <stop offset="0%" style="stop-color:#a855f7;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="50%" cy="50%" r="40%">
      <stop offset="0%" style="stop-color:#ec4899;stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:#ec4899;stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow1)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>
  <rect width="100%" height="100%" fill="url(#glow3)"/>
  
  <!-- Center text -->
  <text x="750" y="180" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="#ffffff" text-anchor="middle">Click. Post. Fly.</text>
  <text x="750" y="240" font-family="Arial, sans-serif" font-size="28" fill="#9ca3af" text-anchor="middle">Pay-as-you-go content that actually works</text>
  
  <!-- Character labels -->
  <text x="225" y="470" font-family="Arial, sans-serif" font-size="20" fill="#06b6d4" text-anchor="middle" font-weight="bold">Luna 💫</text>
  <text x="525" y="470" font-family="Arial, sans-serif" font-size="20" fill="#f97316" text-anchor="middle" font-weight="bold">Max 🧠</text>
  <text x="975" y="470" font-family="Arial, sans-serif" font-size="20" fill="#a855f7" text-anchor="middle" font-weight="bold">Nova ✨</text>
  <text x="1275" y="470" font-family="Arial, sans-serif" font-size="20" fill="#eab308" text-anchor="middle" font-weight="bold">Stella 📝</text>
</svg>
`;

// Load and resize characters
const loadChar = async (name, size) => {
  return sharp(path.join(__dirname, 'public', 'squad', `${name}.png`))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
};

const [luna, max, nova, stella] = await Promise.all([
  loadChar('luna', 200),
  loadChar('max', 200),
  loadChar('nova', 200),
  loadChar('stella', 200),
]);

// Create composite
await sharp(Buffer.from(svgBackground))
  .composite([
    { input: luna, left: 125, top: 250 },
    { input: max, left: 425, top: 250 },
    { input: nova, left: 875, top: 250 },
    { input: stella, left: 1175, top: 250 },
  ])
  .png()
  .toFile(path.join(__dirname, 'public', 'twitter-banner.png'));

console.log('Twitter banner created at public/twitter-banner.png');
