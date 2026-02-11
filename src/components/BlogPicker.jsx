// src/components/BlogPicker.jsx
import React from 'react';

export default function BlogPicker({ blogs, onSelect, onBack, loading }) {
  if (!blogs.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          No relevant blogs found. Try different keywords.
        </p>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ← Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{
        fontSize: '22px',
        fontWeight: '700',
        marginBottom: '8px',
        color: '#1a1a1a',
      }}>
        Pick a blog to reference
      </h2>
      <p style={{
        fontSize: '14px',
        color: '#888',
        marginBottom: '20px',
      }}>
        Your tweet will mention this blog post to add context and credibility.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {blogs.map((blog, i) => (
          <button
            key={i}
            onClick={() => onSelect(blog)}
            disabled={loading}
            style={{
              textAlign: 'left',
              padding: '16px',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              backgroundColor: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#FF6B35';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(255,107,53,0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              fontSize: '15px',
              fontWeight: '600',
              color: '#1a1a1a',
              marginBottom: '4px',
            }}>
              {blog.title}
            </div>
            <div style={{
              fontSize: '13px',
              color: '#888',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {blog.url}
            </div>
            {blog.snippet && (
              <div style={{
                fontSize: '13px',
                color: '#666',
                marginTop: '6px',
                lineHeight: '1.4',
              }}>
                {blog.snippet.slice(0, 120)}...
              </div>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        style={{
          marginTop: '16px',
          padding: '8px 16px',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        ← Back
      </button>

      {loading && (
        <p style={{
          textAlign: 'center',
          color: '#FF6B35',
          fontSize: '14px',
          marginTop: '12px',
        }}>
          Generating tweet content...
        </p>
      )}
    </div>
  );
}
