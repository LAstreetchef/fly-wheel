// Auth routes - OAuth for TikTok, Instagram, OnlyFans verification

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Simple ID generator (replacement for nanoid)
const nanoid = (length = 21) => crypto.randomBytes(length).toString('base64url').slice(0, length);

// TikTok OAuth flow
router.get('/tiktok', (req, res) => {
  // For MVP: redirect to TikTok OAuth
  // In production: use real TikTok client ID
  const clientId = process.env.TIKTOK_CLIENT_ID || 'YOUR_TIKTOK_CLIENT_ID';
  const redirectUri = encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3030/api/auth/tiktok/callback');
  const state = nanoid();
  
  // Store state in session for verification
  req.session.oauthState = state;
  
  // MVP: For testing, skip OAuth and create mock user
  if (!process.env.TIKTOK_CLIENT_ID) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>TikTok Connect</title></head><body>
      <h1>🥔 TikTok Connect (MVP Mode)</h1>
      <p>Enter your TikTok handle to continue:</p>
      <form action="/api/auth/tiktok/mock" method="POST">
        <input type="text" name="handle" placeholder="@username" required style="padding:8px;font-size:14px">
        <button type="submit" style="padding:8px 16px;background:#000;color:#fff;border:none;cursor:pointer">Connect</button>
      </form>
      </body></html>
    `);
  }
  
  const authUrl = `https://www.tiktok.com/auth/authorize/?client_key=${clientId}&scope=user.info.basic&response_type=code&redirect_uri=${redirectUri}&state=${state}`;
  res.redirect(authUrl);
});

// TikTok OAuth callback
router.get('/tiktok/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter');
  }
  
  // Exchange code for access token
  // TODO: Implement real TikTok token exchange
  
  // For MVP: create user and redirect
  const userId = req.app.locals.getNextUserId();
  const user = {
    id: userId,
    platform: 'tiktok',
    handle: '@creator' + userId,
    name: 'TikTok Creator ' + userId,
    points: 100, // Welcome bonus
    balance: 0,
    createdAt: new Date()
  };
  
  req.app.locals.users.set(userId, user);
  req.session.userId = userId;
  
  // Redirect to extension success page or close window
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Connected!</title></head><body>
    <h1>✅ Connected!</h1>
    <p>You can close this window and return to the extension.</p>
    <script>
      setTimeout(() => window.close(), 2000);
    </script>
    </body></html>
  `);
});

// MVP Mock TikTok auth
router.post('/tiktok/mock', express.urlencoded({ extended: true }), (req, res) => {
  const handle = req.body.handle.replace('@', '');
  const userId = req.app.locals.getNextUserId();
  
  const user = {
    id: userId,
    platform: 'tiktok',
    handle: '@' + handle,
    name: handle,
    points: 100, // Welcome bonus
    balance: 0,
    createdAt: new Date()
  };
  
  req.app.locals.users.set(userId, user);
  req.session.userId = userId;
  
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Connected!</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px 20px}h1{font-size:32px}</style>
    </head><body>
    <h1>✅ @${handle} connected!</h1>
    <p>Welcome bonus: 100 HP Points</p>
    <p>You can close this window.</p>
    <script>setTimeout(() => window.close(), 2000);</script>
    </body></html>
  `);
});

// Instagram OAuth
router.get('/instagram', (req, res) => {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  
  // MVP: Skip OAuth for now
  if (!clientId) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>Instagram Connect</title></head><body>
      <h1>🥔 Instagram Connect (MVP Mode)</h1>
      <form action="/api/auth/instagram/mock" method="POST">
        <input type="text" name="handle" placeholder="@username" required style="padding:8px;font-size:14px">
        <button type="submit" style="padding:8px 16px;background:#000;color:#fff;border:none;cursor:pointer">Connect</button>
      </form>
      </body></html>
    `);
  }
  
  const redirectUri = encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3030/api/auth/instagram/callback');
  const state = nanoid();
  req.session.oauthState = state;
  
  const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user_profile&response_type=code&state=${state}`;
  res.redirect(authUrl);
});

// Instagram mock
router.post('/instagram/mock', express.urlencoded({ extended: true }), (req, res) => {
  const handle = req.body.handle.replace('@', '');
  const userId = req.app.locals.getNextUserId();
  
  const user = {
    id: userId,
    platform: 'instagram',
    handle: '@' + handle,
    name: handle,
    points: 100,
    balance: 0,
    createdAt: new Date()
  };
  
  req.app.locals.users.set(userId, user);
  req.session.userId = userId;
  
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Connected!</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px 20px}h1{font-size:32px}</style>
    </head><body>
    <h1>✅ @${handle} connected!</h1>
    <p>Welcome bonus: 100 HP Points</p>
    <script>setTimeout(() => window.close(), 2000);</script>
    </body></html>
  `);
});

// OnlyFans verification (email/bio code method)
router.get('/onlyfans', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>OnlyFans Connect</title>
    <style>body{font-family:sans-serif;max-width:500px;margin:60px auto;padding:20px}
    input,button{width:100%;padding:10px;margin:8px 0;font-size:14px}
    button{background:#00AFF0;color:#fff;border:none;cursor:pointer}
    .hint{font-size:11px;color:#666;margin-top:4px}</style>
    </head><body>
    <h1>🥔 OnlyFans Connect</h1>
    <p>Enter your OnlyFans username:</p>
    <form action="/api/auth/onlyfans/verify" method="POST">
      <input type="text" name="handle" placeholder="username" required>
      <div class="hint">We'll verify your account via bio code</div>
      <button type="submit">Continue →</button>
    </form>
    </body></html>
  `);
});

router.post('/onlyfans/verify', express.urlencoded({ extended: true }), (req, res) => {
  const handle = req.body.handle;
  const verificationCode = nanoid(8).toUpperCase();
  
  // Store code in session for verification
  req.session.ofVerification = { handle, code: verificationCode };
  
  res.send(`
    <!DOCTYPE html>
    <html><head><title>OnlyFans Verification</title>
    <style>body{font-family:sans-serif;max-width:500px;margin:60px auto;padding:20px}
    .code{font-size:24px;font-weight:bold;background:#f0f0f0;padding:12px;text-align:center;margin:16px 0;letter-spacing:2px}
    button{width:100%;padding:12px;background:#00AFF0;color:#fff;border:none;cursor:pointer;font-size:14px}
    ol{line-height:1.8}</style>
    </head><body>
    <h1>🥔 Verify @${handle}</h1>
    <ol>
      <li>Add this code to your OnlyFans bio:</li>
    </ol>
    <div class="code">HP-${verificationCode}</div>
    <ol start="2">
      <li>Click the button below to verify</li>
    </ol>
    <form action="/api/auth/onlyfans/confirm" method="POST">
      <button type="submit">I've added the code →</button>
    </form>
    <p style="font-size:11px;color:#666">For MVP: we'll skip the scraping step and auto-verify</p>
    </body></html>
  `);
});

router.post('/onlyfans/confirm', express.urlencoded({ extended: true }), (req, res) => {
  const { handle, code } = req.session.ofVerification || {};
  
  if (!handle) {
    return res.status(400).send('Session expired. Please start over.');
  }
  
  // MVP: Auto-verify without scraping
  const userId = req.app.locals.getNextUserId();
  const user = {
    id: userId,
    platform: 'onlyfans',
    handle: '@' + handle,
    name: handle,
    points: 100,
    balance: 0,
    createdAt: new Date()
  };
  
  req.app.locals.users.set(userId, user);
  req.session.userId = userId;
  
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Verified!</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px 20px}h1{font-size:32px}</style>
    </head><body>
    <h1>✅ @${handle} verified!</h1>
    <p>Welcome bonus: 100 HP Points</p>
    <script>setTimeout(() => window.close(), 2000);</script>
    </body></html>
  `);
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = req.app.locals.users.get(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({ user });
});

module.exports = router;
