import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic();

// In-memory order store
const orders = new Map();

// Config
const BOOST_PRICE = 175; // $1.75 in cents
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// Middleware
app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
}

// ============================================
// Blog Search
// ============================================

async function searchBlogs(keywords) {
  if (!BRAVE_API_KEY) {
    console.warn('⚠️  BRAVE_API_KEY not set, using mock');
    return [{
      title: 'Sample Blog About ' + keywords,
      url: 'https://example.com/blog/sample',
      snippet: 'This is a sample blog post matching your keywords...',
      source: 'example.com',
    }];
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keywords + ' blog')}&count=10`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
  });
  
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  
  const results = (data.web?.results || [])
    .filter(r => /blog|post|article|\/20/.test(r.url.toLowerCase()))
    .slice(0, 6)
    .map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      source: new URL(r.url).hostname.replace('www.', ''),
    }));

  return results.length ? results : (data.web?.results || []).slice(0, 6).map(r => ({
    title: r.title, url: r.url, snippet: r.description,
    source: new URL(r.url).hostname.replace('www.', ''),
  }));
}

// ============================================
// Content Generation
// ============================================

async function generateBoostContent(productData, blog) {
  const prompt = `You are a social media expert creating a promotional X (Twitter) post.

PRODUCT:
- Name: ${productData.name}
- Description: ${productData.description || 'N/A'}
- URL: ${productData.productUrl || 'N/A'}

BLOG TO PROMOTE ALONGSIDE:
- Title: ${blog.title}
- URL: ${blog.url}
- Snippet: ${blog.snippet || 'N/A'}

Create a natural, engaging X post (max 280 chars) that:
1. References the blog content as valuable/interesting
2. Naturally mentions the product as relevant/useful
3. Includes [BLOG_LINK] placeholder for the blog URL
4. Includes [PRODUCT_LINK] placeholder for the product URL (if provided)
5. Uses 1-2 relevant hashtags
6. Feels authentic, not spammy

Return ONLY the tweet text, nothing else.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return `Great insights on ${blog.title.substring(0, 40)}...

Check out ${productData.name} if you're into this!

[BLOG_LINK]
[PRODUCT_LINK]`;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

// ============================================
// Twitter Posting (@flywheelsquad account)
// ============================================

async function postTweet(text) {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  
  if (!accessToken || !accessSecret) {
    console.warn('⚠️  Twitter tokens not set, mock posting');
    return {
      tweetId: 'mock_' + Date.now(),
      tweetUrl: 'https://x.com/flywheelsquad/status/mock_' + Date.now(),
    };
  }

  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
  
  const { data } = await client.v2.tweet(text);
  
  return {
    tweetId: data.id,
    tweetUrl: `https://x.com/flywheelsquad/status/${data.id}`,
  };
}

// ============================================
// API Routes
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'blogboost' });
});

app.get('/api/blogs/search', async (req, res) => {
  try {
    const { keywords } = req.query;
    if (!keywords) return res.status(400).json({ error: 'Keywords required' });
    const results = await searchBlogs(keywords);
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { productData, blog } = req.body;
    if (!productData?.name || !blog?.url) {
      return res.status(400).json({ error: 'Product data and blog required' });
    }
    const content = await generateBoostContent(productData, blog);
    res.json({ content });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/checkout', async (req, res) => {
  try {
    const { productData, blog, content } = req.body;
    
    if (!productData?.name || !blog?.url || !content) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Blog Boost',
            description: `Promote "${productData.name}" on X`,
          },
          unit_amount: BOOST_PRICE,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: FRONTEND_URL,
      metadata: {
        productData: JSON.stringify(productData),
        blog: JSON.stringify(blog),
        content,
      },
    });
    
    orders.set(session.id, {
      status: 'pending',
      productData,
      blog,
      content,
      createdAt: new Date().toISOString(),
    });
    
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:sessionId', (req, res) => {
  const order = orders.get(req.params.sessionId);
  if (!order) return res.status(404).json({ status: 'not_found' });
  res.json(order);
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
      console.warn('⚠️  Webhook signature not verified');
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment received:', session.id);
    
    const order = orders.get(session.id);
    if (order) {
      try {
        const blog = JSON.parse(session.metadata.blog);
        const productData = JSON.parse(session.metadata.productData);
        let content = session.metadata.content;
        
        content = content
          .replace('[BLOG_LINK]', blog.url)
          .replace('[PRODUCT_LINK]', productData.productUrl || '');
        
        const result = await postTweet(content);
        
        order.status = 'published';
        order.tweetUrl = result.tweetUrl;
        order.tweetId = result.tweetId;
        order.publishedAt = new Date().toISOString();
        orders.set(session.id, order);
        
        console.log('🚀 Posted:', result.tweetUrl);
      } catch (error) {
        console.error('❌ Post failed:', error.message);
        order.status = 'failed';
        order.error = error.message;
        orders.set(session.id, order);
      }
    }
  }

  res.json({ received: true });
});

// SPA fallback
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile('index.html', { root: 'dist' });
  });
}

// ============================================
// Start
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 BlogBoost running on http://localhost:${PORT}`);
});
