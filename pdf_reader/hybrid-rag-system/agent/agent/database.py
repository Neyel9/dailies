"""
Database utilities for Qdrant vector store and Neo4j knowledge graph
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, 
    MatchValue, SearchRequest, CollectionInfo
)
from qdrant_client.http.exceptions import UnexpectedResponse

from neo4j import AsyncGraphDatabase
from graphiti import Graphiti
from graphiti.llm_client import OpenAIClient, LLMConfig
from graphiti.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

from .config import config
from .models import ChunkResult, GraphResult, Document, DocumentChunk

logger = logging.getLogger(__name__)

# ============================================================================
# Qdrant Vector Store
# ============================================================================

class QdrantVectorStore:
    """Qdrant vector database client"""
    
    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.collection_name = config.database.qdrant_collection
        self.embedding_dim = config.embedding.dimensions
        
    async def initialize(self):
        """Initialize Qdrant client and collection"""
        try:
            self.client = QdrantClient(
                url=config.database.qdrant_url,
                timeout=config.database.qdrant_timeout
            )
            
            # Create collection if it doesn't exist
            await self._ensure_collection_exists()
            
            logger.info(f"Qdrant initialized: {config.database.qdrant_url}")
            
        except Exception as error:
            logger.error(f"Failed to initialize Qdrant: {error}")
            raise
    
    async def _ensure_collection_exists(self):
        """Ensure the collection exists with proper configuration"""
        try:
            # Check if collection exists
            collections = self.client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if self.collection_name not in collection_names:
                # Create collection
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self.embedding_dim,
                        distance=Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
            else:
                logger.info(f"Qdrant collection exists: {self.collection_name}")
                
        except Exception as error:
            logger.error(f"Failed to ensure collection exists: {error}")
            raise
    
    async def add_documents(self, chunks: List[DocumentChunk]) -> bool:
        """Add document chunks to the vector store"""
        if not self.client:
            await self.initialize()
        
        try:
            points = []
            for chunk in chunks:
                if not chunk.embedding:
                    logger.warning(f"Chunk {chunk.chunk_id} has no embedding, skipping")
                    continue
                
                point = PointStruct(
                    id=chunk.chunk_id,
                    vector=chunk.embedding,
                    payload={
                        "document_id": chunk.document_id,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        "start_char": chunk.start_char,
                        "end_char": chunk.end_char,
                        "metadata": chunk.metadata,
                        "created_at": datetime.now().isoformat(),
                    }
                )
                points.append(point)
            
            if points:
                self.client.upsert(
                    collection_name=self.collection_name,
                    points=points
                )
                logger.info(f"Added {len(points)} chunks to Qdrant")
                return True
            else:
                logger.warning("No valid chunks to add to Qdrant")
                return False
                
        except Exception as error:
            logger.error(f"Failed to add documents to Qdrant: {error}")
            return False
    
    async def search(
        self,
        query_vector: List[float],
        limit: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        score_threshold: Optional[float] = None
    ) -> List[ChunkResult]:
        """Search for similar vectors"""
        if not self.client:
            await self.initialize()
        
        try:
            # Build filter if provided
            search_filter = None
            if filters:
                conditions = []
                for key, value in filters.items():
                    conditions.append(
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value)
                        )
                    )
                if conditions:
                    search_filter = Filter(must=conditions)
            
            # Perform search
            search_result = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=limit,
                query_filter=search_filter,
                score_threshold=score_threshold,
                with_payload=True
            )
            
            # Convert to ChunkResult objects
            results = []
            for hit in search_result:
                payload = hit.payload
                result = ChunkResult(
                    chunk_id=str(hit.id),
                    document_id=payload.get("document_id", ""),
                    content=payload.get("content", ""),
                    score=hit.score,
                    metadata=payload.get("metadata", {}),
                    document_title=payload.get("document_title"),
                    document_source=payload.get("document_source"),
                    chunk_index=payload.get("chunk_index")
                )
                results.append(result)
            
            logger.debug(f"Qdrant search returned {len(results)} results")
            return results
            
        except Exception as error:
            logger.error(f"Qdrant search failed: {error}")
            return []
    
    async def delete_document(self, document_id: str) -> bool:
        """Delete all chunks for a document"""
        if not self.client:
            await self.initialize()
        
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id)
                        )
                    ]
                )
            )
            logger.info(f"Deleted document {document_id} from Qdrant")
            return True
            
        except Exception as error:
            logger.error(f"Failed to delete document from Qdrant: {error}")
            return False
    
    async def get_collection_info(self) -> Dict[str, Any]:
        """Get collection information"""
        if not self.client:
            await self.initialize()
        
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "name": info.config.name,
                "status": info.status,
                "vectors_count": info.vectors_count,
                "indexed_vectors_count": info.indexed_vectors_count,
                "points_count": info.points_count,
                "segments_count": info.segments_count,
            }
        except Exception as error:
            logger.error(f"Failed to get collection info: {error}")
            return {}
    
    async def close(self):
        """Close the Qdrant client"""
        if self.client:
            self.client.close()
            logger.info("Qdrant client closed")

# ============================================================================
# Neo4j Knowledge Graph
# ============================================================================

class Neo4jKnowledgeGraph:
    """Neo4j knowledge graph client with Graphiti integration"""
    
    def __init__(self):
        self.driver = None
        self.graphiti: Optional[Graphiti] = None
        
    async def initialize(self):
        """Initialize Neo4j driver and Graphiti"""
        try:
            # Initialize Neo4j driver
            self.driver = AsyncGraphDatabase.driver(
                config.database.neo4j_uri,
                auth=(config.database.neo4j_user, config.database.neo4j_password)
            )
            
            # Test connection
            await self.driver.verify_connectivity()
            
            # Initialize Graphiti
            await self._initialize_graphiti()
            
            logger.info(f"Neo4j initialized: {config.database.neo4j_uri}")
            
        except Exception as error:
            logger.error(f"Failed to initialize Neo4j: {error}")
            raise
    
    async def _initialize_graphiti(self):
        """Initialize Graphiti with OpenAI-compatible clients"""
        try:
            # Create LLM config
            llm_config = LLMConfig(
                api_key=config.llm.api_key,
                model=config.llm.model,
                base_url=config.llm.base_url
            )
            
            # Create OpenAI LLM client
            llm_client = OpenAIClient(config=llm_config)
            
            # Create OpenAI embedder
            embedder = OpenAIEmbedder(
                config=OpenAIEmbedderConfig(
                    api_key=config.embedding.api_key,
                    embedding_model=config.embedding.model,
                    embedding_dim=config.embedding.dimensions,
                    base_url=config.embedding.base_url
                )
            )
            
            # Initialize Graphiti
            self.graphiti = Graphiti(
                config.database.neo4j_uri,
                config.database.neo4j_user,
                config.database.neo4j_password,
                llm_client=llm_client,
                embedder=embedder
            )
            
            # Build indices and constraints
            await self.graphiti.build_indices_and_constraints()
            
            logger.info("Graphiti initialized successfully")
            
        except Exception as error:
            logger.error(f"Failed to initialize Graphiti: {error}")
            raise
    
    async def add_episode(
        self,
        content: str,
        source: str,
        episode_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add content to the knowledge graph as an episode"""
        if not self.graphiti:
            await self.initialize()
        
        try:
            if not episode_id:
                episode_id = f"episode_{uuid.uuid4()}"
            
            await self.graphiti.add_episode(
                episode_id=episode_id,
                content=content,
                source=source,
                metadata=metadata or {}
            )
            
            logger.debug(f"Added episode to knowledge graph: {episode_id}")
            return episode_id
            
        except Exception as error:
            logger.error(f"Failed to add episode to knowledge graph: {error}")
            raise
    
    async def search(
        self,
        query: str,
        limit: Optional[int] = None
    ) -> List[GraphResult]:
        """Search the knowledge graph"""
        if not self.graphiti:
            await self.initialize()
        
        try:
            # Use Graphiti search
            results = await self.graphiti.search(query)
            
            # Convert to GraphResult objects
            graph_results = []
            for result in results:
                graph_result = GraphResult(
                    entity_id=result.get("id", str(uuid.uuid4())),
                    entity_name=result.get("name", "Unknown"),
                    entity_type=result.get("type", "Entity"),
                    relationships=result.get("relationships", []),
                    properties=result.get("properties", {}),
                    score=result.get("score")
                )
                graph_results.append(graph_result)
            
            logger.debug(f"Knowledge graph search returned {len(graph_results)} results")
            return graph_results
            
        except Exception as error:
            logger.error(f"Knowledge graph search failed: {error}")
            return []
    
    async def get_entity_relationships(
        self,
        entity_name: str
    ) -> List[Dict[str, Any]]:
        """Get relationships for a specific entity"""
        if not self.graphiti:
            await self.initialize()
        
        try:
            # Use Graphiti to get entity relationships
            relationships = await self.graphiti.get_entity_relationships(entity_name)
            return relationships
            
        except Exception as error:
            logger.error(f"Failed to get entity relationships: {error}")
            return []
    
    async def close(self):
        """Close Neo4j connections"""
        if self.graphiti:
            await self.graphiti.close()
        
        if self.driver:
            await self.driver.close()
            
        logger.info("Neo4j connections closed")

# ============================================================================
# Global Instances
# ============================================================================

# Global database instances
vector_store = QdrantVectorStore()
knowledge_graph = Neo4jKnowledgeGraph()

async def initialize_databases():
    """Initialize all database connections"""
    await vector_store.initialize()
    await knowledge_graph.initialize()
    logger.info("All databases initialized")

async def close_databases():
    """Close all database connections"""
    await vector_store.close()
    await knowledge_graph.close()
    logger.info("All database connections closed")

async def health_check() -> Dict[str, bool]:
    """Check health of all database connections"""
    health = {}
    
    try:
        # Check Qdrant
        if vector_store.client:
            info = await vector_store.get_collection_info()
            health["qdrant"] = bool(info)
        else:
            health["qdrant"] = False
    except Exception:
        health["qdrant"] = False
    
    try:
        # Check Neo4j
        if knowledge_graph.driver:
            await knowledge_graph.driver.verify_connectivity()
            health["neo4j"] = True
        else:
            health["neo4j"] = False
    except Exception:
        health["neo4j"] = False
    
    return health
