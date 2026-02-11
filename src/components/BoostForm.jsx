// src/components/BoostForm.jsx
import React, { useState } from 'react';
import { api } from '../lib/api';
import BlogPicker from './BlogPicker';
import ContentPreview from './ContentPreview';

export default function BoostForm({ onCheckout, userEmail }) {
  const [step, setStep] = useState(1); // 1: input, 2: pick blog, 3: preview
  const [product, setProduct] = useState('');
  const [keywords, setKeywords] = useState('');
  const [email, setEmail] = useState(userEmail || '');
  const [blogs, setBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 → 2: Search blogs
  async function handleSearch(e) {
    e.preventDefault();
    if (!product.trim() || !keywords.trim()) return;

    setLoading(true);
    setError('');

    try {
      const result = await api.searchBlogs(keywords);
      setBlogs(result.results || result.blogs || []);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 2 → 3: Generate content
  async function handleBlogSelect(blog) {
    setSelectedBlog(blog);
    setLoading(true);
    setError('');

    try {
      const result = await api.generateContent({
        productData: { name: product, keywords },
        blog: { title: blog.title, url: blog.url, snippet: blog.snippet },
      });
      setGeneratedContent(result.content);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 3 → checkout
  async function handleCheckout() {
    if (!email.trim()) {
      setError('Email required for checkout');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.createCheckout({
        email,
        productData: { name: product, keywords, productUrl: '' },
        blog: selectedBlog,
        content: generatedContent,
      });

      // Redirect to Stripe
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // Reset
  function handleReset() {
    setStep(1);
    setBlogs([]);
    setSelectedBlog(null);
    setGeneratedContent('');
    setError('');
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '24px',
    }}>
      {/* Step indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        marginBottom: '32px',
      }}>
        {[1, 2, 3].map(s => (
          <div
            key={s}
            style={{
              width: '32px',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: s <= step ? '#FF6B35' : '#e0e0e0',
              transition: 'background-color 0.3s',
            }}
          />
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          color: '#DC2626',
          fontSize: '14px',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {/* Step 1: Product Input */}
      {step === 1 && (
        <form onSubmit={handleSearch}>
          <h2 style={{
            fontSize: '22px',
            fontWeight: '700',
            marginBottom: '20px',
            color: '#1a1a1a',
          }}>
            What are you promoting?
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '6px',
              color: '#333',
            }}>
              Product Name
            </label>
            <input
              type="text"
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="e.g., Organic Palmyra Sugar"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '6px',
              color: '#333',
            }}>
              Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="e.g., natural sweetener, healthy sugar alternative"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '6px',
              color: '#333',
            }}>
              Your Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: loading ? '#ccc' : '#FF6B35',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Searching blogs...' : 'Find Relevant Blogs →'}
          </button>
        </form>
      )}

      {/* Step 2: Blog Selection */}
      {step === 2 && (
        <BlogPicker
          blogs={blogs}
          onSelect={handleBlogSelect}
          onBack={handleReset}
          loading={loading}
        />
      )}

      {/* Step 3: Preview & Checkout */}
      {step === 3 && (
        <ContentPreview
          content={generatedContent}
          blog={selectedBlog}
          product={product}
          onCheckout={handleCheckout}
          onBack={() => setStep(2)}
          loading={loading}
        />
      )}
    </div>
  );
}
