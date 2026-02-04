// Shopify Store Connection Component
import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function ShopifyConnect({ token, onConnect }) {
  const [status, setStatus] = useState({ connected: false, loading: true });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    storeDomain: '',
    accessToken: '',
    clientId: '',
    clientSecret: '',
  });
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/shopify/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus({ ...data, loading: false });
    } catch (e) {
      setStatus({ connected: false, loading: false, error: e.message });
    }
  };

  const connect = async (e) => {
    e.preventDefault();
    setError('');
    setConnecting(true);

    try {
      const res = await fetch(`${API_URL}/api/shopify/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Connection failed');
      }

      setStatus({
        connected: true,
        storeDomain: data.storeDomain,
        shop: data.shop,
        loading: false,
      });
      setShowForm(false);
      onConnect?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Shopify store?')) return;

    try {
      await fetch(`${API_URL}/api/shopify/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus({ connected: false, loading: false });
      setForm({ storeDomain: '', accessToken: '', clientId: '', clientSecret: '' });
    } catch (e) {
      setError(e.message);
    }
  };

  if (status.loading) {
    return (
      <div className="shopify-connect loading">
        <span>Checking Shopify connection...</span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="shopify-connect connected">
        <div className="connection-info">
          <span className="icon">🛍️</span>
          <div>
            <strong>{status.shop?.name || status.storeDomain}</strong>
            <span className="domain">{status.storeDomain}</span>
          </div>
          <span className="badge connected">Connected</span>
        </div>
        <button onClick={disconnect} className="btn-disconnect">
          Disconnect
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="shopify-connect disconnected">
        <div className="connection-info">
          <span className="icon">🛍️</span>
          <span>Connect your Shopify store to create product content</span>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-connect">
          Connect Shopify
        </button>
      </div>
    );
  }

  return (
    <div className="shopify-connect form">
      <h3>🛍️ Connect Shopify Store</h3>
      
      <form onSubmit={connect}>
        <div className="form-group">
          <label>Store Domain</label>
          <input
            type="text"
            placeholder="yourstore.myshopify.com"
            value={form.storeDomain}
            onChange={(e) => setForm({ ...form, storeDomain: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>Admin API Access Token</label>
          <input
            type="password"
            placeholder="shpat_..."
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            required
          />
          <small>Get this from Shopify Admin → Apps → Develop apps</small>
        </div>

        <details className="advanced-options">
          <summary>Advanced: Auto-refresh credentials (optional)</summary>
          <div className="form-group">
            <label>Client ID</label>
            <input
              type="text"
              placeholder="For token refresh"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Client Secret</label>
            <input
              type="password"
              placeholder="For token refresh"
              value={form.clientSecret}
              onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
            />
          </div>
        </details>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" onClick={() => setShowForm(false)} className="btn-cancel">
            Cancel
          </button>
          <button type="submit" disabled={connecting} className="btn-submit">
            {connecting ? 'Connecting...' : 'Connect Store'}
          </button>
        </div>
      </form>
    </div>
  );
}
