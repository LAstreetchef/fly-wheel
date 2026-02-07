import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import { Resend } from 'resend';
import pg from 'pg';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================
// Simple In-Memory Cache
// ============================================
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttl = CACHE_TTL) {
  cache.set(key, { value, expires: Date.now() + ttl });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ============================================
// Database Order Store (PostgreSQL or SQLite)
// ============================================

const usePostgres = !!process.env.DATABASE_URL;
let orderStore;

if (usePostgres) {
  // PostgreSQL for production (Render)
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  
  // Initialize schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      product_data JSONB,
      blog JSONB,
      content TEXT,
      email TEXT,
      tweet_url TEXT,
      tweet_id TEXT,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      follow_up_sent BOOLEAN DEFAULT FALSE,
      metrics JSONB,
      error TEXT,
      source TEXT,
      keywords TEXT
    )
  `);
  
  // Add columns if they don't exist (for existing DBs)
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS keywords TEXT`).catch(() => {});
  
  orderStore = {
    async get(sessionId) {
      const { rows } = await pool.query('SELECT * FROM orders WHERE session_id = $1', [sessionId]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        status: row.status,
        productData: row.product_data,
        blog: row.blog,
        content: row.content,
        email: row.email,
        tweetUrl: row.tweet_url,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        followUpSent: row.follow_up_sent,
        metrics: row.metrics,
        error: row.error,
        source: row.source,
        keywords: row.keywords,
      };
    },
    
    async set(sessionId, order) {
      await pool.query(`
        INSERT INTO orders (session_id, status, product_data, blog, content, email, tweet_url, tweet_id, published_at, created_at, follow_up_sent, metrics, error, source, keywords)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT(session_id) DO UPDATE SET
          status = EXCLUDED.status,
          product_data = EXCLUDED.product_data,
          blog = EXCLUDED.blog,
          content = EXCLUDED.content,
          email = EXCLUDED.email,
          tweet_url = EXCLUDED.tweet_url,
          tweet_id = EXCLUDED.tweet_id,
          published_at = EXCLUDED.published_at,
          follow_up_sent = EXCLUDED.follow_up_sent,
          metrics = EXCLUDED.metrics,
          error = EXCLUDED.error,
          source = EXCLUDED.source,
          keywords = EXCLUDED.keywords
      `, [
        sessionId,
        order.status || 'pending',
        order.productData ? JSON.stringify(order.productData) : null,
        order.blog ? JSON.stringify(order.blog) : null,
        order.content || null,
        order.email || null,
        order.tweetUrl || null,
        order.tweetId || null,
        order.publishedAt || null,
        order.createdAt || new Date().toISOString(),
        order.followUpSent || false,
        order.metrics ? JSON.stringify(order.metrics) : null,
        order.error || null,
        order.source || null,
        order.keywords || null
      ]);
    },
    
    async all() {
      const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      return rows.map(row => ({
        sessionId: row.session_id,
        status: row.status,
        productData: row.product_data,
        blog: row.blog,
        content: row.content,
        email: row.email,
        tweetUrl: row.tweet_url,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        followUpSent: row.follow_up_sent,
        metrics: row.metrics,
        error: row.error,
        source: row.source,
        keywords: row.keywords,
      }));
    },
    
    async pendingFollowUps() {
      const { rows } = await pool.query(`
        SELECT session_id, status, email, tweet_id, published_at FROM orders 
        WHERE status = 'published' 
          AND follow_up_sent = FALSE 
          AND email IS NOT NULL 
          AND tweet_id IS NOT NULL
      `);
      return rows.map(row => ({
        sessionId: row.session_id,
        status: row.status,
        email: row.email,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
      }));
    },
    
    async count() {
      const { rows } = await pool.query('SELECT COUNT(*) as count FROM orders');
      return parseInt(rows[0].count, 10);
    }
  };
  
  console.log(`📦 Orders database: PostgreSQL (${await orderStore.count()} orders)`);
  
} else {
  // SQLite for local development
  const dbPath = process.env.DB_PATH || join(__dirname, 'orders.db');
  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      product_data TEXT,
      blog TEXT,
      content TEXT,
      email TEXT,
      tweet_url TEXT,
      tweet_id TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      follow_up_sent INTEGER DEFAULT 0,
      metrics TEXT,
      error TEXT,
      source TEXT,
      keywords TEXT
    )
  `);
  
  // Add columns if they don't exist (for existing DBs)
  try { db.exec('ALTER TABLE orders ADD COLUMN source TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE orders ADD COLUMN keywords TEXT'); } catch(e) {}
  
  orderStore = {
    async get(sessionId) {
      const row = db.prepare('SELECT * FROM orders WHERE session_id = ?').get(sessionId);
      if (!row) return null;
      return {
        status: row.status,
        productData: row.product_data ? JSON.parse(row.product_data) : null,
        blog: row.blog ? JSON.parse(row.blog) : null,
        content: row.content,
        email: row.email,
        tweetUrl: row.tweet_url,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        followUpSent: !!row.follow_up_sent,
        metrics: row.metrics ? JSON.parse(row.metrics) : null,
        error: row.error,
        source: row.source,
        keywords: row.keywords,
      };
    },
    
    async set(sessionId, order) {
      db.prepare(`
        INSERT INTO orders (session_id, status, product_data, blog, content, email, tweet_url, tweet_id, published_at, created_at, follow_up_sent, metrics, error, source, keywords)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          product_data = excluded.product_data,
          blog = excluded.blog,
          content = excluded.content,
          email = excluded.email,
          tweet_url = excluded.tweet_url,
          tweet_id = excluded.tweet_id,
          published_at = excluded.published_at,
          follow_up_sent = excluded.follow_up_sent,
          metrics = excluded.metrics,
          error = excluded.error,
          source = excluded.source,
          keywords = excluded.keywords
      `).run(
        sessionId,
        order.status || 'pending',
        order.productData ? JSON.stringify(order.productData) : null,
        order.blog ? JSON.stringify(order.blog) : null,
        order.content || null,
        order.email || null,
        order.tweetUrl || null,
        order.tweetId || null,
        order.publishedAt || null,
        order.createdAt || new Date().toISOString(),
        order.followUpSent ? 1 : 0,
        order.metrics ? JSON.stringify(order.metrics) : null,
        order.error || null,
        order.source || null,
        order.keywords || null
      );
    },
    
    async all() {
      const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
      return rows.map(row => ({
        sessionId: row.session_id,
        status: row.status,
        productData: row.product_data ? JSON.parse(row.product_data) : null,
        blog: row.blog ? JSON.parse(row.blog) : null,
        content: row.content,
        email: row.email,
        tweetUrl: row.tweet_url,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        followUpSent: !!row.follow_up_sent,
        metrics: row.metrics ? JSON.parse(row.metrics) : null,
        error: row.error,
        source: row.source,
        keywords: row.keywords,
      }));
    },
    
    async pendingFollowUps() {
      return db.prepare(`
        SELECT session_id, status, email, tweet_id, published_at FROM orders 
        WHERE status = 'published' 
          AND follow_up_sent = 0 
          AND email IS NOT NULL 
          AND tweet_id IS NOT NULL
      `).all().map(row => ({
        sessionId: row.session_id,
        status: row.status,
        email: row.email,
        tweetId: row.tweet_id,
        publishedAt: row.published_at,
      }));
    },
    
    async count() {
      return db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    }
  };
  
  console.log(`📦 Orders database: SQLite @ ${dbPath} (${await orderStore.count()} orders)`);
}

// Backwards compatibility wrapper (now async)
const orders = {
  get: (id) => orderStore.get(id),
  set: (id, order) => orderStore.set(id, order),
};

// Config
const BOOST_PRICE = 175; // $1.75 in cents
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// Middleware
app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 generations per minute (prevents Claude abuse)
  message: { error: 'Too many generation requests, please slow down.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 checkout attempts per minute
  message: { error: 'Too many checkout attempts, please slow down.' },
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
}

// Serve admin dashboard
app.use('/public', express.static(join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin.html'));
});

// ============================================
// Blog Search
// ============================================

async function searchBlogs(keywords) {
  if (!BRAVE_API_KEY) {
    console.warn('⚠️  BRAVE_API_KEY not set, using mock');
    return [{
      title: 'Sample Blog About ' + keywords,
      url: 'https://example.com/blog/sample',
      snippet: 'This is a sample blog post matching your keywords...',
      source: 'example.com',
    }];
  }

  // Check cache first
  const cacheKey = `blogs:${keywords.toLowerCase().trim()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`📦 Blog search cache hit: "${keywords}"`);
    return cached;
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keywords + ' blog')}&count=10`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
  });
  
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  
  const results = (data.web?.results || [])
    .filter(r => /blog|post|article|\/20/.test(r.url.toLowerCase()))
    .slice(0, 6)
    .map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      source: new URL(r.url).hostname.replace('www.', ''),
    }));

  const finalResults = results.length ? results : (data.web?.results || []).slice(0, 6).map(r => ({
    title: r.title, url: r.url, snippet: r.description,
    source: new URL(r.url).hostname.replace('www.', ''),
  }));

  // Cache for 1 hour
  setCache(cacheKey, finalResults);
  console.log(`📦 Blog search cached: "${keywords}" (${finalResults.length} results)`);
  
  return finalResults;
}

// ============================================
// Content Generation
// ============================================

async function generateBoostContent(productData, blog) {
  // Parse X handles - normalize to @handle format
  const xHandles = (productData.xHandles || '')
    .split(/[,\s]+/)
    .map(h => h.trim())
    .filter(h => h)
    .map(h => h.startsWith('@') ? h : `@${h}`)
    .slice(0, 3); // Max 3 tags
  
  const tagsSection = xHandles.length > 0 
    ? `\nACCOUNTS TO TAG: ${xHandles.join(', ')}` 
    : '';
  
  const tagsInstruction = xHandles.length > 0
    ? `7. Naturally incorporate these tags: ${xHandles.join(', ')}`
    : '';

  const prompt = `You are a social media expert creating a promotional X (Twitter) post.

PRODUCT:
- Name: ${productData.name}
- Description: ${productData.description || 'N/A'}
- URL: ${productData.productUrl || 'N/A'}${tagsSection}

BLOG TO PROMOTE ALONGSIDE:
- Title: ${blog.title}
- URL: ${blog.url}
- Snippet: ${blog.snippet || 'N/A'}

Create a natural, engaging X post (max 280 chars) that:
1. References the blog content as valuable/interesting
2. Naturally mentions the product as relevant/useful
3. Includes [BLOG_LINK] placeholder for the blog URL
4. Includes [PRODUCT_LINK] placeholder for the product URL (if provided)
5. Uses 1-2 relevant hashtags
6. Feels authentic, not spammy
${tagsInstruction}

Return ONLY the tweet text, nothing else.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    const tagsStr = xHandles.length > 0 ? `\n\n${xHandles.join(' ')}` : '';
    return `Great insights on ${blog.title.substring(0, 40)}...

Check out ${productData.name} if you're into this!

[BLOG_LINK]
[PRODUCT_LINK]${tagsStr}`;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

// ============================================
// Twitter Posting (multi-account support)
// ============================================

const TWITTER_ACCOUNTS = {
  flywheelsquad: {
    handle: 'flywheelsquad',
    apiKey: () => process.env.TWITTER_API_KEY,
    apiSecret: () => process.env.TWITTER_API_SECRET,
    accessToken: () => process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: () => process.env.TWITTER_ACCESS_SECRET,
  },
  themessageis4u: {
    handle: 'themessageis4u',
    apiKey: () => process.env.TWITTER2_API_KEY,
    apiSecret: () => process.env.TWITTER2_API_SECRET,
    accessToken: () => process.env.TWITTER2_ACCESS_TOKEN,
    accessSecret: () => process.env.TWITTER2_ACCESS_SECRET,
  },
};

async function postTweet(text, accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();
  
  if (!accessToken || !accessSecret) {
    console.warn(`⚠️  Twitter tokens not set for ${account.handle}, mock posting`);
    return {
      tweetId: 'mock_' + Date.now(),
      tweetUrl: `https://x.com/${account.handle}/status/mock_` + Date.now(),
      account: account.handle,
    };
  }

  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
  
  const { data } = await client.v2.tweet(text);
  
  return {
    tweetId: data.id,
    tweetUrl: `https://x.com/${account.handle}/status/${data.id}`,
    account: account.handle,
  };
}

// ============================================
// API Routes
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'daufinder' });
});

app.get('/api/blogs/search', async (req, res) => {
  try {
    const { keywords } = req.query;
    if (!keywords) return res.status(400).json({ error: 'Keywords required' });
    const results = await searchBlogs(keywords);
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate', generateLimiter, async (req, res) => {
  try {
    const { productData, blog } = req.body;
    if (!productData?.name || !blog?.url) {
      return res.status(400).json({ error: 'Product data and blog required' });
    }
    const content = await generateBoostContent(productData, blog);
    res.json({ content });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Support both old and new endpoint paths
app.post(['/api/checkout', '/api/boost/checkout'], checkoutLimiter, async (req, res) => {
  try {
    const { productData, blog, content } = req.body;
    
    console.log('📥 Checkout request received:');
    console.log('   productData:', JSON.stringify(productData));
    console.log('   productData.email:', productData?.email || '(missing)');
    
    if (!productData?.name || !blog?.url || !content) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    // Truncate metadata to fit Stripe's 500 char limit per value
    const truncate = (str, max) => str && str.length > max ? str.substring(0, max - 3) + '...' : str;
    const blogMeta = JSON.stringify({
      url: blog.url,
      title: truncate(blog.title, 100),
    });
    const productMeta = JSON.stringify({
      name: productData.name,
      productUrl: productData.productUrl || '',
      email: productData.email || '',
    });
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'DAUfinder',
            description: `Promote "${productData.name}" on X`,
          },
          unit_amount: BOOST_PRICE,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: FRONTEND_URL,
      metadata: {
        productData: productMeta,
        blog: blogMeta,
        content: truncate(content, 500),
        email: productData.email || '',
      },
    });
    
    await orders.set(session.id, {
      status: 'pending',
      productData,
      blog,
      content,
      email: productData.email || '',
      createdAt: new Date().toISOString(),
      followUpSent: false,
    });
    
    console.log(`📝 Order created: ${session.id.substring(0, 20)}... | email: ${productData.email || '(none)'}`);
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get(['/api/status/:sessionId', '/api/boost/status/:sessionId'], async (req, res) => {
  const order = await orders.get(req.params.sessionId);
  if (!order) return res.status(404).json({ status: 'not_found' });
  res.json(order);
});

// ============================================
// Tweet Metrics & Follow-up Emails
// ============================================

async function getTweetMetrics(tweetId) {
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  
  if (!accessToken || !accessSecret) {
    return { impressions: 2500, engagements: 150, clicks: 50 }; // Mock data
  }
  
  try {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken,
      accessSecret,
    });
    
    const tweet = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics'],
    });
    
    const metrics = tweet.data?.public_metrics || {};
    return {
      impressions: metrics.impression_count || 0,
      engagements: (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0),
      likes: metrics.like_count || 0,
      retweets: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
    };
  } catch (err) {
    console.error('Failed to get tweet metrics:', err.message);
    return null;
  }
}

async function sendConfirmationEmail(order) {
  if (!resend || !order.email) {
    console.warn('⚠️  Cannot send confirmation email: missing Resend API key or email');
    return false;
  }
  
  const productName = order.productData?.name || 'your product';
  const tweetUrl = order.tweetUrl || '#';
  const blogTitle = order.blog?.title || 'a relevant blog';
  const blogUrl = order.blog?.url || '#';
  
  try {
    await resend.emails.send({
      from: 'DAUfinder <message4u@secretmessage4u.com>',
      to: order.email,
      subject: `🎉 Your Boost for "${productName}" is LIVE!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 16px;">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f97316; margin: 0; font-size: 32px;">🚀 You're Live!</h1>
            <p style="color: #888; margin-top: 8px;">Your boost for <strong style="color: #fff;">${productName}</strong> is now on X</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #f97316 0%, #eab308 100%); padding: 3px; border-radius: 12px; margin: 24px 0;">
            <div style="background: #1a1a1a; border-radius: 10px; padding: 20px; text-align: center;">
              <a href="${tweetUrl}" style="color: #f97316; font-weight: bold; font-size: 18px; text-decoration: none;">
                👉 View Your Boost on X →
              </a>
            </div>
          </div>
          
          <div style="background: #111; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #f97316; font-size: 18px; margin: 0 0 12px 0;">🤝 Your Blog Partner</h2>
            <p style="color: #ccc; margin: 0 0 12px 0;">We paired <strong style="color: #fff;">${productName}</strong> with this relevant content:</p>
            <a href="${blogUrl}" target="_blank" style="display: block; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; text-decoration: none; color: inherit;">
              <p style="color: #fff; font-weight: 600; margin: 0 0 4px 0; font-size: 15px;">${blogTitle}</p>
              <p style="color: #f97316; font-size: 13px; margin: 0;">Read the article →</p>
            </a>
            <p style="color: #888; font-size: 13px; margin: 12px 0 0 0;">💡 <em>Consider reaching out to the author — a genuine connection could lead to more exposure!</em></p>
          </div>
          
          <div style="background: #111; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #f97316; font-size: 18px; margin: 0 0 16px 0;">📊 What Happens Next?</h2>
            <ul style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
              <li><strong>Right now:</strong> Your boost is being served to X users interested in your niche</li>
              <li><strong>Next 24-48 hours:</strong> Impressions, engagements, and clicks accumulate</li>
              <li><strong>Then:</strong> We'll email you a full performance report with real stats</li>
            </ul>
          </div>
          
          <div style="background: #111; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #f97316; font-size: 18px; margin: 0 0 16px 0;">💡 Pro Tips to Maximize Your Boost</h2>
            <ul style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
              <li><strong>Engage with replies</strong> — responding to comments boosts visibility</li>
              <li><strong>Retweet it</strong> from your own account for extra reach</li>
              <li><strong>Stack boosts</strong> — multiple boosts across different blogs = more exposure</li>
              <li><strong>Share the link</strong> — drop your boost URL in your communities</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 32px 0; padding: 24px; border: 2px dashed #333; border-radius: 12px;">
            <p style="color: #888; margin: 0 0 12px 0;">Ready for more visibility?</p>
            <a href="${FRONTEND_URL}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #eab308 100%); color: #000; font-weight: bold; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Create Another Boost →
            </a>
          </div>
          
          <div style="border-top: 1px solid #333; padding-top: 24px; margin-top: 32px;">
            <p style="color: #666; font-size: 13px; margin: 0; text-align: center;">
              Questions? Just reply to this email.<br>
              <span style="color: #888;">— The DAUfinder Team</span>
            </p>
          </div>
          
        </div>
      `,
    });
    console.log(`✅ Confirmation email sent to ${order.email}`);
    return true;
  } catch (err) {
    console.error('Failed to send confirmation email:', err.message);
    return false;
  }
}

async function sendFollowUpEmail(order, metrics) {
  if (!resend || !order.email) {
    console.warn('⚠️  Cannot send email: missing Resend API key or email');
    return false;
  }
  
  try {
    await resend.emails.send({
      from: 'DAUfinder <message4u@secretmessage4u.com>',
      to: order.email,
      subject: `🚀 Your Boost Results: ${metrics.impressions.toLocaleString()} impressions!`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h1 style="color: #f97316;">Your Boost Performance</h1>
          <p>Hey! Here's how your boost for <strong>${order.productData?.name || 'your product'}</strong> performed:</p>
          
          <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-around; text-align: center;">
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.impressions.toLocaleString()}</div>
                <div style="color: #888; font-size: 12px;">Impressions</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.engagements}</div>
                <div style="color: #888; font-size: 12px;">Engagements</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.likes}</div>
                <div style="color: #888; font-size: 12px;">Likes</div>
              </div>
            </div>
          </div>
          
          <p><a href="${order.tweetUrl}" style="color: #f97316;">View your boost on X →</a></p>
          
          <p style="color: #888; margin-top: 30px;">Ready for another boost? <a href="${FRONTEND_URL}" style="color: #f97316;">Create one now</a></p>
          
          <p style="color: #666; font-size: 12px; margin-top: 40px;">— DAUfinder by FlyWheel</p>
        </div>
      `,
    });
    console.log(`✅ Follow-up email sent to ${order.email}`);
    return true;
  } catch (err) {
    console.error('Failed to send follow-up email:', err.message);
    return false;
  }
}

// Endpoint to trigger follow-up emails (call via cron or manually)
// Debug: List all orders (remove in production)
app.get('/api/admin/orders', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const allOrders = (await orderStore.all()).map(order => ({
    sessionId: order.sessionId?.substring(0, 20) + '...',
    ...order
  }));
  res.json(allOrders);
});

app.post('/api/admin/send-followups', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const now = Date.now();
  const FOLLOWUP_DELAY = 24 * 60 * 60 * 1000; // 24 hours for production
  let sent = 0;
  
  const pending = await orderStore.pendingFollowUps();
  for (const row of pending) {
    const publishedAt = new Date(row.publishedAt).getTime();
    if (now - publishedAt < FOLLOWUP_DELAY) continue;
    
    const order = await orderStore.get(row.sessionId);
    if (!order) continue;
    
    const metrics = await getTweetMetrics(order.tweetId);
    if (metrics) {
      const emailSent = await sendFollowUpEmail(order, metrics);
      if (emailSent) {
        order.followUpSent = true;
        order.metrics = metrics;
        await orderStore.set(row.sessionId, order);
        sent++;
      }
    }
  }
  
  res.json({ sent, checked: pending.length });
});

// ============================================
// Self-Promotion Flywheel
// ============================================

const DAUFINDER_PRODUCT = {
  name: 'DAUfinder',
  description: 'Find daily active users for your product. We match you with relevant blogs, craft a promo post, and publish to X. Just $1.75.',
  productUrl: 'https://lastreetchef.github.io/fly-wheel/',
  email: 'kammiceli@gmail.com',
};

const KEYWORD_ROTATION = [
  // Week 1: Startup/Indie
  ['startup marketing', 'product launch strategy', 'indie hackers growth'],
  ['bootstrapped startup', 'micro SaaS marketing', 'solo founder tips'],
  // Week 2: Creator/SaaS
  ['creator economy tools', 'newsletter growth hacks', 'content creator monetization'],
  ['SaaS growth strategies', 'B2B marketing tactics', 'product-led growth'],
  // Week 3: Tech/AI
  ['AI tools for marketers', 'automation for startups', 'no-code marketing'],
  ['fintech app promotion', 'developer tools marketing', 'API product launch'],
  // Week 4: Social/Content
  ['X Twitter growth', 'social media marketing tips', 'viral content strategy'],
  ['content marketing ROI', 'SEO content promotion', 'blog traffic growth'],
];

// Track self-promo stats (no cap - experimenting with volume)
let selfPromoStats = {
  totalBoosts: 0,
  totalSpend: 0,
  lastBoostDate: null,
  dailyBoosts: 0,
  keywordIndex: 0,
};

// Get today's keyword set (rotates daily)
function getTodaysKeywords() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const index = dayOfYear % KEYWORD_ROTATION.length;
  return KEYWORD_ROTATION[index];
}

// Self-boost endpoint - triggers a DAUfinder promo (no payment)
app.post('/api/admin/self-boost', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Track daily stats (no cap - experimenting with volume)
  const today = new Date().toDateString();
  if (selfPromoStats.lastBoostDate !== today) {
    selfPromoStats.dailyBoosts = 0;
    selfPromoStats.lastBoostDate = today;
  }
  
  const costPerBoost = 1.75; // virtual cost for ROI tracking

  try {
    // Get keywords (from request or use rotation)
    const keywords = req.body.keywords || getTodaysKeywords()[Math.floor(Math.random() * 3)];
    // Get account (flywheelsquad or themessageis4u)
    const account = req.body.account || 'flywheelsquad';
    console.log(`🔄 Self-boost starting with keywords: "${keywords}" on @${account}`);
    
    // Search for blogs
    const blogs = await searchBlogs(keywords);
    if (!blogs || blogs.length === 0) {
      return res.status(404).json({ error: 'No blogs found for keywords', keywords });
    }
    
    // Pick a random blog from top results
    const blog = blogs[Math.floor(Math.random() * Math.min(3, blogs.length))];
    console.log(`📰 Selected blog: ${blog.title}`);
    
    // Generate content
    const content = await generateBoostContent(DAUFINDER_PRODUCT, blog);
    console.log(`✨ Generated content: ${content.substring(0, 100)}...`);
    
    // Replace placeholders
    const finalContent = content
      .replace('[BLOG_LINK]', blog.url)
      .replace('[PRODUCT_LINK]', DAUFINDER_PRODUCT.productUrl);
    
    // Post to Twitter (with account selection)
    const result = await postTweet(finalContent, account);
    console.log(`🚀 Self-boost posted to @${result.account}: ${result.tweetUrl}`);
    
    // Create order record for tracking
    const orderId = `self_${Date.now()}`;
    await orders.set(orderId, {
      status: 'published',
      productData: DAUFINDER_PRODUCT,
      blog,
      content: finalContent,
      email: DAUFINDER_PRODUCT.email,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      twitterAccount: result.account,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'self-promo', // Track this is internal
      keywords,
      followUpSent: false,
    });
    
    // Update stats
    selfPromoStats.totalBoosts++;
    selfPromoStats.totalSpend += costPerBoost;
    selfPromoStats.dailyBoosts++;
    
    res.json({
      success: true,
      account: result.account,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      keywords,
      blog: { title: blog.title, url: blog.url },
      stats: {
        dailyBoosts: selfPromoStats.dailyBoosts,
        totalBoosts: selfPromoStats.totalBoosts,
        totalSpend: selfPromoStats.totalSpend,
      }
    });
    
  } catch (error) {
    console.error('❌ Self-boost failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get self-promo stats
app.get('/api/admin/self-boost/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Get all self-promo orders
  const allOrders = await orderStore.all();
  const selfPromoOrders = allOrders.filter(o => o.source === 'self-promo');
  
  // Calculate metrics
  const totalOrders = allOrders.length;
  const customerOrders = allOrders.filter(o => o.source !== 'self-promo');
  const revenue = customerOrders.length * 1.75;
  const spend = selfPromoOrders.length * 1.75;
  const roi = spend > 0 ? ((revenue - spend) / spend * 100).toFixed(1) : 0;
  
  res.json({
    selfPromo: {
      total: selfPromoOrders.length,
      spend: spend.toFixed(2),
      ...selfPromoStats,
    },
    customers: {
      total: customerOrders.length,
      revenue: revenue.toFixed(2),
    },
    roi: `${roi}%`,
    keywords: getTodaysKeywords(),
  });
});

// Full dashboard with all metrics
app.get('/api/admin/dashboard', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const allOrders = await orderStore.all();
  const selfPromoOrders = allOrders.filter(o => o.source === 'self-promo');
  const customerOrders = allOrders.filter(o => o.source !== 'self-promo' && !o.sessionId?.startsWith('self_'));
  
  // Revenue & costs
  const revenue = customerOrders.filter(o => o.status === 'published').length * 1.75;
  const actualCostPerBoost = 0.008; // ~$0.008 actual API cost
  const actualSpend = selfPromoOrders.length * actualCostPerBoost;
  
  // Time-based analysis
  const now = new Date();
  const today = now.toDateString();
  const last24h = now.getTime() - 24 * 60 * 60 * 1000;
  const last7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  
  const boostsToday = selfPromoOrders.filter(o => new Date(o.createdAt).toDateString() === today).length;
  const boostsLast24h = selfPromoOrders.filter(o => new Date(o.createdAt).getTime() > last24h).length;
  const boostsLast7d = selfPromoOrders.filter(o => new Date(o.createdAt).getTime() > last7d).length;
  
  const customersToday = customerOrders.filter(o => new Date(o.createdAt).toDateString() === today).length;
  const customersLast24h = customerOrders.filter(o => new Date(o.createdAt).getTime() > last24h).length;
  const customersLast7d = customerOrders.filter(o => new Date(o.createdAt).getTime() > last7d).length;
  
  // Keyword performance
  const keywordStats = {};
  selfPromoOrders.forEach(o => {
    const kw = o.keywords || 'unknown';
    if (!keywordStats[kw]) {
      keywordStats[kw] = { boosts: 0, tweets: [] };
    }
    keywordStats[kw].boosts++;
    if (o.tweetId) {
      keywordStats[kw].tweets.push({
        tweetId: o.tweetId,
        tweetUrl: o.tweetUrl,
        blog: o.blog?.title,
        createdAt: o.createdAt,
      });
    }
  });
  
  // Blog source performance
  const blogStats = {};
  selfPromoOrders.forEach(o => {
    const source = o.blog?.url ? new URL(o.blog.url).hostname.replace('www.', '') : 'unknown';
    if (!blogStats[source]) {
      blogStats[source] = { boosts: 0, blogs: [] };
    }
    blogStats[source].boosts++;
    blogStats[source].blogs.push(o.blog?.title);
  });
  
  // Hour of day analysis (for finding best times)
  const hourStats = Array(24).fill(0);
  selfPromoOrders.forEach(o => {
    const hour = new Date(o.createdAt).getHours();
    hourStats[hour]++;
  });
  
  // Recent activity feed
  const recentBoosts = selfPromoOrders.slice(0, 10).map(o => ({
    keywords: o.keywords,
    blog: o.blog?.title,
    blogSource: o.blog?.url ? new URL(o.blog.url).hostname.replace('www.', '') : null,
    tweetUrl: o.tweetUrl,
    createdAt: o.createdAt,
  }));
  
  const recentCustomers = customerOrders.slice(0, 10).map(o => ({
    product: o.productData?.name,
    blog: o.blog?.title,
    tweetUrl: o.tweetUrl,
    status: o.status,
    createdAt: o.createdAt,
  }));
  
  // Calculate conversion rate (customers per boost)
  const conversionRate = selfPromoOrders.length > 0 
    ? (customersLast7d / Math.max(boostsLast7d, 1) * 100).toFixed(2) 
    : '0.00';
  
  // CAC calculation
  const cac = customersLast7d > 0 
    ? (boostsLast7d * actualCostPerBoost / customersLast7d).toFixed(4)
    : 'N/A';
  
  res.json({
    summary: {
      totalBoosts: selfPromoOrders.length,
      totalCustomers: customerOrders.length,
      totalRevenue: revenue.toFixed(2),
      actualSpend: actualSpend.toFixed(4),
      profit: (revenue - actualSpend).toFixed(2),
      roi: actualSpend > 0 ? ((revenue - actualSpend) / actualSpend * 100).toFixed(0) + '%' : 'N/A',
    },
    today: {
      boosts: boostsToday,
      customers: customersToday,
      revenue: (customersToday * 1.75).toFixed(2),
    },
    last24h: {
      boosts: boostsLast24h,
      customers: customersLast24h,
      revenue: (customersLast24h * 1.75).toFixed(2),
    },
    last7d: {
      boosts: boostsLast7d,
      customers: customersLast7d,
      revenue: (customersLast7d * 1.75).toFixed(2),
      conversionRate: conversionRate + '%',
      cac: cac,
    },
    performance: {
      byKeyword: keywordStats,
      byBlogSource: Object.entries(blogStats)
        .sort((a, b) => b[1].boosts - a[1].boosts)
        .slice(0, 10)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v.boosts }), {}),
      byHour: hourStats,
    },
    recentBoosts,
    recentCustomers,
    config: {
      keywordRotation: KEYWORD_ROTATION,
      todaysKeywords: getTodaysKeywords(),
      costPerBoost: actualCostPerBoost,
    },
  });
});

// ============================================
// Stripe Webhook
// ============================================

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
      console.warn('⚠️  Webhook signature not verified');
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment received:', session.id);
    console.log('   Metadata email:', session.metadata?.email || '(none)');
    
    const order = await orders.get(session.id);
    console.log('   Order found:', order ? 'yes' : 'NO - order missing!');
    if (order) {
      console.log('   Order email:', order.email || '(none)');
      try {
        const blog = JSON.parse(session.metadata.blog);
        const productData = JSON.parse(session.metadata.productData);
        let content = session.metadata.content;
        
        content = content
          .replace('[BLOG_LINK]', blog.url)
          .replace('[PRODUCT_LINK]', productData.productUrl || '');
        
        const result = await postTweet(content);
        
        order.status = 'published';
        order.tweetUrl = result.tweetUrl;
        order.tweetId = result.tweetId;
        order.publishedAt = new Date().toISOString();
        order.email = session.metadata.email || order.email;
        await orders.set(session.id, order);
        
        // Send immediate confirmation email (fire-and-forget, don't block webhook)
        if (order.email) {
          sendConfirmationEmail(order).catch(err => console.error('Confirmation email failed:', err.message));
        }
        
        console.log('🚀 Posted:', result.tweetUrl);
      } catch (error) {
        console.error('❌ Post failed:', error.message);
        order.status = 'failed';
        order.error = error.message;
        await orders.set(session.id, order);
      }
    }
  }

  res.json({ received: true });
});

// SPA fallback
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/webhook')) {
      res.sendFile('index.html', { root: 'dist' });
    } else {
      next();
    }
  });
}

// ============================================
// Start
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 DAUfinder running on http://localhost:${PORT}`);
});
