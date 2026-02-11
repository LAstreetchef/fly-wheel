// src/lib/api.js
const API_BASE = import.meta.env.PROD
  ? 'https://fly-wheel.onrender.com'
  : 'http://localhost:3001';

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Blog search
  searchBlogs: (keywords) =>
    apiFetch(`/api/blogs/search?keywords=${encodeURIComponent(keywords)}`, { method: 'GET' }),

  // Content generation
  generateContent: (data) =>
    apiFetch('/api/generate', { method: 'POST', body: JSON.stringify(data) }),

  // Checkout (single boost)
  createCheckout: (data) =>
    apiFetch('/api/checkout', { method: 'POST', body: JSON.stringify(data) }),

  // Boost status polling
  getBoostStatus: (sessionId) =>
    apiFetch(`/api/status/${sessionId}`),

  // Prime
  getPrimeTiers: () =>
    apiFetch('/api/prime/tiers'),

  getAccount: (email) =>
    apiFetch(`/api/account/${email}`),

  primeBoost: (data) =>
    apiFetch('/api/prime/boost', { method: 'POST', body: JSON.stringify(data) }),

  subscribe: (data) =>
    apiFetch('/api/subscribe', { method: 'POST', body: JSON.stringify(data) }),

  // Rewards
  syncPoints: (email) =>
    apiFetch('/api/prime/sync-points', { method: 'POST', body: JSON.stringify({ email }) }),

  getRewards: (email) =>
    apiFetch(`/api/prime/rewards/${email}`),

  // Free Preview (3/hour)
  preview: (data) =>
    apiFetch('/api/preview', { method: 'POST', body: JSON.stringify(data) }),

  // Reddit
  searchReddit: (keywords) =>
    apiFetch('/api/reddit/search', { method: 'POST', body: JSON.stringify({ keywords }) }),

  generateRedditComment: (data) =>
    apiFetch('/api/reddit/generate', { method: 'POST', body: JSON.stringify(data) }),

  // Referrals
  getReferral: (email) =>
    apiFetch(`/api/referral/${encodeURIComponent(email)}`),

  redeemReferral: (data) =>
    apiFetch('/api/referral/redeem', { method: 'POST', body: JSON.stringify(data) }),

  // Auto-Boost (Prime)
  createAutoBoost: (data) =>
    apiFetch('/api/prime/auto-boost', { method: 'POST', body: JSON.stringify(data) }),

  getAutoBoosts: (email) =>
    apiFetch(`/api/prime/auto-boosts/${encodeURIComponent(email)}`),

  cancelAutoBoost: (id) =>
    apiFetch(`/api/prime/auto-boost/${id}`, { method: 'DELETE' }),
};

export { API_BASE };
