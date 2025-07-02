"""
Configuration management for Hybrid RAG Agent
"""

import os
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class DatabaseConfig:
    """Database configuration"""
    qdrant_url: str = field(default_factory=lambda: os.getenv("QDRANT_URL", "http://localhost:6333"))
    qdrant_collection: str = field(default_factory=lambda: os.getenv("QDRANT_COLLECTION_NAME", "hybrid_rag_documents"))
    qdrant_timeout: int = field(default_factory=lambda: int(os.getenv("QDRANT_TIMEOUT", "30")))
    
    neo4j_uri: str = field(default_factory=lambda: os.getenv("NEO4J_URI", "bolt://localhost:7687"))
    neo4j_user: str = field(default_factory=lambda: os.getenv("NEO4J_USER", "neo4j"))
    neo4j_password: str = field(default_factory=lambda: os.getenv("NEO4J_PASSWORD", "password"))

@dataclass
class LLMConfig:
    """LLM provider configuration"""
    provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "openai"))
    base_url: str = field(default_factory=lambda: os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"))
    api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", ""))
    model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4o-mini"))
    temperature: float = field(default_factory=lambda: float(os.getenv("LLM_TEMPERATURE", "0.1")))
    max_tokens: int = field(default_factory=lambda: int(os.getenv("LLM_MAX_TOKENS", "4000")))

@dataclass
class EmbeddingConfig:
    """Embedding configuration"""
    provider: str = field(default_factory=lambda: os.getenv("EMBEDDING_PROVIDER", "openai"))
    base_url: str = field(default_factory=lambda: os.getenv("EMBEDDING_BASE_URL", "https://api.openai.com/v1"))
    api_key: str = field(default_factory=lambda: os.getenv("EMBEDDING_API_KEY", ""))
    model: str = field(default_factory=lambda: os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))
    dimensions: int = field(default_factory=lambda: int(os.getenv("EMBEDDING_DIMENSIONS", "1536")))
    batch_size: int = field(default_factory=lambda: int(os.getenv("EMBEDDING_BATCH_SIZE", "100")))

@dataclass
class ProcessingConfig:
    """Document processing configuration"""
    chunk_size: int = field(default_factory=lambda: int(os.getenv("CHUNK_SIZE", "1000")))
    chunk_overlap: int = field(default_factory=lambda: int(os.getenv("CHUNK_OVERLAP", "200")))
    max_chunk_size: int = field(default_factory=lambda: int(os.getenv("MAX_CHUNK_SIZE", "2000")))
    enable_ocr: bool = field(default_factory=lambda: os.getenv("ENABLE_OCR", "false").lower() == "true")
    ocr_language: str = field(default_factory=lambda: os.getenv("OCR_LANGUAGE", "eng"))

@dataclass
class AgentConfig:
    """Agent behavior configuration"""
    max_iterations: int = field(default_factory=lambda: int(os.getenv("AGENT_MAX_ITERATIONS", "10")))
    timeout: int = field(default_factory=lambda: int(os.getenv("AGENT_TIMEOUT", "300")))
    temperature: float = field(default_factory=lambda: float(os.getenv("AGENT_TEMPERATURE", "0.1")))

@dataclass
class SearchConfig:
    """Search configuration"""
    default_limit: int = field(default_factory=lambda: int(os.getenv("DEFAULT_SEARCH_LIMIT", "10")))
    vector_threshold: float = field(default_factory=lambda: float(os.getenv("VECTOR_SEARCH_THRESHOLD", "0.7")))
    graph_depth: int = field(default_factory=lambda: int(os.getenv("GRAPH_SEARCH_DEPTH", "3")))
    enable_vector_search: bool = field(default_factory=lambda: os.getenv("ENABLE_VECTOR_SEARCH", "true").lower() == "true")
    enable_graph_search: bool = field(default_factory=lambda: os.getenv("ENABLE_GRAPH_SEARCH", "true").lower() == "true")
    enable_hybrid_search: bool = field(default_factory=lambda: os.getenv("ENABLE_HYBRID_SEARCH", "true").lower() == "true")

@dataclass
class AppConfig:
    """Application configuration"""
    name: str = "Hybrid RAG Agent"
    version: str = "1.0.0"
    environment: str = field(default_factory=lambda: os.getenv("NODE_ENV", "development"))
    port: int = field(default_factory=lambda: int(os.getenv("APP_PORT", "8001")))
    host: str = field(default_factory=lambda: os.getenv("APP_HOST", "0.0.0.0"))
    debug: bool = field(default_factory=lambda: os.getenv("ENABLE_DEBUG_MODE", "false").lower() == "true")

@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "info"))
    format: str = field(default_factory=lambda: os.getenv("LOG_FORMAT", "json"))
    enable_request_logging: bool = field(default_factory=lambda: os.getenv("ENABLE_REQUEST_LOGGING", "true").lower() == "true")

@dataclass
class SecurityConfig:
    """Security configuration"""
    cors_origins: List[str] = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8000").split(","))
    rate_limit_window: int = field(default_factory=lambda: int(os.getenv("RATE_LIMIT_WINDOW", "900000")))
    rate_limit_max_requests: int = field(default_factory=lambda: int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "100")))

@dataclass
class HybridRAGConfig:
    """Main configuration class"""
    app: AppConfig = field(default_factory=AppConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    embedding: EmbeddingConfig = field(default_factory=EmbeddingConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    search: SearchConfig = field(default_factory=SearchConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)

    def validate(self) -> None:
        """Validate configuration"""
        required_fields = [
            (self.llm.api_key, "LLM_API_KEY"),
            (self.embedding.api_key, "EMBEDDING_API_KEY"),
            (self.database.neo4j_password, "NEO4J_PASSWORD"),
        ]
        
        missing = [field_name for value, field_name in required_fields if not value]
        
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")
        
        # Validate URLs
        urls_to_validate = [
            (self.database.qdrant_url, "QDRANT_URL"),
            (self.database.neo4j_uri, "NEO4J_URI"),
            (self.llm.base_url, "LLM_BASE_URL"),
            (self.embedding.base_url, "EMBEDDING_BASE_URL"),
        ]
        
        for url, field_name in urls_to_validate:
            if not url.startswith(("http://", "https://", "bolt://")):
                raise ValueError(f"Invalid URL format for {field_name}: {url}")

    def get_llm_model_config(self) -> Dict[str, Any]:
        """Get LLM model configuration for Pydantic AI"""
        if self.llm.provider == "openai":
            return {
                "model": self.llm.model,
                "api_key": self.llm.api_key,
                "base_url": self.llm.base_url if self.llm.base_url != "https://api.openai.com/v1" else None,
            }
        elif self.llm.provider == "ollama":
            return {
                "model": self.llm.model,
                "base_url": self.llm.base_url,
            }
        elif self.llm.provider == "anthropic":
            return {
                "model": self.llm.model,
                "api_key": self.llm.api_key,
            }
        else:
            # Generic OpenAI-compatible
            return {
                "model": self.llm.model,
                "api_key": self.llm.api_key,
                "base_url": self.llm.base_url,
            }

    def get_embedding_config(self) -> Dict[str, Any]:
        """Get embedding configuration"""
        return {
            "provider": self.embedding.provider,
            "model": self.embedding.model,
            "api_key": self.embedding.api_key,
            "base_url": self.embedding.base_url,
            "dimensions": self.embedding.dimensions,
        }

# Global configuration instance
config = HybridRAGConfig()

def get_config() -> HybridRAGConfig:
    """Get global configuration instance"""
    return config

def validate_config() -> None:
    """Validate global configuration"""
    config.validate()

# Environment-specific configurations
def get_development_config() -> HybridRAGConfig:
    """Get development configuration"""
    dev_config = HybridRAGConfig()
    dev_config.app.debug = True
    dev_config.logging.level = "debug"
    return dev_config

def get_production_config() -> HybridRAGConfig:
    """Get production configuration"""
    prod_config = HybridRAGConfig()
    prod_config.app.debug = False
    prod_config.logging.level = "warning"
    prod_config.security.rate_limit_max_requests = 50
    return prod_config

def get_test_config() -> HybridRAGConfig:
    """Get test configuration"""
    test_config = HybridRAGConfig()
    test_config.app.debug = True
    test_config.logging.level = "error"
    test_config.database.qdrant_url = "http://localhost:6333"
    test_config.database.neo4j_uri = "bolt://localhost:7687"
    return test_config
