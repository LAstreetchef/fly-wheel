import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import { Resend } from 'resend';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
  // Parse X handles - normalize to @handle format
  const xHandles = (productData.xHandles || '')
    .split(/[,\s]+/)
    .map(h => h.trim())
    .filter(h => h)
    .map(h => h.startsWith('@') ? h : `@${h}`)
    .slice(0, 3); // Max 3 tags
  
  const tagsSection = xHandles.length > 0 
    ? `\nACCOUNTS TO TAG: ${xHandles.join(', ')}` 
    : '';
  
  const tagsInstruction = xHandles.length > 0
    ? `7. Naturally incorporate these tags: ${xHandles.join(', ')}`
    : '';

  const prompt = `You are a social media expert creating a promotional X (Twitter) post.

PRODUCT:
- Name: ${productData.name}
- Description: ${productData.description || 'N/A'}
- URL: ${productData.productUrl || 'N/A'}${tagsSection}

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
${tagsInstruction}

Return ONLY the tweet text, nothing else.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    const tagsStr = xHandles.length > 0 ? `\n\n${xHandles.join(' ')}` : '';
    return `Great insights on ${blog.title.substring(0, 40)}...

Check out ${productData.name} if you're into this!

[BLOG_LINK]
[PRODUCT_LINK]${tagsStr}`;
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
        email: productData.email || '',
      },
    });
    
    orders.set(session.id, {
      status: 'pending',
      productData,
      blog,
      content,
      email: productData.email || '',
      createdAt: new Date().toISOString(),
      followUpSent: false,
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
// Tweet Metrics & Follow-up Emails
// ============================================

async function getTweetMetrics(tweetId) {
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  
  if (!accessToken || !accessSecret) {
    return { impressions: 2500, engagements: 150, clicks: 50 }; // Mock data
  }
  
  try {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken,
      accessSecret,
    });
    
    const tweet = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics'],
    });
    
    const metrics = tweet.data?.public_metrics || {};
    return {
      impressions: metrics.impression_count || 0,
      engagements: (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0),
      likes: metrics.like_count || 0,
      retweets: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
    };
  } catch (err) {
    console.error('Failed to get tweet metrics:', err.message);
    return null;
  }
}

async function sendFollowUpEmail(order, metrics) {
  if (!resend || !order.email) {
    console.warn('⚠️  Cannot send email: missing Resend API key or email');
    return false;
  }
  
  try {
    await resend.emails.send({
      from: 'BlogBoost <boost@secretmessage4u.com>',
      to: order.email,
      subject: `🚀 Your Boost Results: ${metrics.impressions.toLocaleString()} impressions!`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h1 style="color: #f97316;">Your Boost Performance</h1>
          <p>Hey! Here's how your boost for <strong>${order.productData?.name || 'your product'}</strong> performed:</p>
          
          <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-around; text-align: center;">
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.impressions.toLocaleString()}</div>
                <div style="color: #888; font-size: 12px;">Impressions</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.engagements}</div>
                <div style="color: #888; font-size: 12px;">Engagements</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: bold; color: #f97316;">${metrics.likes}</div>
                <div style="color: #888; font-size: 12px;">Likes</div>
              </div>
            </div>
          </div>
          
          <p><a href="${order.tweetUrl}" style="color: #f97316;">View your boost on X →</a></p>
          
          <p style="color: #888; margin-top: 30px;">Ready for another boost? <a href="https://lastreetchef.github.io/fly-wheel/" style="color: #f97316;">Create one now</a></p>
          
          <p style="color: #666; font-size: 12px; margin-top: 40px;">— BlogBoost by FlyWheel</p>
        </div>
      `,
    });
    console.log(`✅ Follow-up email sent to ${order.email}`);
    return true;
  } catch (err) {
    console.error('Failed to send follow-up email:', err.message);
    return false;
  }
}

// Endpoint to trigger follow-up emails (call via cron or manually)
app.post('/api/admin/send-followups', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const now = Date.now();
  const FOLLOWUP_DELAY = 24 * 60 * 60 * 1000; // 24 hours
  let sent = 0;
  
  for (const [sessionId, order] of orders) {
    if (order.status !== 'published' || order.followUpSent || !order.email || !order.tweetId) continue;
    
    const publishedAt = new Date(order.publishedAt).getTime();
    if (now - publishedAt < FOLLOWUP_DELAY) continue;
    
    const metrics = await getTweetMetrics(order.tweetId);
    if (metrics) {
      const emailSent = await sendFollowUpEmail(order, metrics);
      if (emailSent) {
        order.followUpSent = true;
        order.metrics = metrics;
        orders.set(sessionId, order);
        sent++;
      }
    }
  }
  
  res.json({ sent, checked: orders.size });
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
        order.email = session.metadata.email || order.email;
        orders.set(session.id, order);
        
        // Schedule follow-up email check (in production, use a proper job queue)
        if (order.email) {
          console.log(`📧 Follow-up email scheduled for ${order.email} (tweet: ${result.tweetId})`);
        }
        
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
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/webhook')) {
      res.sendFile('index.html', { root: 'dist' });
    } else {
      next();
    }
  });
}

// ============================================
// Start
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 BlogBoost running on http://localhost:${PORT}`);
});
