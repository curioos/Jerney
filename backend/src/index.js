require('dotenv').config();
const express = require('express');
const cors = require('cors');
const client = require('prom-client');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
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

// Middleware
app.use(cors());
app.use(express.json());
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Jerney API is vibing ✨' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// Routes
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

// Initialize database and start server
async function start() {
  try {
    await db.initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Jerney backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
