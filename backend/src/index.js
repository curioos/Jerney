require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const authRoutes = require('./routes/auth');
const db = require('./db');
const { errorHandler } = require('./middleware/errorHandler');
const { validateEnv } = require('./middleware/validateEnv');

validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'jerney_backend_',
});

const httpRequestsTotal = new client.Counter({
  name: 'jerney_backend_http_requests_total',
  help: 'Total number of HTTP requests handled by the Jerney backend.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'jerney_backend_http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by the Jerney backend.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

// Security middleware
app.use(helmet());

// CORS - restricted to the frontend origin only
app.use(cors({
  origin: FRONTEND_URL.split(',').map(url => url.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  const endTimer = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    const routePath = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.path;
    const labels = {
      method: req.method,
      route: routePath,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    endTimer(labels);
  });

  next();
});

// General rate limit, scoped to the API so Prometheus scraping /metrics is unaffected
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', generalLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Jerney API is vibing ✨' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// Routes (write operations protected inside each router)
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

async function start() {
  try {
    await db.initDB();
    app.listen(PORT, '0.0.0.0', () => {
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
