"""
Agent tools for vector search, knowledge graph operations, and document retrieval
"""

import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from .database import vector_store, knowledge_graph
from .models import ChunkResult, GraphResult
from .embeddings import generate_embedding

logger = logging.getLogger(__name__)

# ============================================================================
# Tool Input Models
# ============================================================================

class VectorSearchInput(BaseModel):
    """Input for vector search tool"""
    query: str = Field(..., description="Search query for semantic similarity")
    limit: int = Field(default=10, description="Maximum number of results to return")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Optional filters to apply")

class GraphSearchInput(BaseModel):
    """Input for knowledge graph search tool"""
    query: str = Field(..., description="Search query for knowledge graph")
    depth: int = Field(default=3, description="Maximum traversal depth")

class HybridSearchInput(BaseModel):
    """Input for hybrid search tool"""
    query: str = Field(..., description="Search query for hybrid search")
    limit: int = Field(default=10, description="Maximum number of results to return")
    vector_weight: float = Field(default=0.7, description="Weight for vector search results")
    graph_weight: float = Field(default=0.3, description="Weight for graph search results")

class DocumentRetrievalInput(BaseModel):
    """Input for document retrieval tool"""
    document_id: str = Field(..., description="Document ID to retrieve")
    include_chunks: bool = Field(default=True, description="Include document chunks")

class EntityRelationshipInput(BaseModel):
    """Input for entity relationship tool"""
    entity_name: str = Field(..., description="Name of the entity to explore")

# ============================================================================
# Tool Functions
# ============================================================================

async def vector_search_tool(input_data: VectorSearchInput) -> List[ChunkResult]:
    """
    Perform vector similarity search to find semantically similar content.
    
    This tool searches through document chunks using semantic similarity
    to find content that matches the meaning of the query.
    """
    try:
        logger.debug(f"Vector search: {input_data.query}")
        
        # Generate embedding for the query
        query_embedding = await generate_embedding(input_data.query)
        
        # Perform vector search
        results = await vector_store.search(
            query_vector=query_embedding,
            limit=input_data.limit,
            filters=input_data.filters
        )
        
        logger.info(f"Vector search returned {len(results)} results")
        return results
        
    except Exception as error:
        logger.error(f"Vector search failed: {error}")
        return []

async def graph_search_tool(input_data: GraphSearchInput) -> List[GraphResult]:
    """
    Search the knowledge graph to find entity relationships and connections.
    
    This tool explores the knowledge graph to find entities, relationships,
    and connections that are relevant to the query.
    """
    try:
        logger.debug(f"Graph search: {input_data.query}")
        
        # Perform knowledge graph search
        results = await knowledge_graph.search(
            query=input_data.query
        )
        
        logger.info(f"Graph search returned {len(results)} results")
        return results
        
    except Exception as error:
        logger.error(f"Graph search failed: {error}")
        return []

async def hybrid_search_tool(input_data: HybridSearchInput) -> List[ChunkResult]:
    """
    Perform hybrid search combining vector similarity and knowledge graph results.
    
    This tool combines the strengths of both vector search and knowledge graph
    search to provide comprehensive results that include both semantic similarity
    and relationship-based relevance.
    """
    try:
        logger.debug(f"Hybrid search: {input_data.query}")
        
        # Perform vector search
        vector_results = await vector_search_tool(
            VectorSearchInput(
                query=input_data.query,
                limit=input_data.limit
            )
        )
        
        # Perform graph search
        graph_results = await graph_search_tool(
            GraphSearchInput(
                query=input_data.query
            )
        )
        
        # Combine and rank results
        combined_results = _combine_search_results(
            vector_results,
            graph_results,
            input_data.vector_weight,
            input_data.graph_weight
        )
        
        # Limit results
        final_results = combined_results[:input_data.limit]
        
        logger.info(f"Hybrid search returned {len(final_results)} results")
        return final_results
        
    except Exception as error:
        logger.error(f"Hybrid search failed: {error}")
        return []

async def document_retrieval_tool(input_data: DocumentRetrievalInput) -> Dict[str, Any]:
    """
    Retrieve complete document information including metadata and chunks.
    
    This tool fetches full document details, which is useful for getting
    complete context or when you need to understand the entire document.
    """
    try:
        logger.debug(f"Document retrieval: {input_data.document_id}")
        
        # Get document chunks from vector store
        chunks = []
        if input_data.include_chunks:
            # Search for all chunks of this document
            all_chunks = await vector_store.search(
                query_vector=[0.0] * vector_store.embedding_dim,  # Dummy vector
                limit=1000,  # Large limit to get all chunks
                filters={"document_id": input_data.document_id}
            )
            chunks = sorted(all_chunks, key=lambda x: x.chunk_index or 0)
        
        # Combine chunk content
        full_content = "\n\n".join([chunk.content for chunk in chunks])
        
        # Get document metadata (from first chunk if available)
        metadata = {}
        if chunks:
            metadata = chunks[0].metadata
        
        result = {
            "document_id": input_data.document_id,
            "content": full_content,
            "chunks": chunks,
            "metadata": metadata,
            "chunk_count": len(chunks)
        }
        
        logger.info(f"Retrieved document {input_data.document_id} with {len(chunks)} chunks")
        return result
        
    except Exception as error:
        logger.error(f"Document retrieval failed: {error}")
        return {
            "document_id": input_data.document_id,
            "content": "",
            "chunks": [],
            "metadata": {},
            "chunk_count": 0,
            "error": str(error)
        }

async def entity_relationships_tool(input_data: EntityRelationshipInput) -> List[Dict[str, Any]]:
    """
    Explore relationships for a specific entity in the knowledge graph.
    
    This tool finds all relationships and connections for a given entity,
    which is useful for understanding how entities are connected.
    """
    try:
        logger.debug(f"Entity relationships: {input_data.entity_name}")
        
        # Get entity relationships from knowledge graph
        relationships = await knowledge_graph.get_entity_relationships(
            entity_name=input_data.entity_name
        )
        
        logger.info(f"Found {len(relationships)} relationships for {input_data.entity_name}")
        return relationships
        
    except Exception as error:
        logger.error(f"Entity relationships search failed: {error}")
        return []

# ============================================================================
# Helper Functions
# ============================================================================

def _combine_search_results(
    vector_results: List[ChunkResult],
    graph_results: List[GraphResult],
    vector_weight: float,
    graph_weight: float
) -> List[ChunkResult]:
    """Combine and rank vector and graph search results"""
    
    # Convert graph results to chunk-like results for consistency
    combined_results = []
    
    # Add vector results with weighted scores
    for result in vector_results:
        result.score = result.score * vector_weight
        combined_results.append(result)
    
    # Convert graph results to chunk results and add with weighted scores
    for graph_result in graph_results:
        # Create a pseudo-chunk from graph result
        chunk_result = ChunkResult(
            chunk_id=graph_result.entity_id,
            document_id="knowledge_graph",
            content=f"Entity: {graph_result.entity_name} ({graph_result.entity_type})\n"
                   f"Properties: {graph_result.properties}\n"
                   f"Relationships: {graph_result.relationships}",
            score=(graph_result.score or 0.5) * graph_weight,
            metadata={
                "source": "knowledge_graph",
                "entity_type": graph_result.entity_type,
                "entity_name": graph_result.entity_name,
                "relationships": graph_result.relationships,
                "properties": graph_result.properties
            },
            document_title=f"Knowledge Graph: {graph_result.entity_name}",
            document_source="knowledge_graph"
        )
        combined_results.append(chunk_result)
    
    # Sort by combined score (descending)
    combined_results.sort(key=lambda x: x.score, reverse=True)
    
    return combined_results

def _normalize_scores(results: List[ChunkResult]) -> List[ChunkResult]:
    """Normalize scores to 0-1 range"""
    if not results:
        return results
    
    max_score = max(result.score for result in results)
    min_score = min(result.score for result in results)
    
    if max_score == min_score:
        # All scores are the same
        for result in results:
            result.score = 1.0
    else:
        # Normalize to 0-1 range
        score_range = max_score - min_score
        for result in results:
            result.score = (result.score - min_score) / score_range
    
    return results

def _deduplicate_results(results: List[ChunkResult]) -> List[ChunkResult]:
    """Remove duplicate results based on content similarity"""
    if not results:
        return results
    
    deduplicated = []
    seen_content = set()
    
    for result in results:
        # Use first 100 characters as a simple deduplication key
        content_key = result.content[:100].strip().lower()
        
        if content_key not in seen_content:
            seen_content.add(content_key)
            deduplicated.append(result)
    
    return deduplicated

async def perform_comprehensive_search(
    query: str,
    use_vector: bool = True,
    use_graph: bool = True,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Perform a comprehensive search using multiple methods.
    
    This is a convenience function that combines multiple search approaches
    and returns structured results.
    """
    results = {
        "query": query,
        "vector_results": [],
        "graph_results": [],
        "hybrid_results": [],
        "total_results": 0,
        "tools_used": []
    }
    
    try:
        if use_vector:
            vector_results = await vector_search_tool(
                VectorSearchInput(query=query, limit=limit)
            )
            results["vector_results"] = vector_results
            results["tools_used"].append("vector_search")
        
        if use_graph:
            graph_results = await graph_search_tool(
                GraphSearchInput(query=query)
            )
            results["graph_results"] = graph_results
            results["tools_used"].append("graph_search")
        
        if use_vector and use_graph:
            hybrid_results = await hybrid_search_tool(
                HybridSearchInput(query=query, limit=limit)
            )
            results["hybrid_results"] = hybrid_results
            results["tools_used"].append("hybrid_search")
        
        # Calculate total results
        results["total_results"] = (
            len(results["vector_results"]) +
            len(results["graph_results"]) +
            len(results["hybrid_results"])
        )
        
        logger.info(f"Comprehensive search completed: {results['total_results']} total results")
        return results
        
    except Exception as error:
        logger.error(f"Comprehensive search failed: {error}")
        results["error"] = str(error)
        return results
