// server/routes/campaigns.js
// Admin routes for campaign management

import express from 'express';
import {
  createCampaign,
  getCampaign,
  getAllCampaigns,
  updateCampaign,
  fundCampaign,
  getCampaignStats,
  createMission,
  getMission,
  getCampaignMissions,
  getCompletionsForReview,
  verifyCompletion,
  getAvailableMissions,
  getMarketCampaigns,
  claimMission,
  submitCompletion,
  getInfluencerCompletions
} from '../db/campaigns.js';

const router = express.Router();

// Admin auth middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.ADMIN_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'Admin API key not configured' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.slice(7);
  if (token !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// ============ CAMPAIGN ROUTES ============

// GET /api/campaigns - List all campaigns (admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const campaigns = await getAllCampaigns(includeInactive);
    res.json({ campaigns });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
});

// POST /api/campaigns - Create campaign (admin)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, brand, description, brief, tagline, budget_cents, platforms, target_audience, content_guidelines, hashtags, mentions, start_date, end_date } = req.body;
    
    if (!name || !brand) {
      return res.status(400).json({ error: 'Name and brand are required' });
    }
    
    const campaign = await createCampaign({
      name, brand, description, brief, tagline, budget_cents, platforms, target_audience, content_guidelines, hashtags, mentions, start_date, end_date
    });
    
    res.json({ campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// GET /api/campaigns/:id - Get campaign details (admin)
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const stats = await getCampaignStats(parseInt(req.params.id));
    if (!stats) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ campaign: stats });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

// PATCH /api/campaigns/:id - Update campaign (admin)
router.patch('/:id', adminAuth, async (req, res) => {
  try {
    const campaign = await updateCampaign(parseInt(req.params.id), req.body);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// POST /api/campaigns/:id/fund - Add funds to campaign (admin)
router.post('/:id/fund', adminAuth, async (req, res) => {
  try {
    const { amount_cents } = req.body;
    if (!amount_cents || amount_cents <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }
    
    const campaign = await fundCampaign(parseInt(req.params.id), amount_cents);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ campaign, message: `Added $${(amount_cents / 100).toFixed(2)} to campaign` });
  } catch (err) {
    console.error('Fund campaign error:', err);
    res.status(500).json({ error: 'Failed to fund campaign' });
  }
});

// ============ MISSION ROUTES ============

// GET /api/campaigns/:id/missions - Get campaign missions (admin)
router.get('/:id/missions', adminAuth, async (req, res) => {
  try {
    const missions = await getCampaignMissions(parseInt(req.params.id));
    res.json({ missions });
  } catch (err) {
    console.error('Get missions error:', err);
    res.status(500).json({ error: 'Failed to get missions' });
  }
});

// POST /api/campaigns/:id/missions - Create mission (admin)
router.post('/:id/missions', adminAuth, async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.id);
    const { platform, mission_type, title, description, content_prompt, payout_cents, max_completions, requirements } = req.body;
    
    if (!platform || !title) {
      return res.status(400).json({ error: 'Platform and title are required' });
    }
    
    const mission = await createMission({
      campaign_id, platform, mission_type, title, description, content_prompt, payout_cents, max_completions, requirements
    });
    
    res.json({ mission });
  } catch (err) {
    console.error('Create mission error:', err);
    res.status(500).json({ error: 'Failed to create mission' });
  }
});

// ============ REVIEW ROUTES ============

// GET /api/campaigns/review/pending - Get pending completions (admin)
router.get('/review/pending', adminAuth, async (req, res) => {
  try {
    const campaignId = req.query.campaign_id ? parseInt(req.query.campaign_id) : null;
    const completions = await getCompletionsForReview(campaignId);
    res.json({ completions });
  } catch (err) {
    console.error('Get pending completions error:', err);
    res.status(500).json({ error: 'Failed to get pending completions' });
  }
});

// POST /api/campaigns/review/:id/verify - Approve/reject completion (admin)
router.post('/review/:id/verify', adminAuth, async (req, res) => {
  try {
    const { approved, rejection_reason } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved (boolean) is required' });
    }
    
    const completion = await verifyCompletion(parseInt(req.params.id), approved, rejection_reason);
    if (!completion) {
      return res.status(404).json({ error: 'Completion not found' });
    }
    
    res.json({ 
      completion,
      message: approved ? 'Completion verified and influencer paid' : 'Completion rejected'
    });
  } catch (err) {
    console.error('Verify completion error:', err);
    res.status(500).json({ error: 'Failed to verify completion' });
  }
});

// ============ PUBLIC INFLUENCER ROUTES ============
// These would normally be in influencer routes but keeping campaign-related here

// GET /api/campaigns/public/available - Get available missions for influencer
router.get('/public/available', async (req, res) => {
  try {
    // This would normally use auth to get influencer ID
    // For now, accept it as a query param for testing
    const influencerId = parseInt(req.query.influencer_id);
    const platform = req.query.platform || null;
    
    if (!influencerId) {
      return res.status(400).json({ error: 'influencer_id required' });
    }
    
    const missions = await getAvailableMissions(influencerId, platform);
    res.json({ missions });
  } catch (err) {
    console.error('Get available missions error:', err);
    res.status(500).json({ error: 'Failed to get available missions' });
  }
});

// GET /api/campaigns/public/market - Get all active brand campaigns for influence market
router.get('/public/market', async (req, res) => {
  try {
    const campaigns = await getMarketCampaigns();
    res.json({ campaigns });
  } catch (err) {
    console.error('Get market campaigns error:', err);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
});

export default router;
