// server/routes/creators.js
// API routes for DAUcreators

import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createCreator,
  getCreatorById,
  getCreatorByEmail,
  verifyCreatorPassword,
  getCreatorAccounts,
  getCreatorAccountWithToken,
  addCreatorAccount,
  removeCreatorAccount,
  getAvailableMissions,
  getMissionById,
  claimMission,
  completeMission,
  unclaimMission,
  getCreatorMissionHistory,
  updateCreatorBalance,
  incrementMissionsCompleted,
  requestPayout,
  getCreatorPayouts,
  getCreatorStats,
  getAllCreatorsAdmin,
  getPendingPayouts,
  completePayout,
} from '../db/creators.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_API_KEY || 'daucreators-secret-change-me';

// ============================================
// Auth Middleware
// ============================================

function creatorAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.creatorId = decoded.creatorId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================
// Auth Routes
// ============================================

// POST /api/creators/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Check if exists
    const existing = await getCreatorByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const creator = await createCreator({ email, password, name: name || email.split('@')[0] });
    
    const token = jwt.sign({ creatorId: creator.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
      }
    });
  } catch (err) {
    console.error('Creator signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/creators/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const creator = await verifyCreatorPassword(email, password);
    if (!creator) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (creator.status !== 'active') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    
    const token = jwt.sign({ creatorId: creator.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
      }
    });
  } catch (err) {
    console.error('Creator login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/creators/me
router.get('/me', creatorAuth, async (req, res) => {
  try {
    const creator = await getCreatorById(req.creatorId);
    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }
    
    const accounts = await getCreatorAccounts(req.creatorId);
    const stats = await getCreatorStats(req.creatorId);
    
    res.json({
      creator,
      accounts,
      stats
    });
  } catch (err) {
    console.error('Get creator error:', err);
    res.status(500).json({ error: 'Failed to get creator info' });
  }
});

// ============================================
// Social Account Routes
// ============================================

// GET /api/creators/accounts
router.get('/accounts', creatorAuth, async (req, res) => {
  try {
    const accounts = await getCreatorAccounts(req.creatorId);
    res.json({ accounts });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// DELETE /api/creators/accounts/:platform
router.delete('/accounts/:platform', creatorAuth, async (req, res) => {
  try {
    await removeCreatorAccount(req.creatorId, req.params.platform);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove account error:', err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

// ============================================
// Mission Routes
// ============================================

// GET /api/creators/missions
router.get('/missions', creatorAuth, async (req, res) => {
  try {
    const { platform } = req.query;
    const missions = await getAvailableMissions(req.creatorId, platform);
    res.json({ missions });
  } catch (err) {
    console.error('Get missions error:', err);
    res.status(500).json({ error: 'Failed to get missions' });
  }
});

// GET /api/creators/missions/history
router.get('/missions/history', creatorAuth, async (req, res) => {
  try {
    const history = await getCreatorMissionHistory(req.creatorId);
    res.json({ missions: history });
  } catch (err) {
    console.error('Get mission history error:', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// GET /api/creators/missions/:id
router.get('/missions/:id', creatorAuth, async (req, res) => {
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

// POST /api/creators/missions/:id/claim
router.post('/missions/:id/claim', creatorAuth, async (req, res) => {
  try {
    const mission = await claimMission(req.params.id, req.creatorId);
    if (!mission) {
      return res.status(400).json({ error: 'Mission not available' });
    }
    res.json({ success: true, mission });
  } catch (err) {
    console.error('Claim mission error:', err);
    res.status(500).json({ error: 'Failed to claim mission' });
  }
});

// POST /api/creators/missions/:id/skip
router.post('/missions/:id/skip', creatorAuth, async (req, res) => {
  try {
    const mission = await unclaimMission(req.params.id, req.creatorId);
    if (!mission) {
      return res.status(400).json({ error: 'Cannot skip this mission' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Skip mission error:', err);
    res.status(500).json({ error: 'Failed to skip mission' });
  }
});

// POST /api/creators/missions/:id/complete
router.post('/missions/:id/complete', creatorAuth, async (req, res) => {
  try {
    const { postUrl, postId } = req.body;
    
    const mission = await getMissionById(req.params.id);
    if (!mission || mission.claimed_by !== req.creatorId) {
      return res.status(400).json({ error: 'Mission not claimed by you' });
    }
    
    if (mission.status === 'completed') {
      return res.status(400).json({ error: 'Mission already completed' });
    }
    
    // Complete the mission
    const completed = await completeMission(req.params.id, req.creatorId, postUrl, postId);
    
    // Pay the creator
    await updateCreatorBalance(req.creatorId, mission.payout_cents);
    await incrementMissionsCompleted(req.creatorId);
    
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

// GET /api/creators/earnings
router.get('/earnings', creatorAuth, async (req, res) => {
  try {
    const creator = await getCreatorById(req.creatorId);
    const payouts = await getCreatorPayouts(req.creatorId);
    const history = await getCreatorMissionHistory(req.creatorId, 20);
    
    res.json({
      balance_cents: creator.balance_cents,
      lifetime_earned_cents: creator.lifetime_earned_cents,
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

// POST /api/creators/payout
router.post('/payout', creatorAuth, async (req, res) => {
  try {
    const { amount_cents, method } = req.body;
    
    const MIN_PAYOUT = 1000; // $10 minimum
    if (!amount_cents || amount_cents < MIN_PAYOUT) {
      return res.status(400).json({ error: `Minimum payout is $${MIN_PAYOUT / 100}` });
    }
    
    const payout = await requestPayout(req.creatorId, amount_cents, method || 'paypal');
    
    res.json({ success: true, payout });
  } catch (err) {
    console.error('Request payout error:', err);
    res.status(400).json({ error: err.message || 'Failed to request payout' });
  }
});

// ============================================
// Admin Routes
// ============================================

// GET /api/creators/admin/all (requires admin key)
router.get('/admin/all', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const creators = await getAllCreatorsAdmin();
    res.json({ creators });
  } catch (err) {
    console.error('Admin get creators error:', err);
    res.status(500).json({ error: 'Failed to get creators' });
  }
});

// GET /api/creators/admin/payouts (requires admin key)
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

// POST /api/creators/admin/payouts/:id/complete (requires admin key)
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
