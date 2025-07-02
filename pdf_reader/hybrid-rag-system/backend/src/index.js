/**
 * Main Express server for Hybrid RAG Backend
 */

console.log('🚀 Starting Hybrid RAG Backend Server...');

// Add global error handlers first
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('📋 Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('📋 Reason:', reason);
  process.exit(1);
});

console.log('✅ Global error handlers set up');

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('✅ Core modules imported');

import config, { validateConfig } from './config/index.js';
console.log('✅ Config imported');

import logger from './utils/logger.js';
console.log('✅ Logger imported');

import { applyMiddleware, errorHandlingMiddleware, notFoundMiddleware } from './middleware/index.js';
console.log('✅ Middleware imported');

import { initializeQueue } from './services/queue.js';
console.log('✅ Queue service imported');

// Import routes
import uploadRoutes from './routes/upload.js';
console.log('✅ Upload routes imported');

import chatRoutes from './routes/chat.js';
console.log('✅ Chat routes imported');

import queueRoutes from './routes/queue.js';
console.log('✅ Queue routes imported');

import agentRoutes from './routes/agent.js';
console.log('✅ Agent routes imported');

console.log('📦 All modules imported successfully');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Express application
 */
const app = express();
const server = createServer(app);

/**
 * Initialize application
 */
async function initializeApp() {
  try {
    console.log('🔍 Starting application initialization...');
    logger.info('Starting application initialization');

    // Validate configuration
    console.log('🔍 Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');
    logger.info('Configuration validated successfully');

    // Apply middleware
    console.log('🔍 Applying middleware...');
    applyMiddleware(app);
    console.log('✅ Middleware applied successfully');
    logger.info('Middleware applied');

    // Initialize queue system (optional) with timeout
    console.log('🔍 Initializing queue system...');
    try {
      const queuePromise = initializeQueue();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Queue initialization timeout')), 5000)
      );

      const queueResult = await Promise.race([queuePromise, timeoutPromise]);

      if (queueResult.success) {
        console.log('✅ Queue system initialized successfully');
        logger.info('Queue system initialized successfully');
      } else {
        console.log('⚠️ Queue system unavailable - background processing disabled');
        logger.warn('Queue system unavailable - background processing disabled', {
          reason: queueResult.message
        });
      }
    } catch (error) {
      console.log('⚠️ Queue system initialization failed - background processing disabled');
      console.log('📋 Error:', error.message);
      logger.warn('Queue system initialization failed - background processing disabled', {
        error: error.message
      });
    }

    // Set up routes
    console.log('🔍 Setting up routes...');
    setupRoutes();
    console.log('✅ Routes configured successfully');
    logger.info('Routes configured');

    // Apply error handling middleware (must be last)
    console.log('🔍 Applying error handling middleware...');
    app.use(errorHandlingMiddleware);
    app.use(notFoundMiddleware);
    console.log('✅ Error handling middleware applied');

    console.log('🎉 Application initialization completed successfully');
    logger.info('Application initialization completed');
    return app;
  } catch (error) {
    console.error('❌ Failed to initialize application:', error.message);
    console.error('📋 Stack trace:', error.stack);
    logger.error('Failed to initialize application', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Set up application routes
 */
function setupRoutes() {
  // API routes
  app.use('/api/upload', uploadRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/queue', queueRoutes);
  app.use('/api/agent', agentRoutes);

  // Root route
  app.get('/', (req, res) => {
    res.json({
      name: config.app.name,
      version: config.app.version,
      environment: config.app.env,
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        upload: '/api/upload',
        chat: '/api/chat',
        queue: '/api/queue',
        agent: '/api/agent',
        health: '/health',
      },
    });
  });

  // API info route
  app.get('/api', (req, res) => {
    res.json({
      name: config.app.name,
      version: config.app.version,
      documentation: '/api/docs',
      endpoints: [
        'GET /health',
        'GET /api/upload/status',
        'POST /api/upload/pdf',
        'GET /api/chat/history/:sessionId',
        'POST /api/chat/message',
        'GET /api/chat/stream',
        'GET /api/queue/stats',
        'GET /api/queue/job/:jobId',
        'POST /api/agent/search',
        'GET /api/agent/health',
      ],
    });
  });

  // Health check endpoint with detailed status
  app.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.app.version,
        environment: config.app.env,
        uptime: Math.floor(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        services: {
          queue: false,
          agent: false
        }
      };

      // Check queue service
      try {
        const { getQueue } = await import('./services/queue.js');
        getQueue();
        health.services.queue = true;
      } catch (error) {
        health.services.queue = false;
      }

      // Check agent service (basic connectivity test)
      try {
        const response = await fetch(`${config.agent.url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        health.services.agent = response.ok;
      } catch (error) {
        health.services.agent = false;
      }

      res.json(health);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Start server
 */
async function startServer() {
  try {
    console.log('🔍 Starting server initialization...');
    logger.info('Starting server');

    console.log('🔍 About to call initializeApp()...');
    await initializeApp();
    console.log('✅ initializeApp() completed successfully');

    console.log('🔍 About to start HTTP server...');
    server.listen(config.app.port, config.app.host, () => {
      logger.info('Server started successfully', {
        name: config.app.name,
        version: config.app.version,
        environment: config.app.env,
        host: config.app.host,
        port: config.app.port,
        url: `http://${config.app.host}:${config.app.port}`,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      });

      // Log startup message to console for immediate feedback
      console.log(`🚀 Hybrid RAG Backend Server running on http://${config.app.host}:${config.app.port}`);
      console.log(`📊 Environment: ${config.app.env}`);
      console.log(`🔧 Process ID: ${process.pid}`);
    });

    console.log('✅ HTTP server listen() called successfully');

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        const message = `Port ${config.app.port} is already in use`;
        logger.error(message);
        console.error(`❌ ${message}`);
      } else {
        logger.error('Server error', { error: error.message, code: error.code });
        console.error('❌ Server error:', error.message);
      }
      process.exit(1);
    });

    console.log('✅ Server error handlers set up');

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    console.error('❌ Failed to start server:', error.message);
    console.error('📋 Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (error) => {
    if (error) {
      logger.error('Error during server shutdown', { error: error.message });
    } else {
      logger.info('Server closed successfully');
    }

    try {
      // Close queue connections
      const { shutdownQueue } = await import('./services/queue.js');
      await shutdownQueue();
      logger.info('Queue connections closed');

      // Close database connections if any
      // Add other cleanup tasks here

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (shutdownError) {
      logger.error('Error during graceful shutdown', { error: shutdownError.message });
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds
}

/**
 * Handle process signals
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { 
    reason: reason?.message || reason,
    promise: promise.toString(),
  });
  process.exit(1);
});

// Start the server with comprehensive error handling
// Force server startup for debugging
console.log('🎯 Force starting server for debugging...');
startServer().catch((error) => {
  console.error('❌ Critical startup error:', error.message);
  console.error('📋 Stack trace:', error.stack);
  logger.error('Failed to start server', {
    error: error.message,
    stack: error.stack,
    pid: process.pid
  });
  process.exit(1);
});

export { app, server, startServer };
export default app;
