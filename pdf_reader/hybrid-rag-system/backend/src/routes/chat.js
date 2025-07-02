/**
 * Chat routes for streaming AI responses
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import config from '../config/index.js';
import logger, { loggers, PerformanceMonitor } from '../utils/logger.js';

const router = express.Router();

/**
 * Chat validation middleware
 */
const chatValidation = [
  body('message').isString().trim().isLength({ min: 1, max: 5000 }),
  body('session_id').optional().isString().trim(),
  body('user_id').optional().isString().trim(),
  body('search_type').optional().isIn(['vector', 'graph', 'hybrid']),
  body('include_sources').optional().isBoolean(),
  body('stream').optional().isBoolean(),
];

/**
 * POST /api/chat/message - Send a chat message
 */
router.post('/message', chatValidation, async (req, res) => {
  const monitor = new PerformanceMonitor('chat_message');
  
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

    const {
      message,
      session_id = 'default',
      user_id,
      search_type = 'hybrid',
      include_sources = true,
      stream = false
    } = req.body;

    // Forward to agent API
    const agentResponse = await axios.post(`${config.agent.url}/chat`, {
      message,
      session_id,
      user_id,
      search_type,
      include_sources,
      stream
    }, {
      timeout: config.agent.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': req.id,
      }
    });

    monitor.addMetric('agentResponseTime', agentResponse.headers['x-response-time']);
    const duration = monitor.end();

    // Return response
    res.json({
      ...agentResponse.data,
      requestId: req.id,
      processingTime: duration,
    });

    loggers.agent.responseReceived('/chat', duration, agentResponse.status);

  } catch (error) {
    monitor.end({ error: error.message });
    
    if (error.code === 'ECONNREFUSED') {
      logger.error('Agent service unavailable', { requestId: req.id });
      return res.status(503).json({
        error: 'Agent service unavailable',
        message: 'The AI agent is currently unavailable. Please try again later.',
        requestId: req.id,
      });
    }

    if (error.response) {
      // Agent returned an error
      logger.error('Agent error response', {
        status: error.response.status,
        data: error.response.data,
        requestId: req.id,
      });
      
      return res.status(error.response.status).json({
        error: 'Agent error',
        message: error.response.data.message || 'Agent processing failed',
        details: error.response.data,
        requestId: req.id,
      });
    }

    logger.error('Chat message failed', { 
      error: error.message,
      requestId: req.id 
    });

    res.status(500).json({
      error: 'Chat processing failed',
      message: error.message,
      requestId: req.id,
    });
  }
});

/**
 * POST /api/chat/stream - Stream a chat response
 */
router.post('/stream', chatValidation, async (req, res) => {
  const monitor = new PerformanceMonitor('chat_stream');
  
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

    const {
      message,
      session_id = 'default',
      user_id,
      search_type = 'hybrid',
      include_sources = true
    } = req.body;

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Request-ID': req.id,
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', requestId: req.id })}\n\n`);

    try {
      // Forward to agent streaming API
      const agentResponse = await axios.post(`${config.agent.url}/chat/stream`, {
        message,
        session_id,
        user_id,
        search_type,
        include_sources,
        stream: true
      }, {
        timeout: config.agent.timeout,
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': req.id,
        }
      });

      // Pipe agent stream to client
      agentResponse.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            // Forward the line as-is (agent should send proper SSE format)
            res.write(`${line}\n`);
          }
        }
      });

      agentResponse.data.on('end', () => {
        const duration = monitor.end();
        res.write(`data: ${JSON.stringify({ 
          type: 'end', 
          requestId: req.id,
          processingTime: duration 
        })}\n\n`);
        res.end();
        
        loggers.agent.responseReceived('/chat/stream', duration, agentResponse.status);
      });

      agentResponse.data.on('error', (error) => {
        monitor.end({ error: error.message });
        logger.error('Agent stream error', { error: error.message, requestId: req.id });
        
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: error.message,
          requestId: req.id 
        })}\n\n`);
        res.end();
      });

    } catch (streamError) {
      monitor.end({ error: streamError.message });
      
      if (streamError.code === 'ECONNREFUSED') {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: 'Agent service unavailable',
          requestId: req.id 
        })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: streamError.message,
          requestId: req.id 
        })}\n\n`);
      }
      res.end();
    }

    // Handle client disconnect
    req.on('close', () => {
      logger.debug('Client disconnected from stream', { requestId: req.id });
    });

  } catch (error) {
    monitor.end({ error: error.message });
    logger.error('Chat stream setup failed', { 
      error: error.message,
      requestId: req.id 
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Stream setup failed',
        message: error.message,
        requestId: req.id,
      });
    }
  }
});

/**
 * GET /api/chat/history/:sessionId - Get chat history
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID required',
        requestId: req.id,
      });
    }

    // Forward to agent API
    const agentResponse = await axios.get(
      `${config.agent.url}/chat/history/${sessionId}`,
      {
        params: { limit, offset },
        timeout: config.agent.timeout,
        headers: {
          'X-Request-ID': req.id,
        }
      }
    );

    res.json({
      ...agentResponse.data,
      requestId: req.id,
    });

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Agent service unavailable',
        requestId: req.id,
      });
    }

    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Agent error',
        message: error.response.data.message || 'Failed to get chat history',
        requestId: req.id,
      });
    }

    logger.error('Get chat history failed', { 
      error: error.message,
      sessionId: req.params.sessionId,
      requestId: req.id 
    });

    res.status(500).json({
      error: 'Failed to get chat history',
      message: error.message,
      requestId: req.id,
    });
  }
});

/**
 * DELETE /api/chat/history/:sessionId - Clear chat history
 */
router.delete('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID required',
        requestId: req.id,
      });
    }

    // Forward to agent API
    const agentResponse = await axios.delete(
      `${config.agent.url}/chat/history/${sessionId}`,
      {
        timeout: config.agent.timeout,
        headers: {
          'X-Request-ID': req.id,
        }
      }
    );

    res.json({
      ...agentResponse.data,
      requestId: req.id,
    });

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Agent service unavailable',
        requestId: req.id,
      });
    }

    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Agent error',
        message: error.response.data.message || 'Failed to clear chat history',
        requestId: req.id,
      });
    }

    logger.error('Clear chat history failed', { 
      error: error.message,
      sessionId: req.params.sessionId,
      requestId: req.id 
    });

    res.status(500).json({
      error: 'Failed to clear chat history',
      message: error.message,
      requestId: req.id,
    });
  }
});

export default router;
