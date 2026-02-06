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
import { connectStore, getStoreConnection, disconnectStore, verifyConnection, fetchProducts, fetchProduct, getCachedProducts, refreshToken } from './server/shopify.js';
import { fetchProductFromUrl } from './server/product-scraper.js';
import { createBlogPost, getBlogPostBySlug, getBlogPostById, incrementViews, getRecentPosts, getBlogUrl } from './server/blog.js';
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
// Demo Routes (Public, Rate Limited)
// ============================================

// Simple in-memory rate limiter for demo endpoints
const demoRateLimits = new Map();
const DEMO_RATE_LIMIT = 10; // requests per hour
const DEMO_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkDemoRateLimit(ip) {
  const now = Date.now();
  const record = demoRateLimits.get(ip);
  
  if (!record || now - record.windowStart > DEMO_RATE_WINDOW) {
    demoRateLimits.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  
  if (record.count >= DEMO_RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// Demo blog search (no auth required)
app.get('/api/demo/blogs/search', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    
    if (!checkDemoRateLimit(ip)) {
      return res.status(429).json({ error: 'Demo rate limit exceeded. Sign up for unlimited access!' });
    }
    
    const { keywords, count } = req.query;
    
    if (!keywords) {
      return res.status(400).json({ error: 'Keywords required' });
    }
    
    const results = await searchBlogs(keywords, parseInt(count) || 5);
    res.json({ results, demo: true });
  } catch (error) {
    console.error('Demo blog search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Demo content generation (no auth required)
app.post('/api/demo/generate', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    
    if (!checkDemoRateLimit(ip)) {
      return res.status(429).json({ error: 'Demo rate limit exceeded. Sign up for unlimited access!' });
    }
    
    const { productType, productData } = req.body;
    
    if (!productType || !productData) {
      return res.status(400).json({ error: 'productType and productData required' });
    }
    
    // Only allow boost type in demo
    if (productType !== 'boost') {
      return res.status(400).json({ error: 'Demo only supports Blog Boost. Sign up to access all content types!' });
    }
    
    const content = await generateContent(productType, productData);
    res.json({ content, demo: true });
  } catch (error) {
    console.error('Demo generate error:', error);
    res.status(500).json({ error: 'Generation failed: ' + error.message });
  }
});

// ============================================
// Blog Post Routes (Public)
// ============================================

// Create a blog post + promo tweet (demo - no auth, rate limited)
app.post('/api/demo/blog/create', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    
    if (!checkDemoRateLimit(ip)) {
      return res.status(429).json({ error: 'Demo rate limit exceeded. Sign up for unlimited access!' });
    }
    
    const { productData } = req.body;
    
    if (!productData?.name || !productData?.description) {
      return res.status(400).json({ error: 'Product name and description required' });
    }
    
    // Generate full blog post
    const blogContent = await generateContent('blog-full', {
      ...productData,
      format: 'full-blog'
    });
    
    const blogText = typeof blogContent === 'string' ? blogContent : blogContent?.content || '';
    
    // Extract title from first line or generate one
    const lines = blogText.split('\n').filter(l => l.trim());
    let title = lines[0]?.replace(/^#\s*/, '').trim() || `Why ${productData.name} Changes Everything`;
    let content = lines.slice(1).join('\n').trim() || blogText;
    
    // Create the blog post
    const blogPost = createBlogPost({
      title,
      content,
      excerpt: productData.description,
      productName: productData.name,
      productUrl: productData.productUrl,
      authorName: productData.authorName || 'FlyWheel',
      userId: null
    });
    
    const blogUrl = getBlogUrl(blogPost.slug);
    
    // Generate promo tweet for the blog
    const promoContent = await generateContent('boost', {
      ...productData,
      blogTitle: title,
      blogUrl: blogUrl,
      blogSnippet: blogPost.excerpt
    });
    
    const promoText = typeof promoContent === 'string' ? promoContent : promoContent?.content || '';
    
    res.json({
      blog: {
        id: blogPost.id,
        slug: blogPost.slug,
        title: blogPost.title,
        url: blogUrl,
        excerpt: blogPost.excerpt
      },
      promo: promoText.replace('[BLOG_LINK]', blogUrl).replace('[PRODUCT_LINK]', productData.productUrl || ''),
      demo: true
    });
  } catch (error) {
    console.error('Demo blog create error:', error);
    res.status(500).json({ error: 'Blog creation failed: ' + error.message });
  }
});

// Create a blog post (authenticated)
app.post('/api/blog/create', authMiddleware, async (req, res) => {
  try {
    const { productData } = req.body;
    
    if (!productData?.name || !productData?.description) {
      return res.status(400).json({ error: 'Product name and description required' });
    }
    
    // Generate full blog post
    const blogContent = await generateContent('blog-full', {
      ...productData,
      format: 'full-blog'
    });
    
    const blogText = typeof blogContent === 'string' ? blogContent : blogContent?.content || '';
    
    // Extract title from first line or generate one
    const lines = blogText.split('\n').filter(l => l.trim());
    let title = lines[0]?.replace(/^#\s*/, '').trim() || `Why ${productData.name} Changes Everything`;
    let content = lines.slice(1).join('\n').trim() || blogText;
    
    // Create the blog post
    const blogPost = createBlogPost({
      title,
      content,
      excerpt: productData.description,
      productName: productData.name,
      productUrl: productData.productUrl,
      authorName: 'FlyWheel',
      userId: req.user.id
    });
    
    const blogUrl = getBlogUrl(blogPost.slug);
    
    // Generate promo tweet for the blog
    const promoContent = await generateContent('boost', {
      ...productData,
      blogTitle: title,
      blogUrl: blogUrl,
      blogSnippet: blogPost.excerpt
    });
    
    const promoText = typeof promoContent === 'string' ? promoContent : promoContent?.content || '';
    
    // Create a post record for the promo
    const post = createPost(
      req.user.id,
      null,
      'boost',
      { ...productData, blogId: blogPost.id, blogUrl },
      promoText.replace('[BLOG_LINK]', blogUrl).replace('[PRODUCT_LINK]', productData.productUrl || '')
    );
    
    res.json({
      blog: {
        id: blogPost.id,
        slug: blogPost.slug,
        title: blogPost.title,
        url: blogUrl,
        excerpt: blogPost.excerpt
      },
      promo: promoText.replace('[BLOG_LINK]', blogUrl).replace('[PRODUCT_LINK]', productData.productUrl || ''),
      postId: post.id
    });
  } catch (error) {
    console.error('Blog create error:', error);
    res.status(500).json({ error: 'Blog creation failed: ' + error.message });
  }
});

// Get a blog post by slug (public)
app.get('/api/blog/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const post = getBlogPostBySlug(slug);
    
    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    
    // Increment views
    incrementViews(slug);
    
    res.json(post);
  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// Get recent blog posts (public)
app.get('/api/blog', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const posts = getRecentPosts(limit);
    res.json({ posts });
  } catch (error) {
    console.error('Get recent blogs error:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Serve blog post HTML page (for social sharing / SEO)
app.get('/blog/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const post = getBlogPostBySlug(slug);
    
    if (!post) {
      return res.status(404).send('Blog post not found');
    }
    
    // Increment views
    incrementViews(slug);
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://lastreetchef.github.io/fly-wheel';
    const apiUrl = process.env.API_URL || process.env.VITE_API_URL || 'https://blearier-ashlee-unextravasated.ngrok-free.dev';
    const blogUrl = `${apiUrl}/blog/${slug}`;
    
    // Generate HTML page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} | FlyWheel</title>
  <meta name="description" content="${post.excerpt?.replace(/"/g, '&quot;')}">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.excerpt?.replace(/"/g, '&quot;')}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${blogUrl}">
  <meta property="og:image" content="${post.cover_image || frontendUrl + '/og-image.png'}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${post.title}">
  <meta name="twitter:description" content="${post.excerpt?.replace(/"/g, '&quot;')}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Inter', sans-serif; 
      background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
      color: #e5e7eb;
      min-height: 100vh;
      line-height: 1.7;
    }
    .container { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 40px;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      background: linear-gradient(135deg, #06b6d4, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-decoration: none;
    }
    .cta-btn {
      background: linear-gradient(135deg, #06b6d4, #a855f7);
      color: #fff;
      padding: 10px 20px;
      border-radius: 20px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
    }
    h1 {
      font-size: clamp(28px, 5vw, 42px);
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.2;
    }
    .meta {
      color: #9ca3af;
      font-size: 14px;
      margin-bottom: 32px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .content {
      font-size: 17px;
      color: #d1d5db;
    }
    .content p { margin-bottom: 20px; }
    .content h2 { font-size: 24px; color: #fff; margin: 32px 0 16px; }
    .content h3 { font-size: 20px; color: #fff; margin: 24px 0 12px; }
    .content ul, .content ol { margin: 16px 0 16px 24px; }
    .content li { margin-bottom: 8px; }
    .content a { color: #06b6d4; }
    .content blockquote {
      border-left: 3px solid #a855f7;
      padding-left: 20px;
      margin: 24px 0;
      font-style: italic;
      color: #9ca3af;
    }
    .product-cta {
      background: rgba(6,182,212,0.1);
      border: 1px solid rgba(6,182,212,0.3);
      border-radius: 16px;
      padding: 24px;
      margin: 40px 0;
      text-align: center;
    }
    .product-cta h3 { color: #fff; margin-bottom: 12px; }
    .product-cta p { color: #9ca3af; margin-bottom: 16px; }
    .product-cta a {
      display: inline-block;
      background: linear-gradient(135deg, #06b6d4, #a855f7);
      color: #fff;
      padding: 12px 28px;
      border-radius: 25px;
      text-decoration: none;
      font-weight: 600;
    }
    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.1);
      text-align: center;
      color: #6b7280;
      font-size: 13px;
    }
    footer a { color: #06b6d4; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="${frontendUrl}" class="logo">🎰 FlyWheel</a>
      <a href="${frontendUrl}" class="cta-btn">Create Your Content →</a>
    </header>
    
    <article>
      <h1>${post.title}</h1>
      <div class="meta">
        <span>By ${post.author_name || 'FlyWheel'}</span>
        <span>•</span>
        <span>${new Date(post.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        <span>•</span>
        <span>${post.views || 0} views</span>
      </div>
      
      <div class="content">
        ${post.content.split('\n').map(p => p.trim() ? (p.startsWith('#') ? `<h2>${p.replace(/^#+\s*/, '')}</h2>` : `<p>${p}</p>`) : '').join('\n')}
      </div>
      
      ${post.product_name && post.product_url ? `
      <div class="product-cta">
        <h3>Check out ${post.product_name}</h3>
        <p>${post.excerpt}</p>
        <a href="${post.product_url}" target="_blank" rel="noopener">Learn More →</a>
      </div>
      ` : ''}
    </article>
    
    <footer>
      <p>Published with <a href="${frontendUrl}">FlyWheel</a> — AI-powered product promotion</p>
    </footer>
  </div>
  
  <!-- ElevenLabs Conversational AI Widget -->
  <script src="https://elevenlabs.io/convai-widget/index.js" async></script>
  <elevenlabs-convai agent-id="agent_0501kgsz28fveqbvb5td8k3zpeqb"></elevenlabs-convai>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Serve blog error:', error);
    res.status(500).send('Error loading blog post');
  }
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
// Product URL Import (No API key needed!)
// ============================================

// Fetch product data from any supported URL
app.post('/api/product/import', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Product URL required' });
    }
    
    const result = await fetchProductFromUrl(url);
    res.json(result);
  } catch (error) {
    console.error('Product import error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Shopify Integration Routes (Advanced/Optional)
// ============================================

// Connect Shopify store
app.post('/api/shopify/connect', authMiddleware, async (req, res) => {
  try {
    const { storeDomain, accessToken, clientId, clientSecret } = req.body;
    
    if (!storeDomain || !accessToken) {
      return res.status(400).json({ error: 'Store domain and access token required' });
    }
    
    const result = connectStore(req.user.id, storeDomain, accessToken, clientId, clientSecret);
    
    // Verify connection works
    const verification = await verifyConnection(req.user.id);
    if (!verification.connected) {
      // Rollback connection if verification fails
      disconnectStore(req.user.id);
      return res.status(400).json({ error: `Connection failed: ${verification.error}` });
    }
    
    res.json({ 
      success: true, 
      storeDomain: result.storeDomain,
      shop: verification.shop,
    });
  } catch (error) {
    console.error('Shopify connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Shopify connection status
app.get('/api/shopify/status', authMiddleware, async (req, res) => {
  try {
    const connection = getStoreConnection(req.user.id);
    
    if (!connection) {
      return res.json({ connected: false });
    }
    
    // Optionally verify the connection is still valid
    const verification = await verifyConnection(req.user.id);
    
    res.json({
      connected: verification.connected,
      storeDomain: connection.store_domain,
      shop: verification.shop || null,
      connectedAt: connection.connected_at,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch products from connected store
app.get('/api/shopify/products', authMiddleware, async (req, res) => {
  try {
    const { refresh } = req.query;
    
    // If not forcing refresh, try cached products first
    if (!refresh) {
      const cached = getCachedProducts(req.user.id);
      if (cached.length > 0) {
        return res.json({ products: cached, cached: true });
      }
    }
    
    // Fetch fresh from Shopify
    const products = await fetchProducts(req.user.id);
    res.json({ products, cached: false });
  } catch (error) {
    console.error('Shopify products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single product details
app.get('/api/shopify/products/:productId', authMiddleware, async (req, res) => {
  try {
    const product = await fetchProduct(req.user.id, req.params.productId);
    res.json({ product });
  } catch (error) {
    console.error('Shopify product error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Shopify store
app.post('/api/shopify/disconnect', authMiddleware, (req, res) => {
  const result = disconnectStore(req.user.id);
  res.json({ success: result });
});

// Refresh Shopify token (for client credentials flow)
app.post('/api/shopify/refresh-token', authMiddleware, async (req, res) => {
  try {
    const result = await refreshToken(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Quick publish: create post and immediately publish to Twitter
app.post('/api/posts/quick-publish', authMiddleware, async (req, res) => {
  try {
    const { content, productType, productData, blogUrl, productUrl } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    // Check Twitter connection
    const twitterConnection = getConnection(req.user.id);
    if (!twitterConnection) {
      return res.status(400).json({ error: 'Twitter not connected. Please connect your X account first.' });
    }
    
    // Create the post record
    const post = createPost(
      req.user.id, 
      null, 
      productType || 'boost', 
      productData || {}, 
      content
    );
    
    // Publish to Twitter
    const result = await publishToTwitter(post.id, productUrl, blogUrl);
    
    res.json({
      postId: post.id,
      tweetId: result.tweetId,
      tweetUrl: result.tweetUrl,
      trackedLink: result.trackedLink
    });
  } catch (error) {
    console.error('Quick publish error:', error);
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
