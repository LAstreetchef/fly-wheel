// server/jobs/processBoost.js
// Background job: search blogs → generate content → post tweet → update DB

import { searchBlogs } from '../services/brave.js';
import { generateBoostContent } from '../services/claude.js';
import { postTweet, crossEngage } from '../services/twitter.js';
import { JobQueue } from './queue.js';

// Create the boost queue
// concurrency: 2 (don't hammer Twitter API)
// retries: 3 with exponential backoff
const boostQueue = new JobQueue('boosts', {
  concurrency: 2,
  retries: 3,
  retryDelay: 5000,
});

// The order store will be injected after DB init
let orderStore = null;

export function setOrderStore(store) {
  orderStore = store;
}

// Register the handler
boostQueue.process('publish', async (data, job) => {
  const { sessionId, email, productData, blog, content: preGeneratedContent, source } = data;
  
  console.log(`[Boost ${sessionId}] Starting publish for "${productData?.name}"...`);

  try {
    let finalBlog = blog;
    let finalContent = preGeneratedContent;

    // Step 1: If no blog was pre-selected, search for one
    if (!finalBlog?.url && productData?.keywords) {
      console.log(`[Boost ${sessionId}] Searching blogs for: ${productData.keywords}`);
      const blogs = await searchBlogs(productData.keywords, 3);
      if (!blogs || blogs.length === 0) {
        throw new Error(`No blogs found for keywords: ${productData.keywords}`);
      }
      finalBlog = {
        title: blogs[0].title,
        url: blogs[0].url,
        snippet: blogs[0].snippet,
      };
    }

    // Step 2: If no content was pre-generated, generate it
    if (!finalContent && productData && finalBlog) {
      console.log(`[Boost ${sessionId}] Generating content...`);
      finalContent = await generateBoostContent(productData, finalBlog);
      
      // Replace placeholders
      finalContent = finalContent
        .replace('[BLOG_LINK]', finalBlog.url)
        .replace('[PRODUCT_LINK]', productData.productUrl || '');
    }

    // Step 3: Update order with content before posting (in case tweet fails)
    if (orderStore && sessionId) {
      const order = await orderStore.get(sessionId);
      if (order) {
        order.content = finalContent;
        order.blog = finalBlog;
        await orderStore.set(sessionId, order);
      }
    }

    // Step 4: Post the tweet (uses multi-account with fallback)
    console.log(`[Boost ${sessionId}] Posting tweet...`);
    const tweet = await postTweet(finalContent);

    // Step 5: Mark as published
    if (orderStore && sessionId) {
      const order = await orderStore.get(sessionId);
      if (order) {
        order.status = 'published';
        order.tweetUrl = tweet.tweetUrl;
        order.tweetId = tweet.tweetId;
        order.publishedAt = new Date().toISOString();
        await orderStore.set(sessionId, order);
      }
    }

    console.log(`[Boost ${sessionId}] ✅ Published: ${tweet.tweetUrl}`);

    // Step 6: Cross-engage from other accounts (fire-and-forget)
    crossEngage(tweet.tweetId, tweet.account)
      .then(eng => console.log(`[Boost ${sessionId}] 🔥 Cross-engagement:`, eng))
      .catch(err => console.error(`[Boost ${sessionId}] Cross-engage error:`, err.message));

    return tweet;

  } catch (err) {
    // Mark as failed in DB
    if (orderStore && sessionId) {
      const order = await orderStore.get(sessionId);
      if (order) {
        order.status = 'failed';
        order.error = err.message;
        await orderStore.set(sessionId, order);
      }
    }
    throw err;
  }
});

// Convenience function to queue a boost
export function queueBoost({ sessionId, email, productData, blog, content, source, priority }) {
  return boostQueue.add('publish', {
    sessionId,
    email,
    productData,
    blog,
    content,
    source: source || 'paid',
  }, {
    priority: priority || 0,
  });
}

export function getQueueStats() {
  return boostQueue.getStats();
}

export function getJobStatus(jobId) {
  return boostQueue.getJob(jobId);
}

export { boostQueue };
