// server/db/influencers.js
// Creator database operations for DAUinfluencers

import pg from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

let pool;

export function setCreatorPool(p) {
  pool = p;
}

export { pool };

// Initialize influencer tables
export async function initCreatorTables() {
  if (!pool) {
    console.log('⚠️ Creator tables: No pool set, skipping');
    return;
  }

  // Creators table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS influencers (
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
    CREATE TABLE IF NOT EXISTS influencer_accounts (
      id SERIAL PRIMARY KEY,
      influencer_id INTEGER REFERENCES influencers(id) ON DELETE CASCADE,
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
      
      UNIQUE(influencer_id, platform)
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
      
      claimed_by INTEGER REFERENCES influencers(id),
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      
      post_url VARCHAR(500),
      post_id VARCHAR(255)
    )
  `);

  // Payout requests
  await pool.query(`
    CREATE TABLE IF NOT EXISTS influencer_payouts (
      id SERIAL PRIMARY KEY,
      influencer_id INTEGER REFERENCES influencers(id),
      amount_cents INTEGER NOT NULL,
      method VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      notes TEXT
    )
  `);

  console.log('✅ Creator tables initialized');
  
  // Initialize referral system
  await initReferralSystem();
}

// ============================================
// Creator CRUD
// ============================================

export async function createInfluencer({ email, password, name }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO influencers (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at, balance_cents, missions_completed, status`,
    [email.toLowerCase(), passwordHash, name]
  );
  return result.rows[0];
}

export async function getInfluencerByEmail(email) {
  const result = await pool.query(
    `SELECT * FROM influencers WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0];
}

export async function getInfluencerById(id) {
  const result = await pool.query(
    `SELECT id, email, name, created_at, balance_cents, lifetime_earned_cents,
            missions_completed, current_streak, reputation_score, status,
            payout_method, payout_email
     FROM influencers WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function verifyInfluencerPassword(email, password) {
  const influencer = await getInfluencerByEmail(email);
  if (!influencer) return null;
  
  const valid = await bcrypt.compare(password, influencer.password_hash);
  if (!valid) return null;
  
  // Don't return password hash
  delete influencer.password_hash;
  return influencer;
}

export async function updateInfluencerBalance(influencerId, deltaCents) {
  const result = await pool.query(
    `UPDATE influencers 
     SET balance_cents = balance_cents + $2,
         lifetime_earned_cents = CASE WHEN $2 > 0 THEN lifetime_earned_cents + $2 ELSE lifetime_earned_cents END
     WHERE id = $1
     RETURNING balance_cents`,
    [influencerId, deltaCents]
  );
  return result.rows[0]?.balance_cents;
}

export async function incrementInfluencerMissions(influencerId) {
  await pool.query(
    `UPDATE influencers 
     SET missions_completed = missions_completed + 1,
         current_streak = current_streak + 1
     WHERE id = $1`,
    [influencerId]
  );
}

// ============================================
// Creator Accounts (Social)
// ============================================

export async function addInfluencerAccount(influencerId, accountData) {
  const { platform, platformUserId, username, displayName, accessToken, refreshToken, tokenExpiresAt, followerCount } = accountData;
  
  const result = await pool.query(
    `INSERT INTO influencer_accounts 
       (influencer_id, platform, platform_user_id, username, display_name, 
        access_token, refresh_token, token_expires_at, follower_count, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (influencer_id, platform) 
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
    [influencerId, platform, platformUserId, username, displayName, accessToken, refreshToken, tokenExpiresAt, followerCount]
  );
  return result.rows[0];
}

export async function getInfluencerAccounts(influencerId) {
  const result = await pool.query(
    `SELECT id, platform, username, display_name, follower_count, status, cooldown_until, created_at
     FROM influencer_accounts 
     WHERE influencer_id = $1
     ORDER BY platform`,
    [influencerId]
  );
  return result.rows;
}

export async function getInfluencerAccountWithToken(influencerId, platform) {
  const result = await pool.query(
    `SELECT * FROM influencer_accounts 
     WHERE influencer_id = $1 AND platform = $2`,
    [influencerId, platform]
  );
  return result.rows[0];
}

export async function removeCreatorAccount(influencerId, platform) {
  await pool.query(
    `DELETE FROM influencer_accounts WHERE influencer_id = $1 AND platform = $2`,
    [influencerId, platform]
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

export async function getAvailableMissions(influencerId, platform = null) {
  let query = `
    SELECT m.*, 
           CASE WHEN m.claimed_by = $1 THEN true ELSE false END as is_mine
    FROM missions m
    WHERE (m.status = 'available' OR (m.status = 'claimed' AND m.claimed_by = $1))
      AND (m.expires_at IS NULL OR m.expires_at > NOW())
  `;
  const params = [influencerId];
  
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

export async function claimMission(missionId, influencerId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'claimed', claimed_by = $2, claimed_at = NOW()
     WHERE id = $1 AND status = 'available'
     RETURNING *`,
    [missionId, influencerId]
  );
  return result.rows[0];
}

export async function completeMission(missionId, influencerId, postUrl, postId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'completed', completed_at = NOW(), post_url = $3, post_id = $4
     WHERE id = $1 AND claimed_by = $2
     RETURNING *`,
    [missionId, influencerId, postUrl, postId]
  );
  return result.rows[0];
}

export async function unclaimMission(missionId, influencerId) {
  const result = await pool.query(
    `UPDATE missions 
     SET status = 'available', claimed_by = NULL, claimed_at = NULL
     WHERE id = $1 AND claimed_by = $2 AND status = 'claimed'
     RETURNING *`,
    [missionId, influencerId]
  );
  return result.rows[0];
}

export async function getInfluencerMissionHistory(influencerId, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM missions 
     WHERE claimed_by = $1 AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [influencerId, limit]
  );
  return result.rows;
}

// ============================================
// Payouts
// ============================================

export async function requestPayout(influencerId, amountCents, method) {
  // Check balance
  const influencer = await getInfluencerById(influencerId);
  if (!influencer || influencer.balance_cents < amountCents) {
    throw new Error('Insufficient balance');
  }
  
  // Deduct from balance
  await updateInfluencerBalance(influencerId, -amountCents);
  
  // Create payout request
  const result = await pool.query(
    `INSERT INTO influencer_payouts (influencer_id, amount_cents, method)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [influencerId, amountCents, method]
  );
  
  return result.rows[0];
}

export async function getInfluencerPayouts(influencerId) {
  const result = await pool.query(
    `SELECT * FROM influencer_payouts 
     WHERE influencer_id = $1
     ORDER BY created_at DESC`,
    [influencerId]
  );
  return result.rows;
}

export async function getPendingPayouts() {
  const result = await pool.query(
    `SELECT p.*, c.email, c.name, c.payout_email
     FROM influencer_payouts p
     JOIN influencers i ON p.influencer_id = c.id
     WHERE p.status = 'pending'
     ORDER BY p.created_at ASC`
  );
  return result.rows;
}

export async function completePayout(payoutId, notes = null) {
  const result = await pool.query(
    `UPDATE influencer_payouts 
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

export async function getInfluencerStats(influencerId) {
  const result = await pool.query(
    `SELECT 
       c.balance_cents,
       c.lifetime_earned_cents,
       c.missions_completed,
       c.current_streak,
       (SELECT COUNT(*) FROM missions WHERE claimed_by = $1 AND status = 'claimed') as pending_missions,
       (SELECT COUNT(*) FROM influencer_accounts WHERE influencer_id = $1 AND status = 'active') as connected_accounts
     FROM influencers c
     WHERE c.id = $1`,
    [influencerId]
  );
  return result.rows[0];
}

export async function getAllInfluencersAdmin() {
  const result = await pool.query(
    `SELECT id, email, name, created_at, balance_cents, lifetime_earned_cents,
            missions_completed, current_streak, status, referral_code
     FROM influencers
     ORDER BY created_at DESC`
  );
  return result.rows;
}

// ============================================
// Referral System
// ============================================

export async function initReferralSystem() {
  // Add referral columns to influencers table if they don't exist
  await pool.query(`
    ALTER TABLE influencers 
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES influencers(id),
    ADD COLUMN IF NOT EXISTS referral_earnings_cents INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0
  `);

  // Referral tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS influencer_referrals (
      id SERIAL PRIMARY KEY,
      referrer_id INTEGER REFERENCES influencers(id) ON DELETE CASCADE,
      referred_id INTEGER REFERENCES influencers(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'signed_up',
      bonus_paid_cents INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      first_mission_at TIMESTAMPTZ,
      UNIQUE(referred_id)
    )
  `);

  // Referral earnings log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      id SERIAL PRIMARY KEY,
      referrer_id INTEGER REFERENCES influencers(id),
      referred_id INTEGER REFERENCES influencers(id),
      mission_id INTEGER,
      amount_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('✅ Referral system initialized');
}

// Generate unique referral code
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Get or create referral code for influencer
export async function getOrCreateReferralCode(influencerId) {
  // Check if already has code
  const existing = await pool.query(
    'SELECT referral_code FROM influencers WHERE id = $1',
    [influencerId]
  );
  
  if (existing.rows[0]?.referral_code) {
    return existing.rows[0].referral_code;
  }
  
  // Generate new unique code
  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateReferralCode();
    try {
      await pool.query(
        'UPDATE influencers SET referral_code = $1 WHERE id = $2',
        [code, influencerId]
      );
      return code;
    } catch (err) {
      if (err.code === '23505') { // Unique violation
        attempts++;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to generate unique referral code');
}

// Process referral signup
export async function processReferralSignup(newInfluencerId, referralCode) {
  if (!referralCode) return null;
  
  // Find referrer by code
  const referrer = await pool.query(
    'SELECT id FROM influencers WHERE referral_code = $1',
    [referralCode.toUpperCase()]
  );
  
  if (!referrer.rows[0]) return null;
  
  const referrerId = referrer.rows[0].id;
  
  // Don't allow self-referral
  if (referrerId === newInfluencerId) return null;
  
  // Link referral
  await pool.query(
    'UPDATE influencers SET referred_by = $1 WHERE id = $2',
    [referrerId, newInfluencerId]
  );
  
  // Track referral
  await pool.query(
    `INSERT INTO influencer_referrals (referrer_id, referred_id)
     VALUES ($1, $2)
     ON CONFLICT (referred_id) DO NOTHING`,
    [referrerId, newInfluencerId]
  );
  
  // Increment referrer's count
  await pool.query(
    'UPDATE influencers SET referral_count = referral_count + 1 WHERE id = $1',
    [referrerId]
  );
  
  return referrerId;
}

// Process referral bonus when referred user completes mission
export async function processReferralBonus(influencerId, missionEarningsCents, missionId = null) {
  const REFERRAL_PERCENTAGE = 0.10; // 10% of referred user's earnings
  
  // Get referrer
  const result = await pool.query(
    'SELECT referred_by FROM influencers WHERE id = $1',
    [influencerId]
  );
  
  const referrerId = result.rows[0]?.referred_by;
  if (!referrerId) return null;
  
  const bonusCents = Math.floor(missionEarningsCents * REFERRAL_PERCENTAGE);
  if (bonusCents < 1) return null;
  
  // Credit referrer
  await pool.query(
    `UPDATE influencers 
     SET balance_cents = balance_cents + $1,
         referral_earnings_cents = referral_earnings_cents + $1,
         lifetime_earned_cents = lifetime_earned_cents + $1
     WHERE id = $2`,
    [bonusCents, referrerId]
  );
  
  // Log the earning
  await pool.query(
    `INSERT INTO referral_earnings (referrer_id, referred_id, mission_id, amount_cents)
     VALUES ($1, $2, $3, $4)`,
    [referrerId, influencerId, missionId, bonusCents]
  );
  
  // Update referral status if first mission
  await pool.query(
    `UPDATE influencer_referrals 
     SET status = 'active', 
         first_mission_at = COALESCE(first_mission_at, NOW()),
         bonus_paid_cents = bonus_paid_cents + $3
     WHERE referrer_id = $1 AND referred_id = $2`,
    [referrerId, influencerId, bonusCents]
  );
  
  return { referrerId, bonusCents };
}

// Get referral stats for an influencer
export async function getReferralStats(influencerId) {
  const stats = await pool.query(
    `SELECT 
       i.referral_code,
       i.referral_count,
       i.referral_earnings_cents,
       (SELECT COUNT(*) FROM influencer_referrals WHERE referrer_id = $1 AND status = 'active') as active_referrals
     FROM influencers i
     WHERE i.id = $1`,
    [influencerId]
  );
  
  const referrals = await pool.query(
    `SELECT 
       ir.created_at,
       ir.status,
       ir.bonus_paid_cents,
       ir.first_mission_at,
       i.name,
       i.missions_completed
     FROM influencer_referrals ir
     JOIN influencers i ON ir.referred_id = i.id
     WHERE ir.referrer_id = $1
     ORDER BY ir.created_at DESC
     LIMIT 20`,
    [influencerId]
  );
  
  return {
    ...stats.rows[0],
    referrals: referrals.rows
  };
}
