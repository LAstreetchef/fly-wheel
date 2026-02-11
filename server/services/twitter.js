// server/services/twitter.js
// Twitter API v2 — multi-account support with fallback and health tracking

import { TwitterApi } from 'twitter-api-v2';

// Multi-account configuration
export const TWITTER_ACCOUNTS = {
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
  greentruck: {
    handle: 'greentruck',
    apiKey: () => process.env.GREENTRUCK_API_KEY,
    apiSecret: () => process.env.GREENTRUCK_API_SECRET,
    accessToken: () => process.env.GREENTRUCK_ACCESS_TOKEN,
    accessSecret: () => process.env.GREENTRUCK_ACCESS_SECRET,
  },
};

// Track Twitter health status per account
export const twitterHealth = {
  flywheelsquad: { lastSuccess: null, lastError: null, errorCount: 0, rateLimitReset: null },
  greentruck: { lastSuccess: null, lastError: null, errorCount: 0, rateLimitReset: null },
  themessageis4u: { lastSuccess: null, lastError: null, errorCount: 0, rateLimitReset: null },
};

const ALL_ACCOUNTS = ['flywheelsquad', 'themessageis4u', 'greentruck'];

// Parse Twitter API errors for better debugging
export function parseTwitterError(err, accountName) {
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
  
  if (err.rateLimit?.reset) {
    health.rateLimitReset = new Date(err.rateLimit.reset * 1000).toISOString();
  }
  
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
export async function verifyTwitterCredentials(accountName = 'flywheelsquad') {
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
      missing: { apiKey: !apiKey, apiSecret: !apiSecret, accessToken: !accessToken, accessSecret: !accessSecret }
    };
  }
  
  try {
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
    const me = await client.v2.me();
    const health = twitterHealth[accountName];
    health.lastSuccess = new Date().toISOString();
    health.errorCount = 0;
    return { valid: true, user: me.data, health: twitterHealth[accountName] };
  } catch (err) {
    const errorInfo = parseTwitterError(err, accountName);
    return { valid: false, error: errorInfo };
  }
}

// Upload media to Twitter
export async function uploadTwitterMedia(imageBuffer, mimeType, accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();

  if (!accessToken || !accessSecret) {
    console.warn(`⚠️  Twitter tokens not set for ${account.handle}`);
    return null;
  }

  const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });

  try {
    const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
    console.log(`✅ Media uploaded to @${account.handle}: ${mediaId}`);
    return mediaId;
  } catch (err) {
    console.error(`❌ Media upload failed for @${account.handle}:`, err.message);
    return null;
  }
}

// Post tweet with retry and fallback
export async function postTweet(text, accountName = 'flywheelsquad', options = {}) {
  const { retries = 2, fallbackToOther = true, retryDelayMs = 2000, mediaIds = null } = options;
  
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  const apiKey = account.apiKey();
  const apiSecret = account.apiSecret();
  const accessToken = account.accessToken();
  const accessSecret = account.accessSecret();
  
  if (!accessToken || !accessSecret) {
    console.warn(`⚠️  Twitter tokens not set for ${account.handle}`);
    if (fallbackToOther) {
      const otherAccount = accountName === 'flywheelsquad' ? 'themessageis4u' : 'flywheelsquad';
      console.log(`🔄 Trying fallback account @${otherAccount}...`);
      return postTweet(text, otherAccount, { ...options, fallbackToOther: false });
    }
    throw new Error(`Twitter tokens not configured for @${account.handle}`);
  }

  const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
  
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry attempt ${attempt}/${retries} for @${account.handle}...`);
        await new Promise(r => setTimeout(r, retryDelayMs * attempt));
      }
      
      const tweetPayload = { text };
      if (mediaIds && mediaIds.length > 0) {
        tweetPayload.media = { media_ids: mediaIds };
      }
      
      const { data } = await client.v2.tweet(tweetPayload);
      
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
      if (errorInfo.statusCode === 401 || errorInfo.statusCode === 403 || errorInfo.statusCode === 429) break;
    }
  }
  
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

// Cross-engage from other accounts
export async function crossEngage(tweetId, postingAccount) {
  const otherAccounts = ALL_ACCOUNTS.filter(a => a !== postingAccount);
  const results = { likes: [], retweets: [], errors: [] };
  
  for (const accountName of otherAccounts) {
    const account = TWITTER_ACCOUNTS[accountName];
    if (!account) continue;
    
    const accessToken = account.accessToken();
    const accessSecret = account.accessSecret();
    if (!accessToken || !accessSecret) {
      console.log(`⏭️ Skipping ${accountName} - no credentials`);
      continue;
    }
    
    const client = new TwitterApi({
      appKey: account.apiKey(),
      appSecret: account.apiSecret(),
      accessToken,
      accessSecret,
    });
    
    try {
      const me = await client.v2.me();
      await client.v2.like(me.data.id, tweetId);
      results.likes.push(accountName);
      console.log(`❤️ @${accountName} liked tweet ${tweetId}`);
    } catch (err) {
      if (!err.message?.includes('already liked')) {
        results.errors.push({ account: accountName, action: 'like', error: err.message });
      }
    }
    
    try {
      const me = await client.v2.me();
      await client.v2.retweet(me.data.id, tweetId);
      results.retweets.push(accountName);
      console.log(`🔁 @${accountName} retweeted tweet ${tweetId}`);
    } catch (err) {
      if (!err.message?.includes('already retweeted')) {
        results.errors.push({ account: accountName, action: 'retweet', error: err.message });
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return results;
}

// Get client for a specific account
export function getClient(accountName = 'flywheelsquad') {
  const account = TWITTER_ACCOUNTS[accountName] || TWITTER_ACCOUNTS.flywheelsquad;
  return new TwitterApi({
    appKey: account.apiKey(),
    appSecret: account.apiSecret(),
    accessToken: account.accessToken(),
    accessSecret: account.accessSecret(),
  });
}
