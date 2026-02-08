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
  
  // Prime accounts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prime_accounts (
      email TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      boost_balance INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      billing_cycle_anchor TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  
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
  
  // Prime accounts table (SQLite)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prime_accounts (
      email TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      boost_balance INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      billing_cycle_anchor TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
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

// ============================================
// Prime Account Store
// ============================================

let primeStore;

// ============================================
// Prime Rewards Store
// ============================================

let rewardsStore;

if (usePostgres) {
  const rewardsPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  
  // Initialize rewards tables
  await rewardsPool.query(`
    CREATE TABLE IF NOT EXISTS prime_rewards (
      email TEXT PRIMARY KEY,
      twitter_id TEXT,
      twitter_handle TEXT,
      twitter_access_token TEXT,
      twitter_access_secret TEXT,
      points_balance INTEGER NOT NULL DEFAULT 0,
      lifetime_points INTEGER NOT NULL DEFAULT 0,
      follows_flywheelsquad BOOLEAN DEFAULT FALSE,
      follows_themessageis4u BOOLEAN DEFAULT FALSE,
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  
  await rewardsPool.query(`
    CREATE TABLE IF NOT EXISTS prime_reward_history (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      tweet_id TEXT,
      action_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(email, tweet_id, action_type)
    )
  `);
  
  rewardsStore = {
    async get(email) {
      const { rows } = await rewardsPool.query('SELECT * FROM prime_rewards WHERE email = $1', [email.toLowerCase()]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        email: row.email,
        twitterId: row.twitter_id,
        twitterHandle: row.twitter_handle,
        twitterAccessToken: row.twitter_access_token,
        twitterAccessSecret: row.twitter_access_secret,
        pointsBalance: row.points_balance,
        lifetimePoints: row.lifetime_points,
        followsFlywheelsquad: row.follows_flywheelsquad,
        followsThemessageis4u: row.follows_themessageis4u,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
      };
    },
    
    async set(email, data) {
      await rewardsPool.query(`
        INSERT INTO prime_rewards (email, twitter_id, twitter_handle, twitter_access_token, twitter_access_secret, points_balance, lifetime_points, follows_flywheelsquad, follows_themessageis4u, last_sync_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(email) DO UPDATE SET
          twitter_id = COALESCE(EXCLUDED.twitter_id, prime_rewards.twitter_id),
          twitter_handle = COALESCE(EXCLUDED.twitter_handle, prime_rewards.twitter_handle),
          twitter_access_token = COALESCE(EXCLUDED.twitter_access_token, prime_rewards.twitter_access_token),
          twitter_access_secret = COALESCE(EXCLUDED.twitter_access_secret, prime_rewards.twitter_access_secret),
          points_balance = EXCLUDED.points_balance,
          lifetime_points = EXCLUDED.lifetime_points,
          follows_flywheelsquad = EXCLUDED.follows_flywheelsquad,
          follows_themessageis4u = EXCLUDED.follows_themessageis4u,
          last_sync_at = EXCLUDED.last_sync_at
      `, [
        email.toLowerCase(),
        data.twitterId || null,
        data.twitterHandle || null,
        data.twitterAccessToken || null,
        data.twitterAccessSecret || null,
        data.pointsBalance || 0,
        data.lifetimePoints || 0,
        data.followsFlywheelsquad || false,
        data.followsThemessageis4u || false,
        data.lastSyncAt || null,
        data.createdAt || new Date().toISOString(),
      ]);
    },
    
    async addPoints(email, points) {
      const result = await rewardsPool.query(`
        UPDATE prime_rewards 
        SET points_balance = points_balance + $2, lifetime_points = lifetime_points + $2
        WHERE email = $1
        RETURNING points_balance, lifetime_points
      `, [email.toLowerCase(), points]);
      return result.rows[0] || null;
    },
    
    async usePoints(email, points) {
      const result = await rewardsPool.query(`
        UPDATE prime_rewards 
        SET points_balance = points_balance - $2
        WHERE email = $1 AND points_balance >= $2
        RETURNING points_balance
      `, [email.toLowerCase(), points]);
      return result.rows.length > 0 ? result.rows[0].points_balance : null;
    },
    
    async recordEngagement(email, tweetId, actionType, points) {
      try {
        await rewardsPool.query(`
          INSERT INTO prime_reward_history (email, tweet_id, action_type, points)
          VALUES ($1, $2, $3, $4)
        `, [email.toLowerCase(), tweetId, actionType, points]);
        return true;
      } catch (e) {
        // Duplicate entry - already recorded
        if (e.code === '23505') return false;
        throw e;
      }
    },
    
    async getHistory(email, limit = 20) {
      const { rows } = await rewardsPool.query(`
        SELECT tweet_id, action_type, points, created_at 
        FROM prime_reward_history 
        WHERE email = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [email.toLowerCase(), limit]);
      return rows.map(r => ({
        tweetId: r.tweet_id,
        actionType: r.action_type,
        points: r.points,
        createdAt: r.created_at,
      }));
    },
    
    async hasEngagement(email, tweetId, actionType) {
      const { rows } = await rewardsPool.query(`
        SELECT 1 FROM prime_reward_history 
        WHERE email = $1 AND tweet_id = $2 AND action_type = $3
      `, [email.toLowerCase(), tweetId, actionType]);
      return rows.length > 0;
    },
  };
  
  console.log('📦 Prime Rewards database: PostgreSQL initialized');
} else {
  // SQLite rewards store
  const dbPath = process.env.DB_PATH || join(__dirname, 'orders.db');
  const rewardsDb = new Database(dbPath);
  
  rewardsDb.exec(`
    CREATE TABLE IF NOT EXISTS prime_rewards (
      email TEXT PRIMARY KEY,
      twitter_id TEXT,
      twitter_handle TEXT,
      twitter_access_token TEXT,
      twitter_access_secret TEXT,
      points_balance INTEGER NOT NULL DEFAULT 0,
      lifetime_points INTEGER NOT NULL DEFAULT 0,
      follows_flywheelsquad INTEGER DEFAULT 0,
      follows_themessageis4u INTEGER DEFAULT 0,
      last_sync_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  rewardsDb.exec(`
    CREATE TABLE IF NOT EXISTS prime_reward_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      tweet_id TEXT,
      action_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(email, tweet_id, action_type)
    )
  `);
  
  rewardsStore = {
    async get(email) {
      const row = rewardsDb.prepare('SELECT * FROM prime_rewards WHERE email = ?').get(email.toLowerCase());
      if (!row) return null;
      return {
        email: row.email,
        twitterId: row.twitter_id,
        twitterHandle: row.twitter_handle,
        twitterAccessToken: row.twitter_access_token,
        twitterAccessSecret: row.twitter_access_secret,
        pointsBalance: row.points_balance,
        lifetimePoints: row.lifetime_points,
        followsFlywheelsquad: !!row.follows_flywheelsquad,
        followsThemessageis4u: !!row.follows_themessageis4u,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
      };
    },
    
    async set(email, data) {
      rewardsDb.prepare(`
        INSERT INTO prime_rewards (email, twitter_id, twitter_handle, twitter_access_token, twitter_access_secret, points_balance, lifetime_points, follows_flywheelsquad, follows_themessageis4u, last_sync_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          twitter_id = COALESCE(excluded.twitter_id, prime_rewards.twitter_id),
          twitter_handle = COALESCE(excluded.twitter_handle, prime_rewards.twitter_handle),
          twitter_access_token = COALESCE(excluded.twitter_access_token, prime_rewards.twitter_access_token),
          twitter_access_secret = COALESCE(excluded.twitter_access_secret, prime_rewards.twitter_access_secret),
          points_balance = excluded.points_balance,
          lifetime_points = excluded.lifetime_points,
          follows_flywheelsquad = excluded.follows_flywheelsquad,
          follows_themessageis4u = excluded.follows_themessageis4u,
          last_sync_at = excluded.last_sync_at
      `).run(
        email.toLowerCase(),
        data.twitterId || null,
        data.twitterHandle || null,
        data.twitterAccessToken || null,
        data.twitterAccessSecret || null,
        data.pointsBalance || 0,
        data.lifetimePoints || 0,
        data.followsFlywheelsquad ? 1 : 0,
        data.followsThemessageis4u ? 1 : 0,
        data.lastSyncAt || null,
        data.createdAt || new Date().toISOString(),
      );
    },
    
    async addPoints(email, points) {
      const result = rewardsDb.prepare(`
        UPDATE prime_rewards 
        SET points_balance = points_balance + ?, lifetime_points = lifetime_points + ?
        WHERE email = ?
        RETURNING points_balance, lifetime_points
      `).get(points, points, email.toLowerCase());
      return result || null;
    },
    
    async usePoints(email, points) {
      const result = rewardsDb.prepare(`
        UPDATE prime_rewards 
        SET points_balance = points_balance - ?
        WHERE email = ? AND points_balance >= ?
        RETURNING points_balance
      `).get(points, email.toLowerCase(), points);
      return result ? result.points_balance : null;
    },
    
    async recordEngagement(email, tweetId, actionType, points) {
      try {
        rewardsDb.prepare(`
          INSERT INTO prime_reward_history (email, tweet_id, action_type, points, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(email.toLowerCase(), tweetId, actionType, points, new Date().toISOString());
        return true;
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
        throw e;
      }
    },
    
    async getHistory(email, limit = 20) {
      const rows = rewardsDb.prepare(`
        SELECT tweet_id, action_type, points, created_at 
        FROM prime_reward_history 
        WHERE email = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(email.toLowerCase(), limit);
      return rows.map(r => ({
        tweetId: r.tweet_id,
        actionType: r.action_type,
        points: r.points,
        createdAt: r.created_at,
      }));
    },
    
    async hasEngagement(email, tweetId, actionType) {
      const row = rewardsDb.prepare(`
        SELECT 1 FROM prime_reward_history 
        WHERE email = ? AND tweet_id = ? AND action_type = ?
      `).get(email.toLowerCase(), tweetId, actionType);
      return !!row;
    },
  };
  
  console.log('📦 Prime Rewards database: SQLite initialized');
}

// OAuth state storage (in-memory, short-lived)
const oauthStates = new Map();

if (usePostgres) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  
  primeStore = {
    async get(email) {
      const { rows } = await pool.query('SELECT * FROM prime_accounts WHERE email = $1', [email.toLowerCase()]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        email: row.email,
        tier: row.tier,
        boostBalance: row.boost_balance,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        billingCycleAnchor: row.billing_cycle_anchor,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    
    async set(email, account) {
      const now = new Date().toISOString();
      await pool.query(`
        INSERT INTO prime_accounts (email, tier, boost_balance, stripe_customer_id, stripe_subscription_id, billing_cycle_anchor, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(email) DO UPDATE SET
          tier = EXCLUDED.tier,
          boost_balance = EXCLUDED.boost_balance,
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          billing_cycle_anchor = EXCLUDED.billing_cycle_anchor,
          updated_at = EXCLUDED.updated_at
      `, [
        email.toLowerCase(),
        account.tier,
        account.boostBalance,
        account.stripeCustomerId || null,
        account.stripeSubscriptionId || null,
        account.billingCycleAnchor || null,
        account.createdAt || now,
        now
      ]);
    },
    
    async useBoost(email) {
      const result = await pool.query(`
        UPDATE prime_accounts 
        SET boost_balance = boost_balance - 1, updated_at = NOW()
        WHERE email = $1 AND boost_balance > 0
        RETURNING boost_balance
      `, [email.toLowerCase()]);
      return result.rows.length > 0 ? result.rows[0].boost_balance : null;
    },
    
    async resetBalance(email, newBalance) {
      await pool.query(`
        UPDATE prime_accounts 
        SET boost_balance = $2, updated_at = NOW()
        WHERE email = $1
      `, [email.toLowerCase(), newBalance]);
    },
  };
} else {
  // SQLite prime store
  const dbPath = process.env.DB_PATH || join(__dirname, 'orders.db');
  const db = new Database(dbPath);
  
  primeStore = {
    async get(email) {
      const row = db.prepare('SELECT * FROM prime_accounts WHERE email = ?').get(email.toLowerCase());
      if (!row) return null;
      return {
        email: row.email,
        tier: row.tier,
        boostBalance: row.boost_balance,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        billingCycleAnchor: row.billing_cycle_anchor,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    
    async set(email, account) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO prime_accounts (email, tier, boost_balance, stripe_customer_id, stripe_subscription_id, billing_cycle_anchor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          tier = excluded.tier,
          boost_balance = excluded.boost_balance,
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          billing_cycle_anchor = excluded.billing_cycle_anchor,
          updated_at = excluded.updated_at
      `).run(
        email.toLowerCase(),
        account.tier,
        account.boostBalance,
        account.stripeCustomerId || null,
        account.stripeSubscriptionId || null,
        account.billingCycleAnchor || null,
        account.createdAt || now,
        now
      );
    },
    
    async useBoost(email) {
      const result = db.prepare(`
        UPDATE prime_accounts 
        SET boost_balance = boost_balance - 1, updated_at = datetime('now')
        WHERE email = ? AND boost_balance > 0
        RETURNING boost_balance
      `).get(email.toLowerCase());
      return result ? result.boost_balance : null;
    },
    
    async resetBalance(email, newBalance) {
      db.prepare(`
        UPDATE prime_accounts 
        SET boost_balance = ?, updated_at = datetime('now')
        WHERE email = ?
      `).run(newBalance, email.toLowerCase());
    },
  };
}

// Config
const BOOST_PRICE = 199; // $1.99 in cents
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// ============================================
// DAUfinder Prime - Subscription Tiers
// ============================================
const PRIME_TIERS = {
  starter: {
    name: 'Starter',
    boosts: 100,
    price: 2900, // $29
    priceId: process.env.STRIPE_PRICE_STARTER, // Set in env after creating
  },
  growth: {
    name: 'Growth',
    boosts: 1000,
    price: 19900, // $199
    priceId: process.env.STRIPE_PRICE_GROWTH,
  },
  scale: {
    name: 'Scale',
    boosts: 10000,
    price: 99900, // $999
    priceId: process.env.STRIPE_PRICE_SCALE,
  },
};

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

// Track Twitter health status per account
const twitterHealth = {
  flywheelsquad: { lastSuccess: null, lastError: null, errorCount: 0, rateLimitReset: null },
  themessageis4u: { lastSuccess: null, lastError: null, errorCount: 0, rateLimitReset: null },
};

// Parse Twitter API errors for better debugging
function parseTwitterError(err, accountName) {
  const health = twitterHealth[accountName] || twitterHealth.flywheelsquad;
  health.lastError = new Date().toISOString();
  health.errorCount++;
  
  const errorInfo = {
    account: accountName,
    message: err.message,
    code: err.code,
    statusCode: err.data?.status || err.statusCode,
    twitterCode: err.data?.errors?.[0]?.code,
    twitterMessage: err.data?.errors?.[0]?.message,
    rateLimitReset: err.rateLimit?.reset,
  };
  
  // Track rate limits
  if (err.rateLimit?.reset) {
    health.rateLimitReset = new Date(err.rateLimit.reset * 1000).toISOString();
  }
  
  // Detailed error classification
  if (errorInfo.statusCode === 401 || errorInfo.twitterCode === 32) {
    errorInfo.diagnosis = 'AUTH_INVALID - Token expired or revoked. Need to regenerate.';
  } else if (errorInfo.statusCode === 403) {
    if (errorInfo.twitterCode === 187) {
      errorInfo.diagnosis = 'DUPLICATE_TWEET - Already posted this content.';
    } else if (errorInfo.twitterCode === 326) {
      errorInfo.diagnosis = 'ACCOUNT_LOCKED - Account locked, needs verification.';
    } else if (errorInfo.twitterCode === 261) {
      errorInfo.diagnosis = 'APP_SUSPENDED - Twitter app suspended.';
    } else {
      errorInfo.diagnosis = 'FORBIDDEN - Check app permissions or account status.';
    }
  } else if (errorInfo.statusCode === 429) {
    errorInfo.diagnosis = `RATE_LIMITED - Wait until ${health.rateLimitReset}`;
  } else if (errorInfo.statusCode === 503) {
    errorInfo.diagnosis = 'TWITTER_DOWN - Twitter service unavailable.';
  }
  
  console.error(`🚨 Twitter Error [@${accountName}]:`, JSON.stringify(errorInfo, null, 2));
  return errorInfo;
}

// Verify Twitter credentials work
async function verifyTwitterCredentials(accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName];
  if (!account) return { valid: false, error: 'Unknown account' };
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();
  
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return { 
      valid: false, 
      error: 'Missing credentials',
      missing: {
        apiKey: !apiKey,
        apiSecret: !apiSecret,
        accessToken: !accessToken,
        accessSecret: !accessSecret,
      }
    };
  }
  
  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });
    
    const me = await client.v2.me();
    const health = twitterHealth[accountName];
    health.lastSuccess = new Date().toISOString();
    health.errorCount = 0;
    
    return { 
      valid: true, 
      user: me.data,
      health: twitterHealth[accountName],
    };
  } catch (err) {
    const errorInfo = parseTwitterError(err, accountName);
    return { valid: false, error: errorInfo };
  }
}

// Post tweet with retry and fallback
async function postTweet(text, accountName = 'flywheelsquad', options = {}) {
  const { 
    retries = 2, 
    fallbackToOther = true,
    retryDelayMs = 2000,
  } = options;
  
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();
  
  if (!accessToken || !accessSecret) {
    console.warn(`⚠️  Twitter tokens not set for ${account.handle}`);
    // Try fallback account
    if (fallbackToOther) {
      const otherAccount = accountName === 'flywheelsquad' ? 'themessageis4u' : 'flywheelsquad';
      console.log(`🔄 Trying fallback account @${otherAccount}...`);
      return postTweet(text, otherAccount, { ...options, fallbackToOther: false });
    }
    throw new Error(`Twitter tokens not configured for @${account.handle}`);
  }

  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
  
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry attempt ${attempt}/${retries} for @${account.handle}...`);
        await new Promise(r => setTimeout(r, retryDelayMs * attempt));
      }
      
      const { data } = await client.v2.tweet(text);
      
      // Update health on success
      const health = twitterHealth[accountName];
      health.lastSuccess = new Date().toISOString();
      health.errorCount = 0;
      
      console.log(`✅ Tweet posted to @${account.handle}: ${data.id}`);
      
      return {
        tweetId: data.id,
        tweetUrl: `https://x.com/${account.handle}/status/${data.id}`,
        account: account.handle,
      };
    } catch (err) {
      lastError = err;
      const errorInfo = parseTwitterError(err, accountName);
      
      // Don't retry on auth errors - they won't fix themselves
      if (errorInfo.statusCode === 401 || errorInfo.statusCode === 403) {
        break;
      }
      
      // Don't retry if rate limited - wait for reset
      if (errorInfo.statusCode === 429) {
        break;
      }
    }
  }
  
  // Try fallback account on failure
  if (fallbackToOther) {
    const otherAccount = accountName === 'flywheelsquad' ? 'themessageis4u' : 'flywheelsquad';
    console.log(`🔄 Primary account @${account.handle} failed, trying @${otherAccount}...`);
    try {
      return await postTweet(text, otherAccount, { ...options, fallbackToOther: false });
    } catch (fallbackErr) {
      console.error(`❌ Fallback account also failed:`, fallbackErr.message);
    }
  }
  
  throw lastError;
}

// ============================================
// Growth Automation Module
// ============================================

function getTwitterClient(accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();
  
  if (!accessToken || !accessSecret) {
    return null;
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
}

// Growth hashtags and keywords to monitor
const GROWTH_HASHTAGS = [
  '#buildinpublic',
  '#indiehackers', 
  '#saas',
  '#startup',
  '#makers',
  '#solopreneur',
  '#shipfast',
  '#growthhacking',
];

const GROWTH_KEYWORDS = [
  'launching my product',
  'just shipped',
  'looking for beta testers',
  'getting first users',
  'marketing my startup',
  'need more traffic',
  'product hunt launch',
];

// Tips for content flywheel
const GROWTH_TIPS = [
  "💡 Tip: The best time to post on X is 8-10am EST when founders are checking feeds.\n\nMost successful boosts we've seen hit during morning coffee time ☕",
  "🎯 Stop spending hours on content.\n\nFind a relevant blog → Match your product → Let AI write the copy → Post.\n\nThat's the flywheel.",
  "📊 Data point: Products paired with niche blogs get 3x more engaged clicks than generic promo posts.\n\nContext > Blast marketing.",
  "🔄 The Flywheel effect:\n\n1. Post valuable content\n2. Engage with your niche\n3. Build followers\n4. More reach on next post\n5. Repeat\n\nCompounding > one-time campaigns",
  "🚀 Most founders overthink their first launch.\n\nJust get in front of people who already care about your niche.\n\nFind the blogs they read. Meet them there.",
  "💰 CAC math:\n\nPaid ads: $5-50 per click\nInfluencer posts: $100-1000\nNiche blog matching: <$2\n\nSometimes the unsexy option wins.",
  "🎪 Hot take: Your product doesn't need to go viral.\n\nIt needs 100 people who genuinely care.\n\nTarget > Volume.",
  "⚡ Speed hack: Don't write marketing copy from scratch.\n\nFind what's already working in your niche.\nAdapt. Ship. Test.\n\nIteration beats perfection.",
];

// Get App-Only client (Bearer Token) for search
async function getAppOnlyClient(accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  
  if (!apiKey || !apiSecret) {
    return null;
  }

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
    });
    
    // Get App-Only Bearer Token
    const appOnlyClient = await client.appLogin();
    return appOnlyClient;
  } catch (err) {
    console.error('App-Only auth error:', err.message);
    return null;
  }
}

// Search for tweets by query (uses App-Only auth)
async function searchTweets(query, maxResults = 10, accountName = 'flywheelsquad') {
  const client = await getAppOnlyClient(accountName);
  if (!client) {
    console.warn('⚠️  Twitter App-Only client not available for search');
    return { error: 'App-Only client not available' };
  }
  
  try {
    const result = await client.v2.search(query, {
      max_results: maxResults,
      'tweet.fields': ['author_id', 'created_at', 'public_metrics'],
      'user.fields': ['username', 'public_metrics'],
      expansions: ['author_id'],
    });
    
    return result.data?.data || [];
  } catch (err) {
    console.error('Tweet search error:', err.message, err.data || '');
    return { error: err.message, data: err.data };
  }
}

// Like a tweet (with detailed error logging)
async function likeTweet(tweetId, accountName = 'flywheelsquad') {
  const client = getTwitterClient(accountName);
  if (!client) {
    console.warn(`⚠️  No Twitter client for @${accountName} (like)`);
    return false;
  }
  
  try {
    const me = await client.v2.me();
    await client.v2.like(me.data.id, tweetId);
    console.log(`❤️  Liked tweet ${tweetId} from @${accountName}`);
    twitterHealth[accountName].lastSuccess = new Date().toISOString();
    return true;
  } catch (err) {
    // Ignore "already liked" errors (Twitter code 139)
    if (err.data?.errors?.[0]?.code === 139) {
      console.log(`❤️  Already liked tweet ${tweetId}`);
      return true;
    }
    parseTwitterError(err, accountName);
    return false;
  }
}

// Retweet a tweet (with detailed error logging)
async function retweetTweet(tweetId, accountName = 'flywheelsquad') {
  const client = getTwitterClient(accountName);
  if (!client) {
    console.warn(`⚠️  No Twitter client for @${accountName} (retweet)`);
    return false;
  }
  
  try {
    const me = await client.v2.me();
    await client.v2.retweet(me.data.id, tweetId);
    console.log(`🔁 Retweeted tweet ${tweetId} from @${accountName}`);
    twitterHealth[accountName].lastSuccess = new Date().toISOString();
    return true;
  } catch (err) {
    // Ignore "already retweeted" errors (Twitter code 327)
    if (err.data?.errors?.[0]?.code === 327) {
      console.log(`🔁 Already retweeted tweet ${tweetId}`);
      return true;
    }
    parseTwitterError(err, accountName);
    return false;
  }
}

// Reply to a tweet (with detailed error logging)
async function replyToTweet(tweetId, text, accountName = 'flywheelsquad') {
  const client = getTwitterClient(accountName);
  if (!client) {
    console.warn(`⚠️  No Twitter client for @${accountName} (reply)`);
    return null;
  }
  
  try {
    const { data } = await client.v2.reply(text, tweetId);
    console.log(`💬 Replied to tweet ${tweetId} from @${accountName}`);
    twitterHealth[accountName].lastSuccess = new Date().toISOString();
    return data;
  } catch (err) {
    parseTwitterError(err, accountName);
    return null;
  }
}

// Follow a user (with detailed error logging)
async function followUser(userId, accountName = 'flywheelsquad') {
  const client = getTwitterClient(accountName);
  if (!client) {
    console.warn(`⚠️  No Twitter client for @${accountName} (follow)`);
    return false;
  }
  
  try {
    const me = await client.v2.me();
    await client.v2.follow(me.data.id, userId);
    console.log(`👤 Followed user ${userId} from @${accountName}`);
    twitterHealth[accountName].lastSuccess = new Date().toISOString();
    return true;
  } catch (err) {
    // Ignore "already following" errors (Twitter code 160)
    if (err.data?.errors?.[0]?.code === 160) {
      console.log(`👤 Already following user ${userId}`);
      return true;
    }
    parseTwitterError(err, accountName);
    return false;
  }
}

// Get user by username (with detailed error logging)
async function getUserByUsername(username, accountName = 'flywheelsquad') {
  const client = getTwitterClient(accountName);
  if (!client) {
    console.warn(`⚠️  No Twitter client for @${accountName} (user lookup)`);
    return null;
  }
  
  try {
    const { data } = await client.v2.userByUsername(username, {
      'user.fields': ['public_metrics', 'description'],
    });
    return data;
  } catch (err) {
    parseTwitterError(err, accountName);
    return null;
  }
}

// Generate a thoughtful reply using Claude
async function generateReply(tweetText, authorHandle) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `You're @flywheelsquad, a friendly account that helps indie founders get their first users.

Generate a SHORT, genuine reply to this tweet from @${authorHandle}:
"${tweetText}"

Rules:
- Max 200 characters
- Be helpful or encouraging, not salesy
- Don't mention DAUfinder or any product
- Sound human, not corporate
- If they're launching something, congratulate them
- If they're struggling, empathize
- Add value or ask a genuine question

Reply only with the tweet text, nothing else.`
      }]
    });
    
    return response.content[0].text.trim();
  } catch (err) {
    console.error('Reply generation error:', err.message);
    return null;
  }
}

// ============================================
// Cross-Account Engagement System
// ============================================

// Engaging reply templates for cross-account engagement
const CROSS_ENGAGE_REPLIES = [
  "This is such an underrated gem 💎",
  "Bookmarked! Great find 🔖",
  "The SEO community needs to see this 👀",
  "Solid breakdown here 🎯",
  "Been looking for content like this 🙌",
  "Quality over quantity. This is it.",
  "Adding this to my reading list 📚",
  "The data here is 🔥",
  "This deserves more attention",
  "Exactly what founders need to read",
  "Saving this one ⭐",
  "Underrated thread alert 🚨",
  "More of this please 👏",
  "The insights here are gold",
  "Finally, some useful content",
];

// Get the OTHER account for cross-engagement
function getOtherAccount(accountName) {
  return accountName === 'flywheelsquad' ? 'themessageis4u' : 'flywheelsquad';
}

// Cross-engage: Have the OTHER account like, retweet, and reply
async function crossEngage(tweetId, postingAccount = 'flywheelsquad', options = {}) {
  const {
    doLike = true,
    doRetweet = true,
    doReply = true,
    delayMs = 2000, // Small delay between actions to look natural
  } = options;
  
  const otherAccount = getOtherAccount(postingAccount);
  const results = {
    account: otherAccount,
    liked: false,
    retweeted: false,
    replied: false,
    replyId: null,
  };
  
  console.log(`🔄 Cross-engaging tweet ${tweetId} from @${otherAccount}...`);
  
  try {
    // Like from other account
    if (doLike) {
      await new Promise(r => setTimeout(r, delayMs));
      results.liked = await likeTweet(tweetId, otherAccount);
    }
    
    // Retweet from other account
    if (doRetweet) {
      await new Promise(r => setTimeout(r, delayMs));
      results.retweeted = await retweetTweet(tweetId, otherAccount);
    }
    
    // Reply from other account
    if (doReply) {
      await new Promise(r => setTimeout(r, delayMs));
      const reply = CROSS_ENGAGE_REPLIES[Math.floor(Math.random() * CROSS_ENGAGE_REPLIES.length)];
      const replyResult = await replyToTweet(tweetId, reply, otherAccount);
      if (replyResult) {
        results.replied = true;
        results.replyId = replyResult.id;
      }
    }
    
    console.log(`✅ Cross-engagement complete: liked=${results.liked}, RT=${results.retweeted}, replied=${results.replied}`);
    return results;
    
  } catch (err) {
    console.error('Cross-engagement error:', err.message);
    return results;
  }
}

// Full engagement blast: both accounts engage
async function fullEngagementBlast(tweetId, postingAccount = 'flywheelsquad') {
  const results = {
    crossEngage: null,
    selfReply: null,
  };
  
  // Cross-engage from other account
  results.crossEngage = await crossEngage(tweetId, postingAccount);
  
  // Also add a self-reply thread from the posting account (boosts visibility)
  const selfReplies = [
    "Thread incoming... 🧵",
    "What makes this stand out ⬇️",
    "Key takeaway here 👇",
    "Why this matters for founders:",
    "The best part about this article:",
  ];
  
  try {
    await new Promise(r => setTimeout(r, 3000)); // Delay before self-reply
    const selfReply = selfReplies[Math.floor(Math.random() * selfReplies.length)];
    const replyResult = await replyToTweet(tweetId, selfReply, postingAccount);
    if (replyResult) {
      results.selfReply = replyResult.id;
      console.log(`💬 Self-reply added from @${postingAccount}`);
    }
  } catch (err) {
    console.error('Self-reply error:', err.message);
  }
  
  return results;
}

// Run an engagement cycle
async function runEngagementCycle(options = {}) {
  const {
    hashtags = GROWTH_HASHTAGS.slice(0, 3),
    maxTweets = 5,
    shouldLike = true,
    shouldReply = true,
    shouldFollow = false,
    accountName = 'flywheelsquad',
  } = options;
  
  const results = {
    searched: 0,
    liked: 0,
    replied: 0,
    followed: 0,
    errors: [],
  };
  
  for (const hashtag of hashtags) {
    try {
      const tweets = await searchTweets(hashtag, maxTweets, accountName);
      results.searched += tweets.length;
      
      for (const tweet of tweets) {
        // Skip our own tweets
        if (tweet.text?.includes('@flywheelsquad') || tweet.text?.includes('@themessageis4u')) {
          continue;
        }
        
        // Like the tweet
        if (shouldLike) {
          const liked = await likeTweet(tweet.id, accountName);
          if (liked) results.liked++;
          await new Promise(r => setTimeout(r, 1000)); // Rate limit delay
        }
        
        // Generate and post reply
        if (shouldReply && tweet.text) {
          const replyText = await generateReply(tweet.text, tweet.author_id);
          if (replyText) {
            const replied = await replyToTweet(tweet.id, replyText, accountName);
            if (replied) results.replied++;
            await new Promise(r => setTimeout(r, 2000)); // Rate limit delay
          }
        }
        
        // Follow the author
        if (shouldFollow && tweet.author_id) {
          const followed = await followUser(tweet.author_id, accountName);
          if (followed) results.followed++;
          await new Promise(r => setTimeout(r, 1000)); // Rate limit delay
        }
      }
    } catch (err) {
      results.errors.push(`${hashtag}: ${err.message}`);
    }
  }
  
  console.log(`🌱 Engagement cycle complete:`, results);
  return results;
}

// Post a tip from the content flywheel
async function postGrowthTip(accountName = 'flywheelsquad') {
  const tip = GROWTH_TIPS[Math.floor(Math.random() * GROWTH_TIPS.length)];
  
  try {
    const result = await postTweet(tip, accountName);
    console.log(`📝 Posted growth tip: ${result.tweetUrl}`);
    return result;
  } catch (err) {
    console.error('Growth tip post error:', err.message);
    return null;
  }
}

// Post a case study from recent boost stats
async function postCaseStudy(accountName = 'flywheelsquad') {
  try {
    const allOrders = await orderStore.all();
    
    // Find a boost with good metrics
    const goodBoosts = allOrders
      .filter(o => o.metrics?.impressions > 500 && o.status === 'published')
      .sort((a, b) => (b.metrics?.impressions || 0) - (a.metrics?.impressions || 0));
    
    if (goodBoosts.length === 0) {
      console.log('No good boosts for case study yet');
      return null;
    }
    
    const boost = goodBoosts[0];
    const m = boost.metrics;
    
    const caseStudy = `📊 Boost results for "${boost.productData?.name || 'a product'}":

📈 ${m.impressions?.toLocaleString()} impressions
❤️ ${m.likes} likes
🔁 ${m.retweets} retweets
💬 ${m.replies} replies

Paired with: ${boost.blog?.title || 'a relevant niche blog'}

This is what targeted distribution looks like.`;
    
    const result = await postTweet(caseStudy, accountName);
    console.log(`📊 Posted case study: ${result.tweetUrl}`);
    return result;
  } catch (err) {
    console.error('Case study post error:', err.message);
    return null;
  }
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
// DAUfinder Prime - Subscription Endpoints
// ============================================

// Get Prime tiers info
app.get('/api/prime/tiers', (req, res) => {
  const tiers = Object.entries(PRIME_TIERS).map(([id, tier]) => ({
    id,
    name: tier.name,
    boosts: tier.boosts,
    price: tier.price / 100,
    pricePerBoost: ((tier.price / 100) / tier.boosts).toFixed(2),
  }));
  res.json({ tiers });
});

// Get account status
app.get('/api/account/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const account = await primeStore.get(email);
    
    if (!account) {
      return res.json({ 
        exists: false, 
        email,
        tier: null,
        boostBalance: 0,
      });
    }
    
    res.json({
      exists: true,
      email: account.email,
      tier: account.tier,
      tierName: PRIME_TIERS[account.tier]?.name || account.tier,
      boostBalance: account.boostBalance,
      maxBoosts: PRIME_TIERS[account.tier]?.boosts || 0,
      billingCycleAnchor: account.billingCycleAnchor,
    });
  } catch (error) {
    console.error('Account lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's boost history
app.get('/api/account/:email/boosts', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const allOrders = await orderStore.all();
    
    // Filter orders for this user
    const userBoosts = allOrders
      .filter(o => o.email?.toLowerCase() === email && o.status === 'published')
      .map(o => ({
        id: o.sessionId,
        product: o.productData?.name || 'Unknown',
        blog: o.blog?.title || 'Unknown',
        blogUrl: o.blog?.url,
        tweetUrl: o.tweetUrl,
        tweetId: o.tweetId,
        createdAt: o.createdAt,
        metrics: o.metrics || null,
      }))
      .sort((a, b) => {
        // Sort by impressions if available, otherwise by date
        const aImp = a.metrics?.impressions || 0;
        const bImp = b.metrics?.impressions || 0;
        if (aImp !== bImp) return bImp - aImp;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    
    // Calculate totals
    const totalImpressions = userBoosts.reduce((sum, b) => sum + (b.metrics?.impressions || 0), 0);
    const totalEngagements = userBoosts.reduce((sum, b) => sum + (b.metrics?.engagements || 0), 0);
    const totalLikes = userBoosts.reduce((sum, b) => sum + (b.metrics?.likes || 0), 0);
    
    res.json({
      boosts: userBoosts,
      totals: {
        count: userBoosts.length,
        impressions: totalImpressions,
        engagements: totalEngagements,
        likes: totalLikes,
      }
    });
  } catch (error) {
    console.error('Boost history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create subscription checkout
app.post('/api/subscribe', checkoutLimiter, async (req, res) => {
  try {
    const { email, tier } = req.body;
    
    if (!email || !tier) {
      return res.status(400).json({ error: 'Email and tier required' });
    }
    
    const tierConfig = PRIME_TIERS[tier];
    if (!tierConfig) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    
    if (!tierConfig.priceId) {
      // Create price on the fly if not configured (for testing)
      console.warn(`⚠️  No priceId for ${tier}, creating inline price`);
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `DAUfinder Prime - ${tierConfig.name}`,
              description: `${tierConfig.boosts.toLocaleString()} boosts per month`,
            },
            unit_amount: tierConfig.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${FRONTEND_URL}?prime_success=true&email=${encodeURIComponent(email)}`,
        cancel_url: `${FRONTEND_URL}?prime=true`,
        customer_email: email,
        metadata: {
          email: email.toLowerCase(),
          tier,
          boosts: tierConfig.boosts.toString(),
        },
      });
      
      return res.json({ url: session.url, sessionId: session.id });
    }
    
    // Use pre-configured price ID
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: tierConfig.priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}?prime_success=true&email=${encodeURIComponent(email)}`,
      cancel_url: `${FRONTEND_URL}?prime=true`,
      customer_email: email,
      metadata: {
        email: email.toLowerCase(),
        tier,
        boosts: tierConfig.boosts.toString(),
      },
    });
    
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Use a boost from Prime balance (no payment)
app.post('/api/prime/boost', async (req, res) => {
  try {
    const { email, productData, blog, content } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Verify account exists and has balance
    const account = await primeStore.get(email);
    if (!account) {
      return res.status(404).json({ error: 'No Prime account found' });
    }
    
    if (account.boostBalance <= 0) {
      return res.status(400).json({ error: 'No boosts remaining', balance: 0 });
    }
    
    if (!productData?.name || !blog?.url || !content) {
      return res.status(400).json({ error: 'Missing required data (productData, blog, content)' });
    }
    
    // Deduct boost
    const newBalance = await primeStore.useBoost(email);
    if (newBalance === null) {
      return res.status(400).json({ error: 'Failed to use boost' });
    }
    
    // Replace placeholders
    let finalContent = content
      .replace('[BLOG_LINK]', blog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '');
    
    // Post to Twitter
    const result = await postTweet(finalContent);
    
    // Cross-engage from both accounts to boost stats
    const engagement = await fullEngagementBlast(result.tweetId, 'flywheelsquad');
    console.log(`🔥 Prime boost engagement blast:`, engagement);
    
    // Create order record
    const orderId = `prime_${Date.now()}_${email.split('@')[0]}`;
    await orders.set(orderId, {
      status: 'published',
      productData,
      blog,
      content: finalContent,
      email,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'prime',
      followUpSent: false,
    });
    
    console.log(`🌟 Prime boost used by ${email} | Balance: ${newBalance} | Tweet: ${result.tweetUrl}`);
    
    // Send confirmation email
    const orderForEmail = {
      email,
      productData,
      blog,
      tweetUrl: result.tweetUrl,
    };
    sendConfirmationEmail(orderForEmail).catch(err => 
      console.error('Prime boost confirmation email failed:', err.message)
    );
    
    res.json({
      success: true,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      remainingBalance: newBalance,
    });
    
  } catch (error) {
    console.error('Prime boost error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Prime Rewards Endpoints
// ============================================

// Point values
const REWARD_POINTS = {
  like: 1,
  retweet: 3,
  quote: 5,
  reply: 2,
  follow_flywheelsquad: 10,
  follow_themessageis4u: 10,
};
const POINTS_PER_BOOST = 25;

// Our Twitter account IDs (to check follows and get our tweets)
const OUR_TWITTER_ACCOUNTS = {
  flywheelsquad: { handle: 'flywheelsquad', id: null }, // Will be populated
  themessageis4u: { handle: 'themessageis4u', id: null },
};

// Get rewards status for a Prime member
app.get('/api/prime/rewards/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    
    // Check if they're a Prime member
    const primeAccount = await primeStore.get(email);
    if (!primeAccount) {
      return res.status(404).json({ error: 'Not a Prime member' });
    }
    
    // Get or create rewards record
    let rewards = await rewardsStore.get(email);
    if (!rewards) {
      await rewardsStore.set(email, {
        pointsBalance: 0,
        lifetimePoints: 0,
        createdAt: new Date().toISOString(),
      });
      rewards = await rewardsStore.get(email);
    }
    
    // Get recent history
    const history = await rewardsStore.getHistory(email, 10);
    
    res.json({
      email,
      twitterConnected: !!rewards.twitterHandle,
      twitterHandle: rewards.twitterHandle,
      pointsBalance: rewards.pointsBalance,
      lifetimePoints: rewards.lifetimePoints,
      pointsNeeded: POINTS_PER_BOOST,
      canRedeem: rewards.pointsBalance >= POINTS_PER_BOOST,
      followsFlywheelsquad: rewards.followsFlywheelsquad,
      followsThemessageis4u: rewards.followsThemessageis4u,
      lastSyncAt: rewards.lastSyncAt,
      history,
      pointValues: REWARD_POINTS,
    });
  } catch (error) {
    console.error('Get rewards error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Twitter OAuth flow to connect user's X account
app.post('/api/prime/connect-twitter', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Check if they're a Prime member
    const primeAccount = await primeStore.get(email);
    if (!primeAccount) {
      return res.status(404).json({ error: 'Not a Prime member' });
    }
    
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Twitter API not configured' });
    }
    
    // Create OAuth 1.0a client for request token
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
    });
    
    // Use API_URL if set, otherwise construct from known ngrok domain
    const apiBase = process.env.API_URL || (process.env.NODE_ENV === 'production' 
      ? 'https://fly-wheel.onrender.com' 
      : 'https://blearier-ashlee-unextravasated.ngrok-free.dev');
    const callbackUrl = `${apiBase}/api/prime/twitter/callback`;
    
    // Get request token
    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(callbackUrl, { linkMode: 'authorize' });
    
    // Store state for callback
    const state = `${email}:${oauth_token}`;
    oauthStates.set(oauth_token, {
      email,
      oauth_token_secret,
      expires: Date.now() + 10 * 60 * 1000, // 10 min
    });
    
    // Clean up old states
    for (const [token, data] of oauthStates.entries()) {
      if (Date.now() > data.expires) oauthStates.delete(token);
    }
    
    console.log(`🔐 Twitter OAuth started for ${email}`);
    res.json({ authUrl: url });
  } catch (error) {
    console.error('Connect Twitter error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Twitter OAuth callback
app.get('/api/prime/twitter/callback', async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;
    
    if (!oauth_token || !oauth_verifier) {
      return res.redirect(`${FRONTEND_URL}?rewards_error=missing_oauth`);
    }
    
    const stateData = oauthStates.get(oauth_token);
    if (!stateData) {
      return res.redirect(`${FRONTEND_URL}?rewards_error=expired`);
    }
    
    oauthStates.delete(oauth_token);
    const { email, oauth_token_secret } = stateData;
    
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    
    // Exchange for access token
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });
    
    const { client: loggedClient, accessToken, accessSecret } = await client.login(oauth_verifier);
    
    // Get user info
    const user = await loggedClient.v2.me();
    
    // Save to rewards store
    let rewards = await rewardsStore.get(email);
    await rewardsStore.set(email, {
      ...(rewards || {}),
      twitterId: user.data.id,
      twitterHandle: user.data.username,
      twitterAccessToken: accessToken,
      twitterAccessSecret: accessSecret,
      pointsBalance: rewards?.pointsBalance || 0,
      lifetimePoints: rewards?.lifetimePoints || 0,
      createdAt: rewards?.createdAt || new Date().toISOString(),
    });
    
    console.log(`✅ Twitter connected for ${email}: @${user.data.username}`);
    res.redirect(`${FRONTEND_URL}?rewards_connected=true&twitter_handle=${user.data.username}`);
  } catch (error) {
    console.error('Twitter callback error:', error);
    res.redirect(`${FRONTEND_URL}?rewards_error=${encodeURIComponent(error.message)}`);
  }
});

// Sync points - check user's engagements on our tweets
app.post('/api/prime/sync-points', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const rewards = await rewardsStore.get(email);
    if (!rewards || !rewards.twitterAccessToken) {
      return res.status(400).json({ error: 'Twitter not connected' });
    }
    
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    
    // Create client with user's tokens
    const userClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: rewards.twitterAccessToken,
      accessSecret: rewards.twitterAccessSecret,
    });
    
    // Create app client for getting our tweets
    const appClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    let pointsEarned = 0;
    const actions = [];
    
    // Get recent tweets from @flywheelsquad (last 50)
    try {
      const flywheelUser = await appClient.v2.userByUsername('flywheelsquad');
      if (flywheelUser.data) {
        OUR_TWITTER_ACCOUNTS.flywheelsquad.id = flywheelUser.data.id;
        
        const tweets = await appClient.v2.userTimeline(flywheelUser.data.id, {
          max_results: 50,
          'tweet.fields': ['created_at'],
        });
        
        // Check if user liked each tweet
        for await (const tweet of tweets) {
          // Check like
          try {
            const likers = await appClient.v2.tweetLikedBy(tweet.id, { max_results: 100 });
            const userLiked = likers.data?.some(u => u.id === rewards.twitterId);
            if (userLiked) {
              const recorded = await rewardsStore.recordEngagement(email, tweet.id, 'like', REWARD_POINTS.like);
              if (recorded) {
                pointsEarned += REWARD_POINTS.like;
                actions.push({ type: 'like', tweetId: tweet.id, points: REWARD_POINTS.like });
              }
            }
          } catch (e) { /* Rate limit or error - skip */ }
          
          // Check retweet
          try {
            const retweeters = await appClient.v2.tweetRetweetedBy(tweet.id, { max_results: 100 });
            const userRetweeted = retweeters.data?.some(u => u.id === rewards.twitterId);
            if (userRetweeted) {
              const recorded = await rewardsStore.recordEngagement(email, tweet.id, 'retweet', REWARD_POINTS.retweet);
              if (recorded) {
                pointsEarned += REWARD_POINTS.retweet;
                actions.push({ type: 'retweet', tweetId: tweet.id, points: REWARD_POINTS.retweet });
              }
            }
          } catch (e) { /* Skip */ }
        }
        
        // Check if user follows @flywheelsquad
        if (!rewards.followsFlywheelsquad) {
          try {
            const following = await userClient.v2.following(rewards.twitterId, { max_results: 1000 });
            const followsUs = following.data?.some(u => u.id === flywheelUser.data.id);
            if (followsUs) {
              const recorded = await rewardsStore.recordEngagement(email, 'follow', 'follow_flywheelsquad', REWARD_POINTS.follow_flywheelsquad);
              if (recorded) {
                pointsEarned += REWARD_POINTS.follow_flywheelsquad;
                actions.push({ type: 'follow_flywheelsquad', points: REWARD_POINTS.follow_flywheelsquad });
                rewards.followsFlywheelsquad = true;
              }
            }
          } catch (e) { /* Skip */ }
        }
      }
    } catch (e) {
      console.error('Error checking @flywheelsquad:', e.message);
    }
    
    // Check @themessageis4u too
    try {
      const msgUser = await appClient.v2.userByUsername('themessageis4u');
      if (msgUser.data) {
        OUR_TWITTER_ACCOUNTS.themessageis4u.id = msgUser.data.id;
        
        const tweets = await appClient.v2.userTimeline(msgUser.data.id, {
          max_results: 50,
          'tweet.fields': ['created_at'],
        });
        
        for await (const tweet of tweets) {
          try {
            const likers = await appClient.v2.tweetLikedBy(tweet.id, { max_results: 100 });
            const userLiked = likers.data?.some(u => u.id === rewards.twitterId);
            if (userLiked) {
              const recorded = await rewardsStore.recordEngagement(email, tweet.id, 'like', REWARD_POINTS.like);
              if (recorded) {
                pointsEarned += REWARD_POINTS.like;
                actions.push({ type: 'like', tweetId: tweet.id, points: REWARD_POINTS.like });
              }
            }
          } catch (e) { /* Skip */ }
          
          try {
            const retweeters = await appClient.v2.tweetRetweetedBy(tweet.id, { max_results: 100 });
            const userRetweeted = retweeters.data?.some(u => u.id === rewards.twitterId);
            if (userRetweeted) {
              const recorded = await rewardsStore.recordEngagement(email, tweet.id, 'retweet', REWARD_POINTS.retweet);
              if (recorded) {
                pointsEarned += REWARD_POINTS.retweet;
                actions.push({ type: 'retweet', tweetId: tweet.id, points: REWARD_POINTS.retweet });
              }
            }
          } catch (e) { /* Skip */ }
        }
        
        // Check follow
        if (!rewards.followsThemessageis4u) {
          try {
            const following = await userClient.v2.following(rewards.twitterId, { max_results: 1000 });
            const followsUs = following.data?.some(u => u.id === msgUser.data.id);
            if (followsUs) {
              const recorded = await rewardsStore.recordEngagement(email, 'follow', 'follow_themessageis4u', REWARD_POINTS.follow_themessageis4u);
              if (recorded) {
                pointsEarned += REWARD_POINTS.follow_themessageis4u;
                actions.push({ type: 'follow_themessageis4u', points: REWARD_POINTS.follow_themessageis4u });
                rewards.followsThemessageis4u = true;
              }
            }
          } catch (e) { /* Skip */ }
        }
      }
    } catch (e) {
      console.error('Error checking @themessageis4u:', e.message);
    }
    
    // Update points if any earned
    if (pointsEarned > 0) {
      await rewardsStore.addPoints(email, pointsEarned);
    }
    
    // Update last sync and follow status
    await rewardsStore.set(email, {
      ...rewards,
      lastSyncAt: new Date().toISOString(),
    });
    
    // Get updated balance
    const updated = await rewardsStore.get(email);
    
    console.log(`🔄 Points synced for ${email}: +${pointsEarned} (${actions.length} actions)`);
    
    res.json({
      success: true,
      pointsEarned,
      actions,
      newBalance: updated.pointsBalance,
      lifetimePoints: updated.lifetimePoints,
      canRedeem: updated.pointsBalance >= POINTS_PER_BOOST,
    });
  } catch (error) {
    console.error('Sync points error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Redeem points for a free boost
app.post('/api/prime/redeem-points', async (req, res) => {
  try {
    const { email, productData, blog, content } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Check Prime membership
    const primeAccount = await primeStore.get(email);
    if (!primeAccount) {
      return res.status(404).json({ error: 'Not a Prime member' });
    }
    
    // Check points balance
    const rewards = await rewardsStore.get(email);
    if (!rewards || rewards.pointsBalance < POINTS_PER_BOOST) {
      return res.status(400).json({ 
        error: `Need ${POINTS_PER_BOOST} points to redeem`, 
        balance: rewards?.pointsBalance || 0 
      });
    }
    
    if (!productData?.name || !blog?.url || !content) {
      return res.status(400).json({ error: 'Missing required data (productData, blog, content)' });
    }
    
    // Deduct points
    const newBalance = await rewardsStore.usePoints(email, POINTS_PER_BOOST);
    if (newBalance === null) {
      return res.status(400).json({ error: 'Failed to redeem points' });
    }
    
    // Replace placeholders
    let finalContent = content
      .replace('[BLOG_LINK]', blog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '');
    
    // Post to Twitter
    const result = await postTweet(finalContent);
    
    // Cross-engage to boost stats
    const engagement = await fullEngagementBlast(result.tweetId, 'flywheelsquad');
    console.log(`🔥 Rewards boost engagement blast:`, engagement);
    
    // Create order record
    const orderId = `rewards_${Date.now()}_${email.split('@')[0]}`;
    await orders.set(orderId, {
      status: 'published',
      productData,
      blog,
      content: finalContent,
      email,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'rewards',
      followUpSent: false,
    });
    
    // Record the redemption in history
    await rewardsStore.recordEngagement(email, orderId, 'redeem', -POINTS_PER_BOOST);
    
    console.log(`🎁 Points redeemed by ${email} | Balance: ${newBalance} | Tweet: ${result.tweetUrl}`);
    
    res.json({
      success: true,
      tweetUrl: result.tweetUrl,
      tweetId: result.tweetId,
      pointsUsed: POINTS_PER_BOOST,
      remainingBalance: newBalance,
    });
  } catch (error) {
    console.error('Redeem points error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
app.post('/api/prime/cancel', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const account = await primeStore.get(email);
    if (!account || !account.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    // Cancel at period end (they keep remaining boosts)
    await stripe.subscriptions.update(account.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    
    console.log(`🛑 Prime subscription canceled for ${email}`);
    
    res.json({ 
      success: true, 
      message: 'Subscription will cancel at end of billing period',
      remainingBalance: account.boostBalance,
    });
    
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message });
  }
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

// Test email endpoint
app.post('/api/admin/test-email', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const email = req.body.email || 'kammiceli@gmail.com';
  const type = req.body.type || 'confirmation'; // 'confirmation' or 'followup'
  
  const mockOrder = {
    email,
    productData: { name: 'DAUfinder' },
    blog: { 
      title: 'How to Find Your First 100 Users', 
      url: 'https://example.com/blog/first-100-users' 
    },
    tweetUrl: 'https://x.com/flywheelsquad/status/1234567890',
    tweetId: '1234567890',
  };
  
  try {
    if (type === 'followup') {
      const mockMetrics = { impressions: 2847, engagements: 156, likes: 89, retweets: 23, replies: 12 };
      await sendFollowUpEmail(mockOrder, mockMetrics);
      res.json({ success: true, type: 'followup', to: email });
    } else {
      await sendConfirmationEmail(mockOrder);
      res.json({ success: true, type: 'confirmation', to: email });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Self-Promotion Flywheel
// ============================================

const DAUFINDER_PRODUCT = {
  name: 'DAUfinder',
  description: 'Find daily active users for your product. We match you with relevant blogs, craft a promo post, and publish to X. Just $1.99.',
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
  
  const costPerBoost = 1.99; // virtual cost for ROI tracking

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
    
    // Cross-engage from the other account (like, retweet, reply)
    const engagement = await fullEngagementBlast(result.tweetId, account);
    console.log(`🔥 Engagement blast complete:`, engagement);
    
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

// ============================================
// Twitter Health & Diagnostics
// ============================================

// Check Twitter credentials and health
app.get('/api/admin/twitter/health', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('🔍 Running Twitter health check...');
  
  const results = {
    timestamp: new Date().toISOString(),
    accounts: {},
    summary: { healthy: 0, unhealthy: 0 },
  };
  
  for (const accountName of Object.keys(TWITTER_ACCOUNTS)) {
    const check = await verifyTwitterCredentials(accountName);
    results.accounts[accountName] = {
      ...check,
      storedHealth: twitterHealth[accountName],
    };
    
    if (check.valid) {
      results.summary.healthy++;
    } else {
      results.summary.unhealthy++;
    }
  }
  
  results.allHealthy = results.summary.unhealthy === 0;
  
  res.json(results);
});

// Get current Twitter health status (cached, no API call)
app.get('/api/admin/twitter/status', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    health: twitterHealth,
    envCheck: {
      flywheelsquad: {
        apiKey: !!process.env.TWITTER_API_KEY,
        apiSecret: !!process.env.TWITTER_API_SECRET,
        accessToken: !!process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: !!process.env.TWITTER_ACCESS_SECRET,
      },
      themessageis4u: {
        apiKey: !!process.env.TWITTER2_API_KEY,
        apiSecret: !!process.env.TWITTER2_API_SECRET,
        accessToken: !!process.env.TWITTER2_ACCESS_TOKEN,
        accessSecret: !!process.env.TWITTER2_ACCESS_SECRET,
      },
    },
  });
});

// Test posting (dry run or real)
app.post('/api/admin/twitter/test', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { account = 'flywheelsquad', dryRun = true } = req.body;
  const testContent = `🧪 DAUfinder health check - ${new Date().toISOString().slice(0,16)} #test`;
  
  if (dryRun) {
    // Just verify credentials without posting
    const check = await verifyTwitterCredentials(account);
    return res.json({
      dryRun: true,
      account,
      credentialsValid: check.valid,
      ...check,
    });
  }
  
  try {
    const result = await postTweet(testContent, account, { fallbackToOther: false, retries: 0 });
    res.json({
      success: true,
      dryRun: false,
      ...result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      details: parseTwitterError(err, account),
    });
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
  const revenue = customerOrders.length * 1.99;
  const spend = selfPromoOrders.length * 1.99;
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

// ============================================
// Growth Automation Endpoints
// ============================================

// Run engagement cycle (like + reply to relevant tweets)
app.post('/api/admin/growth/engage', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { 
    hashtags, 
    maxTweets = 5, 
    shouldLike = true, 
    shouldReply = true,
    shouldFollow = false,
    account = 'flywheelsquad'
  } = req.body;
  
  try {
    const results = await runEngagementCycle({
      hashtags: hashtags || GROWTH_HASHTAGS.slice(0, 3),
      maxTweets,
      shouldLike,
      shouldReply,
      shouldFollow,
      accountName: account,
    });
    
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a growth tip
app.post('/api/admin/growth/tip', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { account = 'flywheelsquad' } = req.body;
  
  try {
    const result = await postGrowthTip(account);
    if (result) {
      res.json({ success: true, tweetUrl: result.tweetUrl, tweetId: result.tweetId });
    } else {
      res.status(500).json({ error: 'Failed to post tip' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a case study from boost stats
app.post('/api/admin/growth/case-study', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { account = 'flywheelsquad' } = req.body;
  
  try {
    const result = await postCaseStudy(account);
    if (result) {
      res.json({ success: true, tweetUrl: result.tweetUrl, tweetId: result.tweetId });
    } else {
      res.json({ success: false, message: 'No boosts with good metrics yet for case study' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow users from search results
app.post('/api/admin/growth/follow', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { query, maxUsers = 5, account = 'flywheelsquad' } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }
  
  try {
    const tweets = await searchTweets(query, maxUsers * 2, account);
    const followedIds = new Set();
    let followed = 0;
    
    for (const tweet of tweets) {
      if (followed >= maxUsers) break;
      if (followedIds.has(tweet.author_id)) continue;
      
      const success = await followUser(tweet.author_id, account);
      if (success) {
        followed++;
        followedIds.add(tweet.author_id);
      }
      await new Promise(r => setTimeout(r, 1500)); // Rate limit
    }
    
    res.json({ success: true, followed, query });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run full growth cycle (engagement + tip posting)
app.post('/api/admin/growth/cycle', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { 
    account = 'flywheelsquad',
    engagementEnabled = true,
    tipEnabled = true,
    followEnabled = false,
  } = req.body;
  
  const results = {
    engagement: null,
    tip: null,
    errors: [],
  };
  
  try {
    // Run engagement
    if (engagementEnabled) {
      results.engagement = await runEngagementCycle({
        hashtags: GROWTH_HASHTAGS.slice(0, 2),
        maxTweets: 3,
        shouldLike: true,
        shouldReply: true,
        shouldFollow: followEnabled,
        accountName: account,
      });
    }
    
    // Post a tip (randomly, ~30% of the time)
    if (tipEnabled && Math.random() < 0.3) {
      const tipResult = await postGrowthTip(account);
      results.tip = tipResult ? tipResult.tweetUrl : null;
    }
    
    console.log('🌱 Full growth cycle complete:', results);
    res.json({ success: true, results });
  } catch (err) {
    results.errors.push(err.message);
    res.status(500).json({ success: false, results, error: err.message });
  }
});

// Test search endpoint (debug)
app.get('/api/admin/growth/test-search', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const query = req.query.q || '#buildinpublic';
  const result = await searchTweets(query, 5, 'flywheelsquad');
  res.json({ query, result });
});

// Get growth stats
app.get('/api/admin/growth/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const client = getTwitterClient('flywheelsquad');
    if (!client) {
      return res.json({ error: 'Twitter client not configured' });
    }
    
    const me = await client.v2.me({ 'user.fields': ['public_metrics'] });
    
    res.json({
      account: me.data.username,
      followers: me.data.public_metrics?.followers_count || 0,
      following: me.data.public_metrics?.following_count || 0,
      tweets: me.data.public_metrics?.tweet_count || 0,
      hashtags: GROWTH_HASHTAGS,
      tipsAvailable: GROWTH_TIPS.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  const revenue = customerOrders.filter(o => o.status === 'published').length * 1.99;
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
      revenue: (customersToday * 1.99).toFixed(2),
    },
    last24h: {
      boosts: boostsLast24h,
      customers: customersLast24h,
      revenue: (customersLast24h * 1.99).toFixed(2),
    },
    last7d: {
      boosts: boostsLast7d,
      customers: customersLast7d,
      revenue: (customersLast7d * 1.99).toFixed(2),
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
    // All boosts with metrics, sorted by impressions
    boostPerformance: allOrders
      .filter(o => o.tweetId && o.status === 'published')
      .map(o => ({
        tweetId: o.tweetId,
        tweetUrl: o.tweetUrl,
        product: o.productData?.name || 'Unknown',
        blog: o.blog?.title || 'Unknown',
        blogUrl: o.blog?.url,
        email: o.email,
        source: o.source || 'customer',
        createdAt: o.createdAt,
        metrics: o.metrics || null,
      }))
      .sort((a, b) => {
        const aImp = a.metrics?.impressions || 0;
        const bImp = b.metrics?.impressions || 0;
        return bImp - aImp;
      }),
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

  // Handle one-time payment (existing DAUfinder flow)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Check if this is a subscription checkout
    if (session.mode === 'subscription') {
      console.log('🌟 Prime subscription created:', session.id);
      const email = session.metadata?.email || session.customer_email;
      const tier = session.metadata?.tier;
      const boosts = parseInt(session.metadata?.boosts || '0', 10);
      
      if (email && tier) {
        await primeStore.set(email, {
          tier,
          boostBalance: boosts,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          billingCycleAnchor: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        console.log(`✅ Prime account created: ${email} | Tier: ${tier} | Boosts: ${boosts}`);
      }
      return res.json({ received: true });
    }
    
    // Regular one-time payment
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
        
        // Cross-engage to boost customer's stats (fire-and-forget)
        fullEngagementBlast(result.tweetId, 'flywheelsquad')
          .then(eng => console.log('🔥 Customer boost engagement:', eng))
          .catch(err => console.error('Engagement error:', err.message));
        
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
  
  // Handle subscription renewal (invoice paid)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    
    // Only process subscription renewals (not first payment)
    if (invoice.billing_reason === 'subscription_cycle') {
      const subscriptionId = invoice.subscription;
      const customerId = invoice.customer;
      
      try {
        // Get subscription to find metadata
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const email = subscription.metadata?.email || invoice.customer_email;
        const tier = subscription.metadata?.tier;
        const boosts = parseInt(subscription.metadata?.boosts || '0', 10);
        
        if (email && tier) {
          const account = await primeStore.get(email);
          if (account) {
            // Reset balance on renewal
            await primeStore.resetBalance(email, boosts);
            console.log(`🔄 Prime balance reset for ${email}: ${boosts} boosts`);
          }
        }
      } catch (err) {
        console.error('Failed to process subscription renewal:', err.message);
      }
    }
  }
  
  // Handle subscription canceled
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const email = subscription.metadata?.email;
    
    if (email) {
      const account = await primeStore.get(email);
      if (account) {
        // Keep account but clear subscription info
        await primeStore.set(email, {
          ...account,
          tier: 'canceled',
          stripeSubscriptionId: null,
        });
        console.log(`🛑 Prime subscription ended for ${email}`);
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
