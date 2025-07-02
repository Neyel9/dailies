"""
Semantic chunking with LLM assistance for optimal document segmentation
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import re
from datetime import datetime

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangChainDocument

from ..config import config
from ..models import DocumentChunk, Document
from ..providers import get_llm_model

logger = logging.getLogger(__name__)

@dataclass
class ChunkingConfig:
    """Configuration for document chunking"""
    chunk_size: int = config.processing.chunk_size
    chunk_overlap: int = config.processing.chunk_overlap
    max_chunk_size: int = config.processing.max_chunk_size
    use_semantic_chunking: bool = True
    preserve_structure: bool = True
    min_chunk_size: int = 100
    
class SemanticChunker:
    """Advanced document chunker with semantic awareness"""
    
    def __init__(self, chunking_config: Optional[ChunkingConfig] = None):
        self.config = chunking_config or ChunkingConfig()
        self.llm_model = get_llm_model()
        
        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
            length_function=len,
            separators=[
                "\n\n\n",  # Multiple line breaks
                "\n\n",    # Double line breaks
                "\n",      # Single line breaks
                ". ",      # Sentence endings
                "! ",      # Exclamation endings
                "? ",      # Question endings
                "; ",      # Semicolons
                ", ",      # Commas
                " ",       # Spaces
                "",        # Characters
            ]
        )
    
    async def chunk_document(self, document: Document) -> List[DocumentChunk]:
        """Chunk a document into semantically coherent segments"""
        try:
            logger.info(f"Chunking document: {document.original_name}")
            
            # Get extracted text
            text_content = document.metadata.custom_fields.get("extracted_text", "")
            
            if not text_content.strip():
                logger.warning(f"No text content found for document {document.document_id}")
                return []
            
            # Preprocess text
            preprocessed_text = self._preprocess_text(text_content)
            
            # Perform chunking based on configuration
            if self.config.use_semantic_chunking:
                chunks = await self._semantic_chunk(preprocessed_text, document)
            else:
                chunks = await self._basic_chunk(preprocessed_text, document)
            
            # Post-process chunks
            processed_chunks = self._post_process_chunks(chunks, document)
            
            logger.info(f"Created {len(processed_chunks)} chunks for document {document.original_name}")
            return processed_chunks
            
        except Exception as error:
            logger.error(f"Document chunking failed: {error}")
            return []
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for better chunking"""
        try:
            # Remove excessive whitespace
            text = re.sub(r'\s+', ' ', text)
            
            # Normalize line breaks
            text = re.sub(r'\n\s*\n', '\n\n', text)
            
            # Remove page markers if present
            text = re.sub(r'--- Page \d+ ---\n?', '', text)
            text = re.sub(r'--- Page \d+ \(OCR\) ---\n?', '', text)
            
            # Clean up common PDF artifacts
            text = re.sub(r'\x0c', '\n', text)  # Form feed characters
            text = re.sub(r'[^\x00-\x7F]+', ' ', text)  # Non-ASCII characters
            
            # Normalize punctuation spacing
            text = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', text)
            
            return text.strip()
            
        except Exception as error:
            logger.warning(f"Text preprocessing failed: {error}")
            return text
    
    async def _semantic_chunk(self, text: str, document: Document) -> List[str]:
        """Perform semantic chunking with LLM assistance"""
        try:
            # First, do basic chunking to get manageable segments
            basic_chunks = self.text_splitter.split_text(text)
            
            # If we have a reasonable number of chunks, use them as-is
            if len(basic_chunks) <= 20:
                return basic_chunks
            
            # For larger documents, use LLM to identify semantic boundaries
            semantic_chunks = []
            current_batch = []
            batch_size = 5  # Process chunks in batches
            
            for i, chunk in enumerate(basic_chunks):
                current_batch.append(chunk)
                
                # Process batch when full or at end
                if len(current_batch) >= batch_size or i == len(basic_chunks) - 1:
                    try:
                        # Use LLM to identify optimal boundaries
                        optimized_chunks = await self._optimize_chunk_boundaries(current_batch)
                        semantic_chunks.extend(optimized_chunks)
                    except Exception as llm_error:
                        logger.warning(f"LLM chunking failed, using basic chunks: {llm_error}")
                        semantic_chunks.extend(current_batch)
                    
                    current_batch = []
                    
                    # Small delay to avoid overwhelming the LLM
                    await asyncio.sleep(0.1)
            
            return semantic_chunks
            
        except Exception as error:
            logger.warning(f"Semantic chunking failed, falling back to basic: {error}")
            return self.text_splitter.split_text(text)
    
    async def _basic_chunk(self, text: str, document: Document) -> List[str]:
        """Perform basic text chunking"""
        return self.text_splitter.split_text(text)
    
    async def _optimize_chunk_boundaries(self, chunks: List[str]) -> List[str]:
        """Use LLM to optimize chunk boundaries for semantic coherence"""
        try:
            # Combine chunks for analysis
            combined_text = "\n\n".join(chunks)
            
            # Create prompt for boundary optimization
            prompt = f"""
            Analyze the following text and identify optimal boundaries for semantic chunking.
            The goal is to create chunks that are semantically coherent and self-contained.
            
            Current text:
            {combined_text[:2000]}...
            
            Please suggest where to split this text into {len(chunks)} coherent chunks.
            Focus on:
            1. Topical boundaries
            2. Paragraph breaks
            3. Section transitions
            4. Maintaining context within chunks
            
            Return the optimized chunks separated by "---CHUNK_BOUNDARY---"
            """
            
            # This is a simplified implementation
            # In a full implementation, you would use the LLM to analyze and suggest boundaries
            # For now, return the original chunks
            return chunks
            
        except Exception as error:
            logger.warning(f"Chunk boundary optimization failed: {error}")
            return chunks
    
    def _post_process_chunks(self, chunks: List[str], document: Document) -> List[DocumentChunk]:
        """Post-process chunks and create DocumentChunk objects"""
        processed_chunks = []
        char_offset = 0
        
        for i, chunk_text in enumerate(chunks):
            # Skip chunks that are too small
            if len(chunk_text.strip()) < self.config.min_chunk_size:
                continue
            
            # Truncate chunks that are too large
            if len(chunk_text) > self.config.max_chunk_size:
                chunk_text = chunk_text[:self.config.max_chunk_size]
                logger.debug(f"Truncated chunk {i} to {self.config.max_chunk_size} characters")
            
            # Create chunk object
            chunk = DocumentChunk(
                document_id=document.document_id,
                content=chunk_text.strip(),
                chunk_index=i,
                start_char=char_offset,
                end_char=char_offset + len(chunk_text),
                metadata={
                    "document_title": document.metadata.title,
                    "document_source": document.original_name,
                    "chunk_method": "semantic" if self.config.use_semantic_chunking else "basic",
                    "created_at": datetime.now().isoformat(),
                    "file_type": document.metadata.file_type,
                    "page_count": document.metadata.page_count,
                }
            )
            
            processed_chunks.append(chunk)
            char_offset += len(chunk_text)
        
        return processed_chunks
    
    def _identify_structure(self, text: str) -> Dict[str, Any]:
        """Identify document structure (headers, sections, etc.)"""
        structure = {
            "headers": [],
            "sections": [],
            "paragraphs": [],
            "lists": [],
        }
        
        try:
            lines = text.split('\n')
            
            for i, line in enumerate(lines):
                line = line.strip()
                if not line:
                    continue
                
                # Identify headers (simple heuristics)
                if self._is_header(line):
                    structure["headers"].append({
                        "text": line,
                        "line_number": i,
                        "level": self._get_header_level(line)
                    })
                
                # Identify lists
                if self._is_list_item(line):
                    structure["lists"].append({
                        "text": line,
                        "line_number": i,
                        "type": self._get_list_type(line)
                    })
            
            return structure
            
        except Exception as error:
            logger.warning(f"Structure identification failed: {error}")
            return structure
    
    def _is_header(self, line: str) -> bool:
        """Check if a line is likely a header"""
        # Simple heuristics for header detection
        if len(line) > 100:  # Headers are usually shorter
            return False
        
        # Check for common header patterns
        header_patterns = [
            r'^[A-Z][A-Z\s]+$',  # ALL CAPS
            r'^\d+\.\s+[A-Z]',   # Numbered sections
            r'^[A-Z][a-z]+:',    # Title case with colon
            r'^Chapter\s+\d+',   # Chapter headings
            r'^Section\s+\d+',   # Section headings
        ]
        
        for pattern in header_patterns:
            if re.match(pattern, line):
                return True
        
        return False
    
    def _get_header_level(self, line: str) -> int:
        """Determine header level (1-6)"""
        # Simple heuristic based on line characteristics
        if re.match(r'^[A-Z][A-Z\s]+$', line):
            return 1  # ALL CAPS likely main header
        elif re.match(r'^\d+\.\s+', line):
            return 2  # Numbered sections
        elif re.match(r'^[A-Z][a-z]+:', line):
            return 3  # Title case with colon
        else:
            return 4  # Default level
    
    def _is_list_item(self, line: str) -> bool:
        """Check if a line is a list item"""
        list_patterns = [
            r'^\s*[-*•]\s+',     # Bullet points
            r'^\s*\d+\.\s+',     # Numbered lists
            r'^\s*[a-z]\)\s+',   # Lettered lists
            r'^\s*[ivx]+\.\s+',  # Roman numerals
        ]
        
        for pattern in list_patterns:
            if re.match(pattern, line):
                return True
        
        return False
    
    def _get_list_type(self, line: str) -> str:
        """Determine list type"""
        if re.match(r'^\s*[-*•]\s+', line):
            return "bullet"
        elif re.match(r'^\s*\d+\.\s+', line):
            return "numbered"
        elif re.match(r'^\s*[a-z]\)\s+', line):
            return "lettered"
        elif re.match(r'^\s*[ivx]+\.\s+', line):
            return "roman"
        else:
            return "unknown"
    
    def get_chunking_stats(self, chunks: List[DocumentChunk]) -> Dict[str, Any]:
        """Get statistics about the chunking process"""
        if not chunks:
            return {}
        
        chunk_sizes = [len(chunk.content) for chunk in chunks]
        
        return {
            "total_chunks": len(chunks),
            "avg_chunk_size": sum(chunk_sizes) / len(chunk_sizes),
            "min_chunk_size": min(chunk_sizes),
            "max_chunk_size": max(chunk_sizes),
            "total_characters": sum(chunk_sizes),
            "chunking_method": "semantic" if self.config.use_semantic_chunking else "basic",
            "config": {
                "chunk_size": self.config.chunk_size,
                "chunk_overlap": self.config.chunk_overlap,
                "max_chunk_size": self.config.max_chunk_size,
            }
        }
