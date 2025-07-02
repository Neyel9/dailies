/**
 * File upload routes for PDF processing
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import config from '../config/index.js';
import logger, { loggers, PerformanceMonitor } from '../utils/logger.js';
import { uploadRateLimitMiddleware } from '../middleware/index.js';
// Queue service will be imported dynamically when needed

const router = express.Router();

/**
 * Get queue service dynamically to avoid import-time Redis connection
 */
async function getQueueService() {
  try {
    const { pdfQueue } = await import('../services/queue.js');
    return pdfQueue;
  } catch (error) {
    logger.error('Failed to import queue service', { error: error.message });
    throw new Error('Queue service not available');
  }
}

/**
 * Configure multer for file uploads
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Ensure upload directory exists
      await fs.mkdir(config.upload.uploadDir, { recursive: true });
      cb(null, config.upload.uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    const filename = `${uniqueId}${ext}`;
    cb(null, filename);
  },
});

/**
 * File filter for PDF uploads
 */
const fileFilter = (req, file, cb) => {
  // Check file type
  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    const error = new Error(`File type ${file.mimetype} not allowed`);
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.pdf') {
    const error = new Error('Only PDF files are allowed');
    error.code = 'INVALID_FILE_EXTENSION';
    return cb(error, false);
  }

  cb(null, true);
};

/**
 * Parse file size limit
 */
function parseFileSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  
  if (!match) {
    throw new Error('Invalid file size format');
  }
  
  const [, size, unit] = match;
  return parseFloat(size) * units[unit.toUpperCase()];
}

/**
 * Configure multer upload
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseFileSize(config.upload.maxFileSize),
    files: 1, // Only one file at a time
  },
});

/**
 * Upload validation middleware
 */
const uploadValidation = [
  body('userId').optional().isString().trim(),
  body('sessionId').optional().isString().trim(),
  body('metadata').optional().isJSON(),
];

/**
 * POST /api/upload/pdf - Upload PDF file
 */
router.post('/pdf', 
  uploadRateLimitMiddleware,
  upload.single('pdf'),
  uploadValidation,
  async (req, res) => {
    const monitor = new PerformanceMonitor('pdf_upload');
    
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
          requestId: req.id,
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a PDF file to upload',
          requestId: req.id,
        });
      }

      const file = req.file;
      const { userId, sessionId, metadata } = req.body;

      // Log file upload
      loggers.fileProcessing.started(file.originalname, file.size);

      // Parse metadata if provided
      let parsedMetadata = {};
      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch (error) {
          logger.warn('Invalid metadata JSON', { metadata, error: error.message });
        }
      }

      // Add job to processing queue
      const pdfQueue = await getQueueService();
      const jobResult = await pdfQueue.addPDFProcessingJob({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
      }, {
        userId,
        sessionId,
        metadata: parsedMetadata,
        uploadedBy: req.ip,
        requestId: req.id,
      });

      monitor.addMetric('fileSize', file.size);
      monitor.addMetric('jobId', jobResult.jobId);
      const duration = monitor.end();

      // Return success response
      res.status(202).json({
        success: true,
        message: 'File uploaded and queued for processing',
        data: {
          jobId: jobResult.jobId,
          filename: file.originalname,
          size: file.size,
          status: 'queued',
          estimatedProcessingTime: Math.ceil(file.size / 1024 / 1024) * 30, // ~30s per MB
        },
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });

      loggers.fileProcessing.completed(file.originalname, duration, 0);

    } catch (error) {
      monitor.end({ error: error.message });
      
      // Clean up uploaded file on error
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.error('Failed to clean up uploaded file', { 
            file: req.file.path,
            error: cleanupError.message 
          });
        }
      }

      logger.error('File upload failed', { 
        error: error.message,
        requestId: req.id 
      });

      res.status(500).json({
        error: 'Upload failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/upload/status/:jobId - Get upload/processing status
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        error: 'Job ID required',
        requestId: req.id,
      });
    }

    // Get job status from queue
    const pdfQueue = await getQueueService();
    const jobStatus = await pdfQueue.getJobStatus(jobId);

    if (jobStatus.status === 'not_found') {
      return res.status(404).json({
        error: 'Job not found',
        message: 'The specified job ID does not exist',
        requestId: req.id,
      });
    }

    // Map internal status to user-friendly status
    const statusMap = {
      waiting: 'queued',
      active: 'processing',
      completed: 'completed',
      failed: 'failed',
      delayed: 'delayed',
    };

    const response = {
      jobId: jobStatus.id,
      status: statusMap[jobStatus.status] || jobStatus.status,
      progress: jobStatus.progress || 0,
      data: {
        filename: jobStatus.data?.originalName,
        uploadedAt: jobStatus.data?.uploadedAt,
        processedOn: jobStatus.processedOn,
        finishedOn: jobStatus.finishedOn,
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    // Add error details if failed
    if (jobStatus.status === 'failed') {
      response.error = {
        message: jobStatus.failedReason,
        failedAt: jobStatus.finishedOn,
      };
    }

    // Add results if completed
    if (jobStatus.status === 'completed' && jobStatus.returnvalue) {
      response.results = jobStatus.returnvalue;
    }

    res.json(response);

  } catch (error) {
    logger.error('Failed to get job status', { 
      jobId: req.params.jobId,
      error: error.message,
      requestId: req.id 
    });

    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/upload/history - Get upload history (with pagination)
 */
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    
    // Get queue statistics
    const pdfQueue = await getQueueService();
    const stats = await pdfQueue.getQueueStats();

    // For now, return basic stats (in a real implementation, you'd query a database)
    res.json({
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: stats.total,
      },
      filters: {
        status,
        userId,
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get upload history', { 
      error: error.message,
      requestId: req.id 
    });

    res.status(500).json({
      error: 'Failed to get history',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
