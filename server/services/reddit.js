// server/services/reddit.js
// Find Reddit threads where a product recommendation would be relevant
// Uses Brave Search to find Reddit posts (no Reddit API key needed)

import { blogCache } from '../lib/cache.js';
import Anthropic from '@anthropic-ai/sdk';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

function makeCacheKey(keywords) {
  const normalized = keywords.toLowerCase().trim().split(/\s+/).sort().join('_');
  return `reddit:${normalized}`;
}

function extractSubreddit(url) {
  const match = url.match(/reddit\.com\/r\/([^/]+)/);
  return match ? `r/${match[1]}` : null;
}

function scoreRedditThread(thread) {
  let score = 0;
  const title = (thread.title || '').toLowerCase();

  // High-intent signals
  if (title.includes('recommendation')) score += 3;
  if (title.includes('looking for')) score += 3;
  if (title.includes('best ')) score += 2;
  if (title.includes('suggest')) score += 2;
  if (title.includes('alternative')) score += 2;
  if (title.includes('?')) score += 1;
  if (title.includes('help')) score += 1;
  if (title.includes('what ')) score += 1;
  if (title.includes('which ')) score += 1;

  // High-value subreddits
  const sub = (thread.subreddit || '').toLowerCase();
  const valuableSubs = [
    'buyitforlife', 'shutupandtakemymoney', 'supplements', 'fitness',
    'cooking', 'skincare', 'entrepreneur', 'smallbusiness', 'ecommerce', 'health',
  ];
  if (valuableSubs.some(s => sub.includes(s))) score += 2;

  return score;
}

export async function searchRedditThreads(keywords, count = 5) {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');

  // Check cache
  const cacheKey = makeCacheKey(keywords);
  const cached = blogCache.get(cacheKey);
  if (cached) {
    console.log(`📦 Reddit cache HIT: "${keywords}"`);
    return cached;
  }

  // Search Reddit via Brave
  const queries = [
    `site:reddit.com "${keywords}" recommendation`,
    `site:reddit.com "best ${keywords}" OR "looking for ${keywords}"`,
  ];

  const allResults = [];
  for (const query of queries) {
    const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=${count}&search_lang=en`;
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const results = (data.web?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          description: r.description,
          subreddit: extractSubreddit(r.url),
          age: r.age,
          platform: 'reddit',
        }));
        allResults.push(...results);
      }
    } catch (err) {
      console.error(`Reddit search failed for query: ${query}`, err.message);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Sort by purchase intent score
  const sorted = unique.sort((a, b) => scoreRedditThread(b) - scoreRedditThread(a));
  const results = sorted.slice(0, count);

  // Cache for 24 hours
  blogCache.set(cacheKey, results, 86400);
  console.log(`📦 Reddit cache MISS, stored: "${keywords}" (${results.length} results)`);

  return results;
}

export async function generateRedditComment({ product, keywords, threadTitle, threadUrl }) {
  const client = new Anthropic();

  const prompt = `You are writing a helpful Reddit comment in response to a thread.

Thread title: "${threadTitle}"
Thread URL: ${threadUrl}

Product to mention: ${product}
Keywords: ${keywords}

Rules:
- Be genuinely helpful FIRST — answer the person's question
- Mention the product naturally as ONE of several options/suggestions
- Don't be salesy or promotional — Reddit users hate that
- Use casual Reddit tone (lowercase ok, no corporate speak)
- Include a brief personal anecdote or detail for authenticity
- Max 150 words
- Do NOT include links (Reddit flags new accounts with links)
- Do NOT use hashtags

Return ONLY the comment text.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}
