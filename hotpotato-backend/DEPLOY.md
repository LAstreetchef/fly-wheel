# Deploy Hot Potato Backend to Render

## Quick Deploy (5 minutes)

### 1. Go to Render Dashboard
https://dashboard.render.com/

### 2. Create New Web Service
- Click **"New +"** → **"Web Service"**
- Connect to **GitHub repo:** `LAstreetchef/hotpotato`
- Branch: `main`
- Root Directory: `backend`

### 3. Configure Service

**Name:** `hotpotato-api`  
**Environment:** `Node`  
**Region:** `Oregon (US West)` (or closest to you)  
**Branch:** `main`  
**Root Directory:** `backend`  

**Build Command:**
```
npm install
```

**Start Command:**
```
npm start
```

**Instance Type:** `Starter ($7/month)` or Free tier if available

### 4. Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these:
```
NODE_ENV=production
PORT=3030
SESSION_SECRET=hot-potato-prod-secret-change-me-to-random-string
ADMIN_KEY=hotpotato-admin-2026
```

### 5. Click "Create Web Service"

Render will:
- Clone the repo
- Install dependencies
- Start the server
- Give you a URL like: `https://hotpotato-api.onrender.com`

### 6. Test It

Once deployed, visit:
```
https://hotpotato-api.onrender.com/api/health
```

Should return:
```json
{
  "status": "ok",
  "version": "1.0.0-mvp",
  "users": 0,
  "markets": 0
}
```

### 7. Admin Panel

Visit:
```
https://hotpotato-api.onrender.com/api/admin/dashboard
```

You can now give points to influencers!

### 8. Update Extension

Once you have the Render URL, update the extension OAuth URLs from:
```
http://localhost:3030/api/auth/tiktok
```

To:
```
https://hotpotato-api.onrender.com/api/auth/tiktok
```

## Next: Add Supabase Database

Currently using in-memory storage (resets on deploy). To persist data:

1. Create Supabase project
2. Get PostgreSQL connection string
3. Add to Render env vars:
   ```
   DATABASE_URL=postgresql://...
   ```
4. Migrate code to use Drizzle ORM with Supabase

---

**Estimated time:** 5 minutes  
**Cost:** $7/month (or free tier)  
**Auto-deploys:** Yes (on git push to main)
