// Posts/Spins service
import db from './db.js';
import { createTrackedLink } from './links.js';
import { postTweet, getTweetMetrics, getConnection } from './twitter.js';

export function createPost(userId, sessionId, productType, productData, content) {
  const stmt = db.prepare(`
    INSERT INTO posts (user_id, session_id, product_type, product_data, content)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    userId,
    sessionId,
    productType,
    JSON.stringify(productData),
    content
  );
  
  return {
    id: result.lastInsertRowid,
    userId,
    sessionId,
    productType,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function getPost(postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (post && post.product_data) {
    post.product_data = JSON.parse(post.product_data);
  }
  return post;
}

export function getPostBySession(sessionId) {
  const post = db.prepare('SELECT * FROM posts WHERE session_id = ?').get(sessionId);
  if (post && post.product_data) {
    post.product_data = JSON.parse(post.product_data);
  }
  return post;
}

export function getUserPosts(userId, limit = 50) {
  const posts = db.prepare(`
    SELECT p.*, l.code as link_code, l.clicks as link_clicks
    FROM posts p
    LEFT JOIN links l ON l.post_id = p.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ?
  `).all(userId, limit);
  
  return posts.map(post => {
    if (post.product_data) {
      post.product_data = JSON.parse(post.product_data);
    }
    return post;
  });
}

export async function publishToTwitter(postId, productUrl = null, blogUrl = null) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  // Create tracked link if URL provided
  let trackedLink = null;
  let tweetContent = post.content;
  
  // Handle boost posts with both blog and product URLs
  if (post.product_type === 'boost' && blogUrl && productUrl) {
    trackedLink = createTrackedLink(productUrl, post.user_id, postId);
    // Replace placeholders
    tweetContent = tweetContent
      .replace('[BLOG_LINK]', blogUrl)
      .replace('[PRODUCT_LINK]', trackedLink.shortUrl);
  } else if (productUrl) {
    trackedLink = createTrackedLink(productUrl, post.user_id, postId);
    // Append link to content if not already there
    if (!tweetContent.includes('http')) {
      tweetContent = `${tweetContent}\n\n🔗 ${trackedLink.shortUrl}`;
    }
  }
  
  // Post to Twitter
  const tweet = await postTweet(post.user_id, tweetContent);
  
  // Update post with Twitter info
  db.prepare(`
    UPDATE posts 
    SET posted_to = 'twitter', twitter_post_id = ?, link_code = ?
    WHERE id = ?
  `).run(tweet.id, trackedLink?.code || null, postId);
  
  return {
    postId,
    tweetId: tweet.id,
    tweetUrl: tweet.url,
    trackedLink: trackedLink?.shortUrl || null,
    blogUrl: blogUrl || null,
  };
}

export async function getPostAnalytics(postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  const analytics = {
    post: {
      id: post.id,
      productType: post.product_type,
      content: post.content,
      createdAt: post.created_at,
      postedTo: post.posted_to,
    },
    link: null,
    twitter: null,
  };
  
  // Get link stats
  if (post.link_code) {
    const link = db.prepare('SELECT * FROM links WHERE code = ?').get(post.link_code);
    if (link) {
      analytics.link = {
        shortUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/l/${link.code}`,
        clicks: link.clicks,
        createdAt: link.created_at,
      };
    }
  }
  
  // Get Twitter stats if posted
  if (post.twitter_post_id) {
    try {
      const metrics = await getTweetMetrics(post.user_id, post.twitter_post_id);
      analytics.twitter = {
        tweetId: post.twitter_post_id,
        tweetUrl: `https://twitter.com/i/status/${post.twitter_post_id}`,
        impressions: metrics.metrics?.impression_count || 0,
        likes: metrics.metrics?.like_count || 0,
        retweets: metrics.metrics?.retweet_count || 0,
        replies: metrics.metrics?.reply_count || 0,
      };
    } catch (error) {
      console.error('Error fetching Twitter metrics:', error.message);
    }
  }
  
  return analytics;
}

export function getDashboardStats(userId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_posts,
      SUM(CASE WHEN posted_to = 'twitter' THEN 1 ELSE 0 END) as posted_count
    FROM posts
    WHERE user_id = ?
  `).get(userId);
  
  const linkStats = db.prepare(`
    SELECT COALESCE(SUM(clicks), 0) as total_clicks
    FROM links
    WHERE user_id = ?
  `).get(userId);
  
  const recentPosts = db.prepare(`
    SELECT p.*, l.clicks as link_clicks
    FROM posts p
    LEFT JOIN links l ON l.post_id = p.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 5
  `).all(userId);
  
  // Check Twitter connection
  const twitterConnection = getConnection(userId);
  
  return {
    totalPosts: stats.total_posts || 0,
    postedCount: stats.posted_count || 0,
    totalClicks: linkStats.total_clicks || 0,
    twitterConnected: !!twitterConnection,
    twitterUsername: twitterConnection?.twitter_username || null,
    recentPosts: recentPosts.map(p => ({
      id: p.id,
      productType: p.product_type,
      postedTo: p.posted_to,
      clicks: p.link_clicks || 0,
      createdAt: p.created_at,
    })),
  };
}
