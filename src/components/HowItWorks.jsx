// src/components/HowItWorks.jsx
import React from 'react';

const steps = [
  {
    num: '1',
    title: 'Enter Your Product',
    desc: "Tell us what you're selling and the keywords that describe it.",
    icon: '🎯',
  },
  {
    num: '2',
    title: 'AI Finds Relevant Blogs',
    desc: 'We search the web for blog posts your target customers are reading.',
    icon: '🔍',
  },
  {
    num: '3',
    title: 'Tweet Goes Live',
    desc: 'An AI-crafted tweet referencing the blog promotes your product to thousands.',
    icon: '🚀',
  },
];

export default function HowItWorks() {
  return (
    <section style={{
      padding: '60px 20px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <h2 style={{
        textAlign: 'center',
        fontSize: '28px',
        fontWeight: '700',
        marginBottom: '48px',
        color: '#1a1a1a',
      }}>
        How It Works
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '32px',
      }}>
        {steps.map((step) => (
          <div key={step.num} style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>
              {step.icon}
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#FF6B35',
              color: 'white',
              fontWeight: '700',
              fontSize: '14px',
              marginBottom: '12px',
            }}>
              {step.num}
            </div>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1a1a1a',
            }}>
              {step.title}
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#666',
              lineHeight: '1.5',
            }}>
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
