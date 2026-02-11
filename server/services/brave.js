// server/services/brave.js
// Brave Search API with caching — 24hr cache on blog searches

import { blogCache } from '../lib/cache.js';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

function makeCacheKey(keywords, count) {
  // Normalize: lowercase, trim, sort words for consistent keys
  const normalized = keywords.toLowerCase().trim().split(/\s+/).sort().join('_');
  return `blog:${normalized}:${count}`;
}

export async function searchBlogs(keywords, count = 6) {
  if (!BRAVE_API_KEY) {
    console.warn('⚠️  BRAVE_API_KEY not set, using mock');
    return [{
      title: 'Sample Blog About ' + keywords,
      url: 'https://example.com/blog/sample',
      snippet: 'This is a sample blog post matching your keywords...',
      source: 'example.com',
    }];
  }

  // Check cache first
  const cacheKey = makeCacheKey(keywords, count);
  const cached = blogCache.get(cacheKey);
  if (cached) {
    console.log(`📦 Blog cache HIT: "${keywords}"`);
    return cached;
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keywords + ' blog')}&count=10`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
  });
  
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  
  // Filter for blog-like content
  const results = (data.web?.results || [])
    .filter(r => /blog|post|article|\/20/.test(r.url.toLowerCase()))
    .slice(0, count)
    .map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      source: new URL(r.url).hostname.replace('www.', ''),
    }));

  // Fallback if no blog-specific results
  const finalResults = results.length ? results : (data.web?.results || []).slice(0, count).map(r => ({
    title: r.title, 
    url: r.url, 
    snippet: r.description,
    source: new URL(r.url).hostname.replace('www.', ''),
  }));

  // Cache for 24 hours
  blogCache.set(cacheKey, finalResults, 86400);
  console.log(`📦 Blog cache MISS, stored: "${keywords}" (${finalResults.length} results)`);
  
  return finalResults;
}

export { blogCache };
