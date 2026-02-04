// Shopify Integration for FlyWheel
import db from './db.js';

// ============================================
// Database Setup
// ============================================

db.exec(`
  -- Shopify store connections
  CREATE TABLE IF NOT EXISTS shopify_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    store_domain TEXT NOT NULL,
    access_token TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    scopes TEXT,
    token_expires_at DATETIME,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Cached products for faster UI
  CREATE TABLE IF NOT EXISTS shopify_products_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    shopify_product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    handle TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    price TEXT,
    currency TEXT DEFAULT 'USD',
    status TEXT,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES shopify_stores(id),
    UNIQUE(store_id, shopify_product_id)
  );
`);

// ============================================
// Store Connection Management
// ============================================

/**
 * Connect a Shopify store using Admin API credentials
 */
export function connectStore(userId, storeDomain, accessToken, clientId = null, clientSecret = null) {
  // Normalize store domain
  const domain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Check if already connected
  const existing = db.prepare('SELECT id FROM shopify_stores WHERE user_id = ?').get(userId);
  
  if (existing) {
    // Update existing connection
    db.prepare(`
      UPDATE shopify_stores 
      SET store_domain = ?, access_token = ?, client_id = ?, client_secret = ?, connected_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(domain, accessToken, clientId, clientSecret, userId);
    
    return { updated: true, storeDomain: domain };
  }
  
  // Create new connection
  const result = db.prepare(`
    INSERT INTO shopify_stores (user_id, store_domain, access_token, client_id, client_secret)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, domain, accessToken, clientId, clientSecret);
  
  return { id: result.lastInsertRowid, storeDomain: domain };
}

/**
 * Get store connection for a user
 */
export function getStoreConnection(userId) {
  return db.prepare(`
    SELECT id, store_domain, connected_at, 
           CASE WHEN access_token IS NOT NULL THEN 1 ELSE 0 END as has_token
    FROM shopify_stores WHERE user_id = ?
  `).get(userId);
}

/**
 * Get full store credentials (internal use only)
 */
function getStoreCredentials(userId) {
  return db.prepare('SELECT * FROM shopify_stores WHERE user_id = ?').get(userId);
}

/**
 * Disconnect Shopify store
 */
export function disconnectStore(userId) {
  const store = db.prepare('SELECT id FROM shopify_stores WHERE user_id = ?').get(userId);
  
  if (store) {
    // Clear cached products
    db.prepare('DELETE FROM shopify_products_cache WHERE store_id = ?').run(store.id);
    // Remove store connection
    db.prepare('DELETE FROM shopify_stores WHERE user_id = ?').run(userId);
    return true;
  }
  
  return false;
}

// ============================================
// Shopify API Calls
// ============================================

/**
 * Make authenticated request to Shopify Admin API
 */
async function shopifyRequest(store, endpoint, options = {}) {
  const url = `https://${store.store_domain}/admin/api/2024-01${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': store.access_token,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * Verify store connection is valid
 */
export async function verifyConnection(userId) {
  const store = getStoreCredentials(userId);
  if (!store) return { connected: false, error: 'No store connected' };
  
  try {
    const data = await shopifyRequest(store, '/shop.json');
    return {
      connected: true,
      shop: {
        name: data.shop.name,
        domain: data.shop.domain,
        email: data.shop.email,
      },
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Fetch products from Shopify store
 */
export async function fetchProducts(userId, limit = 50) {
  const store = getStoreCredentials(userId);
  if (!store) throw new Error('No Shopify store connected');
  
  const data = await shopifyRequest(store, `/products.json?limit=${limit}&status=active`);
  
  // Cache products
  const cacheStmt = db.prepare(`
    INSERT OR REPLACE INTO shopify_products_cache 
    (store_id, shopify_product_id, title, handle, description, image_url, price, status, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  const products = data.products.map(p => {
    const variant = p.variants?.[0];
    const image = p.image?.src || p.images?.[0]?.src;
    
    cacheStmt.run(
      store.id,
      String(p.id),
      p.title,
      p.handle,
      p.body_html?.replace(/<[^>]*>/g, '').substring(0, 500) || '',
      image || null,
      variant?.price || '0.00',
      p.status
    );
    
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      description: p.body_html?.replace(/<[^>]*>/g, '').substring(0, 500) || '',
      image: image,
      price: variant?.price || '0.00',
      url: `https://${store.store_domain}/products/${p.handle}`,
      status: p.status,
    };
  });
  
  return products;
}

/**
 * Get single product details
 */
export async function fetchProduct(userId, productId) {
  const store = getStoreCredentials(userId);
  if (!store) throw new Error('No Shopify store connected');
  
  const data = await shopifyRequest(store, `/products/${productId}.json`);
  const p = data.product;
  const variant = p.variants?.[0];
  
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.body_html?.replace(/<[^>]*>/g, '') || '',
    descriptionHtml: p.body_html || '',
    image: p.image?.src || p.images?.[0]?.src,
    images: p.images?.map(i => i.src) || [],
    price: variant?.price || '0.00',
    compareAtPrice: variant?.compare_at_price,
    sku: variant?.sku,
    vendor: p.vendor,
    productType: p.product_type,
    tags: p.tags?.split(', ') || [],
    url: `https://${store.store_domain}/products/${p.handle}`,
  };
}

/**
 * Get cached products (faster, for UI dropdowns)
 */
export function getCachedProducts(userId) {
  const store = db.prepare('SELECT id, store_domain FROM shopify_stores WHERE user_id = ?').get(userId);
  if (!store) return [];
  
  const products = db.prepare(`
    SELECT shopify_product_id as id, title, handle, description, image_url as image, price
    FROM shopify_products_cache 
    WHERE store_id = ?
    ORDER BY title
  `).all(store.id);
  
  return products.map(p => ({
    ...p,
    url: `https://${store.store_domain}/products/${p.handle}`,
  }));
}

/**
 * Refresh token using client credentials (if token expired)
 */
export async function refreshToken(userId) {
  const store = getStoreCredentials(userId);
  if (!store || !store.client_id || !store.client_secret) {
    throw new Error('Cannot refresh token: missing client credentials');
  }
  
  const response = await fetch(`https://${store.store_domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: store.client_id,
      client_secret: store.client_secret,
      grant_type: 'client_credentials',
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh Shopify token');
  }
  
  const data = await response.json();
  
  // Update stored token
  db.prepare(`
    UPDATE shopify_stores 
    SET access_token = ?, token_expires_at = datetime('now', '+' || ? || ' seconds')
    WHERE user_id = ?
  `).run(data.access_token, data.expires_in || 86400, userId);
  
  return { success: true };
}

export default {
  connectStore,
  getStoreConnection,
  disconnectStore,
  verifyConnection,
  fetchProducts,
  fetchProduct,
  getCachedProducts,
  refreshToken,
};
