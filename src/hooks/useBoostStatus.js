// src/hooks/useBoostStatus.js
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function useBoostStatus(boostId) {
  const [status, setStatus] = useState(null); // queued | pending | published | failed
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);

  const poll = useCallback(async () => {
    if (!boostId) return;

    setPolling(true);
    setError(null);

    let attempts = 0;
    const maxAttempts = 30;

    const interval = setInterval(async () => {
      attempts++;

      try {
        const result = await api.getBoostStatus(boostId);
        setStatus(result.status);
        setData(result);

        if (result.status === 'published' || result.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
        }
      } catch (err) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setPolling(false);
          setError('Boost is still processing. Check back shortly.');
        }
      }
    }, 2000);

    // Cleanup
    return () => clearInterval(interval);
  }, [boostId]);

  useEffect(() => {
    if (boostId) poll();
  }, [boostId, poll]);

  return { status, data, error, polling };
}
