// src/components/StatusTracker.jsx
import React from 'react';
import { useBoostStatus } from '../hooks/useBoostStatus';

const statusConfig = {
  queued: { label: 'Queued', color: '#F7C948', icon: '⏳', message: 'Your boost is in the queue...' },
  pending: { label: 'Processing', color: '#3B82F6', icon: '⚙️', message: 'Searching blogs and generating content...' },
  published: { label: 'Live!', color: '#10B981', icon: '✅', message: 'Your tweet is live!' },
  failed: { label: 'Failed', color: '#EF4444', icon: '❌', message: "Something went wrong. We'll retry or contact you." },
};

export default function StatusTracker({ boostId }) {
  const { status, data, error, polling } = useBoostStatus(boostId);

  if (!boostId) return null;

  const config = statusConfig[status] || statusConfig.queued;

  return (
    <div style={{
      maxWidth: '500px',
      margin: '40px auto',
      padding: '24px',
      borderRadius: '12px',
      border: `2px solid ${config.color}`,
      backgroundColor: '#fff',
      textAlign: 'center',
    }}>
      {/* Status icon + label */}
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>
        {config.icon}
      </div>
      <h3 style={{
        fontSize: '20px',
        fontWeight: '700',
        color: config.color,
        marginBottom: '8px',
      }}>
        {config.label}
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#666',
        marginBottom: '20px',
      }}>
        {config.message}
      </p>

      {/* Progress dots animation while polling */}
      {polling && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '6px',
          marginBottom: '16px',
        }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: config.color,
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Show tweet link when published */}
      {status === 'published' && data?.tweetUrl && (
        <a
          href={data.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            backgroundColor: '#1DA1F2',
            color: 'white',
            borderRadius: '24px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          View Tweet →
        </a>
      )}

      {/* Show content preview */}
      {data?.content && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#333',
          textAlign: 'left',
          lineHeight: '1.5',
        }}>
          {data.content}
        </div>
      )}

      {/* Error display */}
      {error && (
        <p style={{
          marginTop: '12px',
          fontSize: '13px',
          color: '#EF4444',
        }}>
          {error}
        </p>
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
