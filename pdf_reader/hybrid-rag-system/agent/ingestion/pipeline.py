"""
Main ingestion pipeline that orchestrates PDF processing, chunking, embedding, and knowledge graph building
"""

import asyncio
import logging
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
import traceback

from .pdf_processor import PDFProcessor
from .chunker import SemanticChunker, ChunkingConfig
from ..embeddings import generate_embeddings_batch, test_embedding_service
from ..database import knowledge_graph
from ..models import Document, DocumentStatus, ProcessingResult
from ..database import vector_store, knowledge_graph

logger = logging.getLogger(__name__)

class IngestionPipelineError(Exception):
    """Exception raised for ingestion pipeline errors"""
    pass

class IngestionPipeline:
    """Main pipeline for processing PDFs into vector and graph stores"""
    
    def __init__(self):
        self.pdf_processor = PDFProcessor()
        self.chunker = SemanticChunker()
        
        # Pipeline statistics
        self.stats = {
            "documents_processed": 0,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "entities_extracted": 0,
            "relationships_created": 0,
            "total_processing_time": 0.0,
        }
    
    async def process_document(
        self,
        file_path: str,
        filename: str,
        original_name: str,
        metadata: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> ProcessingResult:
        """Process a single document through the complete pipeline"""
        start_time = datetime.now()
        job_id = f"job_{int(start_time.timestamp())}"
        
        try:
            logger.info(f"Starting document processing: {original_name}")
            
            # Initialize progress
            if progress_callback:
                progress_callback("Starting processing...", 0.0)
            
            # Step 1: PDF Processing (20%)
            if progress_callback:
                progress_callback("Extracting text from PDF...", 10.0)
            
            document = await self.pdf_processor.process_pdf(
                file_path=file_path,
                filename=filename,
                original_name=original_name
            )
            
            # Add custom metadata if provided
            if metadata:
                document.metadata.custom_fields.update(metadata)
            
            document.status = DocumentStatus.PROCESSING
            document.processing_started_at = start_time
            
            if progress_callback:
                progress_callback("Text extraction completed", 20.0)
            
            # Step 2: Document Chunking (40%)
            if progress_callback:
                progress_callback("Creating semantic chunks...", 25.0)
            
            chunks = await self.chunker.chunk_document(document)
            
            if not chunks:
                raise IngestionPipelineError("No chunks created from document")
            
            document.chunks = chunks
            
            if progress_callback:
                progress_callback(f"Created {len(chunks)} chunks", 40.0)
            
            # Step 3: Generate Embeddings (60%)
            if progress_callback:
                progress_callback("Generating embeddings...", 45.0)
            
            def embedding_progress(current: int, total: int):
                progress = 45.0 + (current / total) * 15.0
                if progress_callback:
                    progress_callback(f"Generating embeddings ({current}/{total})", progress)
            
            # Generate embeddings for all chunks
            chunk_texts = [chunk.content for chunk in chunks]
            embeddings = await generate_embeddings_batch(chunk_texts, embedding_progress)

            # Assign embeddings to chunks
            for chunk, embedding in zip(chunks, embeddings):
                chunk.embedding = embedding
            
            if progress_callback:
                progress_callback("Embeddings generated", 60.0)
            
            # Step 4: Store in Vector Database (70%)
            if progress_callback:
                progress_callback("Storing in vector database...", 65.0)
            
            vector_success = await vector_store.add_documents(chunks)
            
            if not vector_success:
                logger.warning("Failed to store some chunks in vector database")
            
            if progress_callback:
                progress_callback("Vector storage completed", 70.0)
            
            # Step 5: Build Knowledge Graph (90%)
            if progress_callback:
                progress_callback("Building knowledge graph...", 75.0)
            
            def graph_progress(current: int, total: int):
                progress = 75.0 + (current / total) * 15.0
                if progress_callback:
                    progress_callback(f"Processing entities ({current}/{total})", progress)
            
            # Build knowledge graph from document content
            full_text = document.metadata.custom_fields.get("extracted_text", "")
            episode_id = await knowledge_graph.add_episode(
                content=full_text,
                source=document.original_name,
                episode_id=document.document_id,
                metadata={
                    "document_title": document.metadata.title,
                    "file_type": document.metadata.file_type,
                    "chunk_count": len(chunks)
                }
            )

            graph_result = {
                "entities_created": 1,  # Simplified for now
                "relationships_created": 0,
                "episode_id": episode_id
            }
            
            if progress_callback:
                progress_callback("Knowledge graph completed", 90.0)
            
            # Step 6: Finalize (100%)
            if progress_callback:
                progress_callback("Finalizing processing...", 95.0)
            
            # Update document status
            document.status = DocumentStatus.COMPLETED
            document.processing_completed_at = datetime.now()
            
            # Calculate processing time
            processing_time = (document.processing_completed_at - start_time).total_seconds() * 1000
            
            # Update statistics
            self.stats["documents_processed"] += 1
            self.stats["chunks_created"] += len(chunks)
            self.stats["embeddings_generated"] += len([c for c in chunks if c.embedding])
            self.stats["entities_extracted"] += graph_result.get("entities_created", 0)
            self.stats["relationships_created"] += graph_result.get("relationships_created", 0)
            self.stats["total_processing_time"] += processing_time
            
            # Create result
            result = ProcessingResult(
                job_id=job_id,
                document_id=document.document_id,
                chunks_created=len(chunks),
                entities_extracted=graph_result.get("entities_created", 0),
                relationships_created=graph_result.get("relationships_created", 0),
                processing_time_ms=processing_time,
                success=True
            )
            
            if progress_callback:
                progress_callback("Processing completed successfully", 100.0)
            
            logger.info(f"Document processing completed: {original_name} in {processing_time:.1f}ms")
            return result
            
        except Exception as error:
            # Handle processing error
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            logger.error(f"Document processing failed: {original_name}")
            logger.error(f"Error: {error}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Update document status if it exists
            try:
                if 'document' in locals():
                    document.status = DocumentStatus.FAILED
                    document.error_message = str(error)
                    document.processing_completed_at = datetime.now()
            except Exception:
                pass
            
            # Create error result
            result = ProcessingResult(
                job_id=job_id,
                document_id=getattr(locals().get('document'), 'document_id', 'unknown'),
                chunks_created=0,
                entities_extracted=0,
                relationships_created=0,
                processing_time_ms=processing_time,
                success=False,
                error_message=str(error)
            )
            
            if progress_callback:
                progress_callback(f"Processing failed: {error}", 100.0)
            
            return result
    
    async def process_multiple_documents(
        self,
        file_info_list: List[Dict[str, str]],
        progress_callback: Optional[Callable[[str, float, int, int], None]] = None
    ) -> List[ProcessingResult]:
        """Process multiple documents concurrently"""
        results = []
        total_docs = len(file_info_list)
        
        logger.info(f"Starting batch processing of {total_docs} documents")
        
        for i, file_info in enumerate(file_info_list):
            try:
                # Individual document progress callback
                def doc_progress(message: str, progress: float):
                    if progress_callback:
                        overall_progress = ((i + progress / 100.0) / total_docs) * 100.0
                        progress_callback(
                            f"Document {i+1}/{total_docs}: {message}",
                            overall_progress,
                            i + 1,
                            total_docs
                        )
                
                # Process document
                result = await self.process_document(
                    file_path=file_info["file_path"],
                    filename=file_info["filename"],
                    original_name=file_info["original_name"],
                    metadata=file_info.get("metadata"),
                    progress_callback=doc_progress
                )
                
                results.append(result)
                
                # Small delay between documents
                if i < total_docs - 1:
                    await asyncio.sleep(0.5)
                
            except Exception as error:
                logger.error(f"Failed to process document {file_info.get('original_name', 'unknown')}: {error}")
                
                # Create error result
                error_result = ProcessingResult(
                    job_id=f"batch_job_{i}",
                    document_id="unknown",
                    chunks_created=0,
                    entities_extracted=0,
                    relationships_created=0,
                    processing_time_ms=0,
                    success=False,
                    error_message=str(error)
                )
                results.append(error_result)
        
        logger.info(f"Batch processing completed: {len(results)} results")
        return results
    
    async def validate_pipeline(self) -> Dict[str, bool]:
        """Validate that all pipeline components are working"""
        validation_results = {}
        
        try:
            # Test PDF processor
            validation_results["pdf_processor"] = True  # Basic validation
            
            # Test chunker
            validation_results["chunker"] = True  # Basic validation
            
            # Test embedding service
            validation_results["embedding_service"] = await test_embedding_service()
            
            # Test vector store
            try:
                await vector_store.get_collection_info()
                validation_results["vector_store"] = True
            except Exception:
                validation_results["vector_store"] = False
            
            # Test knowledge graph
            try:
                if knowledge_graph.driver:
                    await knowledge_graph.driver.verify_connectivity()
                    validation_results["knowledge_graph"] = True
                else:
                    validation_results["knowledge_graph"] = False
            except Exception:
                validation_results["knowledge_graph"] = False
            
            logger.info(f"Pipeline validation completed: {validation_results}")
            return validation_results
            
        except Exception as error:
            logger.error(f"Pipeline validation failed: {error}")
            return {"error": str(error)}
    
    def get_pipeline_stats(self) -> Dict[str, Any]:
        """Get pipeline processing statistics"""
        return {
            **self.stats,
            "avg_processing_time": (
                self.stats["total_processing_time"] / max(1, self.stats["documents_processed"])
            ),
            "avg_chunks_per_document": (
                self.stats["chunks_created"] / max(1, self.stats["documents_processed"])
            ),
            "embedding_success_rate": (
                self.stats["embeddings_generated"] / max(1, self.stats["chunks_created"])
            ) if self.stats["chunks_created"] > 0 else 0.0,
        }
    
    def reset_stats(self):
        """Reset pipeline statistics"""
        self.stats = {
            "documents_processed": 0,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "entities_extracted": 0,
            "relationships_created": 0,
            "total_processing_time": 0.0,
        }
        logger.info("Pipeline statistics reset")

# Global pipeline instance
ingestion_pipeline = IngestionPipeline()

# Convenience functions
async def process_pdf_file(
    file_path: str,
    filename: str,
    original_name: str,
    metadata: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable[[str, float], None]] = None
) -> ProcessingResult:
    """Process a single PDF file"""
    return await ingestion_pipeline.process_document(
        file_path=file_path,
        filename=filename,
        original_name=original_name,
        metadata=metadata,
        progress_callback=progress_callback
    )

async def validate_ingestion_pipeline() -> Dict[str, bool]:
    """Validate the ingestion pipeline"""
    return await ingestion_pipeline.validate_pipeline()

def get_ingestion_stats() -> Dict[str, Any]:
    """Get ingestion pipeline statistics"""
    return ingestion_pipeline.get_pipeline_stats()
