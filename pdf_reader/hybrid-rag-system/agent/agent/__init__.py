"""
Hybrid RAG Agent System

A sophisticated AI agent that combines vector search with knowledge graph capabilities
for intelligent document retrieval and question answering.
"""

__version__ = "1.0.0"
__author__ = "Hybrid RAG System"
__description__ = "AI Agent with Vector Search and Knowledge Graph Integration"

from .agent import rag_agent, AgentDependencies
from .models import *
from .config import config

__all__ = [
    "rag_agent",
    "AgentDependencies", 
    "config",
]
