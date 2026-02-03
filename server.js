import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { generateContent } from './server/generate.js';
import { createUser, loginUser, generateToken, authMiddleware, getUserById } from './server/auth.js';
import { createTrackedLink, getLink, recordClick, getUserLinks, getLinkStats } from './server/links.js';
import { isTwitterConfigured, getAuthUrl, handleCallback, getConnection, disconnectTwitter, getFrontendUrl } from './server/twitter.js';
import { createPost, getPost, getPostBySession, getUserPosts, publishToTwitter, getPostAnalytics, getDashboardStats } from './server/posts.js';
import { searchBlogs, isSearchConfigured } from './server/blog-search.js';
import db from './server/db.js';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// In-memory content store for webhook -> frontend sync
const contentStore = new Map();

// Products/prices configuration
const PRODUCTS = {
  social: { name: 'Social Post', price: 500, description: 'Single post for Instagram, Twitter, or TikTok' },
  boost: { name: 'Blog Boost', price: 750, description: 'X post promoting a relevant blog + your product (2-for-1 exposure)' },
  carousel: { name: 'Carousel', price: 1000, description: '5-slide Instagram carousel with hooks and CTA' },
  video: { name: 'Video Script', price: 1500, description: 'TikTok/Reel script with hooks and talking points' },
  blog: { name: 'Blog Post', price: 2000, description: '500-word SEO blog snippet' },
  email: { name: 'Email Blast', price: 2500, description: 'Subject line + body copy ready to send' },
};

const CREDIT_PACKS = {
  credits25: { amount: 25, bonus: 0, price: 2500 },
  credits50: { amount: 50, bonus: 10, price: 5000 },
  credits100: { amount: 100, bonus: 25, price: 10000 },
};

// Middleware
app.use(cors());

// Stripe webhook needs raw body
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ============================================
// Health & Status
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    twitter: isTwitterConfigured(),
    blogSearch: isSearchConfigured(),
  });
});

// ============================================
// Blog Search Routes
// ============================================

app.get('/api/blogs/search', authMiddleware, async (req, res) => {
  try {
    const { keywords, count } = req.query;
    
    if (!keywords) {
      return res.status(400).json({ error: 'Keywords required' });
    }
    
    const results = await searchBlogs(keywords, parseInt(count) || 5);
    res.json({ results, configured: isSearchConfigured() });
  } catch (error) {
    console.error('Blog search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================
// Auth Routes
// ============================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = createUser(email, password, name);
    const token = generateToken(user);
    
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = loginUser(email, password);
    const token = generateToken(user);
    
    res.json({ user, token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// ============================================
// Twitter OAuth Routes
// ============================================

app.get('/api/twitter/status', authMiddleware, (req, res) => {
  const connection = getConnection(req.user.id);
  res.json({
    configured: isTwitterConfigured(),
    connected: !!connection,
    username: connection?.twitter_username || null,
  });
});

app.get('/api/twitter/auth', authMiddleware, (req, res) => {
  try {
    const url = getAuthUrl(req.user.id);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/twitter/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const result = await handleCallback(code, state);
    
    // Redirect to frontend dashboard with success
    const frontendUrl = getFrontendUrl();
    res.redirect(`${frontendUrl}/dashboard?twitter=connected&username=${result.twitterUsername}`);
  } catch (error) {
    console.error('Twitter callback error:', error.message, error.stack);
    const fs = await import('fs');
    fs.appendFileSync('twitter-errors.log', `${new Date().toISOString()} - ${error.message}\n${error.stack}\n\n`);
    const frontendUrl = getFrontendUrl();
    res.redirect(`${frontendUrl}/dashboard?twitter=error`);
  }
});

app.post('/api/twitter/disconnect', authMiddleware, (req, res) => {
  disconnectTwitter(req.user.id);
  res.json({ success: true });
});

// ============================================
// Link Tracking
// ============================================

// Redirect handler (public)
app.get('/l/:code', (req, res) => {
  const link = getLink(req.params.code);
  
  if (!link) {
    return res.status(404).send('Link not found');
  }
  
  // Record the click
  recordClick(
    link.id,
    req.ip,
    req.headers['user-agent'],
    req.headers['referer']
  );
  
  // Redirect
  res.redirect(link.destination_url);
});

app.get('/api/links', authMiddleware, (req, res) => {
  const links = getUserLinks(req.user.id);
  res.json(links);
});

app.get('/api/links/:code/stats', authMiddleware, (req, res) => {
  const stats = getLinkStats(req.params.code);
  if (!stats) {
    return res.status(404).json({ error: 'Link not found' });
  }
  res.json(stats);
});

app.post('/api/links', authMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const link = createTrackedLink(url, req.user.id);
  res.json(link);
});

// ============================================
// Dashboard & Posts
// ============================================

app.get('/api/dashboard', authMiddleware, (req, res) => {
  const stats = getDashboardStats(req.user.id);
  res.json(stats);
});

app.get('/api/posts', authMiddleware, (req, res) => {
  const posts = getUserPosts(req.user.id);
  res.json(posts);
});

app.get('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const analytics = await getPostAnalytics(parseInt(req.params.id));
    res.json(analytics);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/api/posts/:id/publish', authMiddleware, async (req, res) => {
  try {
    const { platform, productUrl, blogUrl } = req.body;
    const postId = parseInt(req.params.id);
    
    if (platform === 'twitter') {
      const result = await publishToTwitter(postId, productUrl, blogUrl);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Unsupported platform' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a post directly (for boost flow)
app.post('/api/content/create', authMiddleware, (req, res) => {
  try {
    const { productType, content, productData } = req.body;
    
    if (!productType || !content) {
      return res.status(400).json({ error: 'productType and content required' });
    }
    
    const post = createPost(req.user.id, null, productType, productData || {}, content);
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Stripe Checkout
// ============================================

app.post('/api/checkout/spin', async (req, res) => {
  try {
    const { productType, productData, userId } = req.body;
    
    if (!PRODUCTS[productType]) {
      return res.status(400).json({ error: 'Invalid product type' });
    }

    const product = PRODUCTS[productType];
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `FlyWheel: ${product.name}`,
            description: product.description,
          },
          unit_amount: product.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'http://localhost:5173'}/fly-wheel/?success=true&type=${productType}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/fly-wheel/?canceled=true`,
      metadata: {
        type: 'spin',
        productType,
        productData: JSON.stringify(productData || {}),
        userId: userId || '',
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/checkout/credits', async (req, res) => {
  try {
    const { packType } = req.body;
    
    if (!CREDIT_PACKS[packType]) {
      return res.status(400).json({ error: 'Invalid credit pack' });
    }

    const pack = CREDIT_PACKS[packType];
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `FlyWheel Credits: $${pack.amount}`,
            description: pack.bonus > 0 
              ? `$${pack.amount} + $${pack.bonus} bonus (${Math.floor((pack.amount + pack.bonus) / 5)} spins)`
              : `$${pack.amount} (${Math.floor(pack.amount / 5)} spins)`,
          },
          unit_amount: pack.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'http://localhost:5173'}/fly-wheel/?success=true&credits=${pack.amount + pack.bonus}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/fly-wheel/?canceled=true`,
      metadata: {
        type: 'credits',
        packType,
        amount: pack.amount,
        bonus: pack.bonus,
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session details + generated content
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const content = contentStore.get(session.id);
    
    res.json({
      id: session.id,
      status: session.payment_status,
      metadata: session.metadata,
      customer_email: session.customer_details?.email,
      content: content || null,
    });
  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/content/:sessionId', (req, res) => {
  const content = contentStore.get(req.params.sessionId);
  if (!content) {
    return res.status(404).json({ error: 'Content not found or not yet generated' });
  }
  res.json(content);
});

// Manual content generation (for testing)
app.post('/api/generate', async (req, res) => {
  try {
    const { productType, productData } = req.body;
    
    if (!PRODUCTS[productType]) {
      return res.status(400).json({ error: 'Invalid product type' });
    }

    console.log(`🎨 Generating ${productType} content...`);
    const result = await generateContent(productType, productData);
    console.log(`✅ Content generated (mock: ${result.mock})`);
    
    res.json(result);
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Stripe Webhook
// ============================================

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
      console.warn('⚠️  Webhook signature not verified (no STRIPE_WEBHOOK_SECRET)');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('✅ Payment successful:', session.id);
      
      if (session.metadata.type === 'spin') {
        const productType = session.metadata.productType;
        const productData = session.metadata.productData;
        const userId = session.metadata.userId ? parseInt(session.metadata.userId) : null;
        
        console.log(`   🎰 Spin: ${productType}`);
        console.log(`   🎨 Generating content...`);
        
        try {
          const result = await generateContent(productType, productData);
          
          // Store in memory for frontend polling
          contentStore.set(session.id, {
            sessionId: session.id,
            productType,
            content: result.content,
            mock: result.mock,
            generatedAt: new Date().toISOString(),
          });
          
          // If user is logged in, save to database
          if (userId) {
            const post = createPost(userId, session.id, productType, JSON.parse(productData || '{}'), result.content);
            console.log(`   💾 Saved to database: post #${post.id}`);
          }
          
          console.log(`   ✅ Content generated!`);
        } catch (error) {
          console.error(`   ❌ Generation failed:`, error.message);
        }
      } else if (session.metadata.type === 'credits') {
        console.log(`   💳 Credits: $${session.metadata.amount} + $${session.metadata.bonus} bonus`);
      }
      break;
      
    case 'payment_intent.payment_failed':
      console.log('❌ Payment failed:', event.data.object.id);
      break;
  }

  res.json({ received: true });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 FlyWheel API running on http://localhost:${PORT}`);
  console.log(`   Stripe: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'TEST' : 'LIVE'}`);
  console.log(`   Claude: ${process.env.ANTHROPIC_API_KEY ? 'configured ✓' : 'not configured'}`);
  console.log(`   Twitter: ${isTwitterConfigured() ? 'configured ✓' : 'not configured'}`);
});
