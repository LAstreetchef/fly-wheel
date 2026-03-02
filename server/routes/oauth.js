// server/routes/oauth.js
// OAuth routes for influencer social account connections

import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import crypto from 'crypto';

const router = express.Router();

// In-memory state store (use Redis in production)
const oauthStates = new Map();

// Twitter OAuth 2.0 config
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_CALLBACK = process.env.TWITTER_INFLUENCER_CALLBACK || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://daufinder.com/api/oauth/twitter/callback'
    : 'http://localhost:10000/api/oauth/twitter/callback');

// ============ TWITTER ============

// GET /api/oauth/twitter - Start Twitter OAuth
router.get('/twitter', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Store state for verification
    oauthStates.set(state, {
      codeVerifier,
      returnUrl: req.query.return_url || '/influencers',
      createdAt: Date.now()
    });
    
    // Clean old states (>10 min)
    for (const [key, val] of oauthStates) {
      if (Date.now() - val.createdAt > 600000) oauthStates.delete(key);
    }
    
    // Build Twitter OAuth URL
    const client = new TwitterApi({ clientId: TWITTER_CLIENT_ID, clientSecret: TWITTER_CLIENT_SECRET });
    
    const { url, codeVerifier: cv, state: s } = client.generateOAuth2AuthLink(
      TWITTER_CALLBACK,
      { 
        scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        state,
        codeVerifier
      }
    );
    
    // Update stored codeVerifier with the one from Twitter lib
    oauthStates.set(state, { ...oauthStates.get(state), codeVerifier: cv });
    
    res.redirect(url);
  } catch (err) {
    console.error('Twitter OAuth start error:', err);
    res.redirect('/influencers?error=oauth_failed');
  }
});

// GET /api/oauth/twitter/callback - Twitter OAuth callback
router.get('/twitter/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.redirect('/influencers?error=missing_params');
    }
    
    const stored = oauthStates.get(state);
    if (!stored) {
      return res.redirect('/influencers?error=invalid_state');
    }
    
    oauthStates.delete(state);
    
    // Exchange code for tokens
    const client = new TwitterApi({ clientId: TWITTER_CLIENT_ID, clientSecret: TWITTER_CLIENT_SECRET });
    
    const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
      code,
      codeVerifier: stored.codeVerifier,
      redirectUri: TWITTER_CALLBACK
    });
    
    // Get user info
    const userClient = new TwitterApi(accessToken);
    const { data: user } = await userClient.v2.me({ 'user.fields': ['profile_image_url', 'public_metrics'] });
    
    // For now, pass data back to frontend via URL params (will use sessions later)
    const params = new URLSearchParams({
      platform: 'twitter',
      connected: 'true',
      username: user.username,
      name: user.name,
      followers: user.public_metrics?.followers_count || 0,
      // Store tokens in sessionStorage via frontend (temp solution)
      token: Buffer.from(JSON.stringify({ accessToken, refreshToken, expiresIn })).toString('base64')
    });
    
    res.redirect(`/influencers?${params.toString()}`);
  } catch (err) {
    console.error('Twitter OAuth callback error:', err);
    res.redirect('/influencers?error=oauth_callback_failed');
  }
});

// POST /api/oauth/twitter/tweet - Post a tweet on behalf of user
router.post('/twitter/tweet', async (req, res) => {
  try {
    const { token, text } = req.body;
    
    if (!token || !text) {
      return res.status(400).json({ error: 'Missing token or text' });
    }
    
    // Decode token
    const { accessToken } = JSON.parse(Buffer.from(token, 'base64').toString());
    
    // Post tweet
    const client = new TwitterApi(accessToken);
    const { data } = await client.v2.tweet(text);
    
    res.json({
      success: true,
      tweet_id: data.id,
      url: `https://twitter.com/i/web/status/${data.id}`
    });
  } catch (err) {
    console.error('Tweet error:', err);
    res.status(500).json({ error: 'Failed to post tweet', details: err.message });
  }
});

// ============ INSTAGRAM ============
// Instagram requires Facebook Business account - placeholder for now

router.get('/instagram', (req, res) => {
  res.redirect('/influencers?error=instagram_coming_soon');
});

// ============ TIKTOK ============
// TikTok API requires approved developer account - placeholder for now

router.get('/tiktok', (req, res) => {
  res.redirect('/influencers?error=tiktok_coming_soon');
});

// ============ LINKEDIN ============
// LinkedIn OAuth

router.get('/linkedin', (req, res) => {
  res.redirect('/influencers?error=linkedin_coming_soon');
});

export default router;
