// server/middleware/auth.js

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminToken = process.env.ADMIN_API_KEY;

  if (!adminToken) {
    console.error('ADMIN_API_KEY env var not set!');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export { requireAdmin };
