"""
Embedding generation utilities for the Hybrid RAG Agent
"""

import asyncio
import logging
from typing import List, Optional, Dict, Any
import httpx
import openai
from openai import AsyncOpenAI

from .config import config

logger = logging.getLogger(__name__)

class EmbeddingError(Exception):
    """Exception raised for embedding generation errors"""
    pass

class EmbeddingGenerator:
    """Embedding generator with support for multiple providers"""
    
    def __init__(self):
        self.provider = config.embedding.provider
        self.model = config.embedding.model
        self.api_key = config.embedding.api_key
        self.base_url = config.embedding.base_url
        self.dimensions = config.embedding.dimensions
        self.batch_size = config.embedding.batch_size
        
        # Initialize client based on provider
        self.client = self._initialize_client()
    
    def _initialize_client(self) -> AsyncOpenAI:
        """Initialize the embedding client"""
        try:
            if self.provider == "openai":
                return AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url if self.base_url != "https://api.openai.com/v1" else None
                )
            elif self.provider == "ollama":
                return AsyncOpenAI(
                    api_key="ollama",  # Ollama doesn't require a real API key
                    base_url=self.base_url
                )
            else:
                # Generic OpenAI-compatible
                return AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url
                )
        except Exception as error:
            logger.error(f"Failed to initialize embedding client: {error}")
            raise EmbeddingError(f"Failed to initialize embedding client: {error}")
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            # Clean and prepare text
            cleaned_text = self._clean_text(text)
            
            if not cleaned_text.strip():
                logger.warning("Empty text provided for embedding")
                return [0.0] * self.dimensions
            
            # Generate embedding
            response = await self.client.embeddings.create(
                model=self.model,
                input=cleaned_text,
                encoding_format="float"
            )
            
            embedding = response.data[0].embedding
            
            # Validate embedding dimensions
            if len(embedding) != self.dimensions:
                logger.warning(
                    f"Embedding dimension mismatch: expected {self.dimensions}, "
                    f"got {len(embedding)}"
                )
            
            return embedding
            
        except Exception as error:
            logger.error(f"Failed to generate embedding: {error}")
            raise EmbeddingError(f"Failed to generate embedding: {error}")
    
    async def generate_embeddings_batch(
        self,
        texts: List[str],
        progress_callback: Optional[callable] = None
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts in batches"""
        try:
            embeddings = []
            total_batches = (len(texts) + self.batch_size - 1) // self.batch_size
            
            for i in range(0, len(texts), self.batch_size):
                batch = texts[i:i + self.batch_size]
                batch_num = i // self.batch_size + 1
                
                # Clean texts in batch
                cleaned_batch = [self._clean_text(text) for text in batch]
                
                # Filter out empty texts
                non_empty_batch = [text for text in cleaned_batch if text.strip()]
                
                if not non_empty_batch:
                    # Add zero embeddings for empty batch
                    embeddings.extend([[0.0] * self.dimensions] * len(batch))
                    continue
                
                try:
                    # Generate embeddings for batch
                    response = await self.client.embeddings.create(
                        model=self.model,
                        input=non_empty_batch,
                        encoding_format="float"
                    )
                    
                    # Extract embeddings
                    batch_embeddings = [item.embedding for item in response.data]
                    
                    # Handle case where some texts were filtered out
                    embedding_idx = 0
                    for original_text, cleaned_text in zip(batch, cleaned_batch):
                        if cleaned_text.strip():
                            embeddings.append(batch_embeddings[embedding_idx])
                            embedding_idx += 1
                        else:
                            embeddings.append([0.0] * self.dimensions)
                    
                    logger.debug(f"Generated embeddings for batch {batch_num}/{total_batches}")
                    
                    # Call progress callback if provided
                    if progress_callback:
                        progress_callback(batch_num, total_batches)
                    
                    # Small delay to avoid rate limiting
                    if batch_num < total_batches:
                        await asyncio.sleep(0.1)
                
                except Exception as batch_error:
                    logger.error(f"Failed to generate embeddings for batch {batch_num}: {batch_error}")
                    # Add zero embeddings for failed batch
                    embeddings.extend([[0.0] * self.dimensions] * len(batch))
            
            logger.info(f"Generated {len(embeddings)} embeddings in {total_batches} batches")
            return embeddings
            
        except Exception as error:
            logger.error(f"Failed to generate batch embeddings: {error}")
            raise EmbeddingError(f"Failed to generate batch embeddings: {error}")
    
    def _clean_text(self, text: str) -> str:
        """Clean and prepare text for embedding"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        cleaned = " ".join(text.split())
        
        # Truncate if too long (most embedding models have token limits)
        max_chars = 8000  # Conservative limit
        if len(cleaned) > max_chars:
            cleaned = cleaned[:max_chars]
            logger.debug(f"Truncated text from {len(text)} to {len(cleaned)} characters")
        
        return cleaned
    
    async def test_connection(self) -> bool:
        """Test the embedding service connection"""
        try:
            test_embedding = await self.generate_embedding("test")
            return len(test_embedding) == self.dimensions
        except Exception as error:
            logger.error(f"Embedding service test failed: {error}")
            return False
    
    def get_info(self) -> Dict[str, Any]:
        """Get embedding service information"""
        return {
            "provider": self.provider,
            "model": self.model,
            "dimensions": self.dimensions,
            "batch_size": self.batch_size,
            "base_url": self.base_url
        }

# Global embedding generator instance
embedding_generator = EmbeddingGenerator()

# Convenience functions
async def generate_embedding(text: str) -> List[float]:
    """Generate embedding for a single text"""
    return await embedding_generator.generate_embedding(text)

async def generate_embeddings_batch(
    texts: List[str],
    progress_callback: Optional[callable] = None
) -> List[List[float]]:
    """Generate embeddings for multiple texts"""
    return await embedding_generator.generate_embeddings_batch(texts, progress_callback)

async def test_embedding_service() -> bool:
    """Test the embedding service"""
    return await embedding_generator.test_connection()

def get_embedding_info() -> Dict[str, Any]:
    """Get embedding service information"""
    return embedding_generator.get_info()

# Embedding utilities
def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Calculate cosine similarity between two embeddings"""
    try:
        import math
        
        # Calculate dot product
        dot_product = sum(x * y for x, y in zip(a, b))
        
        # Calculate magnitudes
        magnitude_a = math.sqrt(sum(x * x for x in a))
        magnitude_b = math.sqrt(sum(x * x for x in b))
        
        # Avoid division by zero
        if magnitude_a == 0 or magnitude_b == 0:
            return 0.0
        
        # Calculate cosine similarity
        similarity = dot_product / (magnitude_a * magnitude_b)
        return similarity
        
    except Exception as error:
        logger.error(f"Failed to calculate cosine similarity: {error}")
        return 0.0

def euclidean_distance(a: List[float], b: List[float]) -> float:
    """Calculate Euclidean distance between two embeddings"""
    try:
        import math
        
        # Calculate squared differences
        squared_diffs = [(x - y) ** 2 for x, y in zip(a, b)]
        
        # Calculate Euclidean distance
        distance = math.sqrt(sum(squared_diffs))
        return distance
        
    except Exception as error:
        logger.error(f"Failed to calculate Euclidean distance: {error}")
        return float('inf')

def normalize_embedding(embedding: List[float]) -> List[float]:
    """Normalize an embedding to unit length"""
    try:
        import math
        
        # Calculate magnitude
        magnitude = math.sqrt(sum(x * x for x in embedding))
        
        # Avoid division by zero
        if magnitude == 0:
            return embedding
        
        # Normalize
        normalized = [x / magnitude for x in embedding]
        return normalized
        
    except Exception as error:
        logger.error(f"Failed to normalize embedding: {error}")
        return embedding

async def validate_embedding_config() -> Dict[str, Any]:
    """Validate embedding configuration and test service"""
    validation_result = {
        "config_valid": False,
        "service_available": False,
        "dimensions_correct": False,
        "error": None
    }
    
    try:
        # Check configuration
        if not config.embedding.api_key and config.embedding.provider != "ollama":
            validation_result["error"] = "API key is required for most providers"
            return validation_result
        
        if not config.embedding.model:
            validation_result["error"] = "Model name is required"
            return validation_result
        
        validation_result["config_valid"] = True
        
        # Test service
        service_available = await test_embedding_service()
        validation_result["service_available"] = service_available
        
        if service_available:
            # Test embedding dimensions
            test_embedding = await generate_embedding("test")
            expected_dims = config.embedding.dimensions
            actual_dims = len(test_embedding)
            
            validation_result["dimensions_correct"] = (actual_dims == expected_dims)
            
            if not validation_result["dimensions_correct"]:
                validation_result["error"] = (
                    f"Dimension mismatch: expected {expected_dims}, got {actual_dims}"
                )
        else:
            validation_result["error"] = "Embedding service is not available"
        
        return validation_result
        
    except Exception as error:
        validation_result["error"] = str(error)
        return validation_result
