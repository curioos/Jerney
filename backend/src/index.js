require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const authRoutes = require('./routes/auth');
const db = require('./db');
const { errorHandler } = require('./middleware/errorHandler');
const { validateEnv } = require('./middleware/validateEnv');

// Validate environment variables
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Security Middleware
app.use(helmet());

// CORS configuration - restricted to frontend origin
app.use(cors({
  origin: FRONTEND_URL.split(',').map(url => url.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting - general API limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Rate limiting - stricter for write operations
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // limit each IP to 30 requests per windowMs
  message: 'Too many write requests from this IP, please try again later.'
});

app.use(generalLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Jerney API is vibing ✨' });
});

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function start() {
  try {
    await db.initDB();
    app.listen(PORT, 'localhost', () => {
      console.log(`🚀 Jerney backend running on port ${PORT}`);
      console.log(`✅ CORS enabled for: ${FRONTEND_URL}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
