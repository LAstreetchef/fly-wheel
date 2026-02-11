// server/jobs/autoBoost.js
// Scheduled job: process auto-boost subscriptions for Prime users

import { queueBoost } from './processBoost.js';

// These will be injected after DB init
let pool = null;
let primeStore = null;

export function setPool(p) { pool = p; }
export function setPrimeStore(ps) { primeStore = ps; }

async function query(text, params) {
  if (!pool) throw new Error('Database pool not initialized');
  return pool.query(text, params);
}

export async function processAutoBoosts() {
  if (!pool) {
    console.warn('[Auto-Boost] Database not initialized, skipping');
    return;
  }

  console.log('[Auto-Boost] Checking for scheduled boosts...');

  try {
    // Find auto-boosts that are due
    const result = await query(`
      SELECT ab.*, pa.boost_balance
      FROM auto_boosts ab
      JOIN prime_accounts pa ON LOWER(ab.email) = LOWER(pa.email)
      WHERE ab.active = true
        AND ab.next_run_at <= NOW()
        AND pa.boost_balance > 0
      ORDER BY ab.next_run_at ASC
      LIMIT 20
    `);

    const dueBoosts = result.rows;
    console.log(`[Auto-Boost] ${dueBoosts.length} boosts due`);

    for (const ab of dueBoosts) {
      try {
        // Decrement balance
        const balanceResult = await query(
          `UPDATE prime_accounts SET boost_balance = boost_balance - 1, updated_at = NOW()
           WHERE LOWER(email) = LOWER($1) AND boost_balance > 0
           RETURNING boost_balance`,
          [ab.email]
        );

        if (!balanceResult.rows.length) {
          console.log(`[Auto-Boost] No balance for ${ab.email}, skipping`);
          continue;
        }

        // Generate a unique session ID for this auto-boost
        const sessionId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Queue the boost
        queueBoost({
          sessionId,
          email: ab.email,
          productData: { name: ab.product, keywords: ab.keywords },
          blog: null, // Will be searched
          content: null, // Will be generated
          source: 'auto',
          priority: 0,
        });

        // Calculate next run
        const intervalMs = ab.frequency === 'daily'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;

        await query(
          `UPDATE auto_boosts 
           SET last_run_at = NOW(), next_run_at = NOW() + $1 * INTERVAL '1 millisecond'
           WHERE id = $2`,
          [intervalMs, ab.id]
        );

        console.log(`[Auto-Boost] ✅ Queued boost for ${ab.email}: "${ab.product}"`);

      } catch (err) {
        console.error(`[Auto-Boost] Failed for ${ab.email}:`, err.message);
      }
    }

    return { processed: dueBoosts.length };

  } catch (err) {
    console.error('[Auto-Boost] Error:', err.message);
    throw err;
  }
}

let autoBoostInterval = null;

export function startAutoBoostScheduler() {
  const INTERVAL = 15 * 60 * 1000; // 15 minutes

  // First run after 2 minutes
  setTimeout(() => {
    processAutoBoosts().catch(err =>
      console.error('[Auto-Boost] Initial run failed:', err.message)
    );
  }, 2 * 60 * 1000);

  // Then every 15 minutes
  autoBoostInterval = setInterval(() => {
    processAutoBoosts().catch(err =>
      console.error('[Auto-Boost] Scheduled run failed:', err.message)
    );
  }, INTERVAL);

  console.log('[Auto-Boost] 📅 Scheduler started: checking every 15 minutes');
}

export function stopAutoBoostScheduler() {
  if (autoBoostInterval) {
    clearInterval(autoBoostInterval);
    autoBoostInterval = null;
    console.log('[Auto-Boost] Scheduler stopped');
  }
}

// Initialize the auto_boosts table
export async function initAutoBoostsTable() {
  if (!pool) return;

  await query(`
    CREATE TABLE IF NOT EXISTS auto_boosts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      product TEXT NOT NULL,
      keywords TEXT NOT NULL,
      frequency TEXT DEFAULT 'weekly',
      next_run_at TIMESTAMP,
      last_run_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log('📦 Auto-boosts table initialized');
}
