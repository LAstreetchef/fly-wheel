// server/db/index.js
// Database stores with dual PostgreSQL/SQLite support

import pg from 'pg';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const usePostgres = !!process.env.DATABASE_URL;

let orderStore;
let primeStore;
let rewardsStore;
let pool; // Postgres pool (if used)

async function initializeDatabase() {
  if (usePostgres) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // Initialize orders schema
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
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS keywords TEXT`).catch(() => {});

    // Prime accounts
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

    // Rewards
    await pool.query(`
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

    await pool.query(`
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

    // PostgreSQL stores
    orderStore = createPostgresOrderStore(pool);
    primeStore = createPostgresPrimeStore(pool);
    rewardsStore = createPostgresRewardsStore(pool);

    const count = await orderStore.count();
    console.log(`📦 Database: PostgreSQL (${count} orders)`);

  } else {
    // SQLite for development
    const dbPath = process.env.DB_PATH || join(__dirname, '../../orders.db');
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        product_data TEXT, blog TEXT, content TEXT, email TEXT,
        tweet_url TEXT, tweet_id TEXT, published_at TEXT,
        created_at TEXT NOT NULL, follow_up_sent INTEGER DEFAULT 0,
        metrics TEXT, error TEXT, source TEXT, keywords TEXT
      )
    `);
    try { db.exec('ALTER TABLE orders ADD COLUMN source TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN keywords TEXT'); } catch(e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS prime_accounts (
        email TEXT PRIMARY KEY, tier TEXT NOT NULL,
        boost_balance INTEGER NOT NULL DEFAULT 0,
        stripe_customer_id TEXT, stripe_subscription_id TEXT,
        billing_cycle_anchor TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS prime_rewards (
        email TEXT PRIMARY KEY, twitter_id TEXT, twitter_handle TEXT,
        twitter_access_token TEXT, twitter_access_secret TEXT,
        points_balance INTEGER NOT NULL DEFAULT 0,
        lifetime_points INTEGER NOT NULL DEFAULT 0,
        follows_flywheelsquad INTEGER DEFAULT 0,
        follows_themessageis4u INTEGER DEFAULT 0,
        last_sync_at TEXT, created_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS prime_reward_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL, tweet_id TEXT, action_type TEXT NOT NULL,
        points INTEGER NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(email, tweet_id, action_type)
      )
    `);

    orderStore = createSqliteOrderStore(db);
    primeStore = createSqlitePrimeStore(db);
    rewardsStore = createSqliteRewardsStore(db);

    const count = await orderStore.count();
    console.log(`📦 Database: SQLite @ ${dbPath} (${count} orders)`);
  }
}

// ============================================
// PostgreSQL Store Factories
// ============================================

function createPostgresOrderStore(pool) {
  return {
    async get(sessionId) {
      const { rows } = await pool.query('SELECT * FROM orders WHERE session_id = $1', [sessionId]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        status: row.status, productData: row.product_data, blog: row.blog,
        content: row.content, email: row.email, tweetUrl: row.tweet_url,
        tweetId: row.tweet_id, publishedAt: row.published_at, createdAt: row.created_at,
        followUpSent: row.follow_up_sent, metrics: row.metrics, error: row.error,
        source: row.source, keywords: row.keywords,
      };
    },
    async set(sessionId, order) {
      await pool.query(`
        INSERT INTO orders (session_id, status, product_data, blog, content, email, tweet_url, tweet_id, published_at, created_at, follow_up_sent, metrics, error, source, keywords)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT(session_id) DO UPDATE SET
          status = EXCLUDED.status, product_data = EXCLUDED.product_data, blog = EXCLUDED.blog,
          content = EXCLUDED.content, email = EXCLUDED.email, tweet_url = EXCLUDED.tweet_url,
          tweet_id = EXCLUDED.tweet_id, published_at = EXCLUDED.published_at,
          follow_up_sent = EXCLUDED.follow_up_sent, metrics = EXCLUDED.metrics,
          error = EXCLUDED.error, source = EXCLUDED.source, keywords = EXCLUDED.keywords
      `, [
        sessionId, order.status || 'pending',
        order.productData ? JSON.stringify(order.productData) : null,
        order.blog ? JSON.stringify(order.blog) : null,
        order.content || null, order.email || null, order.tweetUrl || null,
        order.tweetId || null, order.publishedAt || null,
        order.createdAt || new Date().toISOString(), order.followUpSent || false,
        order.metrics ? JSON.stringify(order.metrics) : null, order.error || null,
        order.source || null, order.keywords || null
      ]);
    },
    async all() {
      const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      return rows.map(row => ({
        sessionId: row.session_id, status: row.status, productData: row.product_data,
        blog: row.blog, content: row.content, email: row.email, tweetUrl: row.tweet_url,
        tweetId: row.tweet_id, publishedAt: row.published_at, createdAt: row.created_at,
        followUpSent: row.follow_up_sent, metrics: row.metrics, error: row.error,
        source: row.source, keywords: row.keywords,
      }));
    },
    async pendingFollowUps() {
      const { rows } = await pool.query(`
        SELECT session_id, status, email, tweet_id, published_at FROM orders 
        WHERE status = 'published' AND follow_up_sent = FALSE 
          AND email IS NOT NULL AND tweet_id IS NOT NULL
      `);
      return rows.map(row => ({
        sessionId: row.session_id, status: row.status, email: row.email,
        tweetId: row.tweet_id, publishedAt: row.published_at,
      }));
    },
    async count() {
      const { rows } = await pool.query('SELECT COUNT(*) as count FROM orders');
      return parseInt(rows[0].count, 10);
    },
    async markFollowUpSent(sessionId) {
      await pool.query('UPDATE orders SET follow_up_sent = TRUE WHERE session_id = $1', [sessionId]);
    }
  };
}

function createPostgresPrimeStore(pool) {
  return {
    async get(email) {
      const { rows } = await pool.query('SELECT * FROM prime_accounts WHERE email = $1', [email.toLowerCase()]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        email: row.email, tier: row.tier, boostBalance: row.boost_balance,
        stripeCustomerId: row.stripe_customer_id, stripeSubscriptionId: row.stripe_subscription_id,
        billingCycleAnchor: row.billing_cycle_anchor, createdAt: row.created_at, updatedAt: row.updated_at,
      };
    },
    async set(email, account) {
      const now = new Date().toISOString();
      await pool.query(`
        INSERT INTO prime_accounts (email, tier, boost_balance, stripe_customer_id, stripe_subscription_id, billing_cycle_anchor, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(email) DO UPDATE SET
          tier = EXCLUDED.tier, boost_balance = EXCLUDED.boost_balance,
          stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          billing_cycle_anchor = EXCLUDED.billing_cycle_anchor, updated_at = EXCLUDED.updated_at
      `, [email.toLowerCase(), account.tier, account.boostBalance, account.stripeCustomerId || null,
          account.stripeSubscriptionId || null, account.billingCycleAnchor || null, account.createdAt || now, now]);
    },
    async useBoost(email) {
      const result = await pool.query(`
        UPDATE prime_accounts SET boost_balance = boost_balance - 1, updated_at = NOW()
        WHERE email = $1 AND boost_balance > 0 RETURNING boost_balance
      `, [email.toLowerCase()]);
      return result.rows.length > 0 ? result.rows[0].boost_balance : null;
    },
    async resetBalance(email, newBalance) {
      await pool.query('UPDATE prime_accounts SET boost_balance = $2, updated_at = NOW() WHERE email = $1',
        [email.toLowerCase(), newBalance]);
    },
  };
}

function createPostgresRewardsStore(pool) {
  return {
    async get(email) {
      const { rows } = await pool.query('SELECT * FROM prime_rewards WHERE email = $1', [email.toLowerCase()]);
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        email: row.email, twitterId: row.twitter_id, twitterHandle: row.twitter_handle,
        twitterAccessToken: row.twitter_access_token, twitterAccessSecret: row.twitter_access_secret,
        pointsBalance: row.points_balance, lifetimePoints: row.lifetime_points,
        followsFlywheelsquad: row.follows_flywheelsquad, followsThemessageis4u: row.follows_themessageis4u,
        lastSyncAt: row.last_sync_at, createdAt: row.created_at,
      };
    },
    async set(email, data) {
      await pool.query(`
        INSERT INTO prime_rewards (email, twitter_id, twitter_handle, twitter_access_token, twitter_access_secret, points_balance, lifetime_points, follows_flywheelsquad, follows_themessageis4u, last_sync_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(email) DO UPDATE SET
          twitter_id = COALESCE(EXCLUDED.twitter_id, prime_rewards.twitter_id),
          twitter_handle = COALESCE(EXCLUDED.twitter_handle, prime_rewards.twitter_handle),
          twitter_access_token = COALESCE(EXCLUDED.twitter_access_token, prime_rewards.twitter_access_token),
          twitter_access_secret = COALESCE(EXCLUDED.twitter_access_secret, prime_rewards.twitter_access_secret),
          points_balance = EXCLUDED.points_balance, lifetime_points = EXCLUDED.lifetime_points,
          follows_flywheelsquad = EXCLUDED.follows_flywheelsquad, follows_themessageis4u = EXCLUDED.follows_themessageis4u,
          last_sync_at = EXCLUDED.last_sync_at
      `, [email.toLowerCase(), data.twitterId || null, data.twitterHandle || null,
          data.twitterAccessToken || null, data.twitterAccessSecret || null,
          data.pointsBalance || 0, data.lifetimePoints || 0,
          data.followsFlywheelsquad || false, data.followsThemessageis4u || false,
          data.lastSyncAt || null, data.createdAt || new Date().toISOString()]);
    },
    async addPoints(email, points) {
      const result = await pool.query(`
        UPDATE prime_rewards SET points_balance = points_balance + $2, lifetime_points = lifetime_points + $2
        WHERE email = $1 RETURNING points_balance, lifetime_points
      `, [email.toLowerCase(), points]);
      return result.rows[0] || null;
    },
    async usePoints(email, points) {
      const result = await pool.query(`
        UPDATE prime_rewards SET points_balance = points_balance - $2
        WHERE email = $1 AND points_balance >= $2 RETURNING points_balance
      `, [email.toLowerCase(), points]);
      return result.rows.length > 0 ? result.rows[0].points_balance : null;
    },
    async recordEngagement(email, tweetId, actionType, points) {
      try {
        await pool.query('INSERT INTO prime_reward_history (email, tweet_id, action_type, points) VALUES ($1, $2, $3, $4)',
          [email.toLowerCase(), tweetId, actionType, points]);
        return true;
      } catch (e) {
        if (e.code === '23505') return false; // Duplicate
        throw e;
      }
    },
    async getHistory(email, limit = 20) {
      const { rows } = await pool.query(`
        SELECT tweet_id, action_type, points, created_at FROM prime_reward_history 
        WHERE email = $1 ORDER BY created_at DESC LIMIT $2
      `, [email.toLowerCase(), limit]);
      return rows.map(r => ({ tweetId: r.tweet_id, actionType: r.action_type, points: r.points, createdAt: r.created_at }));
    },
    async hasEngagement(email, tweetId, actionType) {
      const { rows } = await pool.query(
        'SELECT 1 FROM prime_reward_history WHERE email = $1 AND tweet_id = $2 AND action_type = $3',
        [email.toLowerCase(), tweetId, actionType]);
      return rows.length > 0;
    },
  };
}

// ============================================
// SQLite Store Factories
// ============================================

function createSqliteOrderStore(db) {
  return {
    async get(sessionId) {
      const row = db.prepare('SELECT * FROM orders WHERE session_id = ?').get(sessionId);
      if (!row) return null;
      return {
        status: row.status, productData: row.product_data ? JSON.parse(row.product_data) : null,
        blog: row.blog ? JSON.parse(row.blog) : null, content: row.content, email: row.email,
        tweetUrl: row.tweet_url, tweetId: row.tweet_id, publishedAt: row.published_at,
        createdAt: row.created_at, followUpSent: !!row.follow_up_sent,
        metrics: row.metrics ? JSON.parse(row.metrics) : null, error: row.error,
        source: row.source, keywords: row.keywords,
      };
    },
    async set(sessionId, order) {
      db.prepare(`
        INSERT INTO orders (session_id, status, product_data, blog, content, email, tweet_url, tweet_id, published_at, created_at, follow_up_sent, metrics, error, source, keywords)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status, product_data = excluded.product_data, blog = excluded.blog,
          content = excluded.content, email = excluded.email, tweet_url = excluded.tweet_url,
          tweet_id = excluded.tweet_id, published_at = excluded.published_at,
          follow_up_sent = excluded.follow_up_sent, metrics = excluded.metrics,
          error = excluded.error, source = excluded.source, keywords = excluded.keywords
      `).run(
        sessionId, order.status || 'pending',
        order.productData ? JSON.stringify(order.productData) : null,
        order.blog ? JSON.stringify(order.blog) : null,
        order.content || null, order.email || null, order.tweetUrl || null,
        order.tweetId || null, order.publishedAt || null,
        order.createdAt || new Date().toISOString(), order.followUpSent ? 1 : 0,
        order.metrics ? JSON.stringify(order.metrics) : null, order.error || null,
        order.source || null, order.keywords || null
      );
    },
    async all() {
      const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
      return rows.map(row => ({
        sessionId: row.session_id, status: row.status,
        productData: row.product_data ? JSON.parse(row.product_data) : null,
        blog: row.blog ? JSON.parse(row.blog) : null, content: row.content,
        email: row.email, tweetUrl: row.tweet_url, tweetId: row.tweet_id,
        publishedAt: row.published_at, createdAt: row.created_at,
        followUpSent: !!row.follow_up_sent,
        metrics: row.metrics ? JSON.parse(row.metrics) : null,
        error: row.error, source: row.source, keywords: row.keywords,
      }));
    },
    async pendingFollowUps() {
      return db.prepare(`
        SELECT session_id, status, email, tweet_id, published_at FROM orders 
        WHERE status = 'published' AND follow_up_sent = 0 
          AND email IS NOT NULL AND tweet_id IS NOT NULL
      `).all().map(row => ({
        sessionId: row.session_id, status: row.status, email: row.email,
        tweetId: row.tweet_id, publishedAt: row.published_at,
      }));
    },
    async count() {
      return db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    },
    async markFollowUpSent(sessionId) {
      db.prepare('UPDATE orders SET follow_up_sent = 1 WHERE session_id = ?').run(sessionId);
    }
  };
}

function createSqlitePrimeStore(db) {
  return {
    async get(email) {
      const row = db.prepare('SELECT * FROM prime_accounts WHERE email = ?').get(email.toLowerCase());
      if (!row) return null;
      return {
        email: row.email, tier: row.tier, boostBalance: row.boost_balance,
        stripeCustomerId: row.stripe_customer_id, stripeSubscriptionId: row.stripe_subscription_id,
        billingCycleAnchor: row.billing_cycle_anchor, createdAt: row.created_at, updatedAt: row.updated_at,
      };
    },
    async set(email, account) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO prime_accounts (email, tier, boost_balance, stripe_customer_id, stripe_subscription_id, billing_cycle_anchor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          tier = excluded.tier, boost_balance = excluded.boost_balance,
          stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
          billing_cycle_anchor = excluded.billing_cycle_anchor, updated_at = excluded.updated_at
      `).run(email.toLowerCase(), account.tier, account.boostBalance, account.stripeCustomerId || null,
             account.stripeSubscriptionId || null, account.billingCycleAnchor || null, account.createdAt || now, now);
    },
    async useBoost(email) {
      const result = db.prepare(`
        UPDATE prime_accounts SET boost_balance = boost_balance - 1, updated_at = ?
        WHERE email = ? AND boost_balance > 0 RETURNING boost_balance
      `).get(new Date().toISOString(), email.toLowerCase());
      return result ? result.boost_balance : null;
    },
    async resetBalance(email, newBalance) {
      db.prepare('UPDATE prime_accounts SET boost_balance = ?, updated_at = ? WHERE email = ?')
        .run(newBalance, new Date().toISOString(), email.toLowerCase());
    },
  };
}

function createSqliteRewardsStore(db) {
  return {
    async get(email) {
      const row = db.prepare('SELECT * FROM prime_rewards WHERE email = ?').get(email.toLowerCase());
      if (!row) return null;
      return {
        email: row.email, twitterId: row.twitter_id, twitterHandle: row.twitter_handle,
        twitterAccessToken: row.twitter_access_token, twitterAccessSecret: row.twitter_access_secret,
        pointsBalance: row.points_balance, lifetimePoints: row.lifetime_points,
        followsFlywheelsquad: !!row.follows_flywheelsquad, followsThemessageis4u: !!row.follows_themessageis4u,
        lastSyncAt: row.last_sync_at, createdAt: row.created_at,
      };
    },
    async set(email, data) {
      db.prepare(`
        INSERT INTO prime_rewards (email, twitter_id, twitter_handle, twitter_access_token, twitter_access_secret, points_balance, lifetime_points, follows_flywheelsquad, follows_themessageis4u, last_sync_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          twitter_id = COALESCE(excluded.twitter_id, prime_rewards.twitter_id),
          twitter_handle = COALESCE(excluded.twitter_handle, prime_rewards.twitter_handle),
          twitter_access_token = COALESCE(excluded.twitter_access_token, prime_rewards.twitter_access_token),
          twitter_access_secret = COALESCE(excluded.twitter_access_secret, prime_rewards.twitter_access_secret),
          points_balance = excluded.points_balance, lifetime_points = excluded.lifetime_points,
          follows_flywheelsquad = excluded.follows_flywheelsquad, follows_themessageis4u = excluded.follows_themessageis4u,
          last_sync_at = excluded.last_sync_at
      `).run(email.toLowerCase(), data.twitterId || null, data.twitterHandle || null,
             data.twitterAccessToken || null, data.twitterAccessSecret || null,
             data.pointsBalance || 0, data.lifetimePoints || 0,
             data.followsFlywheelsquad ? 1 : 0, data.followsThemessageis4u ? 1 : 0,
             data.lastSyncAt || null, data.createdAt || new Date().toISOString());
    },
    async addPoints(email, points) {
      const result = db.prepare(`
        UPDATE prime_rewards SET points_balance = points_balance + ?, lifetime_points = lifetime_points + ?
        WHERE email = ? RETURNING points_balance, lifetime_points
      `).get(points, points, email.toLowerCase());
      return result || null;
    },
    async usePoints(email, points) {
      const result = db.prepare(`
        UPDATE prime_rewards SET points_balance = points_balance - ?
        WHERE email = ? AND points_balance >= ? RETURNING points_balance
      `).get(points, email.toLowerCase(), points);
      return result ? result.points_balance : null;
    },
    async recordEngagement(email, tweetId, actionType, points) {
      try {
        db.prepare('INSERT INTO prime_reward_history (email, tweet_id, action_type, points, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(email.toLowerCase(), tweetId, actionType, points, new Date().toISOString());
        return true;
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
        throw e;
      }
    },
    async getHistory(email, limit = 20) {
      const rows = db.prepare(`
        SELECT tweet_id, action_type, points, created_at FROM prime_reward_history 
        WHERE email = ? ORDER BY created_at DESC LIMIT ?
      `).all(email.toLowerCase(), limit);
      return rows.map(r => ({ tweetId: r.tweet_id, actionType: r.action_type, points: r.points, createdAt: r.created_at }));
    },
    async hasEngagement(email, tweetId, actionType) {
      const row = db.prepare('SELECT 1 FROM prime_reward_history WHERE email = ? AND tweet_id = ? AND action_type = ?')
        .get(email.toLowerCase(), tweetId, actionType);
      return !!row;
    },
  };
}

// Database singleton - stores are populated after initializeDatabase()
const db = {
  orders: null,
  prime: null,
  rewards: null,
  pool: null,
  initialized: false,
  
  async init() {
    if (this.initialized) return;
    await initializeDatabase();
    this.orders = orderStore;
    this.prime = primeStore;
    this.rewards = rewardsStore;
    this.pool = pool;
    this.initialized = true;
  }
};

export { initializeDatabase, db };
export default db;
