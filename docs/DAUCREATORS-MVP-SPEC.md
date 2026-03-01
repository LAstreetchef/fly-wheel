# DAUcreators MVP Spec
> Bolt-on to FlyWheel/DAUfinder — Human distribution network for AI-generated content

## Overview

**Problem:** AI accounts have no reach, get suspended, can't penetrate communities.

**Solution:** Pay real humans to share AI-generated content through their established social networks.

**Model:** 
- Client pays $1.99-$9.99 per boost
- AI generates content + finds relevant blogs (existing DAUfinder)
- Creator shares via their real account
- Creator gets $0.50-$4.00, platform keeps the rest

---

## User Flows

### Creator Signup (< 2 minutes)

```
Landing Page
    ↓
"Start Earning" button
    ↓
Sign up (email + password) or Google OAuth
    ↓
Connect at least 1 social account (OAuth)
    - Twitter
    - LinkedIn  
    - Instagram (later)
    - Facebook (later)
    - Reddit (later - manual verification)
    ↓
Set payout method (Stripe Connect / PayPal)
    ↓
Enter Creator Dashboard
```

### Mission Flow (< 30 seconds per share)

```
Creator Dashboard shows available missions
    ↓
Click "Start Mission"
    ↓
See pre-generated content + preview
    - Tweet text
    - Target blog reference
    - Campaign brief (optional reading)
    ↓
Click "Share Now"
    ↓
OAuth posts directly to their account
    ↓
Verification automatic (we have the post ID)
    ↓
Balance updates instantly (+$0.50)
    ↓
Repeat or cash out
```

### Client Flow (unchanged from DAUfinder)

```
Submit product URL + keywords
    ↓
Pay $1.99-$9.99
    ↓
AI generates content
    ↓
Mission goes into creator queue
    ↓
Creator claims + shares
    ↓
Client sees boost completed with real engagement
```

---

## Database Schema

### New Tables

```sql
-- Creators (human distributors)
CREATE TABLE creators (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Payout
  stripe_connect_id VARCHAR(255),
  paypal_email VARCHAR(255),
  balance_cents INTEGER DEFAULT 0,
  lifetime_earned_cents INTEGER DEFAULT 0,
  
  -- Stats
  missions_completed INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 100,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, pending
  verified_at TIMESTAMP
);

-- Creator Social Accounts
CREATE TABLE creator_accounts (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER REFERENCES creators(id),
  platform VARCHAR(50) NOT NULL, -- twitter, linkedin, instagram, facebook, reddit
  
  -- OAuth tokens
  platform_user_id VARCHAR(255),
  username VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  
  -- Stats
  follower_count INTEGER,
  last_synced_at TIMESTAMP,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, cooldown, disconnected
  cooldown_until TIMESTAMP,
  
  UNIQUE(creator_id, platform)
);

-- Missions (tasks for creators)
CREATE TABLE missions (
  id SERIAL PRIMARY KEY,
  
  -- Link to original boost order
  order_id VARCHAR(255) REFERENCES orders(session_id),
  
  -- Content
  platform VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  blog_url VARCHAR(500),
  blog_title VARCHAR(255),
  product_name VARCHAR(255),
  
  -- Payout
  payout_cents INTEGER NOT NULL, -- what creator earns
  
  -- Targeting (optional)
  target_geo VARCHAR(100),
  target_niche VARCHAR(100),
  
  -- Status
  status VARCHAR(50) DEFAULT 'available', -- available, claimed, completed, expired
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  -- Assignment
  claimed_by INTEGER REFERENCES creators(id),
  claimed_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Result
  post_url VARCHAR(500),
  post_id VARCHAR(255)
);

-- Payouts
CREATE TABLE creator_payouts (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER REFERENCES creators(id),
  amount_cents INTEGER NOT NULL,
  method VARCHAR(50), -- stripe, paypal
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  external_id VARCHAR(255) -- Stripe/PayPal transaction ID
);
```

---

## API Endpoints

### Auth
```
POST /api/creators/signup
POST /api/creators/login
GET  /api/creators/me
```

### Social Accounts
```
GET  /api/creators/accounts
POST /api/creators/accounts/connect/:platform  (initiates OAuth)
GET  /api/creators/accounts/callback/:platform (OAuth callback)
DELETE /api/creators/accounts/:id
```

### Missions
```
GET  /api/missions                    (available missions for this creator)
GET  /api/missions/:id                (mission details)
POST /api/missions/:id/claim          (claim a mission)
POST /api/missions/:id/complete       (mark completed - triggers OAuth post)
POST /api/missions/:id/skip           (skip/unclaim)
```

### Earnings
```
GET  /api/creators/earnings           (balance, history)
POST /api/creators/payout             (request payout)
```

---

## Frontend Pages

### Public
- `/creators` — Landing page (the HTML Kam shared)
- `/creators/login` — Sign in
- `/creators/signup` — Create account

### Creator Dashboard (authenticated)
- `/creators/dashboard` — Home (available missions, earnings summary)
- `/creators/missions` — All missions list
- `/creators/mission/:id` — Mission detail + share
- `/creators/accounts` — Connected accounts
- `/creators/earnings` — Earnings history + payout

---

## Mission Generation

When a DAUfinder boost is purchased:

```javascript
async function createMissionFromBoost(order) {
  // Calculate creator payout (e.g., 40% of order price)
  const payoutCents = Math.floor(order.priceCents * 0.40);
  
  // Create mission
  const mission = await db.missions.create({
    order_id: order.sessionId,
    platform: 'twitter', // or multi-platform
    content: order.generatedTweet,
    blog_url: order.blog.url,
    blog_title: order.blog.title,
    product_name: order.productData.name,
    payout_cents: payoutCents,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  });
  
  // Notify available creators (push notification, email, or just show in dashboard)
  await notifyCreators(mission);
  
  return mission;
}
```

---

## OAuth Posting

### Twitter (already have this)
```javascript
async function postToTwitter(creatorAccount, content) {
  const client = new TwitterApi({
    accessToken: creatorAccount.access_token,
    accessSecret: creatorAccount.refresh_token, // if OAuth 1.0a
  });
  
  const tweet = await client.v2.tweet(content);
  return {
    postId: tweet.data.id,
    postUrl: `https://twitter.com/${creatorAccount.username}/status/${tweet.data.id}`
  };
}
```

### LinkedIn (already have this)
```javascript
async function postToLinkedIn(creatorAccount, content) {
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creatorAccount.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      author: `urn:li:person:${creatorAccount.platform_user_id}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    })
  });
  
  const data = await response.json();
  return { postId: data.id, postUrl: `https://linkedin.com/feed/update/${data.id}` };
}
```

---

## Payout System

### Option 1: Stripe Connect (recommended)
- Creator onboards to Stripe Connect
- You transfer funds directly to their Stripe account
- Handles taxes (1099s for US creators)

### Option 2: PayPal Payouts
- Simpler setup
- Batch payouts via PayPal API
- Higher fees

### Option 3: Manual (MVP)
- Creator requests payout
- You manually send via Venmo/PayPal/Zelle
- Track in admin dashboard

**MVP Recommendation:** Start with PayPal Payouts or manual, add Stripe Connect later.

---

## Anti-Fraud

### Creator Verification
- Require minimum follower count (e.g., 100+)
- Verify account age (OAuth gives this)
- Manual review for first few missions
- Reputation score based on completion rate

### Mission Quality
- Random spot-checks on posted content
- Flag if post deleted within 24h
- Cooldown periods between missions (prevent spam)

### Rate Limits
- Max missions per day per creator (e.g., 10)
- Max missions per platform per day (e.g., 5)
- Cooldown between same-niche missions

---

## MVP Scope (1 Week Build)

### Week 1 Deliverables

**Day 1-2: Database + Auth**
- [ ] Creator signup/login (email + password)
- [ ] Creator accounts table
- [ ] JWT auth for creator endpoints

**Day 3-4: Social Connect**
- [ ] Twitter OAuth for creators (reuse existing)
- [ ] LinkedIn OAuth for creators (reuse existing)
- [ ] Store tokens per creator

**Day 5: Missions**
- [ ] Mission table + CRUD
- [ ] Hook into DAUfinder boost flow → create mission
- [ ] Mission list endpoint for creators
- [ ] Claim/complete mission endpoints

**Day 6: Posting + Dashboard**
- [ ] OAuth posting on mission complete
- [ ] Basic creator dashboard UI
- [ ] Earnings display

**Day 7: Payouts + Polish**
- [ ] Manual payout request system
- [ ] Admin view of pending payouts
- [ ] Testing + bug fixes

### Post-MVP (Week 2+)
- Instagram OAuth
- Facebook OAuth
- Reddit (manual verification)
- Stripe Connect payouts
- Push notifications for new missions
- Referral program for creators
- Tier system (more missions = better payouts)
- Mobile-responsive dashboard

---

## File Structure

```
fly-wheel/
├── server.js                    # Add creator routes
├── server/
│   ├── routes/
│   │   └── creators.js          # NEW: Creator API routes
│   ├── services/
│   │   └── creatorService.js    # NEW: Creator business logic
│   └── db/
│       └── schema.sql           # Add new tables
├── public/
│   ├── creators.html            # Landing page (from Kam)
│   ├── creator-dashboard.html   # NEW: Dashboard
│   └── creator-mission.html     # NEW: Mission view
└── docs/
    └── DAUCREATORS-MVP-SPEC.md  # This file
```

---

## Success Metrics

### Creator Side
- Signups per week
- Active creators (completed 1+ mission in 7 days)
- Avg missions per creator per week
- Creator retention (week over week)
- Avg payout per creator

### Client Side
- Boosts fulfilled by creators vs AI
- Engagement rate (likes, comments) on creator posts vs AI posts
- Client satisfaction / repeat rate

### Business
- Revenue per boost (unchanged)
- Cost per boost (creator payout)
- Net margin per boost
- Total creator payouts

---

## Questions to Resolve

1. **Pricing split:** What % goes to creator? (Suggested: 40%)
2. **Minimum payout:** $10? $25?
3. **Mission expiry:** 24h? 48h?
4. **Platform priority:** Twitter + LinkedIn first? Add others when?
5. **Creator approval:** Auto-approve or manual review?
6. **Content editing:** Can creators modify AI content or must post exact?

---

*Spec written by Street Chef 🔪 — 2026-03-01*
