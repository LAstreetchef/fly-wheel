// src/components/ContentPreview.jsx
import React from 'react';

export default function ContentPreview({ content, blog, product, onCheckout, onBack, loading }) {
  return (
    <div>
      <h2 style={{
        fontSize: '22px',
        fontWeight: '700',
        marginBottom: '8px',
        color: '#1a1a1a',
      }}>
        Preview your boost
      </h2>
      <p style={{
        fontSize: '14px',
        color: '#888',
        marginBottom: '20px',
      }}>
        This is what will be tweeted from @flywheelsquad
      </p>

      {/* Tweet preview card */}
      <div style={{
        border: '1px solid #e1e8ed',
        borderRadius: '12px',
        padding: '16px',
        backgroundColor: '#fff',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF6B35, #F7C948)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '700',
            fontSize: '14px',
          }}>
            F
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f1419' }}>
              FlyWheel Squad
            </div>
            <div style={{ fontSize: '12px', color: '#536471' }}>
              @flywheelsquad
            </div>
          </div>
        </div>

        <p style={{
          fontSize: '15px',
          lineHeight: '1.5',
          color: '#0f1419',
          whiteSpace: 'pre-wrap',
        }}>
          {content}
        </p>

        <div style={{
          fontSize: '12px',
          color: '#536471',
          marginTop: '8px',
        }}>
          {content?.length || 0}/280 characters
        </div>
      </div>

      {/* Context */}
      <div style={{
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#666',
        marginBottom: '24px',
      }}>
        <strong>Product:</strong> {product} &nbsp;|&nbsp;
        <strong>Blog:</strong> {blog?.title}
      </div>

      {/* CTA */}
      <button
        onClick={onCheckout}
        disabled={loading}
        style={{
          width: '100%',
          padding: '16px',
          backgroundColor: loading ? '#ccc' : '#FF6B35',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '17px',
          fontWeight: '700',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Redirecting to checkout...' : 'Boost for $1.99 →'}
      </button>

      <button
        onClick={onBack}
        style={{
          display: 'block',
          margin: '12px auto 0',
          padding: '8px 16px',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        ← Pick different blog
      </button>
    </div>
  );
}
