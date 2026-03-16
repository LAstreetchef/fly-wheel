// Admin routes - Distribute points to first 10 influencers

const express = require('express');
const router = express.Router();

// Simple admin auth (replace with real auth in production)
const ADMIN_KEY = process.env.ADMIN_KEY || 'hotpotato-admin-2026';

function requireAdmin(req, res, next) {
  const key = req.headers.authorization?.replace('Bearer ', '');
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin dashboard
router.get('/dashboard', (req, res) => {
  const users = Array.from(req.app.locals.users.values());
  const markets = Array.from(req.app.locals.markets.values());
  
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Hot Potato Admin</title>
    <style>
      body{font-family:sans-serif;max-width:1200px;margin:0 auto;padding:40px 20px}
      h1{font-size:28px;margin-bottom:8px}
      .meta{color:#666;font-size:12px;margin-bottom:32px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}
      th{background:#f5f5f5;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
      .btn{display:inline-block;padding:6px 12px;background:#000;color:#fff;text-decoration:none;font-size:12px;cursor:pointer;border:none}
      .btn:hover{background:#333}
      .add-form{background:#f9f9f9;padding:20px;margin:20px 0;border:1px solid #ddd}
      .add-form input{padding:8px;margin:0 8px 0 0;font-size:14px}
      .stat{display:inline-block;margin-right:24px;font-size:14px}
      .stat strong{font-size:20px;display:block}
    </style>
    </head><body>
    <h1>🥔 Hot Potato Admin</h1>
    <div class="meta">MVP Dashboard · ${new Date().toLocaleDateString()}</div>
    
    <div style="margin-bottom:32px">
      <div class="stat"><strong>${users.length}</strong> Users</div>
      <div class="stat"><strong>${markets.length}</strong> Markets</div>
      <div class="stat"><strong>${users.reduce((sum, u) => sum + u.points, 0).toLocaleString()}</strong> Total Points</div>
    </div>
    
    <h2>Add Points</h2>
    <div class="add-form">
      <form action="/api/admin/give-points" method="POST">
        <input type="number" name="userId" placeholder="User ID" required>
        <input type="number" name="points" placeholder="Points" required value="1000">
        <button type="submit" class="btn">Give Points</button>
      </form>
      <p style="font-size:11px;color:#666;margin-top:8px">Quick bonus for early influencers</p>
    </div>
    
    <h2>Users</h2>
    <table>
      <tr>
        <th>ID</th>
        <th>Platform</th>
        <th>Handle</th>
        <th>Points</th>
        <th>Balance</th>
        <th>Joined</th>
        <th>Actions</th>
      </tr>
      ${users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${u.platform}</td>
          <td>${u.handle}</td>
          <td><strong>${u.points.toLocaleString()}</strong></td>
          <td>$${u.balance.toFixed(2)}</td>
          <td>${new Date(u.createdAt).toLocaleString()}</td>
          <td>
            <form action="/api/admin/give-points" method="POST" style="display:inline">
              <input type="hidden" name="userId" value="${u.id}">
              <input type="number" name="points" value="1000" style="width:80px;padding:4px">
              <button type="submit" class="btn">+</button>
            </form>
          </td>
        </tr>
      `).join('')}
    </table>
    
    ${markets.length > 0 ? `
    <h2>Markets</h2>
    <table>
      <tr>
        <th>ID</th>
        <th>Creator</th>
        <th>Question</th>
        <th>YES Odds</th>
        <th>Volume</th>
      </tr>
      ${markets.map(m => `
        <tr>
          <td>${m.id}</td>
          <td>${m.creatorHandle}</td>
          <td>${m.question}</td>
          <td>${m.yesOdds}%</td>
          <td>$${m.volume?.toFixed(2) || '0.00'}</td>
        </tr>
      `).join('')}
    </table>
    ` : '<p>No markets created yet.</p>'}
    
    </body></html>
  `);
});

// Give points to user
router.post('/give-points', express.urlencoded({ extended: true }), (req, res) => {
  const { userId, points } = req.body;
  const user = req.app.locals.users.get(parseInt(userId));
  
  if (!user) {
    return res.status(404).send('User not found');
  }
  
  user.points += parseInt(points);
  res.redirect('/api/admin/dashboard');
});

// API endpoint for programmatic point distribution
router.post('/api/give-points', requireAdmin, express.json(), (req, res) => {
  const { userId, points } = req.body;
  const user = req.app.locals.users.get(parseInt(userId));
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.points += parseInt(points);
  res.json({ success: true, user });
});

// List all users (API)
router.get('/api/users', requireAdmin, (req, res) => {
  const users = Array.from(req.app.locals.users.values());
  res.json({ users });
});

module.exports = router;
