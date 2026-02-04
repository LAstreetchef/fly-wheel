// Product Picker Component - Select Shopify products for content generation
import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function ProductPicker({ token, onSelect, selectedProduct }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async (refresh = false) => {
    setLoading(true);
    setError('');

    try {
      // First check if Shopify is connected
      const statusRes = await fetch(`${API_URL}/api/shopify/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        setConnected(false);
        setLoading(false);
        return;
      }

      setConnected(true);

      // Fetch products
      const res = await fetch(`${API_URL}/api/shopify/products${refresh ? '?refresh=true' : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to load products');
      }

      const data = await res.json();
      setProducts(data.products || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.handle?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!connected && !loading) {
    return (
      <div className="product-picker not-connected">
        <p>Connect your Shopify store to select products</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="product-picker loading">
        <span>Loading products...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-picker error">
        <p>{error}</p>
        <button onClick={() => loadProducts(true)}>Retry</button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="product-picker empty">
        <p>No products found in your store</p>
        <button onClick={() => loadProducts(true)}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="product-picker">
      <div className="picker-header">
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button onClick={() => loadProducts(true)} className="btn-refresh" title="Refresh products">
          🔄
        </button>
      </div>

      <div className="products-grid">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className={`product-card ${selectedProduct?.id === product.id ? 'selected' : ''}`}
            onClick={() => onSelect(product)}
          >
            {product.image && (
              <img src={product.image} alt={product.title} className="product-image" />
            )}
            {!product.image && (
              <div className="product-image placeholder">🖼️</div>
            )}
            <div className="product-info">
              <h4>{product.title}</h4>
              <span className="price">${product.price}</span>
            </div>
            {selectedProduct?.id === product.id && (
              <span className="selected-badge">✓</span>
            )}
          </div>
        ))}
      </div>

      {selectedProduct && (
        <div className="selected-product-preview">
          <h4>Selected: {selectedProduct.title}</h4>
          <p>{selectedProduct.description?.slice(0, 150)}...</p>
          <a href={selectedProduct.url} target="_blank" rel="noopener noreferrer">
            View in store →
          </a>
        </div>
      )}
    </div>
  );
}

// Compact dropdown version for inline use
export function ProductDropdown({ token, onSelect, selectedProduct }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/shopify/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error('Failed to load products:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <span className="loading-inline">Loading products...</span>;
  if (products.length === 0) return null;

  return (
    <div className="product-dropdown">
      <button 
        type="button" 
        onClick={() => setOpen(!open)} 
        className="dropdown-trigger"
      >
        {selectedProduct ? (
          <>
            {selectedProduct.image && <img src={selectedProduct.image} alt="" />}
            <span>{selectedProduct.title}</span>
          </>
        ) : (
          <span>Select a Shopify product...</span>
        )}
        <span className="arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="dropdown-menu">
          <div 
            className="dropdown-item clear"
            onClick={() => { onSelect(null); setOpen(false); }}
          >
            <span>No product (manual entry)</span>
          </div>
          {products.map((product) => (
            <div
              key={product.id}
              className={`dropdown-item ${selectedProduct?.id === product.id ? 'selected' : ''}`}
              onClick={() => { onSelect(product); setOpen(false); }}
            >
              {product.image && <img src={product.image} alt="" />}
              <span>{product.title}</span>
              <span className="price">${product.price}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
