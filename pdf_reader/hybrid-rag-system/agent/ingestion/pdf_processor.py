"""
PDF processing utilities for text extraction and OCR
"""

import logging
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import tempfile
import os

# PDF processing libraries
import PyPDF2
from pdf2image import convert_from_path
import pytesseract
from PIL import Image

from ..config import config
from ..models import Document, DocumentMetadata, DocumentStatus

logger = logging.getLogger(__name__)

class PDFProcessingError(Exception):
    """Exception raised for PDF processing errors"""
    pass

class PDFProcessor:
    """PDF processor with text extraction and OCR capabilities"""
    
    def __init__(self):
        self.enable_ocr = config.processing.enable_ocr
        self.ocr_language = config.processing.ocr_language
        
    async def process_pdf(
        self,
        file_path: str,
        filename: str,
        original_name: str
    ) -> Document:
        """Process a PDF file and extract text content"""
        try:
            logger.info(f"Processing PDF: {original_name}")
            
            # Validate file exists
            if not os.path.exists(file_path):
                raise PDFProcessingError(f"File not found: {file_path}")
            
            # Extract metadata
            metadata = await self._extract_metadata(file_path, original_name)
            
            # Extract text content
            text_content = await self._extract_text(file_path)
            
            # Create document object
            document = Document(
                filename=filename,
                original_name=original_name,
                file_path=file_path,
                status=DocumentStatus.PROCESSING,
                metadata=metadata,
                processing_started_at=None,  # Will be set by pipeline
                processing_completed_at=None
            )
            
            # Store extracted text in metadata
            document.metadata.custom_fields["extracted_text"] = text_content
            document.metadata.custom_fields["text_length"] = len(text_content)
            
            logger.info(f"PDF processed successfully: {len(text_content)} characters extracted")
            return document
            
        except Exception as error:
            logger.error(f"PDF processing failed for {original_name}: {error}")
            raise PDFProcessingError(f"Failed to process PDF: {error}")
    
    async def _extract_metadata(self, file_path: str, original_name: str) -> DocumentMetadata:
        """Extract metadata from PDF file"""
        try:
            metadata = DocumentMetadata(
                title=original_name,
                file_size=os.path.getsize(file_path),
                file_type="application/pdf"
            )
            
            # Extract PDF-specific metadata
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                # Basic info
                metadata.page_count = len(pdf_reader.pages)
                
                # PDF metadata
                if pdf_reader.metadata:
                    pdf_meta = pdf_reader.metadata
                    
                    if pdf_meta.get('/Title'):
                        metadata.title = str(pdf_meta['/Title'])
                    
                    if pdf_meta.get('/Author'):
                        metadata.author = str(pdf_meta['/Author'])
                    
                    if pdf_meta.get('/CreationDate'):
                        try:
                            # Parse PDF date format
                            creation_date = str(pdf_meta['/CreationDate'])
                            # Basic parsing - could be enhanced
                            metadata.custom_fields["creation_date"] = creation_date
                        except Exception:
                            pass
                    
                    # Additional metadata
                    for key in ['/Subject', '/Creator', '/Producer', '/Keywords']:
                        if pdf_meta.get(key):
                            field_name = key.replace('/', '').lower()
                            metadata.custom_fields[field_name] = str(pdf_meta[key])
            
            return metadata
            
        except Exception as error:
            logger.warning(f"Failed to extract PDF metadata: {error}")
            # Return basic metadata
            return DocumentMetadata(
                title=original_name,
                file_size=os.path.getsize(file_path) if os.path.exists(file_path) else 0,
                file_type="application/pdf"
            )
    
    async def _extract_text(self, file_path: str) -> str:
        """Extract text from PDF using PyPDF2 and optionally OCR"""
        try:
            # First, try standard text extraction
            text_content = await self._extract_text_pypdf2(file_path)
            
            # If text extraction yields little content and OCR is enabled, try OCR
            if len(text_content.strip()) < 100 and self.enable_ocr:
                logger.info("Text extraction yielded little content, trying OCR")
                ocr_content = await self._extract_text_ocr(file_path)
                
                # Use OCR content if it's significantly longer
                if len(ocr_content.strip()) > len(text_content.strip()) * 2:
                    text_content = ocr_content
                    logger.info("Using OCR content as it's more comprehensive")
            
            return text_content
            
        except Exception as error:
            logger.error(f"Text extraction failed: {error}")
            raise PDFProcessingError(f"Failed to extract text: {error}")
    
    async def _extract_text_pypdf2(self, file_path: str) -> str:
        """Extract text using PyPDF2"""
        try:
            text_content = []
            
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text.strip():
                            text_content.append(f"--- Page {page_num + 1} ---\n{page_text}")
                    except Exception as page_error:
                        logger.warning(f"Failed to extract text from page {page_num + 1}: {page_error}")
                        continue
            
            full_text = "\n\n".join(text_content)
            logger.debug(f"PyPDF2 extracted {len(full_text)} characters")
            return full_text
            
        except Exception as error:
            logger.error(f"PyPDF2 text extraction failed: {error}")
            return ""
    
    async def _extract_text_ocr(self, file_path: str) -> str:
        """Extract text using OCR (pdf2image + pytesseract)"""
        if not self.enable_ocr:
            return ""
        
        try:
            logger.info("Starting OCR text extraction")
            
            # Convert PDF to images
            with tempfile.TemporaryDirectory() as temp_dir:
                # Convert PDF pages to images
                images = convert_from_path(
                    file_path,
                    dpi=200,  # Good balance of quality and speed
                    output_folder=temp_dir,
                    fmt='jpeg'
                )
                
                text_content = []
                
                for page_num, image in enumerate(images):
                    try:
                        # Perform OCR on the image
                        page_text = pytesseract.image_to_string(
                            image,
                            lang=self.ocr_language,
                            config='--psm 6'  # Uniform block of text
                        )
                        
                        if page_text.strip():
                            text_content.append(f"--- Page {page_num + 1} (OCR) ---\n{page_text}")
                        
                        # Small delay to prevent overwhelming the system
                        if page_num < len(images) - 1:
                            await asyncio.sleep(0.1)
                            
                    except Exception as page_error:
                        logger.warning(f"OCR failed for page {page_num + 1}: {page_error}")
                        continue
                
                full_text = "\n\n".join(text_content)
                logger.info(f"OCR extracted {len(full_text)} characters from {len(images)} pages")
                return full_text
                
        except Exception as error:
            logger.error(f"OCR text extraction failed: {error}")
            return ""
    
    async def validate_pdf(self, file_path: str) -> Tuple[bool, Optional[str]]:
        """Validate that the file is a valid PDF"""
        try:
            if not os.path.exists(file_path):
                return False, "File does not exist"
            
            # Check file size
            file_size = os.path.getsize(file_path)
            if file_size == 0:
                return False, "File is empty"
            
            # Try to open with PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                # Check if it has pages
                if len(pdf_reader.pages) == 0:
                    return False, "PDF has no pages"
                
                # Try to read first page
                first_page = pdf_reader.pages[0]
                first_page.extract_text()  # This will raise an exception if corrupted
            
            return True, None
            
        except Exception as error:
            return False, f"PDF validation failed: {error}"
    
    def get_processing_info(self) -> Dict[str, Any]:
        """Get information about PDF processing configuration"""
        return {
            "ocr_enabled": self.enable_ocr,
            "ocr_language": self.ocr_language,
            "supported_formats": ["application/pdf"],
            "features": {
                "text_extraction": True,
                "metadata_extraction": True,
                "ocr_fallback": self.enable_ocr,
                "multi_page_support": True
            }
        }
    
    async def estimate_processing_time(self, file_path: str) -> float:
        """Estimate processing time in seconds based on file size and page count"""
        try:
            if not os.path.exists(file_path):
                return 0.0
            
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            
            # Quick page count check
            try:
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    page_count = len(pdf_reader.pages)
            except Exception:
                page_count = max(1, int(file_size_mb))  # Rough estimate
            
            # Base processing time
            base_time = page_count * 2  # 2 seconds per page for text extraction
            
            # Add OCR time if enabled
            if self.enable_ocr:
                ocr_time = page_count * 10  # 10 seconds per page for OCR
                base_time += ocr_time
            
            # Add overhead
            overhead = max(5, file_size_mb * 0.5)  # Minimum 5 seconds overhead
            
            total_time = base_time + overhead
            
            logger.debug(f"Estimated processing time: {total_time:.1f}s for {page_count} pages")
            return total_time
            
        except Exception as error:
            logger.warning(f"Failed to estimate processing time: {error}")
            return 60.0  # Default estimate
