# Hot Potato MVP Backend

**Frictionless influencer onboarding + points distribution**

## Quick Start

```bash
cd ~/clawd/hotpotato/backend

# Install dependencies (already done)
npm install

# Start server
npm start
```

## Endpoints

### Auth (Influencer Onboarding)
- `GET /api/auth/tiktok` — TikTok OAuth (MVP: mock)
- `GET /api/auth/instagram` — Instagram OAuth (MVP: mock)
- `GET /api/auth/onlyfans` — OnlyFans verification (bio code method)
- `GET /api/auth/me` — Get current user

### Markets
- `POST /api/markets/create` — Create a prediction market
- `GET /api/markets` — List all markets
- `GET /api/markets/:id` — Get market details
- `POST /api/markets/:id/trade` — Place a trade
- `GET /api/markets/positions/me` — Get user's positions

### Admin
- `GET /api/admin/dashboard` — Admin panel (browser UI)
- `POST /api/admin/give-points` — Distribute points to influencers
- `GET /api/admin/api/users` — List all users (requires admin key)

### Health
- `GET /api/health` — Server status

## Admin Panel

Open in browser: **http://localhost:3030/api/admin/dashboard**

Features:
- View all users
- Give points to influencers
- See markets created
- Track stats

## Give Points to First 10

1. Open admin panel: http://localhost:3030/api/admin/dashboard
2. Each new user gets **100 points** welcome bonus
3. Use the form to give bonus points (recommend 1000-5000 for early influencers)

## MVP Features

### ✅ Frictionless Onboarding
- No wallet required upfront
- Simple username entry
- Instant account creation
- 100 HP Points welcome bonus

### ✅ Points Distribution
- Admin can give points to anyone
- Creators earn points for creating markets (+100)
- Traders earn 2x their trade amount in points

### ✅ Mock OAuth
- TikTok: Just enter handle
- Instagram: Just enter handle
- OnlyFans: Bio code method (auto-verified in MVP)

### 🚧 Coming Soon
- Real OAuth for TikTok/Instagram
- OnlyFans bio scraping
- Database persistence (currently in-memory)
- Blockchain integration (USDC on Polygon)

## Extension Integration

Update extension OAuth URLs to point to this server:

```javascript
// extension/src/popup.js

function connectPlatform(platform) {
  const urls = {
    onlyfans:  'http://localhost:3030/api/auth/onlyfans',
    tiktok:    'http://localhost:3030/api/auth/tiktok',
    instagram: 'http://localhost:3030/api/auth/instagram',
  };
  chrome.tabs.create({url: urls[platform]});
}
```

## Data Storage (MVP)

Currently using **in-memory storage** (resets on server restart).

Data structures:
- `users` — Map of userId → user object
- `markets` — Map of marketId → market object
- `positions` — Map of positionKey → position object

**Next phase:** Migrate to PostgreSQL with Drizzle ORM.

## Environment Variables

See `.env.example` for configuration.

For MVP, only need:
- `PORT` — Server port (default: 3030)
- `ADMIN_KEY` — Admin API key (default: hotpotato-admin-2026)
- `SESSION_SECRET` — Session encryption key

## Deploy to Production

### Option 1: Render
```bash
# Push to GitHub
git push

# Create new web service on Render
# Connect to GitHub repo
# Set environment variables
# Deploy
```

### Option 2: Fly.io
```bash
flyctl launch
flyctl deploy
```

### Option 3: Railway
```bash
railway init
railway up
```

## Testing

```bash
# Server running on http://localhost:3030

# Health check
curl http://localhost:3030/api/health

# Create mock TikTok user
curl -X POST http://localhost:3030/api/auth/tiktok/mock \
  -d "handle=@testcreator"

# Check admin dashboard
open http://localhost:3030/api/admin/dashboard
```

## Next Steps

1. ✅ Server running locally
2. 🚧 Update extension OAuth URLs
3. 🚧 Onboard first 10 influencers
4. 📝 Deploy to production
5. 📝 Add real OAuth
6. 📝 Add database persistence
7. 📝 Integrate Polygon blockchain

---

**Status:** MVP Ready  
**Last Updated:** March 16, 2026
