// server/db/campaigns.js
// Campaign and mission database operations for DAUinfluencers

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize campaign tables
export async function initCampaignTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      brand VARCHAR(255) NOT NULL,
      description TEXT,
      brief TEXT,
      tagline VARCHAR(255),
      budget_cents INTEGER DEFAULT 0,
      spent_cents INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      platforms JSONB DEFAULT '[]',
      target_audience TEXT,
      content_guidelines TEXT,
      hashtags JSONB DEFAULT '[]',
      mentions JSONB DEFAULT '[]',
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      platform VARCHAR(50) NOT NULL,
      mission_type VARCHAR(50) DEFAULT 'post',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      content_prompt TEXT,
      payout_cents INTEGER DEFAULT 200,
      max_completions INTEGER DEFAULT 100,
      current_completions INTEGER DEFAULT 0,
      requirements JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migration: ensure campaign_id column exists (for tables created before this column was added)
  await pool.query(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='missions' AND column_name='campaign_id') THEN
        ALTER TABLE missions ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_completions (
      id SERIAL PRIMARY KEY,
      mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
      influencer_id INTEGER REFERENCES influencers(id) ON DELETE CASCADE,
      platform VARCHAR(50) NOT NULL,
      post_url TEXT,
      post_content TEXT,
      screenshot_url TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      payout_cents INTEGER,
      verified_at TIMESTAMP,
      paid_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(mission_id, influencer_id)
    )
  `);

  console.log('📦 Campaigns database initialized');
}

// ============ CAMPAIGNS ============

export async function createCampaign(data) {
  const { name, brand, description, brief, tagline, budget_cents, platforms, target_audience, content_guidelines, hashtags, mentions, start_date, end_date } = data;
  
  const result = await pool.query(
    `INSERT INTO campaigns (name, brand, description, brief, tagline, budget_cents, platforms, target_audience, content_guidelines, hashtags, mentions, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
     RETURNING *`,
    [name, brand, description, brief, tagline, budget_cents || 0, JSON.stringify(platforms || []), target_audience, content_guidelines, JSON.stringify(hashtags || []), JSON.stringify(mentions || []), start_date, end_date]
  );
  return result.rows[0];
}

export async function getCampaign(id) {
  const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getAllCampaigns(includeInactive = false) {
  const query = includeInactive 
    ? 'SELECT * FROM campaigns ORDER BY created_at DESC'
    : "SELECT * FROM campaigns WHERE status != 'archived' ORDER BY created_at DESC";
  const result = await pool.query(query);
  return result.rows;
}

export async function updateCampaign(id, data) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      values.push(key.includes('platforms') || key.includes('hashtags') || key.includes('mentions') ? JSON.stringify(value) : value);
      paramCount++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function fundCampaign(id, amountCents) {
  const result = await pool.query(
    `UPDATE campaigns SET budget_cents = budget_cents + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [amountCents, id]
  );
  return result.rows[0];
}

export async function getCampaignStats(id) {
  const campaign = await getCampaign(id);
  if (!campaign) return null;

  const missionsResult = await pool.query(
    'SELECT COUNT(*) as total, SUM(current_completions) as completions FROM missions WHERE campaign_id = $1',
    [id]
  );

  const completionsResult = await pool.query(
    `SELECT status, COUNT(*) as count, SUM(payout_cents) as total_payout 
     FROM mission_completions mc
     JOIN missions m ON mc.mission_id = m.id
     WHERE m.campaign_id = $1
     GROUP BY status`,
    [id]
  );

  return {
    ...campaign,
    missions_count: parseInt(missionsResult.rows[0].total) || 0,
    total_completions: parseInt(missionsResult.rows[0].completions) || 0,
    completion_stats: completionsResult.rows
  };
}

// ============ MISSIONS ============

export async function createMission(data) {
  const { campaign_id, platform, mission_type, title, description, content_prompt, payout_cents, max_completions, requirements } = data;
  
  const result = await pool.query(
    `INSERT INTO missions (campaign_id, platform, mission_type, title, description, content_prompt, payout_cents, max_completions, requirements)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [campaign_id, platform, mission_type || 'post', title, description, content_prompt, payout_cents || 200, max_completions || 100, JSON.stringify(requirements || {})]
  );
  return result.rows[0];
}

export async function getMission(id) {
  const result = await pool.query(
    `SELECT m.*, c.name as campaign_name, c.brand, c.brief, c.hashtags, c.mentions
     FROM missions m
     JOIN campaigns c ON m.campaign_id = c.id
     WHERE m.id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function getAvailableMissions(influencerId, platform = null) {
  let query = `
    SELECT m.*, c.name as campaign_name, c.brand, c.brief
    FROM missions m
    JOIN campaigns c ON m.campaign_id = c.id
    WHERE m.status = 'active'
      AND c.status = 'active'
      AND m.current_completions < m.max_completions
      AND m.id NOT IN (
        SELECT mission_id FROM mission_completions WHERE influencer_id = $1
      )
  `;
  
  const params = [influencerId];
  
  if (platform) {
    query += ' AND m.platform = $2';
    params.push(platform);
  }
  
  query += ' ORDER BY m.payout_cents DESC, m.created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getCampaignMissions(campaignId) {
  const result = await pool.query(
    'SELECT * FROM missions WHERE campaign_id = $1 ORDER BY created_at DESC',
    [campaignId]
  );
  return result.rows;
}

// ============ COMPLETIONS ============

export async function claimMission(missionId, influencerId) {
  // Check if already claimed
  const existing = await pool.query(
    'SELECT * FROM mission_completions WHERE mission_id = $1 AND influencer_id = $2',
    [missionId, influencerId]
  );
  
  if (existing.rows.length > 0) {
    return { error: 'Already claimed', completion: existing.rows[0] };
  }

  // Check if mission is available
  const mission = await getMission(missionId);
  if (!mission || mission.status !== 'active') {
    return { error: 'Mission not available' };
  }
  
  if (mission.current_completions >= mission.max_completions) {
    return { error: 'Mission fully claimed' };
  }

  // Create completion record
  const result = await pool.query(
    `INSERT INTO mission_completions (mission_id, influencer_id, platform, payout_cents, status)
     VALUES ($1, $2, $3, $4, 'claimed')
     RETURNING *`,
    [missionId, influencerId, mission.platform, mission.payout_cents]
  );

  return { completion: result.rows[0], mission };
}

export async function submitCompletion(completionId, postUrl, postContent, screenshotUrl = null) {
  const result = await pool.query(
    `UPDATE mission_completions 
     SET post_url = $1, post_content = $2, screenshot_url = $3, status = 'pending', created_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [postUrl, postContent, screenshotUrl, completionId]
  );
  return result.rows[0];
}

export async function verifyCompletion(completionId, approved, rejectionReason = null) {
  if (approved) {
    // Get completion and mission info
    const completion = await pool.query('SELECT * FROM mission_completions WHERE id = $1', [completionId]);
    if (!completion.rows[0]) return null;

    const comp = completion.rows[0];

    // Update completion status
    await pool.query(
      `UPDATE mission_completions SET status = 'verified', verified_at = NOW() WHERE id = $1`,
      [completionId]
    );

    // Increment mission completion count
    await pool.query(
      `UPDATE missions SET current_completions = current_completions + 1 WHERE id = $1`,
      [comp.mission_id]
    );

    // Update campaign spent
    await pool.query(
      `UPDATE campaigns SET spent_cents = spent_cents + $1 
       WHERE id = (SELECT campaign_id FROM missions WHERE id = $2)`,
      [comp.payout_cents, comp.mission_id]
    );

    // Credit influencer balance
    await pool.query(
      `UPDATE influencers SET balance_cents = balance_cents + $1, lifetime_earned_cents = lifetime_earned_cents + $1 WHERE id = $2`,
      [comp.payout_cents, comp.influencer_id]
    );

    return { ...comp, status: 'verified' };
  } else {
    const result = await pool.query(
      `UPDATE mission_completions SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *`,
      [rejectionReason, completionId]
    );
    return result.rows[0];
  }
}

export async function getCompletionsForReview(campaignId = null) {
  let query = `
    SELECT mc.*, m.title as mission_title, m.platform, i.name as influencer_name, i.email as influencer_email,
           c.name as campaign_name, c.brand
    FROM mission_completions mc
    JOIN missions m ON mc.mission_id = m.id
    JOIN campaigns c ON m.campaign_id = c.id
    JOIN influencers i ON mc.influencer_id = i.id
    WHERE mc.status = 'pending'
  `;
  
  const params = [];
  if (campaignId) {
    query += ' AND c.id = $1';
    params.push(campaignId);
  }
  
  query += ' ORDER BY mc.created_at ASC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getInfluencerCompletions(influencerId) {
  const result = await pool.query(
    `SELECT mc.*, m.title as mission_title, m.platform, c.name as campaign_name, c.brand
     FROM mission_completions mc
     JOIN missions m ON mc.mission_id = m.id
     JOIN campaigns c ON m.campaign_id = c.id
     WHERE mc.influencer_id = $1
     ORDER BY mc.created_at DESC`,
    [influencerId]
  );
  return result.rows;
}

// ============ INFLUENCE MARKET ============

export async function getMarketCampaigns() {
  console.log('[getMarketCampaigns] Starting...');
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.brand,
        c.description,
        c.brief,
        m.id as mission_id,
        m.title as mission_title,
        m.description as mission_description,
        m.content_prompt,
        m.payout_cents,
        m.max_completions,
        m.current_completions,
        (m.max_completions - m.current_completions) as spots_left,
        m.platform
      FROM campaigns c
      JOIN missions m ON m.campaign_id = c.id
      WHERE c.status = 'active'
        AND m.status = 'active'
        AND m.current_completions < m.max_completions
        AND c.brand_id IS NOT NULL
      ORDER BY m.payout_cents DESC, c.created_at DESC
      LIMIT 20
    `);
    console.log('[getMarketCampaigns] Found:', result.rows.length, 'campaigns');
    return result.rows;
  } catch (err) {
    console.error('[getMarketCampaigns] Error:', err.message);
    throw err;
  }
}

export { pool };
