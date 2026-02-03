// Blog search service using Brave Search API
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

export async function searchBlogs(keywords, count = 5) {
  if (!BRAVE_API_KEY) {
    console.log('⚠️  No BRAVE_API_KEY - using mock results');
    return getMockResults(keywords);
  }

  try {
    // Search for blog posts related to keywords
    const query = `${keywords} blog`;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&freshness=pm`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter and format results - prefer actual blog posts
    const results = (data.web?.results || [])
      .filter(r => {
        const url = r.url.toLowerCase();
        const title = r.title.toLowerCase();
        // Prefer blog-like URLs and avoid product/shop pages
        return !url.includes('/product') && 
               !url.includes('/shop') && 
               !url.includes('/cart') &&
               (url.includes('blog') || 
                url.includes('article') || 
                url.includes('post') ||
                title.includes('guide') ||
                title.includes('how to') ||
                title.includes('tips') ||
                title.includes('best') ||
                r.description?.length > 100);
      })
      .slice(0, count)
      .map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description || '',
        source: new URL(r.url).hostname.replace('www.', ''),
      }));

    return results;
  } catch (error) {
    console.error('Blog search error:', error);
    return getMockResults(keywords);
  }
}

function getMockResults(keywords) {
  return [
    {
      title: `The Ultimate Guide to ${keywords}`,
      url: `https://example-blog.com/guide-to-${keywords.replace(/\s+/g, '-')}`,
      snippet: `Everything you need to know about ${keywords}. We cover the basics, advanced tips, and expert recommendations...`,
      source: 'example-blog.com',
    },
    {
      title: `10 Things You Should Know About ${keywords}`,
      url: `https://wellness-daily.com/${keywords.replace(/\s+/g, '-')}-tips`,
      snippet: `Discover the top insights about ${keywords} that experts recommend. From beginners to pros...`,
      source: 'wellness-daily.com',
    },
    {
      title: `Why ${keywords} Is Trending in 2026`,
      url: `https://trend-watchers.com/${keywords.replace(/\s+/g, '-')}-trend`,
      snippet: `The rise of ${keywords} explained. What's driving the growth and why you should pay attention...`,
      source: 'trend-watchers.com',
    },
  ];
}

export function isSearchConfigured() {
  return !!BRAVE_API_KEY;
}
