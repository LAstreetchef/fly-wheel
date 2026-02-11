// src/components/ReferralWidget.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function ReferralWidget({ email }) {
  const [referralData, setReferralData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (email) {
      setLoading(true);
      api.getReferral(email)
        .then(setReferralData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [email]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
        Loading referral info...
      </div>
    );
  }

  if (!referralData) return null;

  function handleCopy() {
    navigator.clipboard.writeText(referralData.referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      maxWidth: '500px',
      margin: '32px auto',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      backgroundColor: '#fff',
    }}>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '700',
        marginBottom: '8px',
        color: '#1a1a1a',
      }}>
        🎁 Earn Free Boosts
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#666',
        marginBottom: '16px',
      }}>
        Share your link — you both get a free boost when they sign up.
      </p>

      {/* Referral URL + copy button */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <input
          type="text"
          value={referralData.referralUrl}
          readOnly
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#333',
            backgroundColor: '#f9fafb',
          }}
        />
        <button
          onClick={handleCopy}
          style={{
            padding: '10px 16px',
            backgroundColor: copied ? '#10B981' : '#FF6B35',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.2s',
          }}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>

      {/* Stats */}
      {referralData.stats && (
        <div style={{
          display: 'flex',
          gap: '24px',
          fontSize: '13px',
          color: '#888',
        }}>
          <span>
            <strong style={{ color: '#1a1a1a' }}>{referralData.stats.conversions || 0}</strong> referrals converted
          </span>
          <span>
            <strong style={{ color: '#10B981' }}>{referralData.stats.conversions || 0}</strong> free boosts earned
          </span>
        </div>
      )}
    </div>
  );
}
