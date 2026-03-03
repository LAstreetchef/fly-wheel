// server/routes/brands.js
// Brand self-serve routes - dead simple campaign creation

import express from 'express';
import Stripe from 'stripe';
import {
  getOrCreateBrand,
  getBrandByEmail,
  getBrandById,
  getBrandByToken,
  updateBrand,
  addBrandBalance,
  getBrandCampaigns,
  createBrandCampaign,
  getBrandStats
} from '../db/brands.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Brand auth middleware
async function brandAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  
  const token = authHeader.slice(7);
  const brand = await getBrandByToken(token);
  
  if (!brand) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.brand = brand;
  next();
}

// ============ AUTH ROUTES ============

// POST /api/brands/signup - Create brand account & start checkout
router.post('/signup', async (req, res) => {
  try {
    const { email, product, budget } = req.body;
    
    if (!email || !product) {
      return res.status(400).json({ error: 'Email and product required' });
    }
    
    // Get or create brand
    const brand = await getOrCreateBrand(email);
    
    // Budget presets in cents (default to $50)
    const budgetCents = {
      '50': 5000,
      '200': 20000,
      '500': 50000
    }[budget] || parseInt(budget) * 100 || 5000;
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Campaign: ${product}`,
            description: `${Math.floor(budgetCents / 200)} posts about "${product}" on X/Twitter`
          },
          unit_amount: budgetCents
        },
        quantity: 1
      }],
      metadata: {
        brand_id: brand.id.toString(),
        product: product,
        budget_cents: budgetCents.toString(),
        type: 'brand_campaign'
      },
      success_url: `${process.env.API_URL || 'https://fly-wheel.onrender.com'}/brand-dashboard?token=${brand.auth_token}&new=1`,
      cancel_url: `${process.env.API_URL || 'https://fly-wheel.onrender.com'}/brands`
    });
    
    res.json({ 
      checkout_url: session.url,
      token: brand.auth_token 
    });
    
  } catch (err) {
    console.error('Brand signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/brands/login - Magic link login (sends email)
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const brand = await getBrandByEmail(email);
    
    if (!brand) {
      return res.status(404).json({ error: 'No account found. Create a campaign first!' });
    }
    
    // For now, just return the dashboard URL
    // TODO: Send magic link email
    const dashboardUrl = `${process.env.API_URL || 'https://fly-wheel.onrender.com'}/brand-dashboard?token=${brand.auth_token}`;
    
    res.json({ 
      message: 'Check your email for login link',
      // TODO: Remove this in production - just for testing
      _dev_url: process.env.NODE_ENV !== 'production' ? dashboardUrl : undefined
    });
    
  } catch (err) {
    console.error('Brand login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/brands/me - Get current brand info
router.get('/me', brandAuth, async (req, res) => {
  try {
    const stats = await getBrandStats(req.brand.id);
    res.json({ brand: stats });
  } catch (err) {
    console.error('Get brand error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to get brand info', detail: err.message });
  }
});

// ============ CAMPAIGN ROUTES ============

// GET /api/brands/campaigns - List brand's campaigns
router.get('/campaigns', brandAuth, async (req, res) => {
  try {
    const campaigns = await getBrandCampaigns(req.brand.id);
    res.json({ campaigns });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
});

// POST /api/brands/campaigns - Create new campaign (uses balance)
router.post('/campaigns', brandAuth, async (req, res) => {
  try {
    const { product, budget } = req.body;
    
    if (!product) {
      return res.status(400).json({ error: 'Product name required' });
    }
    
    const budgetCents = parseInt(budget) * 100 || 5000;
    
    // Check balance
    if (req.brand.balance_cents < budgetCents) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: req.brand.balance_cents,
        required: budgetCents
      });
    }
    
    const campaign = await createBrandCampaign(req.brand.id, {
      name: product,
      budget_cents: budgetCents
    });
    
    res.json({ campaign });
    
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// POST /api/brands/add-funds - Add funds via Stripe
router.post('/add-funds', brandAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const amountCents = parseInt(amount) * 100 || 5000;
    
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.brand.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Add Campaign Funds',
            description: `Add $${(amountCents / 100).toFixed(0)} to your balance`
          },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      metadata: {
        brand_id: req.brand.id.toString(),
        type: 'brand_funds',
        amount_cents: amountCents.toString()
      },
      success_url: `${process.env.API_URL || 'https://fly-wheel.onrender.com'}/brand-dashboard?token=${req.brand.auth_token}&funded=1`,
      cancel_url: `${process.env.API_URL || 'https://fly-wheel.onrender.com'}/brand-dashboard?token=${req.brand.auth_token}`
    });
    
    res.json({ checkout_url: session.url });
    
  } catch (err) {
    console.error('Add funds error:', err);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// ============ WEBHOOK HANDLER ============
// This should be called from the main Stripe webhook

export async function handleBrandPayment(session) {
  const { brand_id, type, product, budget_cents, amount_cents } = session.metadata;
  
  if (type === 'brand_campaign') {
    // Create campaign after successful payment
    const campaign = await createBrandCampaign(parseInt(brand_id), {
      name: product,
      budget_cents: parseInt(budget_cents)
    });
    console.log(`✅ Brand campaign created: ${campaign.id} for brand ${brand_id}`);
    return campaign;
  }
  
  if (type === 'brand_funds') {
    // Add funds to brand balance
    const brand = await addBrandBalance(parseInt(brand_id), parseInt(amount_cents));
    console.log(`✅ Added $${(parseInt(amount_cents) / 100).toFixed(2)} to brand ${brand_id}`);
    return brand;
  }
}

// Admin: Fix campaigns missing missions
router.post('/admin/fix-missions', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Import pool from brands db
    const { pool } = await import('../db/brands.js');
    
    // Find campaigns without missions
    const campaigns = await pool.query(`
      SELECT c.* FROM campaigns c
      LEFT JOIN missions m ON m.campaign_id = c.id
      WHERE m.id IS NULL AND c.brand_id IS NOT NULL
    `);
    
    console.log(`Found ${campaigns.rows.length} campaigns without missions`);
    
    for (const c of campaigns.rows) {
      const contentPrompt = `Create an authentic post sharing your thoughts on ${c.name}. Be genuine and creative!`;
      await pool.query(`
        INSERT INTO missions (
          campaign_id, platform, content, payout_cents, status,
          title, description, content_prompt, max_completions
        ) VALUES ($1, 'twitter', $2, 200, 'active', $3, $4, $2, $5)
      `, [
        c.id,
        contentPrompt,
        `Share about ${c.name}`,
        `Post about ${c.name} on X/Twitter`,
        Math.floor((c.budget_cents || 5000) / 200)
      ]);
      console.log(`Created mission for campaign ${c.id}: ${c.name}`);
    }
    
    res.json({ fixed: campaigns.rows.length });
  } catch (err) {
    console.error('Fix missions error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
