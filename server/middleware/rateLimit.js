// server/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => {
    const email = req.body?.email || req.query?.email || 'anonymous';
    return `${email}_${req.ip}`;
  },
  message: { error: 'Rate limit exceeded. Max 20 generations per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => {
    const email = req.body?.email || 'anonymous';
    return `checkout_${email}_${req.ip}`;
  },
  message: { error: 'Too many checkout attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});
