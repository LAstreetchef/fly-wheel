// server/services/claude.js
// AI content generation with caching — 7 day cache on generated content

import Anthropic from '@anthropic-ai/sdk';
import { contentCache } from '../lib/cache.js';

const anthropic = new Anthropic();

function makeCacheKey(product, keywords, blogUrl) {
  // Same product + keywords + blog = same tweet
  const normalized = `${product}::${keywords}::${blogUrl}`.toLowerCase().trim();
  // Simple hash to keep key short
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `content:${Math.abs(hash)}`;
}

export async function generateBoostContent(productData, blog) {
  // Parse X handles - normalize to @handle format
  const rawTags = productData.tags || productData.xHandles || '';
  const xHandles = rawTags
    .split(/[,\s]+/)
    .map(h => h.trim())
    .filter(h => h)
    .map(h => h.startsWith('@') ? h : `@${h}`)
    .slice(0, 5);
  
  const tagsSection = xHandles.length > 0 
    ? `\nACCOUNTS TO TAG: ${xHandles.join(', ')}` 
    : '';
  
  const tagsInstruction = xHandles.length > 0
    ? `7. Naturally incorporate these tags: ${xHandles.join(', ')}`
    : '';

  // Check cache first — same inputs = same output
  const cacheKey = makeCacheKey(productData.name, productData.keywords || '', blog.url);
  const cached = contentCache.get(cacheKey);
  if (cached) {
    console.log(`📦 Content cache HIT: "${productData.name}"`);
    return cached;
  }

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
    const fallback = `Great insights on ${blog.title.substring(0, 40)}...

Check out ${productData.name} if you're into this!

[BLOG_LINK]
[PRODUCT_LINK]${tagsStr}`;
    contentCache.set(cacheKey, fallback, 604800);
    return fallback;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  let tweetText = message.content[0].text.trim();
  
  // Safety: enforce 280 char limit
  if (tweetText.length > 280) {
    tweetText = tweetText.slice(0, 277) + '...';
  }

  // Cache for 7 days
  contentCache.set(cacheKey, tweetText, 604800);
  console.log(`📦 Content cache MISS, stored: "${productData.name}"`);

  return tweetText;
}

export { anthropic, contentCache };
