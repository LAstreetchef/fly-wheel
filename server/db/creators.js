// server/db/creators.js
// Creator database operations for DAUcreators

import pg from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

let pool;

export function setCreatorPool(p) {
  pool = p;
}

// Initialize creator tables
export async function initCreatorTables() {
  if (!pool) {
    console.log('⚠️ Creator tables: No pool set, skipping');
    return;
  }

  // Creators table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creators (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      
      -- Payout
      payout_method VARCHAR(50),
      payout_email VARCHAR(255),
      balance_cents INTEGER DEFAULT 0,
      lifetime_earned_cents INTEGER DEFAULT 0,
      
      -- Stats
      missions_completed INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      reputation_score INTEGER DEFAULT 100,
      
      -- Status
      status VARCHAR(50) DEFAULT 'active'
    )
  `);

  // Creator social accounts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creator_accounts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
      platform VARCHAR(50) NOT NULL,
      
      platform_user_id VARCHAR(255),
      username VARCHAR(255),
      display_name VARCHAR(255),
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      
      follower_count INTEGER DEFAULT 0,
      last_synced_at TIMESTAMPTZ,
      
      status VARCHAR(50) DEFAULT 'active',
      cooldown_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      
      UNIQUE(creator_id, platform)
    )
  `);

  // Missions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(255),
      
      platform VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      blog_url VARCHAR(500),
      blog_title VARCHAR(255),
      product_name VARCHAR(255),
      
      payout_cents INTEGER NOT NULL,
      
      target_geo VARCHAR(100),
      target_niche VARCHAR(100),
      
      status VARCHAR(50) DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      
      claimed_by INTEGER REFERENCES creators(id),
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      
      post_url VARCHAR(500),
      post_id VARCHAR(255)
    )
  `);

  // Payout requests
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creator_payouts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES creators(id),
      amount_cents INTEGER NOT NULL,
      method VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      notes TEXT
    )
  `);

  console.log('✅ Creator tables initialized');
}

// ============================================
// Creator CRUD
// ============================================

export async function createCreator({ email, password, name }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO creators (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at, balance_cents, missions_completed, status`,
    [email.toLowerCase(), passwordHash, name]
  );
  return result.rows[0];
}

export async function getCreatorByEmail(email) {
  const result = await pool.query(
    `SELECT * FROM creators WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0];
}

export async function getCreatorById(id) {
  const result = await pool.query(
    `SELECT id, email, name, created_at, balance_cents, lifetime_earned_cents,
            missions_completed, current_streak, reputation_score, status,
            payout_method, payout_email
     FROM creators WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function verifyCreatorPassword(email, password) {
  const creator = await getCreatorByEmail(email);
  if (!creator) return null;
  
  const valid = await bcrypt.compare(password, creator.password_hash);
  if (!valid) return null;
  
  // Don't return password hash
  delete creator.password_hash;
  return creator;
}

export async function updateCreatorBalance(creatorId, deltaCents) {
  const result = await pool.query(
    `UPDATE creators 
     SET balance_cents = balance_cents + $2,
         lifetime_earned_cents = CASE WHEN $2 > 0 THEN lifetime_earned_cents + $2 ELSE lifetime_earned_cents END
     WHERE id = $1
     RETURNING balance_cents`,
    [creatorId, deltaCents]
  );
  return result.rows[0]?.balance_cents;
}

export async function incrementMissionsCompleted(creatorId) {
  await pool.query(
    `UPDATE creators 
     SET missions_completed = missions_completed + 1,
         current_streak = current_streak + 1
     WHERE id = $1`,
    [creatorId]
  );
}

// ============================================
// Creator Accounts (Social)
// ============================================

export async function addCreatorAccount(creatorId, accountData) {
  const { platform, platformUserId, username, displayName, accessToken, refreshToken, tokenExpiresAt, followerCount } = accountData;
  
  const result = await pool.query(
    `INSERT INTO creator_accounts 
       (creator_id, platform, platform_user_id, username, display_name, 
        access_token, refresh_token, token_expires_at, follower_count, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (creator_id, platform) 
     DO UPDATE SET
       platform_user_id = $3,
       username = $4,
       display_name = $5,
       access_token = $6,
       refresh_token = $7,
       token_expires_at = $8,
       follower_count = $9,
       last_synced_at = NOW(),
       status = 'active'
     RETURNING *`,
    [creatorId, platform, platformUserId, username, displayName, accessToken, refreshToken, tokenExpiresAt, followerCount]
  );
  return result.rows[0];
}

export async function getCreatorAccounts(creatorId) {
  const result = await pool.query(
    `SELECT id, platform, username, display_name, follower_count, status, cooldown_until, created_at
     FROM creator_accounts 
     WHERE creator_id = $1
     ORDER BY platform`,
    [creatorId]
  );
  return result.rows;
}

export async function getCreatorAccountWithToken(creatorId, platform) {
  const result = await pool.query(
    `SELECT * FROM creator_accounts 
     WHERE creator_id = $1 AND platform = $2`,
    [creatorId, platform]
  );
  return result.rows[0];
}

export async function removeCreatorAccount(creatorId, platform) {
  await pool.query(
    `DELETE FROM creator_accounts WHERE creator_id = $1 AND platform = $2`,
    [creatorId, platform]
  );
}

// ============================================
// Missions
// ============================================

export async function createMission(missionData) {
  const { orderId, platform, content, blogUrl, blogTitle, productName, payoutCents, expiresAt } = missionData;
  
  const result = await pool.query(
    `INSERT INTO missions 
       (order_id, platform, content, blog_url, blog_title, product_name, payout_cents, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [orderId, platform, content, blogUrl, blogTitle, productName, payoutCents, expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  return result.rows[0];
}

export async function getAvailableMissions(creatorId, platform = null) {
  let query = `
    SELECT m.*, 
           CASE WHEN m.claimed_by = $1 THEN true ELSE false END as is_mine
    FROM missions m
    WHERE (m.status = 'available' OR (m.status = 'claimed' AND m.claimed_by = $1))
      AND (m.expires_at IS NULL OR m.expires_at > NOW())
  `;
  const params = [creatorId];
  
  if (platform) {
    query += ` AND m.platform = $2`;
    params.push(platform);
  }
  
  query += ` ORDER BY m.payout_cents DESC, m.created_at DESC LIMIT 50`;
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getMissionById(missionId) {
  const result = await pool.query(
    `SELECT * FROM missions WHERE id = $1`,
    [missionId]
  );
  return result.rows[0];
}

export async function claimMission(missionId, creatorId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'claimed', claimed_by = $2, claimed_at = NOW()
     WHERE id = $1 AND status = 'available'
     RETURNING *`,
    [missionId, creatorId]
  );
  return result.rows[0];
}

export async function completeMission(missionId, creatorId, postUrl, postId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'completed', completed_at = NOW(), post_url = $3, post_id = $4
     WHERE id = $1 AND claimed_by = $2
     RETURNING *`,
    [missionId, creatorId, postUrl, postId]
  );
  return result.rows[0];
}

export async function unclaimMission(missionId, creatorId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'available', claimed_by = NULL, claimed_at = NULL
     WHERE id = $1 AND claimed_by = $2 AND status = 'claimed'
     RETURNING *`,
    [missionId, creatorId]
  );
  return result.rows[0];
}

export async function getCreatorMissionHistory(creatorId, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM missions 
     WHERE claimed_by = $1 AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [creatorId, limit]
  );
  return result.rows;
}

// ============================================
// Payouts
// ============================================

export async function requestPayout(creatorId, amountCents, method) {
  // Check balance
  const creator = await getCreatorById(creatorId);
  if (!creator || creator.balance_cents < amountCents) {
    throw new Error('Insufficient balance');
  }
  
  // Deduct from balance
  await updateCreatorBalance(creatorId, -amountCents);
  
  // Create payout request
  const result = await pool.query(
    `INSERT INTO creator_payouts (creator_id, amount_cents, method)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [creatorId, amountCents, method]
  );
  
  return result.rows[0];
}

export async function getCreatorPayouts(creatorId) {
  const result = await pool.query(
    `SELECT * FROM creator_payouts 
     WHERE creator_id = $1
     ORDER BY created_at DESC`,
    [creatorId]
  );
  return result.rows;
}

export async function getPendingPayouts() {
  const result = await pool.query(
    `SELECT p.*, c.email, c.name, c.payout_email
     FROM creator_payouts p
     JOIN creators c ON p.creator_id = c.id
     WHERE p.status = 'pending'
     ORDER BY p.created_at ASC`
  );
  return result.rows;
}

export async function completePayout(payoutId, notes = null) {
  const result = await pool.query(
    `UPDATE creator_payouts 
     SET status = 'completed', completed_at = NOW(), notes = $2
     WHERE id = $1
     RETURNING *`,
    [payoutId, notes]
  );
  return result.rows[0];
}

// ============================================
// Stats
// ============================================

export async function getCreatorStats(creatorId) {
  const result = await pool.query(
    `SELECT 
       c.balance_cents,
       c.lifetime_earned_cents,
       c.missions_completed,
       c.current_streak,
       (SELECT COUNT(*) FROM missions WHERE claimed_by = $1 AND status = 'claimed') as pending_missions,
       (SELECT COUNT(*) FROM creator_accounts WHERE creator_id = $1 AND status = 'active') as connected_accounts
     FROM creators c
     WHERE c.id = $1`,
    [creatorId]
  );
  return result.rows[0];
}

export async function getAllCreatorsAdmin() {
  const result = await pool.query(
    `SELECT id, email, name, created_at, balance_cents, lifetime_earned_cents,
            missions_completed, current_streak, status
     FROM creators
     ORDER BY created_at DESC`
  );
  return result.rows;
}
