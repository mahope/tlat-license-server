/**
 * TLAT License Server
 * 
 * Express server for managing WordPress plugin licenses
 * Endpoints: /activate, /deactivate, /validate, /heartbeat
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { initDatabase } from './db/init.js';
import licenseRoutes from './routes/licenses.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/products.js';
import webhookRoutes from './routes/webhooks.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestLogger } from './middleware/logger.js';
import { generalLimiter } from './middleware/rate-limit.js';

const app = express();
const PORT = process.env.PORT || 3100;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-License-Key']
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// General rate limiting (skips /health)
app.use(generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1/license', licenseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/products', productRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    console.log('✓ Database initialized');

    app.listen(PORT, () => {
      console.log(`✓ License server running on port ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
