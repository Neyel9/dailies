/**
 * Middleware collection for Hybrid RAG Backend
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger, { requestLogger, errorLogger } from '../utils/logger.js';

/**
 * Request ID middleware
 */
export const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * CORS middleware configuration with safe defaults
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    try {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Get CORS origins safely with fallback
      const corsOrigins = config?.security?.corsOrigins || ['http://localhost:3000'];

      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error(`CORS policy violation: Origin ${origin} not allowed`);
      error.status = 403;
      callback(error);
    } catch (error) {
      logger.error('CORS configuration error', { error: error.message });
      // Allow all origins as fallback in case of configuration error
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
  ],
  exposedHeaders: ['X-Request-ID'],
});

/**
 * Security middleware configuration
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Rate limiting middleware with safe configuration
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config?.security?.rateLimitWindow || 900000, // 15 minutes default
  max: config?.security?.rateLimitMaxRequests || 100, // 100 requests default
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil((config?.security?.rateLimitWindow || 900000) / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id,
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(config.security.rateLimitWindow / 1000),
    });
  },
});

/**
 * File upload rate limiting (stricter)
 */
export const uploadRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per 15 minutes
  message: {
    error: 'Upload rate limit exceeded',
    message: 'Too many file uploads. Please wait before uploading again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * JSON parsing middleware with size limit
 */
export const jsonMiddleware = express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
});

/**
 * URL encoding middleware
 */
export const urlencodedMiddleware = express.urlencoded({
  extended: true,
  limit: '10mb',
});

/**
 * Compression middleware
 */
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress if response is larger than 1KB
});

/**
 * Health check middleware (bypass other middleware)
 */
export const healthCheckMiddleware = (req, res, next) => {
  if (req.path === '/health' || req.path === '/healthz') {
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.app.version,
      environment: config.app.env,
    });
  }
  next();
};

/**
 * Error handling middleware
 */
export const errorHandlingMiddleware = (error, req, res, next) => {
  // Log error
  errorLogger(error, req, res, () => {});
  
  // Default error response
  let statusCode = error.status || error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    if (error.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
  }
  
  // Prepare error response
  const errorResponse = {
    error: true,
    message,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };
  
  // Add stack trace in development
  if (config.app.env === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = error.details || null;
  }
  
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler middleware
 */
export const notFoundMiddleware = (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    requestId: req.id,
  });
  
  res.status(404).json({
    error: true,
    message: 'Route not found',
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Request timeout middleware
 */
export const timeoutMiddleware = (timeout = 30000) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          url: req.url,
          timeout,
          requestId: req.id,
        });

        res.status(408).json({
          error: true,
          message: 'Request timeout',
          requestId: req.id,
          timestamp: new Date().toISOString(),
        });
      }
    }, timeout);

    res.on('finish', () => {
      clearTimeout(timer);
    });

    next();
  };
};

/**
 * Apply all middleware to Express app
 */
export const applyMiddleware = (app) => {
  try {
    console.log('🔧 Applying middleware...');

    // Health check (before other middleware)
    app.use(healthCheckMiddleware);
    console.log('✅ Health check middleware applied');

    // Request ID
    app.use(requestId);
    console.log('✅ Request ID middleware applied');

    // Security
    app.use(securityMiddleware);
    console.log('✅ Security middleware applied');

    // CORS
    app.use(corsMiddleware);
    console.log('✅ CORS middleware applied');

    // Compression
    app.use(compressionMiddleware);
    console.log('✅ Compression middleware applied');

    // Rate limiting
    app.use(rateLimitMiddleware);
    console.log('✅ Rate limiting middleware applied');

    // Request timeout
    app.use(timeoutMiddleware(30000));
    console.log('✅ Timeout middleware applied');

    // Body parsing
    app.use(jsonMiddleware);
    app.use(urlencodedMiddleware);
    console.log('✅ Body parsing middleware applied');

    // Request logging
    if (config?.logging?.enableRequestLogging) {
      app.use(requestLogger);
      console.log('✅ Request logging middleware applied');
    }

    // Static files (uploads) - with safe path handling
    const uploadDir = config?.upload?.uploadDir || './uploads';
    app.use('/uploads', express.static(uploadDir));
    console.log('✅ Static files middleware applied');

    console.log('🎉 All middleware applied successfully');
    return app;
  } catch (error) {
    console.error('❌ Middleware application failed:', error.message);
    throw error;
  }
};

export default {
  requestId,
  corsMiddleware,
  securityMiddleware,
  rateLimitMiddleware,
  uploadRateLimitMiddleware,
  jsonMiddleware,
  urlencodedMiddleware,
  compressionMiddleware,
  healthCheckMiddleware,
  errorHandlingMiddleware,
  notFoundMiddleware,
  timeoutMiddleware,
  applyMiddleware,
};
