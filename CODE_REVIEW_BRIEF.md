# DAUfinder / FlyWheel - Code Review Brief

> **Purpose**: This document provides context for an AI agent to review the codebase and suggest improvements for performance, scalability, and business growth.

---

## 🎯 Product Overview

**DAUfinder** is a self-promotion flywheel for product makers:
1. User enters product details + keywords
2. System finds relevant blog posts via Brave Search API
3. AI (Claude) generates a promotional tweet referencing the blog
4. Tweet is posted to X (Twitter) via @flywheelsquad account
5. User pays $1.99 per boost OR subscribes to Prime for bulk boosts

**Live URLs**:
- Frontend: https://daufinder.com
- API: https://fly-wheel.onrender.com
- GitHub Pages mirror: https://lastreetchef.github.io/fly-wheel/

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│   SQLite DB     │
│   (Vite)        │     │  (Node.js)      │     │   (Postgres on  │
│                 │     │                 │     │    Render)      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Twitter  │ │  Stripe  │ │  Claude  │
              │   API    │ │   API    │ │   API    │
              └──────────┘ └──────────┘ └──────────┘
```

**Hosting**: Render.com (auto-deploys on push to main)
**Domain**: daufinder.com (Cloudflare DNS)

---

## 📁 File Structure

```
fly-wheel/
├── server.js           # Main Express server (5776 lines - LARGE!)
├── server/
│   ├── db.js           # SQLite/Postgres database setup
│   ├── twitter.js      # Twitter OAuth & posting
│   ├── blog-search.js  # Brave Search API integration
│   ├── generate.js     # AI content generation (Claude)
│   ├── posts.js        # Post/boost management
│   ├── links.js        # Link tracking
│   ├── shopify.js      # Shopify integration (WIP)
│   ├── auth.js         # Authentication helpers
│   └── product-scraper.js # URL scraping for product info
├── src/
│   ├── App.jsx         # Main React app (1300+ lines - LARGE!)
│   └── components/     # React components
├── public/
│   └── admin.html      # Admin dashboard (standalone HTML)
└── dist/               # Built frontend
```

---

## 🔑 Key Features

### Core Flow
1. **Blog Search**: Uses Brave Search API to find relevant blog posts
2. **AI Generation**: Claude generates promotional content
3. **Payment**: Stripe Checkout for $1.99 per boost
4. **Posting**: Twitter API v2 OAuth 2.0 for posting

### Prime Subscriptions
- **Starter**: $9/mo → 30 boosts ($0.30/boost)
- **Growth**: $29/mo → 100 boosts ($0.29/boost) ⭐ Popular
- **Scale**: $99/mo → 500 boosts ($0.20/boost)
- **Agency**: $199/mo → 1000 boosts ($0.20/boost)

### Rewards System
- Users earn points for engaging with DAUfinder tweets
- Like: +1, Reply: +2, Retweet: +3, Quote: +5, Follow: +10
- 25 points = 1 free boost

### Admin Dashboard
- `/admin.html` - Real-time stats
- Boost metrics, customer tracking, keyword performance
- System health monitoring

---

## 🗄️ Database Schema (Key Tables)

```sql
-- Boosts (main business object)
CREATE TABLE boosts (
  id SERIAL PRIMARY KEY,
  email TEXT,
  product TEXT,
  keywords TEXT,
  blog_url TEXT,
  blog_title TEXT,
  content TEXT,
  tweet_id TEXT,
  tweet_url TEXT,
  status TEXT,  -- pending, published, failed
  source TEXT,  -- paid, prime, self-promo, rewards
  metrics JSONB,  -- impressions, likes, retweets, replies
  created_at TIMESTAMP
);

-- Prime accounts
CREATE TABLE prime_accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  stripe_customer_id TEXT,
  tier TEXT,
  boost_balance INTEGER,
  created_at TIMESTAMP
);

-- Rewards
CREATE TABLE rewards (
  id SERIAL PRIMARY KEY,
  email TEXT,
  twitter_handle TEXT,
  points_balance INTEGER,
  last_sync_at TIMESTAMP
);
```

---

## 🔌 API Endpoints

### Public
- `POST /api/blogs/search?keywords=...` - Find relevant blogs
- `POST /api/generate` - Generate content with AI
- `POST /api/checkout` - Create Stripe checkout session
- `GET /api/status/:sessionId` - Check boost status

### Prime
- `GET /api/prime/tiers` - Get subscription tiers
- `POST /api/subscribe` - Create Prime subscription
- `GET /api/account/:email` - Get account details
- `POST /api/prime/boost` - Use a Prime boost
- `POST /api/prime/connect-twitter` - Connect for rewards
- `POST /api/prime/sync-points` - Sync engagement points

### Admin (requires Bearer token)
- `GET /api/admin/dashboard` - Full stats
- `POST /api/admin/self-boost` - Manual boost trigger
- `GET /api/admin/system/health` - Service health check
- `POST /api/admin/send-followups` - Send follow-up emails

### Webhooks
- `POST /api/webhooks/stripe` - Stripe payment webhooks

---

## ⚠️ Known Issues & Technical Debt

### Code Quality
1. **server.js is 5776 lines** - needs to be split into modules
2. **App.jsx is 1300+ lines** - should be broken into components
3. **Mixed SQLite/Postgres** - inconsistent DB usage
4. **No TypeScript** - would help with maintainability

### Performance
1. **No Redis caching** - using in-memory Map (resets on deploy)
2. **No job queue** - tweet posting is synchronous
3. **No CDN for images** - serving from Express directly
4. **Rate limiting is basic** - per-IP only

### Features (Incomplete)
1. **Shopify integration** - OAuth flow exists but broken
2. **Metrics collection** - needs scheduled job for Twitter stats
3. **Email follow-ups** - partially implemented

### Security
1. **Admin token is hardcoded** - should be env var (it is, but check)
2. **No request validation** - missing input sanitization in places
3. **CORS is wide open** - `*` origin in production

---

## 📊 Current Metrics (from Dashboard)

- Twitter accounts: @flywheelsquad, @themessageis4u
- Database: Postgres on Render
- Typical boost: 100-1000 impressions
- Conversion: ~5% of boosts → customer

---

## 🚀 Growth Opportunities

### Technical
1. Add Redis for caching hot data
2. Implement background job queue (BullMQ)
3. Split server.js into proper modules
4. Add comprehensive error tracking (Sentry)
5. Implement proper rate limiting per user/email

### Product
1. **Scheduling**: Let users schedule boosts
2. **Analytics dashboard**: Show users their boost performance
3. **A/B testing**: Test different content formats
4. **Multi-platform**: Threads, LinkedIn, Bluesky
5. **Referral program**: Users earn boosts for referrals

### Business
1. **Lifetime deals**: One-time payment for X boosts
2. **API access**: Let developers integrate
3. **White-label**: Offer to agencies
4. **Auto-boost subscriptions**: Daily/weekly auto-posts

---

## 🧪 How to Test Locally

```bash
cd fly-wheel
npm install
cp .env.example .env  # Fill in API keys
npm run server        # Start API on :3001
npm run dev           # Start frontend on :5173
```

Required env vars:
- `STRIPE_SECRET_KEY`
- `ANTHROPIC_API_KEY`
- `BRAVE_API_KEY`
- `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`
- `DATABASE_URL` (Postgres)

---

## 📝 Review Request

Please analyze this codebase and provide:

1. **Performance improvements** - What's slowing us down?
2. **Code organization** - How should we restructure?
3. **Scaling strategy** - What breaks at 10x, 100x users?
4. **Feature priorities** - What should we build next?
5. **Security audit** - What vulnerabilities exist?
6. **Cost optimization** - How can we reduce API costs?

Focus on actionable, specific recommendations with code examples where possible.

---

*Generated: February 2026*
*Codebase: https://github.com/LAstreetchef/fly-wheel*
