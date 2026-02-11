// src/components/SampleOutput.jsx
import React from 'react';

const sampleBoost = {
  product: 'Organic Palmyra Sugar',
  keywords: 'natural sweetener, healthy sugar alternative',
  blog: {
    title: '10 Natural Sweeteners That Are Actually Good For You',
    url: 'https://example-health-blog.com/natural-sweeteners',
  },
  tweet: `Looking for a healthier sugar swap? This deep dive into natural sweeteners is worth a read 👇

Palmyra sugar is one standout — unrefined, mineral-rich, and sustainable. Check out @LivingNectar for the real deal.

#CleanEating #NaturalSweetener

https://example-health-blog.com/natural-sweeteners`,
  metrics: {
    impressions: 847,
    likes: 12,
    retweets: 4,
    replies: 2,
  },
};

export default function SampleOutput() {
  return (
    <section style={{
      padding: '60px 20px',
      maxWidth: '700px',
      margin: '0 auto',
    }}>
      <h2 style={{
        textAlign: 'center',
        fontSize: '24px',
        fontWeight: '700',
        marginBottom: '8px',
        color: '#1a1a1a',
      }}>
        What You Get
      </h2>
      <p style={{
        textAlign: 'center',
        fontSize: '14px',
        color: '#888',
        marginBottom: '32px',
      }}>
        Here's a real example of a $1.99 boost
      </p>

      {/* Tweet Card */}
      <div style={{
        border: '1px solid #e1e8ed',
        borderRadius: '16px',
        padding: '20px',
        backgroundColor: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        {/* Account header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF6B35, #F7C948)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '700',
            fontSize: '16px',
          }}>
            F
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#0f1419' }}>
              FlyWheel Squad
            </div>
            <div style={{ fontSize: '13px', color: '#536471' }}>
              @flywheelsquad
            </div>
          </div>
        </div>

        {/* Tweet content */}
        <p style={{
          fontSize: '15px',
          lineHeight: '1.5',
          color: '#0f1419',
          marginBottom: '16px',
          whiteSpace: 'pre-wrap',
        }}>
          {sampleBoost.tweet}
        </p>

        {/* Metrics bar */}
        <div style={{
          display: 'flex',
          gap: '24px',
          paddingTop: '12px',
          borderTop: '1px solid #eff3f4',
          fontSize: '13px',
          color: '#536471',
        }}>
          <span>💬 {sampleBoost.metrics.replies}</span>
          <span>🔄 {sampleBoost.metrics.retweets}</span>
          <span>❤️ {sampleBoost.metrics.likes}</span>
          <span>📊 {sampleBoost.metrics.impressions.toLocaleString()} impressions</span>
        </div>
      </div>

      {/* Context below the card */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#666',
      }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>Product:</strong> {sampleBoost.product}
        </div>
        <div style={{ marginBottom: '4px' }}>
          <strong>Keywords:</strong> {sampleBoost.keywords}
        </div>
        <div>
          <strong>Blog found:</strong> {sampleBoost.blog.title}
        </div>
      </div>
    </section>
  );
}
