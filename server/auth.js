// Authentication service
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'flywheel-secret-change-in-production';

export function createUser(email, password, name = null) {
  const passwordHash = bcrypt.hashSync(password, 10);
  
  try {
    const stmt = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
    const result = stmt.run(email, passwordHash, name);
    return { id: result.lastInsertRowid, email, name };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Email already exists');
    }
    throw error;
  }
}

export function loginUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('Invalid password');
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function getUserById(id) {
  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
  return user || null;
}

// Middleware to protect routes
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = decoded;
  next();
}
