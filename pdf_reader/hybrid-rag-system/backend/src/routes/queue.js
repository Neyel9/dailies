/**
 * Queue management routes for monitoring and controlling background jobs
 */

import express from 'express';
// Queue service functions will be imported dynamically when needed
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Get queue service functions dynamically to avoid import-time Redis connection
 */
async function getQueueFunctions() {
  try {
    const queueModule = await import('../services/queue.js');
    return {
      getQueue: queueModule.getQueue,
      getJobCounts: queueModule.getJobCounts,
      getJob: queueModule.getJob,
      removeJob: queueModule.removeJob,
      retryJob: queueModule.retryJob
    };
  } catch (error) {
    logger.error('Failed to import queue service', { error: error.message });
    throw new Error('Queue service not available');
  }
}

/**
 * Get queue statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { getQueue, getJobCounts } = await getQueueFunctions();
    const queue = getQueue();
    const counts = await getJobCounts();
    
    const stats = {
      name: queue.name,
      counts,
      isPaused: await queue.isPaused(),
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    if (error.message === 'Queue service not available') {
      res.status(503).json({
        success: false,
        error: 'Queue service unavailable',
        message: 'Background processing is currently disabled'
      });
    } else {
      logger.error('Failed to get queue stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get queue statistics',
        message: error.message,
      });
    }
  }
});

/**
 * Get job details by ID
 */
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { getJob } = await getQueueFunctions();
    const job = await getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId,
      });
    }

    const jobData = {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      opts: job.opts,
    };

    res.json({
      success: true,
      data: jobData,
    });
  } catch (error) {
    logger.error('Failed to get job details', { 
      jobId: req.params.jobId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get job details',
      message: error.message,
    });
  }
});

/**
 * Get recent jobs with pagination
 */
router.get('/jobs', async (req, res) => {
  try {
    const { 
      status = 'all', 
      page = 1, 
      limit = 20,
      start = 0,
      end = -1 
    } = req.query;

    const queue = getQueue();
    let jobs = [];

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIdx = (pageNum - 1) * limitNum;
    const endIdx = startIdx + limitNum - 1;

    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(startIdx, endIdx);
        break;
      case 'active':
        jobs = await queue.getActive(startIdx, endIdx);
        break;
      case 'completed':
        jobs = await queue.getCompleted(startIdx, endIdx);
        break;
      case 'failed':
        jobs = await queue.getFailed(startIdx, endIdx);
        break;
      case 'delayed':
        jobs = await queue.getDelayed(startIdx, endIdx);
        break;
      default:
        // Get all jobs (this might be expensive for large queues)
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(0, limitNum / 5),
          queue.getActive(0, limitNum / 5),
          queue.getCompleted(0, limitNum / 5),
          queue.getFailed(0, limitNum / 5),
          queue.getDelayed(0, limitNum / 5),
        ]);
        jobs = [...waiting, ...active, ...completed, ...failed, ...delayed];
    }

    const jobsData = jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
    }));

    res.json({
      success: true,
      data: {
        jobs: jobsData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: jobs.length,
        },
        status,
      },
    });
  } catch (error) {
    logger.error('Failed to get jobs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get jobs',
      message: error.message,
    });
  }
});

/**
 * Retry a failed job
 */
router.post('/job/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await retryJob(jobId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or cannot be retried',
        jobId,
      });
    }

    res.json({
      success: true,
      message: 'Job queued for retry',
      jobId,
    });
  } catch (error) {
    logger.error('Failed to retry job', { 
      jobId: req.params.jobId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retry job',
      message: error.message,
    });
  }
});

/**
 * Remove a job from the queue
 */
router.delete('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await removeJob(jobId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId,
      });
    }

    res.json({
      success: true,
      message: 'Job removed successfully',
      jobId,
    });
  } catch (error) {
    logger.error('Failed to remove job', { 
      jobId: req.params.jobId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove job',
      message: error.message,
    });
  }
});

/**
 * Pause the queue
 */
router.post('/pause', async (req, res) => {
  try {
    const queue = getQueue();
    await queue.pause();

    res.json({
      success: true,
      message: 'Queue paused successfully',
    });
  } catch (error) {
    logger.error('Failed to pause queue', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to pause queue',
      message: error.message,
    });
  }
});

/**
 * Resume the queue
 */
router.post('/resume', async (req, res) => {
  try {
    const queue = getQueue();
    await queue.resume();

    res.json({
      success: true,
      message: 'Queue resumed successfully',
    });
  } catch (error) {
    logger.error('Failed to resume queue', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to resume queue',
      message: error.message,
    });
  }
});

/**
 * Clean completed jobs
 */
router.post('/clean', async (req, res) => {
  try {
    const { 
      grace = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      status = 'completed',
      limit = 100 
    } = req.body;

    const queue = getQueue();
    let cleanedCount = 0;

    switch (status) {
      case 'completed':
        cleanedCount = await queue.clean(grace, limit, 'completed');
        break;
      case 'failed':
        cleanedCount = await queue.clean(grace, limit, 'failed');
        break;
      case 'active':
        cleanedCount = await queue.clean(grace, limit, 'active');
        break;
      default:
        throw new Error(`Invalid status: ${status}`);
    }

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} ${status} jobs`,
      cleanedCount,
      status,
    });
  } catch (error) {
    logger.error('Failed to clean queue', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to clean queue',
      message: error.message,
    });
  }
});

export default router;
