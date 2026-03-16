// Markets routes - Create markets, place trades

const express = require('express');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Create a new market
router.post('/create', requireAuth, (req, res) => {
  const { question, yesOdds = 60, resolveDate } = req.body;
  const user = req.app.locals.users.get(req.session.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!question || question.length < 10) {
    return res.status(400).json({ error: 'Question must be at least 10 characters' });
  }
  
  const marketId = req.app.locals.getNextMarketId();
  const market = {
    id: marketId,
    creatorId: user.id,
    creatorHandle: user.handle,
    question,
    yesOdds: parseInt(yesOdds),
    noOdds: 100 - parseInt(yesOdds),
    volume: 0,
    resolveDate: resolveDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(),
    resolved: false
  };
  
  req.app.locals.markets.set(marketId, market);
  
  // Reward creator with points for creating market
  user.points += 100;
  
  res.json({ success: true, market });
});

// Get all markets
router.get('/', (req, res) => {
  const markets = Array.from(req.app.locals.markets.values())
    .filter(m => !m.resolved)
    .sort((a, b) => b.createdAt - a.createdAt);
  
  res.json({ markets });
});

// Get single market
router.get('/:id', (req, res) => {
  const market = req.app.locals.markets.get(parseInt(req.params.id));
  
  if (!market) {
    return res.status(404).json({ error: 'Market not found' });
  }
  
  res.json({ market });
});

// Place a trade
router.post('/:id/trade', requireAuth, (req, res) => {
  const { side, amount } = req.body; // side: 'yes' | 'no', amount: USD
  const marketId = parseInt(req.params.id);
  const market = req.app.locals.markets.get(marketId);
  const user = req.app.locals.users.get(req.session.userId);
  
  if (!market) {
    return res.status(404).json({ error: 'Market not found' });
  }
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!['yes', 'no'].includes(side)) {
    return res.status(400).json({ error: 'Side must be yes or no' });
  }
  
  const tradeAmount = parseFloat(amount);
  if (tradeAmount <= 0 || tradeAmount > user.balance) {
    return res.status(400).json({ error: 'Invalid trade amount' });
  }
  
  // Calculate shares
  const odds = side === 'yes' ? market.yesOdds / 100 : market.noOdds / 100;
  const shares = tradeAmount / odds;
  
  // Deduct from user balance
  user.balance -= tradeAmount;
  
  // Award HP Points (2x the trade amount)
  user.points += Math.floor(tradeAmount * 2);
  
  // Update market volume
  market.volume = (market.volume || 0) + tradeAmount;
  
  // Give creator their 1% fee
  const creator = req.app.locals.users.get(market.creatorId);
  if (creator) {
    creator.balance += tradeAmount * 0.01;
  }
  
  // Store position
  const positionKey = `${user.id}-${marketId}`;
  const existingPosition = req.app.locals.positions.get(positionKey);
  
  if (existingPosition) {
    existingPosition.shares += shares;
    existingPosition.invested += tradeAmount;
  } else {
    req.app.locals.positions.set(positionKey, {
      userId: user.id,
      marketId,
      side,
      shares,
      invested: tradeAmount,
      entryOdds: odds,
      createdAt: new Date()
    });
  }
  
  res.json({
    success: true,
    trade: {
      marketId,
      side,
      amount: tradeAmount,
      shares,
      pointsEarned: Math.floor(tradeAmount * 2)
    },
    user: {
      points: user.points,
      balance: user.balance
    }
  });
});

// Get user's positions
router.get('/positions/me', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const positions = Array.from(req.app.locals.positions.values())
    .filter(p => p.userId === userId)
    .map(p => {
      const market = req.app.locals.markets.get(p.marketId);
      return {
        ...p,
        market
      };
    });
  
  res.json({ positions });
});

module.exports = router;
