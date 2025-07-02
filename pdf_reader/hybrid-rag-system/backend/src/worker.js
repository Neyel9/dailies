/**
 * Background worker for processing PDF files using BullMQ
 */

import { Worker } from 'bullmq';
import axios from 'axios';
import config from './config/index.js';
import logger, { loggers } from './utils/logger.js';
import { createRedisConnection } from './services/queue.js';

/**
 * PDF processing worker
 */
class PDFWorker {
  constructor() {
    this.connection = createRedisConnection();
    this.worker = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the worker
   */
  async initialize() {
    try {
      this.worker = new Worker(
        config.queue.name,
        this.processJob.bind(this),
        {
          connection: this.connection,
          concurrency: config.queue.concurrency,
          removeOnComplete: config.queue.removeOnComplete,
          removeOnFail: config.queue.removeOnFail,
        }
      );

      // Set up event listeners
      this.setupEventListeners();

      logger.info('PDF processing worker initialized', {
        queueName: config.queue.name,
        concurrency: config.queue.concurrency,
      });

    } catch (error) {
      logger.error('Failed to initialize PDF worker', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up worker event listeners
   */
  setupEventListeners() {
    this.worker.on('completed', (job, returnvalue) => {
      loggers.queue.jobCompleted(job.id, 'pdf_processing', returnvalue?.duration || 0);
    });

    this.worker.on('failed', (job, err) => {
      loggers.queue.jobFailed(job.id, 'pdf_processing', err);
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug('Job progress update', { 
        jobId: job.id, 
        progress: progress 
      });
    });

    this.worker.on('error', (error) => {
      logger.error('Worker error', { error: error.message });
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn('Job stalled', { jobId });
    });
  }

  /**
   * Process a PDF job
   */
  async processJob(job) {
    const startTime = Date.now();
    
    try {
      loggers.queue.jobStarted(job.id, 'pdf_processing');
      
      const {
        filename,
        originalName,
        path: filePath,
        size,
        mimetype,
        userId,
        sessionId,
        metadata = {}
      } = job.data;

      logger.info('Processing PDF job', {
        jobId: job.id,
        filename: originalName,
        size,
        userId,
      });

      // Update progress: Starting
      await job.updateProgress(10);

      // Validate file exists
      if (!filePath) {
        throw new Error('File path is required');
      }

      // Update progress: Sending to agent
      await job.updateProgress(20);

      // Send to agent for processing
      const agentResponse = await axios.post(
        `${config.agent.url}/process/pdf`,
        {
          file_path: filePath,
          filename,
          original_name: originalName,
          metadata: {
            ...metadata,
            userId,
            sessionId,
            jobId: job.id,
            queuedAt: job.timestamp,
            startedAt: startTime,
          }
        },
        {
          timeout: config.agent.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Job-ID': job.id,
          }
        }
      );

      // Update progress: Processing complete
      await job.updateProgress(90);

      const result = agentResponse.data;
      const duration = Date.now() - startTime;

      // Update progress: Finalizing
      await job.updateProgress(100);

      // Return processing result
      const jobResult = {
        success: result.success,
        document_id: result.document_id,
        chunks_created: result.chunks_created,
        entities_extracted: result.entities_extracted,
        relationships_created: result.relationships_created,
        processing_time_ms: result.processing_time_ms,
        total_time_ms: duration,
        filename: originalName,
        file_size: size,
        job_id: job.id,
        completed_at: new Date().toISOString(),
      };

      logger.info('PDF processing completed', {
        jobId: job.id,
        filename: originalName,
        duration: `${duration}ms`,
        chunks: result.chunks_created,
        entities: result.entities_extracted,
      });

      return jobResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('PDF processing failed', {
        jobId: job.id,
        filename: job.data.originalName,
        error: error.message,
        duration: `${duration}ms`,
      });

      // Handle specific error types
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Agent service unavailable');
      }

      if (error.response) {
        const agentError = error.response.data;
        throw new Error(agentError.message || 'Agent processing failed');
      }

      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down PDF worker...');

    try {
      if (this.worker) {
        await this.worker.close();
        logger.info('Worker closed');
      }

      if (this.connection) {
        await this.connection.quit();
        logger.info('Redis connection closed');
      }

      logger.info('PDF worker shutdown complete');
    } catch (error) {
      logger.error('Error during worker shutdown', { error: error.message });
    }
  }
}

/**
 * Create and start the worker
 */
async function startWorker() {
  const worker = new PDFWorker();
  
  try {
    await worker.initialize();
    
    // Handle graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down worker...`);
      await worker.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception in worker', { 
        error: error.message, 
        stack: error.stack 
      });
      await worker.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled promise rejection in worker', { 
        reason: reason?.message || reason,
        promise: promise.toString(),
      });
      await worker.shutdown();
      process.exit(1);
    });

    logger.info('PDF processing worker started successfully');

  } catch (error) {
    logger.error('Failed to start PDF worker', { error: error.message });
    process.exit(1);
  }
}

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}

export { PDFWorker, startWorker };
export default PDFWorker;
