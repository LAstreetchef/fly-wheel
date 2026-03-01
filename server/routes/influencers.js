// server/routes/influencers.js
// API routes for DAUinfluencers

import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createInfluencer,
  getInfluencerById,
  getInfluencerByEmail,
  verifyInfluencerPassword,
  getInfluencerAccounts,
  getInfluencerAccountWithToken,
  addInfluencerAccount,
  removeCreatorAccount,
  getAvailableMissions,
  getMissionById,
  claimMission,
  completeMission,
  unclaimMission,
  getInfluencerMissionHistory,
  updateInfluencerBalance,
  incrementInfluencerMissions,
  requestPayout,
  getInfluencerPayouts,
  getInfluencerStats,
  getAllInfluencersAdmin,
  getPendingPayouts,
  completePayout,
} from '../db/influencers.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_API_KEY || 'dauinfluencers-secret-change-me';

// ============================================
// Auth Middleware
// ============================================

function influencerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.influencerId = decoded.influencerId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================
// Auth Routes
// ============================================

// POST /api/influencers/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Check if exists
    const existing = await getInfluencerByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const influencer = await createInfluencer({ email, password, name: name || email.split('@')[0] });
    
    const token = jwt.sign({ influencerId: influencer.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      influencer: {
        id: influencer.id,
        email: influencer.email,
        name: influencer.name,
      }
    });
  } catch (err) {
    console.error('Creator signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/influencers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const influencer = await verifyInfluencerPassword(email, password);
    if (!influencer) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (influencer.status !== 'active') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    
    const token = jwt.sign({ influencerId: influencer.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      influencer: {
        id: influencer.id,
        email: influencer.email,
        name: influencer.name,
      }
    });
  } catch (err) {
    console.error('Creator login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/influencers/me
router.get('/me', influencerAuth, async (req, res) => {
  try {
    const influencer = await getInfluencerById(req.influencerId);
    if (!influencer) {
      return res.status(404).json({ error: 'Creator not found' });
    }
    
    const accounts = await getInfluencerAccounts(req.influencerId);
    const stats = await getInfluencerStats(req.influencerId);
    
    res.json({
      influencer,
      accounts,
      stats
    });
  } catch (err) {
    console.error('Get influencer error:', err);
    res.status(500).json({ error: 'Failed to get influencer info' });
  }
});

// ============================================
// Social Account Routes
// ============================================

// GET /api/influencers/accounts
router.get('/accounts', influencerAuth, async (req, res) => {
  try {
    const accounts = await getInfluencerAccounts(req.influencerId);
    res.json({ accounts });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// DELETE /api/influencers/accounts/:platform
router.delete('/accounts/:platform', influencerAuth, async (req, res) => {
  try {
    await removeCreatorAccount(req.influencerId, req.params.platform);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove account error:', err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

// ============================================
// Mission Routes
// ============================================

// GET /api/influencers/missions
router.get('/missions', influencerAuth, async (req, res) => {
  try {
    const { platform } = req.query;
    const missions = await getAvailableMissions(req.influencerId, platform);
    res.json({ missions });
  } catch (err) {
    console.error('Get missions error:', err);
    res.status(500).json({ error: 'Failed to get missions' });
  }
});

// GET /api/influencers/missions/history
router.get('/missions/history', influencerAuth, async (req, res) => {
  try {
    const history = await getInfluencerMissionHistory(req.influencerId);
    res.json({ missions: history });
  } catch (err) {
    console.error('Get mission history error:', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// GET /api/influencers/missions/:id
router.get('/missions/:id', influencerAuth, async (req, res) => {
  try {
    const mission = await getMissionById(req.params.id);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json({ mission });
  } catch (err) {
    console.error('Get mission error:', err);
    res.status(500).json({ error: 'Failed to get mission' });
  }
});

// POST /api/influencers/missions/:id/claim
router.post('/missions/:id/claim', influencerAuth, async (req, res) => {
  try {
    const mission = await claimMission(req.params.id, req.influencerId);
    if (!mission) {
      return res.status(400).json({ error: 'Mission not available' });
    }
    res.json({ success: true, mission });
  } catch (err) {
    console.error('Claim mission error:', err);
    res.status(500).json({ error: 'Failed to claim mission' });
  }
});

// POST /api/influencers/missions/:id/skip
router.post('/missions/:id/skip', influencerAuth, async (req, res) => {
  try {
    const mission = await unclaimMission(req.params.id, req.influencerId);
    if (!mission) {
      return res.status(400).json({ error: 'Cannot skip this mission' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Skip mission error:', err);
    res.status(500).json({ error: 'Failed to skip mission' });
  }
});

// POST /api/influencers/missions/:id/complete
router.post('/missions/:id/complete', influencerAuth, async (req, res) => {
  try {
    const { postUrl, postId } = req.body;
    
    const mission = await getMissionById(req.params.id);
    if (!mission || mission.claimed_by !== req.influencerId) {
      return res.status(400).json({ error: 'Mission not claimed by you' });
    }
    
    if (mission.status === 'completed') {
      return res.status(400).json({ error: 'Mission already completed' });
    }
    
    // Complete the mission
    const completed = await completeMission(req.params.id, req.influencerId, postUrl, postId);
    
    // Pay the influencer
    await updateInfluencerBalance(req.influencerId, mission.payout_cents);
    await incrementInfluencerMissions(req.influencerId);
    
    res.json({ 
      success: true, 
      mission: completed,
      earned_cents: mission.payout_cents
    });
  } catch (err) {
    console.error('Complete mission error:', err);
    res.status(500).json({ error: 'Failed to complete mission' });
  }
});

// ============================================
// Earnings/Payout Routes
// ============================================

// GET /api/influencers/earnings
router.get('/earnings', influencerAuth, async (req, res) => {
  try {
    const influencer = await getInfluencerById(req.influencerId);
    const payouts = await getInfluencerPayouts(req.influencerId);
    const history = await getInfluencerMissionHistory(req.influencerId, 20);
    
    res.json({
      balance_cents: influencer.balance_cents,
      lifetime_earned_cents: influencer.lifetime_earned_cents,
      payouts,
      recent_earnings: history.map(m => ({
        id: m.id,
        platform: m.platform,
        product_name: m.product_name,
        payout_cents: m.payout_cents,
        completed_at: m.completed_at
      }))
    });
  } catch (err) {
    console.error('Get earnings error:', err);
    res.status(500).json({ error: 'Failed to get earnings' });
  }
});

// POST /api/influencers/payout
router.post('/payout', influencerAuth, async (req, res) => {
  try {
    const { amount_cents, method } = req.body;
    
    const MIN_PAYOUT = 1000; // $10 minimum
    if (!amount_cents || amount_cents < MIN_PAYOUT) {
      return res.status(400).json({ error: `Minimum payout is $${MIN_PAYOUT / 100}` });
    }
    
    const payout = await requestPayout(req.influencerId, amount_cents, method || 'paypal');
    
    res.json({ success: true, payout });
  } catch (err) {
    console.error('Request payout error:', err);
    res.status(400).json({ error: err.message || 'Failed to request payout' });
  }
});

// ============================================
// Admin Routes
// ============================================

// GET /api/influencers/admin/all (requires admin key)
router.get('/admin/all', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const influencers = await getAllInfluencersAdmin();
    res.json({ influencers });
  } catch (err) {
    console.error('Admin get influencers error:', err);
    res.status(500).json({ error: 'Failed to get influencers' });
  }
});

// GET /api/influencers/admin/payouts (requires admin key)
router.get('/admin/payouts', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const payouts = await getPendingPayouts();
    res.json({ payouts });
  } catch (err) {
    console.error('Admin get payouts error:', err);
    res.status(500).json({ error: 'Failed to get payouts' });
  }
});

// POST /api/influencers/admin/payouts/:id/complete (requires admin key)
router.post('/admin/payouts/:id/complete', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { notes } = req.body;
    const payout = await completePayout(req.params.id, notes);
    res.json({ success: true, payout });
  } catch (err) {
    console.error('Admin complete payout error:', err);
    res.status(500).json({ error: 'Failed to complete payout' });
  }
});

export default router;
