// server/services/referrals.js
// Referral program — both parties get a free boost on conversion

import crypto from 'crypto';

// These will be injected after DB init
let pool = null;
let primeStore = null;

export function setPool(p) { pool = p; }
export function setPrimeStore(ps) { primeStore = ps; }

async function query(text, params) {
  if (!pool) throw new Error('Database pool not initialized');
  return pool.query(text, params);
}

function generateReferralCode(email) {
  const prefix = email.split('@')[0].slice(0, 3).toUpperCase();
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function getOrCreateReferralCode(email) {
  // Check if they already have a code
  const existing = await query(
    'SELECT referral_code FROM referrals WHERE referrer_email = $1 LIMIT 1',
    [email.toLowerCase()]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].referral_code;
  }

  // Generate new code
  const code = generateReferralCode(email);
  await query(
    'INSERT INTO referrals (referrer_email, referral_code) VALUES ($1, $2)',
    [email.toLowerCase(), code]
  );

  return code;
}

export async function processReferral(referralCode, refereeEmail) {
  // Find the referral
  const result = await query(
    `SELECT * FROM referrals WHERE referral_code = $1 AND status = 'pending' LIMIT 1`,
    [referralCode]
  );

  if (!result.rows.length) {
    return { success: false, error: 'Invalid or already used referral code' };
  }

  const referral = result.rows[0];

  // Don't let people refer themselves
  if (referral.referrer_email === refereeEmail.toLowerCase()) {
    return { success: false, error: 'Cannot refer yourself' };
  }

  // Mark as converted
  await query(
    `UPDATE referrals SET referee_email = $1, status = 'converted', converted_at = NOW() WHERE id = $2`,
    [refereeEmail.toLowerCase(), referral.id]
  );

  // Award free boost to both parties
  await awardFreeBoost(referral.referrer_email, 'referral_reward');
  await awardFreeBoost(refereeEmail.toLowerCase(), 'referral_signup');

  return {
    success: true,
    referrerEmail: referral.referrer_email,
    message: 'Both you and the referrer earned a free boost!',
  };
}

async function awardFreeBoost(email, source) {
  // Try to add to existing prime account, or create a minimal one
  const result = await query(
    `INSERT INTO prime_accounts (email, tier, boost_balance, created_at, updated_at)
     VALUES ($1, 'free', 1, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET boost_balance = prime_accounts.boost_balance + 1, updated_at = NOW()
     RETURNING boost_balance`,
    [email.toLowerCase()]
  );

  console.log(`🎁 Free boost awarded to ${email} (source: ${source}), balance: ${result.rows[0]?.boost_balance}`);
}

export async function getReferralStats(email) {
  const result = await query(
    `SELECT referral_code, 
            COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions,
            COUNT(*) as total_referrals
     FROM referrals 
     WHERE referrer_email = $1 
     GROUP BY referral_code`,
    [email.toLowerCase()]
  );

  return result.rows[0] || { referral_code: null, conversions: 0, total_referrals: 0 };
}

// Initialize the referrals table (call on startup)
export async function initReferralsTable() {
  if (!pool) return;
  
  await query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_email TEXT NOT NULL,
      referee_email TEXT,
      referral_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      converted_at TIMESTAMP
    )
  `);
  
  console.log('📦 Referrals table initialized');
}
