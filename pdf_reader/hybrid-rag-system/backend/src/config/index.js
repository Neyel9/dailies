/**
 * Configuration management for Hybrid RAG Backend
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

/**
 * Application configuration object
 */
export const config = {
  // Application settings
  app: {
    name: 'Hybrid RAG Backend',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.APP_PORT) || 8000,
    host: process.env.APP_HOST || '0.0.0.0',
  },

  // Database connections
  databases: {
    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: process.env.QDRANT_COLLECTION_NAME || 'hybrid_rag_documents',
      timeout: 30000,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB) || 0,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    },
  },

  // LLM Provider settings
  llm: {
    provider: process.env.LLM_PROVIDER || 'openai',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 4000,
  },

  // Embedding settings
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'openai',
    baseUrl: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.EMBEDDING_API_KEY,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536,
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 100,
  },

  // File upload settings
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '50MB',
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'application/pdf').split(','),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    tempDir: process.env.TEMP_DIR || './temp',
  },

  // PDF processing settings
  processing: {
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 200,
    maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE) || 2000,
    enableOcr: process.env.ENABLE_OCR === 'true',
    ocrLanguage: process.env.OCR_LANGUAGE || 'eng',
  },

  // Queue settings
  queue: {
    name: process.env.QUEUE_NAME || 'pdf_processing',
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 3,
    retryAttempts: parseInt(process.env.QUEUE_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.QUEUE_RETRY_DELAY) || 5000,
    removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 100,
    removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL) || 50,
  },

  // Agent API settings
  agent: {
    url: process.env.AGENT_API_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.AGENT_TIMEOUT) || 300000,
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES) || 3,
  },

  // Security settings
  security: {
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 3600,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
    enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
  },

  // Development settings
  development: {
    enableDebugMode: process.env.ENABLE_DEBUG_MODE === 'true',
    enableHotReload: process.env.ENABLE_HOT_RELOAD === 'true',
    enableSourceMaps: process.env.ENABLE_SOURCE_MAPS === 'true',
    mockLlmResponses: process.env.MOCK_LLM_RESPONSES === 'true',
  },

  // Search settings
  search: {
    defaultLimit: parseInt(process.env.DEFAULT_SEARCH_LIMIT) || 10,
    vectorThreshold: parseFloat(process.env.VECTOR_SEARCH_THRESHOLD) || 0.7,
    graphDepth: parseInt(process.env.GRAPH_SEARCH_DEPTH) || 3,
    enableVectorSearch: process.env.ENABLE_VECTOR_SEARCH !== 'false',
    enableGraphSearch: process.env.ENABLE_GRAPH_SEARCH !== 'false',
    enableHybridSearch: process.env.ENABLE_HYBRID_SEARCH !== 'false',
  },
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const required = [
    'LLM_API_KEY',
    'EMBEDDING_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate file size format
  if (config.upload.maxFileSize && !config.upload.maxFileSize.match(/^\d+[KMGT]?B$/i)) {
    throw new Error('Invalid MAX_FILE_SIZE format. Use format like "50MB", "1GB", etc.');
  }

  // Validate URLs
  try {
    new URL(config.databases.qdrant.url);
    new URL(config.llm.baseUrl);
    new URL(config.embedding.baseUrl);
    new URL(config.agent.url);
  } catch (error) {
    throw new Error(`Invalid URL in configuration: ${error.message}`);
  }
}

/**
 * Get configuration for specific environment
 */
export function getEnvConfig() {
  const env = config.app.env;
  
  const envConfigs = {
    development: {
      logging: { level: 'debug' },
      development: { enableDebugMode: true },
    },
    production: {
      logging: { level: 'warn' },
      development: { enableDebugMode: false },
      security: { rateLimitMaxRequests: 50 },
    },
    test: {
      logging: { level: 'error' },
      development: { mockLlmResponses: true },
    },
  };

  return { ...config, ...envConfigs[env] };
}

export default config;
