// Twitter integration service
import { TwitterApi } from 'twitter-api-v2';
import db from './db.js';

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = process.env.TWITTER_CALLBACK_URL || 'http://127.0.0.1:3001/api/twitter/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173/fly-wheel';

// OAuth 2.0 state storage (in production, use Redis or similar)
const oauthStates = new Map();

export function isTwitterConfigured() {
  return !!(TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET);
}

export function getFrontendUrl() {
  return FRONTEND_URL;
}

export function getAuthUrl(userId, returnTo = null) {
  if (!isTwitterConfigured()) {
    throw new Error('Twitter API not configured');
  }
  
  const client = new TwitterApi({
    clientId: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET,
  });
  
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(CALLBACK_URL, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });
  
  // Store state for verification (including returnTo for redirect after auth)
  oauthStates.set(state, { userId, codeVerifier, returnTo, createdAt: Date.now() });
  console.log(`[Twitter] State stored: ${state.substring(0, 10)}... for user ${userId}. Total states: ${oauthStates.size}`);
  
  // Clean old states (older than 10 minutes)
  for (const [key, value] of oauthStates.entries()) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) {
      oauthStates.delete(key);
    }
  }
  
  return url;
}

export async function handleCallback(code, state) {
  console.log(`[Twitter] Callback received. State: ${state?.substring(0, 10)}... Total stored states: ${oauthStates.size}`);
  console.log(`[Twitter] Stored states:`, [...oauthStates.keys()].map(k => k.substring(0, 10)));
  const storedState = oauthStates.get(state);
  if (!storedState) {
    console.log(`[Twitter] State NOT FOUND in storage!`);
    throw new Error('Invalid or expired state');
  }
  console.log(`[Twitter] State found for user ${storedState.userId}`);
  
  oauthStates.delete(state);
  
  const client = new TwitterApi({
    clientId: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET,
  });
  
  const { accessToken, refreshToken } = await client.loginWithOAuth2({
    code,
    codeVerifier: storedState.codeVerifier,
    redirectUri: CALLBACK_URL,
  });
  
  // Get user info
  const userClient = new TwitterApi(accessToken);
  const { data: twitterUser } = await userClient.v2.me();
  
  // Store connection
  const existingConnection = db.prepare(
    'SELECT * FROM twitter_connections WHERE user_id = ?'
  ).get(storedState.userId);
  
  if (existingConnection) {
    db.prepare(`
      UPDATE twitter_connections 
      SET twitter_id = ?, twitter_username = ?, access_token = ?, refresh_token = ?, connected_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(twitterUser.id, twitterUser.username, accessToken, refreshToken, storedState.userId);
  } else {
    db.prepare(`
      INSERT INTO twitter_connections (user_id, twitter_id, twitter_username, access_token, refresh_token)
      VALUES (?, ?, ?, ?, ?)
    `).run(storedState.userId, twitterUser.id, twitterUser.username, accessToken, refreshToken);
  }
  
  return {
    userId: storedState.userId,
    twitterUsername: twitterUser.username,
    returnTo: storedState.returnTo,
  };
}

export function getConnection(userId) {
  return db.prepare(`
    SELECT twitter_id, twitter_username, connected_at 
    FROM twitter_connections 
    WHERE user_id = ?
  `).get(userId);
}

export function disconnectTwitter(userId) {
  db.prepare('DELETE FROM twitter_connections WHERE user_id = ?').run(userId);
}

export async function postTweet(userId, text, mediaIds = []) {
  const connection = db.prepare(
    'SELECT access_token FROM twitter_connections WHERE user_id = ?'
  ).get(userId);
  
  if (!connection) {
    throw new Error('Twitter not connected');
  }
  
  const client = new TwitterApi(connection.access_token);
  
  try {
    const tweetOptions = mediaIds.length > 0 
      ? { text, media: { media_ids: mediaIds } }
      : text;
    const { data } = await client.v2.tweet(tweetOptions);
    return {
      id: data.id,
      url: `https://twitter.com/i/status/${data.id}`,
    };
  } catch (error) {
    // Handle token refresh if needed
    if (error.code === 401) {
      throw new Error('Twitter token expired. Please reconnect.');
    }
    throw error;
  }
}

export async function uploadMedia(userId, imagePath) {
  const connection = db.prepare(
    'SELECT access_token FROM twitter_connections WHERE user_id = ?'
  ).get(userId);
  
  if (!connection) {
    throw new Error('Twitter not connected');
  }
  
  const client = new TwitterApi(connection.access_token);
  
  try {
    const mediaId = await client.v1.uploadMedia(imagePath);
    return mediaId;
  } catch (error) {
    console.error('Media upload error:', error);
    throw error;
  }
}

export async function getTweetMetrics(userId, tweetId) {
  const connection = db.prepare(
    'SELECT access_token FROM twitter_connections WHERE user_id = ?'
  ).get(userId);
  
  if (!connection) {
    throw new Error('Twitter not connected');
  }
  
  const client = new TwitterApi(connection.access_token);
  
  const { data } = await client.v2.singleTweet(tweetId, {
    'tweet.fields': ['public_metrics', 'created_at'],
  });
  
  return {
    id: data.id,
    metrics: data.public_metrics,
    createdAt: data.created_at,
  };
}
