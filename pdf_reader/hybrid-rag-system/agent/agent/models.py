"""
Pydantic models for the Hybrid RAG Agent system
"""

from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, validator
from uuid import UUID, uuid4

# ============================================================================
# Base Models
# ============================================================================

class BaseResponse(BaseModel):
    """Base response model"""
    success: bool = True
    timestamp: datetime = Field(default_factory=datetime.now)
    request_id: Optional[str] = None

class ErrorResponse(BaseResponse):
    """Error response model"""
    success: bool = False
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None

# ============================================================================
# Search Models
# ============================================================================

class SearchType(str, Enum):
    """Search type enumeration"""
    VECTOR = "vector"
    GRAPH = "graph"
    HYBRID = "hybrid"
    DOCUMENT = "document"

class ChunkResult(BaseModel):
    """Document chunk search result"""
    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)
    document_title: Optional[str] = None
    document_source: Optional[str] = None
    chunk_index: Optional[int] = None

class GraphResult(BaseModel):
    """Knowledge graph search result"""
    entity_id: str
    entity_name: str
    entity_type: str
    relationships: List[Dict[str, Any]] = Field(default_factory=list)
    properties: Dict[str, Any] = Field(default_factory=dict)
    score: Optional[float] = None

class SearchRequest(BaseModel):
    """Search request model"""
    query: str = Field(..., min_length=1, max_length=1000)
    search_type: SearchType = SearchType.HYBRID
    limit: int = Field(default=10, ge=1, le=100)
    filters: Optional[Dict[str, Any]] = None
    include_metadata: bool = True
    session_id: Optional[str] = None
    user_id: Optional[str] = None

class SearchResponse(BaseResponse):
    """Search response model"""
    query: str
    search_type: SearchType
    results: List[Union[ChunkResult, GraphResult]]
    total_results: int
    search_time_ms: float
    tools_used: List[str] = Field(default_factory=list)

# ============================================================================
# Chat Models
# ============================================================================

class ChatMessage(BaseModel):
    """Chat message model"""
    role: str = Field(..., regex="^(user|assistant|system)$")
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    """Chat request model"""
    message: str = Field(..., min_length=1, max_length=5000)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    search_type: SearchType = SearchType.HYBRID
    include_sources: bool = True
    stream: bool = False
    context: Optional[List[ChatMessage]] = None

class ToolCall(BaseModel):
    """Tool call information"""
    tool_name: str
    args: Dict[str, Any]
    result_summary: Optional[str] = None
    execution_time_ms: Optional[float] = None

class ChatResponse(BaseResponse):
    """Chat response model"""
    message: str
    session_id: str
    tools_used: List[ToolCall] = Field(default_factory=list)
    sources: List[Union[ChunkResult, GraphResult]] = Field(default_factory=list)
    response_time_ms: float
    token_usage: Optional[Dict[str, int]] = None

class StreamDelta(BaseModel):
    """Streaming response delta"""
    type: str = Field(..., regex="^(text|tools|sources|session|end|error)$")
    content: Optional[str] = None
    tools: Optional[List[ToolCall]] = None
    sources: Optional[List[Union[ChunkResult, GraphResult]]] = None
    session_id: Optional[str] = None
    error: Optional[str] = None

# ============================================================================
# Document Models
# ============================================================================

class DocumentStatus(str, Enum):
    """Document processing status"""
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class DocumentMetadata(BaseModel):
    """Document metadata"""
    title: str
    author: Optional[str] = None
    created_date: Optional[datetime] = None
    file_size: int
    file_type: str
    page_count: Optional[int] = None
    language: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

class DocumentChunk(BaseModel):
    """Document chunk model"""
    chunk_id: str = Field(default_factory=lambda: str(uuid4()))
    document_id: str
    content: str
    chunk_index: int
    start_char: Optional[int] = None
    end_char: Optional[int] = None
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class Document(BaseModel):
    """Document model"""
    document_id: str = Field(default_factory=lambda: str(uuid4()))
    filename: str
    original_name: str
    file_path: str
    status: DocumentStatus = DocumentStatus.UPLOADED
    metadata: DocumentMetadata
    chunks: List[DocumentChunk] = Field(default_factory=list)
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

# ============================================================================
# Agent Models
# ============================================================================

class AgentCapability(str, Enum):
    """Agent capability enumeration"""
    VECTOR_SEARCH = "vector_search"
    GRAPH_SEARCH = "graph_search"
    HYBRID_SEARCH = "hybrid_search"
    DOCUMENT_RETRIEVAL = "document_retrieval"
    ENTITY_EXTRACTION = "entity_extraction"
    RELATIONSHIP_MAPPING = "relationship_mapping"

class AgentStatus(BaseModel):
    """Agent status model"""
    status: str = "healthy"
    capabilities: List[AgentCapability]
    version: str
    uptime_seconds: float
    total_requests: int
    active_sessions: int
    database_connections: Dict[str, bool]

class AgentConfig(BaseModel):
    """Agent configuration model"""
    max_iterations: int = 10
    timeout_seconds: int = 300
    temperature: float = 0.1
    enable_streaming: bool = True
    enable_tool_transparency: bool = True
    default_search_limit: int = 10

# ============================================================================
# Processing Models
# ============================================================================

class ProcessingJob(BaseModel):
    """Document processing job model"""
    job_id: str = Field(default_factory=lambda: str(uuid4()))
    document_id: str
    job_type: str = "pdf_processing"
    status: str = "queued"
    progress: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

class ProcessingResult(BaseModel):
    """Processing result model"""
    job_id: str
    document_id: str
    chunks_created: int
    entities_extracted: int
    relationships_created: int
    processing_time_ms: float
    success: bool
    error_message: Optional[str] = None

# ============================================================================
# Health and Monitoring Models
# ============================================================================

class HealthStatus(BaseModel):
    """Health status model"""
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.now)
    version: str
    uptime_seconds: float
    checks: Dict[str, bool] = Field(default_factory=dict)

class MetricData(BaseModel):
    """Metric data model"""
    name: str
    value: Union[int, float, str]
    timestamp: datetime = Field(default_factory=datetime.now)
    labels: Dict[str, str] = Field(default_factory=dict)

# ============================================================================
# Session Models
# ============================================================================

class Session(BaseModel):
    """Chat session model"""
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    message_count: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SessionMessage(BaseModel):
    """Session message model"""
    message_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    role: str
    content: str
    tools_used: List[ToolCall] = Field(default_factory=list)
    sources: List[Union[ChunkResult, GraphResult]] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)

# ============================================================================
# Validation and Utility Functions
# ============================================================================

def validate_search_filters(filters: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Validate search filters"""
    if not filters:
        return None
    
    allowed_keys = {
        "document_type", "date_range", "author", "tags", 
        "file_size_range", "language", "source"
    }
    
    validated = {}
    for key, value in filters.items():
        if key in allowed_keys:
            validated[key] = value
    
    return validated if validated else None

def create_error_response(error: str, message: str, details: Optional[Dict[str, Any]] = None) -> ErrorResponse:
    """Create standardized error response"""
    return ErrorResponse(
        error=error,
        message=message,
        details=details
    )
