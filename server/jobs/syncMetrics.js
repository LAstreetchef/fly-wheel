// server/jobs/syncMetrics.js
// Periodically fetch tweet metrics for recent boosts

import { getClient, TWITTER_ACCOUNTS } from '../services/twitter.js';

// Order store will be injected after DB init
let orderStore = null;

export function setOrderStore(store) {
  orderStore = store;
}

// Get tweet metrics using the Twitter API
async function getTweetMetrics(tweetId, accountName = 'flywheelsquad') {
  try {
    const client = getClient(accountName);
    const tweet = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics', 'created_at'],
    });
    
    if (!tweet.data) return null;
    
    return {
      impressions: tweet.data.public_metrics?.impression_count || 0,
      likes: tweet.data.public_metrics?.like_count || 0,
      retweets: tweet.data.public_metrics?.retweet_count || 0,
      replies: tweet.data.public_metrics?.reply_count || 0,
      quotes: tweet.data.public_metrics?.quote_count || 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Metrics] Failed to fetch metrics for ${tweetId}:`, err.message);
    return null;
  }
}

export async function syncRecentBoostMetrics() {
  if (!orderStore) {
    console.warn('[Metrics Sync] Order store not initialized, skipping');
    return;
  }

  console.log('[Metrics Sync] Starting...');
  
  try {
    // Get all orders and filter to recent published ones
    const allOrders = await orderStore.all();
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const recentBoosts = allOrders.filter(order => 
      order.status === 'published' && 
      order.tweetId && 
      new Date(order.createdAt).getTime() > sevenDaysAgo
    ).slice(0, 50);

    console.log(`[Metrics Sync] Fetching metrics for ${recentBoosts.length} boosts`);

    let updated = 0;
    for (const boost of recentBoosts) {
      try {
        const metrics = await getTweetMetrics(boost.tweetId);
        if (metrics) {
          // Update the order with new metrics
          const order = await orderStore.get(boost.sessionId);
          if (order) {
            order.metrics = metrics;
            await orderStore.set(boost.sessionId, order);
            updated++;
          }
        }
        // Small delay to avoid Twitter rate limits
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[Metrics Sync] Failed for boost ${boost.sessionId}:`, err.message);
      }
    }

    console.log(`[Metrics Sync] ✅ Updated ${updated}/${recentBoosts.length} boosts`);
    return { updated, total: recentBoosts.length };

  } catch (err) {
    console.error('[Metrics Sync] Error:', err.message);
    throw err;
  }
}

// Run every 6 hours
let syncInterval = null;

export function startMetricsSync() {
  const INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  // Initial run after 2 minutes (let server warm up)
  setTimeout(() => {
    syncRecentBoostMetrics().catch(err => 
      console.error('[Metrics Sync] Initial run failed:', err.message)
    );
  }, 2 * 60 * 1000);

  // Then every 6 hours
  syncInterval = setInterval(() => {
    syncRecentBoostMetrics().catch(err => 
      console.error('[Metrics Sync] Scheduled run failed:', err.message)
    );
  }, INTERVAL);

  console.log('[Metrics Sync] 📅 Scheduled: every 6 hours');
}

export function stopMetricsSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Metrics Sync] Stopped');
  }
}
