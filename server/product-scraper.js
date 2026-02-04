// Product URL Scraper - Fetch product data from public URLs (no API key needed)

/**
 * Extract product data from a Shopify product URL
 * Works by appending .json to the product URL
 */
export async function fetchShopifyProduct(productUrl) {
  // Clean up the URL - remove query params, ensure no trailing slash
  let cleanUrl = productUrl.split('?')[0].replace(/\/$/, '');
  
  // Add .json if not present
  if (!cleanUrl.endsWith('.json')) {
    cleanUrl += '.json';
  }
  
  const response = await fetch(cleanUrl, {
    headers: {
      'User-Agent': 'FlyWheel/1.0 (Content Generator)',
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.status}`);
  }
  
  const data = await response.json();
  const product = data.product;
  
  if (!product) {
    throw new Error('No product data found');
  }
  
  // Extract and clean the data
  const variant = product.variants?.[0];
  const description = product.body_html
    ?.replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim()
    .substring(0, 500);
  
  return {
    title: product.title,
    description: description || '',
    price: variant?.price || '0.00',
    compareAtPrice: variant?.compare_at_price,
    image: product.image?.src || product.images?.[0]?.src,
    images: product.images?.map(i => i.src) || [],
    vendor: product.vendor,
    productType: product.product_type,
    tags: product.tags?.split(', ').filter(Boolean) || [],
    handle: product.handle,
    url: productUrl.split('?')[0],  // Clean URL without tracking params
  };
}

/**
 * Detect platform from URL and fetch product data
 * Currently supports: Shopify
 * Future: WooCommerce, BigCommerce, etc.
 */
export async function fetchProductFromUrl(url) {
  // Detect Shopify URLs
  if (url.includes('.myshopify.com/products/') || url.includes('/products/')) {
    // Check if it's a Shopify store by trying the .json endpoint
    try {
      return {
        platform: 'shopify',
        product: await fetchShopifyProduct(url),
      };
    } catch (e) {
      // Not a Shopify store or product not found
    }
  }
  
  // Future: Add WooCommerce, BigCommerce, etc.
  
  throw new Error('Unsupported product URL. Currently supports Shopify product links.');
}

export default { fetchShopifyProduct, fetchProductFromUrl };
