const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { validateLogin } = require('../middleware/validation');

// Simple in-memory user store (in production, use a database)
// Password should be hashed using bcrypt in production
const users = {
  'admin': 'admin123' // Change this!
};

/**
 * POST /api/auth/login
 * Login and get JWT token
 */
router.post('/login', validateLogin, (req, res) => {
  const { username, password } = req.body;

  // Verify credentials (use bcrypt in production)
  if (!users[username] || users[username] !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      message: 'Login successful 🔐'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const newToken = jwt.sign(
      { username: decoded.username, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token: newToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
