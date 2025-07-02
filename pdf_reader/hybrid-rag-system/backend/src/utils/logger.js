/**
 * Centralized logging utility for Hybrid RAG Backend
 */

import winston from 'winston';
import config from '../config/index.js';

/**
 * Custom log format for development
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

/**
 * Production log format (JSON)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: config.app.env === 'production' ? productionFormat : developmentFormat,
  defaultMeta: {
    service: config.app.name,
    version: config.app.version,
    environment: config.app.env,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add file transport for production
if (config.app.env === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.id,
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.id,
    });
  });
  
  next();
};

/**
 * Error logging middleware
 */
export const errorLogger = (error, req, res, next) => {
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    requestId: req.id,
  });
  
  next(error);
};

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  constructor(operation) {
    this.operation = operation;
    this.startTime = Date.now();
    this.metrics = {};
  }
  
  addMetric(name, value) {
    this.metrics[name] = value;
    return this;
  }
  
  end(additionalData = {}) {
    const duration = Date.now() - this.startTime;
    
    logger.info('Performance metric', {
      operation: this.operation,
      duration: `${duration}ms`,
      ...this.metrics,
      ...additionalData,
    });
    
    return duration;
  }
}

/**
 * Structured logging helpers
 */
export const loggers = {
  // File processing logs
  fileProcessing: {
    started: (filename, fileSize) => {
      logger.info('File processing started', {
        filename,
        fileSize,
        operation: 'file_processing',
      });
    },
    
    completed: (filename, duration, chunks) => {
      logger.info('File processing completed', {
        filename,
        duration: `${duration}ms`,
        chunksCreated: chunks,
        operation: 'file_processing',
      });
    },
    
    failed: (filename, error) => {
      logger.error('File processing failed', {
        filename,
        error: error.message,
        stack: error.stack,
        operation: 'file_processing',
      });
    },
  },
  
  // Queue operation logs
  queue: {
    jobAdded: (jobId, jobType, data) => {
      logger.info('Queue job added', {
        jobId,
        jobType,
        data,
        operation: 'queue',
      });
    },
    
    jobStarted: (jobId, jobType) => {
      logger.info('Queue job started', {
        jobId,
        jobType,
        operation: 'queue',
      });
    },
    
    jobCompleted: (jobId, jobType, duration) => {
      logger.info('Queue job completed', {
        jobId,
        jobType,
        duration: `${duration}ms`,
        operation: 'queue',
      });
    },
    
    jobFailed: (jobId, jobType, error) => {
      logger.error('Queue job failed', {
        jobId,
        jobType,
        error: error.message,
        stack: error.stack,
        operation: 'queue',
      });
    },
  },
  
  // Agent communication logs
  agent: {
    requestSent: (endpoint, data) => {
      logger.info('Agent request sent', {
        endpoint,
        dataSize: JSON.stringify(data).length,
        operation: 'agent_communication',
      });
    },
    
    responseReceived: (endpoint, duration, statusCode) => {
      logger.info('Agent response received', {
        endpoint,
        duration: `${duration}ms`,
        statusCode,
        operation: 'agent_communication',
      });
    },
    
    requestFailed: (endpoint, error) => {
      logger.error('Agent request failed', {
        endpoint,
        error: error.message,
        operation: 'agent_communication',
      });
    },
  },
  
  // Database operation logs
  database: {
    connected: (database) => {
      logger.info('Database connected', {
        database,
        operation: 'database',
      });
    },
    
    disconnected: (database) => {
      logger.info('Database disconnected', {
        database,
        operation: 'database',
      });
    },
    
    queryExecuted: (database, operation, duration) => {
      logger.debug('Database query executed', {
        database,
        operation,
        duration: `${duration}ms`,
      });
    },
    
    error: (database, operation, error) => {
      logger.error('Database error', {
        database,
        operation,
        error: error.message,
        stack: error.stack,
      });
    },
  },
};

export default logger;
