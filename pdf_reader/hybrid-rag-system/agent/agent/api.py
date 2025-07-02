"""
FastAPI application for the Hybrid RAG Agent
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import uvicorn

from .config import config, validate_config
from .models import (
    ChatRequest, ChatResponse, SearchRequest, SearchResponse,
    HealthStatus, AgentStatus, AgentCapability, StreamDelta
)
from .agent import rag_agent, AgentDependencies, process_chat_request, process_search_request
from .database import initialize_databases, close_databases, health_check
from .providers import validate_model_config
from ..ingestion.pipeline import process_pdf_file, validate_ingestion_pipeline

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.logging.level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Hybrid RAG Agent API...")
    
    try:
        # Validate configuration
        validate_config()
        logger.info("Configuration validated")
        
        # Validate model configuration
        if not validate_model_config():
            raise RuntimeError("Model configuration validation failed")
        
        # Initialize databases
        await initialize_databases()
        logger.info("Databases initialized")
        
        # Validate pipeline
        pipeline_status = await validate_ingestion_pipeline()
        logger.info(f"Pipeline validation: {pipeline_status}")
        
        logger.info("Hybrid RAG Agent API started successfully")
        
    except Exception as error:
        logger.error(f"Failed to start application: {error}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Hybrid RAG Agent API...")
    try:
        await close_databases()
        logger.info("Databases closed")
    except Exception as error:
        logger.error(f"Error during shutdown: {error}")

# Create FastAPI application
app = FastAPI(
    title="Hybrid RAG Agent API",
    description="AI Agent with Vector Search and Knowledge Graph Integration",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.security.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to create agent dependencies
async def get_agent_deps(
    session_id: str = "default",
    user_id: str = None
) -> AgentDependencies:
    """Create agent dependencies"""
    return AgentDependencies(
        session_id=session_id,
        user_id=user_id
    )

# ============================================================================
# Health and Status Endpoints
# ============================================================================

@app.get("/health", response_model=HealthStatus)
async def health_endpoint():
    """Health check endpoint"""
    try:
        # Check database connections
        db_health = await health_check()
        
        # Determine overall status
        all_healthy = all(db_health.values())
        status = "healthy" if all_healthy else "degraded"
        
        return HealthStatus(
            status=status,
            version="1.0.0",
            uptime_seconds=0.0,  # Could be enhanced with actual uptime
            checks=db_health
        )
    except Exception as error:
        logger.error(f"Health check failed: {error}")
        raise HTTPException(status_code=503, detail="Service unavailable")

@app.get("/status", response_model=AgentStatus)
async def status_endpoint():
    """Get agent status and capabilities"""
    try:
        db_health = await health_check()
        
        capabilities = [
            AgentCapability.VECTOR_SEARCH,
            AgentCapability.HYBRID_SEARCH,
            AgentCapability.DOCUMENT_RETRIEVAL,
        ]
        
        if db_health.get("neo4j", False):
            capabilities.extend([
                AgentCapability.GRAPH_SEARCH,
                AgentCapability.ENTITY_EXTRACTION,
                AgentCapability.RELATIONSHIP_MAPPING,
            ])
        
        return AgentStatus(
            status="healthy" if all(db_health.values()) else "degraded",
            capabilities=capabilities,
            version="1.0.0",
            uptime_seconds=0.0,
            total_requests=0,  # Could be enhanced with actual metrics
            active_sessions=len(rag_agent.active_sessions),
            database_connections=db_health
        )
    except Exception as error:
        logger.error(f"Status check failed: {error}")
        raise HTTPException(status_code=500, detail="Failed to get status")

# ============================================================================
# Chat Endpoints
# ============================================================================

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    deps: AgentDependencies = Depends(get_agent_deps)
):
    """Process a chat request"""
    try:
        # Update dependencies with request data
        if request.session_id:
            deps.session_id = request.session_id
        if request.user_id:
            deps.user_id = request.user_id
        
        # Process chat request
        response = await process_chat_request(request, deps)
        return response
        
    except Exception as error:
        logger.error(f"Chat request failed: {error}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {error}")

@app.post("/chat/stream")
async def chat_stream_endpoint(
    request: ChatRequest,
    deps: AgentDependencies = Depends(get_agent_deps)
):
    """Process a streaming chat request"""
    try:
        # Update dependencies with request data
        if request.session_id:
            deps.session_id = request.session_id
        if request.user_id:
            deps.user_id = request.user_id
        
        async def event_generator():
            try:
                async for delta in rag_agent.chat_stream(request, deps):
                    yield {
                        "event": "delta",
                        "data": delta.model_dump_json()
                    }
            except Exception as error:
                logger.error(f"Streaming error: {error}")
                error_delta = StreamDelta(type="error", error=str(error))
                yield {
                    "event": "error",
                    "data": error_delta.model_dump_json()
                }
        
        return EventSourceResponse(event_generator())
        
    except Exception as error:
        logger.error(f"Streaming chat request failed: {error}")
        raise HTTPException(status_code=500, detail=f"Streaming failed: {error}")

@app.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """Get chat history for a session"""
    try:
        history = rag_agent.get_session_history(session_id)
        return {
            "session_id": session_id,
            "messages": history,
            "message_count": len(history)
        }
    except Exception as error:
        logger.error(f"Failed to get chat history: {error}")
        raise HTTPException(status_code=500, detail="Failed to get chat history")

@app.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    """Clear chat history for a session"""
    try:
        success = rag_agent.clear_session(session_id)
        return {
            "session_id": session_id,
            "cleared": success
        }
    except Exception as error:
        logger.error(f"Failed to clear chat history: {error}")
        raise HTTPException(status_code=500, detail="Failed to clear chat history")

# ============================================================================
# Search Endpoints
# ============================================================================

@app.post("/search", response_model=SearchResponse)
async def search_endpoint(
    request: SearchRequest,
    deps: AgentDependencies = Depends(get_agent_deps)
):
    """Perform a search using the specified method"""
    try:
        # Update dependencies with request data
        if request.session_id:
            deps.session_id = request.session_id
        if request.user_id:
            deps.user_id = request.user_id
        
        # Process search request
        response = await process_search_request(request, deps)
        return response
        
    except Exception as error:
        logger.error(f"Search request failed: {error}")
        raise HTTPException(status_code=500, detail=f"Search failed: {error}")

# ============================================================================
# Document Processing Endpoints
# ============================================================================

@app.post("/process/pdf")
async def process_pdf_endpoint(
    file_path: str,
    filename: str,
    original_name: str
):
    """Process a PDF file through the ingestion pipeline"""
    try:
        result = await process_pdf_file(
            file_path=file_path,
            filename=filename,
            original_name=original_name
        )
        return result
        
    except Exception as error:
        logger.error(f"PDF processing failed: {error}")
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {error}")

# ============================================================================
# Configuration and Info Endpoints
# ============================================================================

@app.get("/info")
async def info_endpoint():
    """Get API information"""
    return {
        "name": "Hybrid RAG Agent API",
        "version": "1.0.0",
        "description": "AI Agent with Vector Search and Knowledge Graph Integration",
        "capabilities": [
            "Vector similarity search",
            "Knowledge graph traversal",
            "Hybrid search combining both approaches",
            "Document processing and ingestion",
            "Real-time streaming responses",
            "Tool transparency and reasoning"
        ],
        "endpoints": {
            "health": "/health",
            "status": "/status",
            "chat": "/chat",
            "chat_stream": "/chat/stream",
            "search": "/search",
            "process_pdf": "/process/pdf",
            "info": "/info"
        }
    }

@app.get("/config")
async def config_endpoint():
    """Get configuration information (non-sensitive)"""
    return {
        "llm_provider": config.llm.provider,
        "llm_model": config.llm.model,
        "embedding_model": config.embedding.model,
        "embedding_dimensions": config.embedding.dimensions,
        "search_capabilities": {
            "vector_search": config.search.enable_vector_search,
            "graph_search": config.search.enable_graph_search,
            "hybrid_search": config.search.enable_hybrid_search,
        },
        "processing": {
            "chunk_size": config.processing.chunk_size,
            "chunk_overlap": config.processing.chunk_overlap,
            "ocr_enabled": config.processing.enable_ocr,
        }
    }

# ============================================================================
# Main Application Entry Point
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "agent.api:app",
        host=config.app.host,
        port=config.app.port,
        reload=config.app.debug,
        log_level=config.logging.level.lower()
    )
