// Link tracking service
import { nanoid } from 'nanoid';
import db from './db.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

export function createTrackedLink(destinationUrl, userId = null, postId = null) {
  const code = nanoid(8); // Short 8-char code
  
  const stmt = db.prepare(`
    INSERT INTO links (code, destination_url, user_id, post_id)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(code, destinationUrl, userId, postId);
  
  return {
    id: result.lastInsertRowid,
    code,
    shortUrl: `${BASE_URL}/l/${code}`,
    destinationUrl,
  };
}

export function getLink(code) {
  return db.prepare('SELECT * FROM links WHERE code = ?').get(code);
}

export function recordClick(linkId, ipAddress = null, userAgent = null, referer = null) {
  // Record detailed click
  db.prepare(`
    INSERT INTO link_clicks (link_id, ip_address, user_agent, referer)
    VALUES (?, ?, ?, ?)
  `).run(linkId, ipAddress, userAgent, referer);
  
  // Increment counter
  db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(linkId);
}

export function getLinkStats(code) {
  const link = db.prepare('SELECT * FROM links WHERE code = ?').get(code);
  if (!link) return null;
  
  const recentClicks = db.prepare(`
    SELECT clicked_at, referer 
    FROM link_clicks 
    WHERE link_id = ? 
    ORDER BY clicked_at DESC 
    LIMIT 100
  `).all(link.id);
  
  return {
    ...link,
    recentClicks,
  };
}

export function getUserLinks(userId) {
  return db.prepare(`
    SELECT l.*, p.product_type, p.twitter_post_id
    FROM links l
    LEFT JOIN posts p ON l.post_id = p.id
    WHERE l.user_id = ?
    ORDER BY l.created_at DESC
  `).all(userId);
}

export function getLinksByPost(postId) {
  return db.prepare('SELECT * FROM links WHERE post_id = ?').all(postId);
}
