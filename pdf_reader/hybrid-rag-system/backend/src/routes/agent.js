/**
 * Agent service routes for communicating with the Python AI agent
 */

import express from 'express';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Agent service base URL
 */
const AGENT_BASE_URL = `http://${config.agent.host}:${config.agent.port}`;

/**
 * Forward request to agent service
 */
async function forwardToAgent(req, res, endpoint, method = 'GET') {
  try {
    const url = `${AGENT_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers,
      },
    };

    if (method !== 'GET' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Agent service error: ${response.status} ${response.statusText}`);
    }

    res.status(response.status).json(data);
  } catch (error) {
    logger.error('Failed to communicate with agent service', {
      endpoint,
      method,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Agent service unavailable',
      message: error.message,
    });
  }
}

/**
 * Check agent service health
 */
router.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${AGENT_BASE_URL}/health`, {
      method: 'GET',
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        agent: data,
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error(`Health check failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('Agent health check failed', { error: error.message });
    res.status(503).json({
      success: false,
      error: 'Agent service unavailable',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Search documents using the agent
 */
router.post('/search', async (req, res) => {
  await forwardToAgent(req, res, '/search', 'POST');
});

/**
 * Process a document through the agent
 */
router.post('/process', async (req, res) => {
  await forwardToAgent(req, res, '/process', 'POST');
});

/**
 * Get agent configuration
 */
router.get('/config', async (req, res) => {
  await forwardToAgent(req, res, '/config', 'GET');
});

/**
 * Update agent configuration
 */
router.put('/config', async (req, res) => {
  await forwardToAgent(req, res, '/config', 'PUT');
});

/**
 * Get agent statistics
 */
router.get('/stats', async (req, res) => {
  await forwardToAgent(req, res, '/stats', 'GET');
});

/**
 * Chat with the agent
 */
router.post('/chat', async (req, res) => {
  await forwardToAgent(req, res, '/chat', 'POST');
});

/**
 * Stream chat with the agent
 */
router.post('/chat/stream', async (req, res) => {
  try {
    const url = `${AGENT_BASE_URL}/chat/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      throw new Error(`Agent service error: ${response.status} ${response.statusText}`);
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Forward the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    logger.error('Failed to stream chat with agent', { error: error.message });
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to stream chat',
        message: error.message,
      });
    } else {
      res.write(`data: ${JSON.stringify({
        error: 'Stream interrupted',
        message: error.message,
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * Get document embeddings
 */
router.post('/embeddings', async (req, res) => {
  await forwardToAgent(req, res, '/embeddings', 'POST');
});

/**
 * Get knowledge graph data
 */
router.get('/graph', async (req, res) => {
  await forwardToAgent(req, res, '/graph', 'GET');
});

/**
 * Query knowledge graph
 */
router.post('/graph/query', async (req, res) => {
  await forwardToAgent(req, res, '/graph/query', 'POST');
});

/**
 * Get vector search results
 */
router.post('/vector/search', async (req, res) => {
  await forwardToAgent(req, res, '/vector/search', 'POST');
});

/**
 * Get hybrid search results (vector + graph)
 */
router.post('/hybrid/search', async (req, res) => {
  await forwardToAgent(req, res, '/hybrid/search', 'POST');
});

/**
 * Get agent tools information
 */
router.get('/tools', async (req, res) => {
  await forwardToAgent(req, res, '/tools', 'GET');
});

/**
 * Execute a specific tool
 */
router.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  await forwardToAgent(req, res, `/tools/${toolName}`, 'POST');
});

/**
 * Get agent models information
 */
router.get('/models', async (req, res) => {
  await forwardToAgent(req, res, '/models', 'GET');
});

/**
 * Switch agent model
 */
router.post('/models/switch', async (req, res) => {
  await forwardToAgent(req, res, '/models/switch', 'POST');
});

/**
 * Clear agent memory/context
 */
router.post('/clear', async (req, res) => {
  await forwardToAgent(req, res, '/clear', 'POST');
});

/**
 * Get agent version and info
 */
router.get('/info', async (req, res) => {
  await forwardToAgent(req, res, '/info', 'GET');
});

export default router;
