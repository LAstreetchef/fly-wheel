// server/db/brands.js
// Brand database operations for DAUinfluencers

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize brands table
export async function initBrandTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      company VARCHAR(255),
      stripe_customer_id VARCHAR(255),
      balance_cents INTEGER DEFAULT 0,
      total_spent_cents INTEGER DEFAULT 0,
      auth_token VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add brand_id to campaigns if not exists
  await pool.query(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='campaigns' AND column_name='brand_id') THEN
        ALTER TABLE campaigns ADD COLUMN brand_id INTEGER REFERENCES brands(id);
      END IF;
    END $$;
  `);

  console.log('📦 Brands database initialized');
}

// ============ BRAND AUTH ============

export async function getOrCreateBrand(email, name = null, company = null) {
  // Try to find existing brand
  const existing = await pool.query(
    'SELECT * FROM brands WHERE email = $1',
    [email.toLowerCase()]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }
  
  // Create new brand
  const result = await pool.query(
    `INSERT INTO brands (email, name, company, auth_token) 
     VALUES ($1, $2, $3, $4) 
     RETURNING *`,
    [email.toLowerCase(), name, company, generateToken()]
  );
  
  return result.rows[0];
}

export async function getBrandByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM brands WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

export async function getBrandById(id) {
  const result = await pool.query(
    'SELECT * FROM brands WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getBrandByToken(token) {
  const result = await pool.query(
    'SELECT * FROM brands WHERE auth_token = $1',
    [token]
  );
  return result.rows[0] || null;
}

export async function updateBrand(id, data) {
  const { name, company, stripe_customer_id } = data;
  const result = await pool.query(
    `UPDATE brands 
     SET name = COALESCE($2, name),
         company = COALESCE($3, company),
         stripe_customer_id = COALESCE($4, stripe_customer_id),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, name, company, stripe_customer_id]
  );
  return result.rows[0] || null;
}

// ============ BRAND BALANCE ============

export async function addBrandBalance(id, amount_cents) {
  const result = await pool.query(
    `UPDATE brands 
     SET balance_cents = balance_cents + $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, amount_cents]
  );
  return result.rows[0] || null;
}

export async function deductBrandBalance(id, amount_cents) {
  const result = await pool.query(
    `UPDATE brands 
     SET balance_cents = balance_cents - $2,
         total_spent_cents = total_spent_cents + $2,
         updated_at = NOW()
     WHERE id = $1 AND balance_cents >= $2
     RETURNING *`,
    [id, amount_cents]
  );
  return result.rows[0] || null;
}

// ============ BRAND CAMPAIGNS ============

export async function getBrandCampaigns(brandId) {
  const result = await pool.query(
    `SELECT c.*, 
            (SELECT COUNT(*) FROM missions m WHERE m.campaign_id = c.id) as mission_count,
            (SELECT COUNT(*) FROM mission_completions mc 
             JOIN missions m ON mc.mission_id = m.id 
             WHERE m.campaign_id = c.id AND mc.status = 'verified') as verified_posts
     FROM campaigns c 
     WHERE c.brand_id = $1 
     ORDER BY c.created_at DESC`,
    [brandId]
  );
  return result.rows;
}

export async function createBrandCampaign(brandId, data) {
  const { name, product_url, budget_cents } = data;
  
  // Auto-generate campaign details
  const brand = await getBrandById(brandId);
  
  const result = await pool.query(
    `INSERT INTO campaigns (
      brand_id, name, brand, description, budget_cents, status
    ) VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING *`,
    [
      brandId,
      name,
      brand?.company || brand?.name || 'Brand',
      `Promote ${name}`,
      budget_cents
    ]
  );
  
  const campaign = result.rows[0];
  
  // Auto-create a generic Twitter mission
  await pool.query(
    `INSERT INTO missions (
      campaign_id, platform, mission_type, title, description, 
      content_prompt, payout_cents, max_completions
    ) VALUES ($1, 'twitter', 'post', $2, $3, $4, 200, $5)`,
    [
      campaign.id,
      `Share about ${name}`,
      `Post about ${name} on X/Twitter`,
      `Create an authentic post sharing your thoughts on ${name}. Be genuine and creative!`,
      Math.floor(budget_cents / 200) // $2 per post
    ]
  );
  
  return campaign;
}

// ============ BRAND STATS ============

export async function getBrandStats(brandId) {
  console.log('[getBrandStats] Starting for brandId:', brandId);
  
  const brand = await getBrandById(brandId);
  console.log('[getBrandStats] Brand found:', !!brand);
  if (!brand) return null;
  
  let campaigns = [];
  try {
    campaigns = await getBrandCampaigns(brandId);
    console.log('[getBrandStats] Campaigns:', campaigns.length);
  } catch (err) {
    console.error('[getBrandStats] getBrandCampaigns error:', err.message);
    campaigns = [];
  }
  
  let stats = { rows: [{ total_posts: 0, verified_posts: 0, pending_posts: 0 }] };
  try {
    stats = await pool.query(
      `SELECT 
         COUNT(DISTINCT mc.id) as total_posts,
         COALESCE(SUM(CASE WHEN mc.status = 'verified' THEN 1 ELSE 0 END), 0) as verified_posts,
         COALESCE(SUM(CASE WHEN mc.status = 'pending' THEN 1 ELSE 0 END), 0) as pending_posts
       FROM campaigns c
       LEFT JOIN missions m ON m.campaign_id = c.id
       LEFT JOIN mission_completions mc ON mc.mission_id = m.id
       WHERE c.brand_id = $1`,
      [brandId]
    );
    console.log('[getBrandStats] Stats query success');
  } catch (err) {
    console.error('[getBrandStats] Stats query error:', err.message);
  }
  
  return {
    ...brand,
    campaigns: campaigns.length,
    total_posts: parseInt(stats.rows[0]?.total_posts) || 0,
    verified_posts: parseInt(stats.rows[0]?.verified_posts) || 0,
    pending_posts: parseInt(stats.rows[0]?.pending_posts) || 0
  };
}

// ============ HELPERS ============

function generateToken() {
  return 'br_' + Array.from({ length: 32 }, () => 
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    .charAt(Math.floor(Math.random() * 62))
  ).join('');
}

export { pool };
