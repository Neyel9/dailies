/**
 * Queue service for background PDF processing using BullMQ
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import config from '../config/index.js';
import logger, { loggers } from '../utils/logger.js';

/**
 * Redis connection configuration
 */
const redisConfig = {
  host: config.databases.redis.host,
  port: config.databases.redis.port,
  password: config.databases.redis.password || undefined,
  db: config.databases.redis.db,
  maxRetriesPerRequest: config.databases.redis.maxRetriesPerRequest,
  retryDelayOnFailover: config.databases.redis.retryDelayOnFailover,
  lazyConnect: true,
};

/**
 * Create Redis connection with proper error handling
 */
export const createRedisConnection = () => {
  const redis = new IORedis({
    ...redisConfig,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryDelayOnFailover: 100,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });

  redis.on('connect', () => {
    loggers.database.connected('Redis');
  });

  redis.on('error', (error) => {
    loggers.database.error('Redis', 'connection', error);
  });

  redis.on('close', () => {
    loggers.database.disconnected('Redis');
  });

  redis.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return redis;
};

/**
 * PDF Processing Queue
 */
class PDFProcessingQueue {
  constructor() {
    this.connection = null;
    this.queue = null;
    this.worker = null;
    this.events = null;
    this.isInitialized = false;
  }

  /**
   * Initialize queue, worker, and events with proper error handling
   */
  async initialize() {
    if (this.isInitialized) {
      return { success: true, message: 'Queue already initialized' };
    }

    try {
      // Create Redis connection
      this.connection = createRedisConnection();

      // Test Redis connection with aggressive timeout
      const pingPromise = this.connection.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 1000)
      );

      await Promise.race([pingPromise, timeoutPromise]);
      logger.info('Redis connection established');

      // Create queue
      this.queue = new Queue(config.queue.name, {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: config.queue.removeOnComplete,
          removeOnFail: config.queue.removeOnFail,
          attempts: config.queue.retryAttempts,
          backoff: {
            type: 'exponential',
            delay: config.queue.retryDelay,
          },
        },
      });

      // Create queue events listener
      this.events = new QueueEvents(config.queue.name, {
        connection: this.connection,
      });

      // Set up event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('PDF processing queue initialized successfully');
      return { success: true, message: 'Queue initialized successfully' };

    } catch (error) {
      logger.warn('Queue service unavailable - continuing without background processing', {
        error: error.message,
        redisHost: config.databases.redis.host,
        redisPort: config.databases.redis.port
      });

      this.isInitialized = false;
      return {
        success: false,
        message: 'Queue service unavailable',
        error: error.message
      };
    }
  }

  /**
   * Set up queue event listeners
   */
  setupEventListeners() {
    this.events.on('completed', ({ jobId, returnvalue }) => {
      loggers.queue.jobCompleted(jobId, 'pdf_processing', returnvalue?.duration || 0);
    });

    this.events.on('failed', ({ jobId, failedReason }) => {
      loggers.queue.jobFailed(jobId, 'pdf_processing', new Error(failedReason));
    });

    this.events.on('progress', ({ jobId, data }) => {
      logger.debug('Job progress update', { jobId, progress: data });
    });
  }

  /**
   * Add PDF processing job to queue
   */
  async addPDFProcessingJob(fileData, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const jobData = {
      filename: fileData.filename,
      originalName: fileData.originalName,
      path: fileData.path,
      size: fileData.size,
      mimetype: fileData.mimetype,
      uploadedAt: new Date().toISOString(),
      userId: options.userId || null,
      sessionId: options.sessionId || null,
      ...options,
    };

    try {
      const job = await this.queue.add('process_pdf', jobData, {
        priority: options.priority || 0,
        delay: options.delay || 0,
        jobId: options.jobId || undefined,
      });

      loggers.queue.jobAdded(job.id, 'pdf_processing', jobData);
      
      return {
        jobId: job.id,
        status: 'queued',
        data: jobData,
      };
    } catch (error) {
      logger.error('Failed to add PDF processing job', { 
        error: error.message,
        fileData 
      });
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      const progress = job.progress;
      
      return {
        id: job.id,
        status: state,
        progress,
        data: job.data,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        returnvalue: job.returnvalue,
      };
    } catch (error) {
      logger.error('Failed to get job status', { jobId, error: error.message });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length,
      };
    } catch (error) {
      logger.error('Failed to get queue stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean old jobs
   */
  async cleanJobs(grace = 24 * 60 * 60 * 1000) { // 24 hours
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const results = await this.queue.clean(grace, 100, 'completed');
      logger.info('Cleaned old jobs', { cleaned: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to clean jobs', { error: error.message });
      throw error;
    }
  }

  /**
   * Pause queue
   */
  async pause() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resume queue
   */
  async resume() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * Close queue connections
   */
  async close() {
    if (!this.isInitialized) {
      return;
    }

    try {
      if (this.worker) {
        await this.worker.close();
      }
      
      if (this.events) {
        await this.events.close();
      }
      
      if (this.queue) {
        await this.queue.close();
      }
      
      if (this.connection) {
        await this.connection.quit();
      }

      this.isInitialized = false;
      logger.info('PDF processing queue closed');
    } catch (error) {
      logger.error('Error closing queue', { error: error.message });
    }
  }
}

// Create singleton instance
export const pdfQueue = new PDFProcessingQueue();

/**
 * Initialize queue with proper error handling
 */
export const initializeQueue = async () => {
  return await pdfQueue.initialize();
};

/**
 * Graceful shutdown
 */
export const shutdownQueue = async () => {
  await pdfQueue.close();
};

/**
 * Export additional functions for route handlers with proper error handling
 */
export const getQueue = () => {
  if (!pdfQueue.isInitialized || !pdfQueue.queue) {
    throw new Error('Queue service not available');
  }
  return pdfQueue.queue;
};

export const getJobCounts = async () => {
  if (!pdfQueue.isInitialized) {
    throw new Error('Queue service not available');
  }
  return await pdfQueue.getQueueStats();
};

export const getJob = async (jobId) => {
  if (!pdfQueue.isInitialized) {
    throw new Error('Queue service not available');
  }
  return await pdfQueue.queue.getJob(jobId);
};

export const removeJob = async (jobId) => {
  if (!pdfQueue.isInitialized) {
    throw new Error('Queue service not available');
  }
  const job = await getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
};

export const retryJob = async (jobId) => {
  if (!pdfQueue.isInitialized) {
    throw new Error('Queue service not available');
  }
  const job = await getJob(jobId);
  if (job && job.failedReason) {
    await job.retry();
    return true;
  }
  return false;
};

// Handle process termination
process.on('SIGTERM', shutdownQueue);
process.on('SIGINT', shutdownQueue);

export default pdfQueue;
