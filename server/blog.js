// Blog post management
import db from './db.js';
import { nanoid } from 'nanoid';

// Generate a URL-friendly slug
function generateSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  const id = nanoid(8);
  return `${base}-${id}`;
}

// Create a new blog post
export function createBlogPost({ title, content, excerpt, productName, productUrl, authorName, coverImage, userId }) {
  const slug = generateSlug(title);
  
  const stmt = db.prepare(`
    INSERT INTO blog_posts (slug, title, content, excerpt, product_name, product_url, author_name, cover_image, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    slug,
    title,
    content,
    excerpt || content.substring(0, 200) + '...',
    productName || null,
    productUrl || null,
    authorName || 'FlyWheel',
    coverImage || null,
    userId || null
  );
  
  return {
    id: result.lastInsertRowid,
    slug,
    title,
    excerpt: excerpt || content.substring(0, 200) + '...'
  };
}

// Get blog post by slug
export function getBlogPostBySlug(slug) {
  const stmt = db.prepare(`
    SELECT * FROM blog_posts WHERE slug = ? AND published = 1
  `);
  return stmt.get(slug);
}

// Get blog post by ID
export function getBlogPostById(id) {
  const stmt = db.prepare(`
    SELECT * FROM blog_posts WHERE id = ?
  `);
  return stmt.get(id);
}

// Increment view count
export function incrementViews(slug) {
  const stmt = db.prepare(`
    UPDATE blog_posts SET views = views + 1 WHERE slug = ?
  `);
  return stmt.run(slug);
}

// Get recent blog posts
export function getRecentPosts(limit = 10) {
  const stmt = db.prepare(`
    SELECT slug, title, excerpt, product_name, author_name, views, created_at
    FROM blog_posts
    WHERE published = 1
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

// Get posts by user
export function getUserPosts(userId, limit = 20) {
  const stmt = db.prepare(`
    SELECT slug, title, excerpt, views, created_at, published
    FROM blog_posts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

// Generate the public URL for a blog post
export function getBlogUrl(slug) {
  // Blog posts are served from the API server, not the frontend
  const apiUrl = process.env.VITE_API_URL || process.env.API_URL || 'https://blearier-ashlee-unextravasated.ngrok-free.dev';
  return `${apiUrl}/blog/${slug}`;
}
