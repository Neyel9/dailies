"""
Main Pydantic AI agent for the Hybrid RAG system
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, AsyncGenerator
from dataclasses import dataclass
from datetime import datetime

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model

from .config import config
from .models import (
    ChatRequest, ChatResponse, SearchRequest, SearchResponse,
    ChunkResult, GraphResult, ToolCall, StreamDelta
)
from .prompts import SYSTEM_PROMPT, format_system_prompt
from .providers import get_llm_model
from .tools import (
    vector_search_tool,
    graph_search_tool, 
    hybrid_search_tool,
    document_retrieval_tool,
    entity_relationships_tool,
    VectorSearchInput,
    GraphSearchInput,
    HybridSearchInput,
    DocumentRetrievalInput,
    EntityRelationshipInput
)

logger = logging.getLogger(__name__)

@dataclass
class AgentDependencies:
    """Dependencies for the agent"""
    session_id: str
    user_id: Optional[str] = None
    search_preferences: Dict[str, Any] = None
    request_id: Optional[str] = None
    
    def __post_init__(self):
        if self.search_preferences is None:
            self.search_preferences = {
                "use_vector": config.search.enable_vector_search,
                "use_graph": config.search.enable_graph_search,
                "use_hybrid": config.search.enable_hybrid_search,
                "default_limit": config.search.default_limit
            }

class HybridRAGAgent:
    """Main agent class for the Hybrid RAG system"""
    
    def __init__(self):
        self.model = get_llm_model()
        self.agent = self._create_agent()
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        
    def _create_agent(self) -> Agent:
        """Create the Pydantic AI agent with tools"""
        
        # Create agent with system prompt and tools
        agent = Agent(
            model=self.model,
            system_prompt=SYSTEM_PROMPT,
            deps_type=AgentDependencies,
        )
        
        # Register tools
        agent.tool(vector_search_tool)
        agent.tool(graph_search_tool)
        agent.tool(hybrid_search_tool)
        agent.tool(document_retrieval_tool)
        agent.tool(entity_relationships_tool)
        
        return agent
    
    async def chat(
        self,
        request: ChatRequest,
        deps: AgentDependencies
    ) -> ChatResponse:
        """Process a chat request and return response"""
        start_time = datetime.now()
        tools_used = []
        sources = []
        
        try:
            # Update session
            self._update_session(deps.session_id, request.message, "user")
            
            # Run the agent
            result = await self.agent.run(
                request.message,
                deps=deps
            )
            
            # Extract response
            response_text = result.data
            
            # Extract tool calls from result
            if hasattr(result, 'all_messages'):
                tools_used = self._extract_tool_calls(result.all_messages())
            
            # Update session with response
            self._update_session(deps.session_id, response_text, "assistant")
            
            # Calculate response time
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return ChatResponse(
                message=response_text,
                session_id=deps.session_id,
                tools_used=tools_used,
                sources=sources,
                response_time_ms=response_time,
                request_id=deps.request_id
            )
            
        except Exception as error:
            logger.error(f"Chat error: {error}", exc_info=True)
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return ChatResponse(
                message=f"I apologize, but I encountered an error while processing your request: {str(error)}",
                session_id=deps.session_id,
                tools_used=tools_used,
                sources=sources,
                response_time_ms=response_time,
                request_id=deps.request_id,
                success=False
            )
    
    async def chat_stream(
        self,
        request: ChatRequest,
        deps: AgentDependencies
    ) -> AsyncGenerator[StreamDelta, None]:
        """Process a chat request with streaming response"""
        try:
            # Update session
            self._update_session(deps.session_id, request.message, "user")
            
            # Yield session info
            yield StreamDelta(
                type="session",
                session_id=deps.session_id
            )
            
            # Stream the agent response
            full_response = ""
            tools_used = []
            
            async with self.agent.iter(request.message, deps=deps) as run:
                async for node in run:
                    if self.agent.is_model_request_node(node):
                        # Stream tokens from the model
                        async with node.stream(run.ctx) as request_stream:
                            async for event in request_stream:
                                from pydantic_ai.messages import PartStartEvent, PartDeltaEvent, TextPartDelta
                                
                                if isinstance(event, PartStartEvent) and event.part.part_kind == 'text':
                                    delta_content = event.part.content
                                    yield StreamDelta(type="text", content=delta_content)
                                    full_response += delta_content
                                
                                elif isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
                                    delta_content = event.delta.content
                                    yield StreamDelta(type="text", content=delta_content)
                                    full_response += delta_content
                    
                    elif self.agent.is_tool_call_node(node):
                        # Handle tool calls
                        tool_call = ToolCall(
                            tool_name=node.tool_name,
                            args=node.tool_args,
                            execution_time_ms=0  # Will be updated after execution
                        )
                        tools_used.append(tool_call)
            
            # Extract final tool calls
            if hasattr(run, 'all_messages'):
                tools_used = self._extract_tool_calls(run.all_messages())
            
            # Yield tools used
            if tools_used:
                yield StreamDelta(type="tools", tools=tools_used)
            
            # Update session with response
            self._update_session(deps.session_id, full_response, "assistant")
            
            # Yield end signal
            yield StreamDelta(type="end")
            
        except Exception as error:
            logger.error(f"Streaming chat error: {error}", exc_info=True)
            yield StreamDelta(
                type="error",
                error=f"I encountered an error while processing your request: {str(error)}"
            )
    
    async def search(
        self,
        request: SearchRequest,
        deps: AgentDependencies
    ) -> SearchResponse:
        """Perform a search using the specified method"""
        start_time = datetime.now()
        
        try:
            if request.search_type == "vector":
                results = await vector_search_tool(
                    VectorSearchInput(
                        query=request.query,
                        limit=request.limit
                    ),
                    deps
                )
            elif request.search_type == "graph":
                results = await graph_search_tool(
                    GraphSearchInput(
                        query=request.query,
                        depth=config.search.graph_depth
                    ),
                    deps
                )
            elif request.search_type == "hybrid":
                results = await hybrid_search_tool(
                    HybridSearchInput(
                        query=request.query,
                        limit=request.limit,
                        vector_weight=0.7,
                        graph_weight=0.3
                    ),
                    deps
                )
            else:
                raise ValueError(f"Unsupported search type: {request.search_type}")
            
            search_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return SearchResponse(
                query=request.query,
                search_type=request.search_type,
                results=results,
                total_results=len(results),
                search_time_ms=search_time,
                tools_used=[request.search_type],
                request_id=deps.request_id
            )
            
        except Exception as error:
            logger.error(f"Search error: {error}", exc_info=True)
            search_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return SearchResponse(
                query=request.query,
                search_type=request.search_type,
                results=[],
                total_results=0,
                search_time_ms=search_time,
                tools_used=[],
                request_id=deps.request_id,
                success=False
            )
    
    def _update_session(self, session_id: str, message: str, role: str):
        """Update session with new message"""
        if session_id not in self.active_sessions:
            self.active_sessions[session_id] = {
                "messages": [],
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
        
        self.active_sessions[session_id]["messages"].append({
            "role": role,
            "content": message,
            "timestamp": datetime.now()
        })
        self.active_sessions[session_id]["updated_at"] = datetime.now()
    
    def _extract_tool_calls(self, messages: List[Any]) -> List[ToolCall]:
        """Extract tool calls from agent messages"""
        tool_calls = []
        
        for message in messages:
            if hasattr(message, 'tool_calls') and message.tool_calls:
                for tool_call in message.tool_calls:
                    tool_calls.append(ToolCall(
                        tool_name=tool_call.function.name,
                        args=tool_call.function.arguments,
                        result_summary=None,  # Could be enhanced
                        execution_time_ms=None
                    ))
        
        return tool_calls
    
    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get session message history"""
        if session_id in self.active_sessions:
            return self.active_sessions[session_id]["messages"]
        return []
    
    def clear_session(self, session_id: str) -> bool:
        """Clear session history"""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
            return True
        return False

# Global agent instance
rag_agent = HybridRAGAgent()

# Convenience functions
async def process_chat_request(request: ChatRequest, deps: AgentDependencies) -> ChatResponse:
    """Process a chat request"""
    return await rag_agent.chat(request, deps)

async def process_chat_stream(request: ChatRequest, deps: AgentDependencies) -> AsyncGenerator[StreamDelta, None]:
    """Process a streaming chat request"""
    async for delta in rag_agent.chat_stream(request, deps):
        yield delta

async def process_search_request(request: SearchRequest, deps: AgentDependencies) -> SearchResponse:
    """Process a search request"""
    return await rag_agent.search(request, deps)
