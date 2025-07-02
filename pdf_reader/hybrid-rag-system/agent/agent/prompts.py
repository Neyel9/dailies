"""
System prompts and prompt templates for the Hybrid RAG Agent
"""

from typing import Dict, List, Any

# ============================================================================
# Main System Prompt
# ============================================================================

SYSTEM_PROMPT = """You are an advanced AI assistant with access to a hybrid retrieval system that combines vector search and knowledge graph capabilities. Your goal is to provide accurate, helpful, and well-sourced responses to user questions about documents.

## Your Capabilities

You have access to the following tools:

1. **Vector Search**: Semantic similarity search across document chunks
   - Use for: Finding content similar to the user's query
   - Best for: Conceptual questions, topic exploration, content discovery

2. **Graph Search**: Knowledge graph traversal to find entity relationships
   - Use for: Finding connections between entities, exploring relationships
   - Best for: "How are X and Y related?", "What companies work with Z?"

3. **Hybrid Search**: Combined vector and graph search with intelligent ranking
   - Use for: Complex queries that benefit from both approaches
   - Best for: Multi-faceted questions, comprehensive analysis

4. **Document Retrieval**: Get full document content and metadata
   - Use for: When you need complete document context
   - Best for: Document summaries, full-text analysis

5. **Entity Relationships**: Explore specific entity connections in the knowledge graph
   - Use for: Understanding entity networks and relationships
   - Best for: "Who does X work with?", "What are Y's partnerships?"

## Tool Selection Strategy

Choose tools based on the query type:

- **Factual Questions**: Start with vector search for direct answers
- **Relationship Questions**: Use graph search or entity relationships
- **Complex Analysis**: Use hybrid search for comprehensive results
- **Document Overview**: Use document retrieval for full context
- **Multi-part Questions**: Combine multiple tools as needed

## Response Guidelines

1. **Be Transparent**: Always explain which tools you used and why
2. **Cite Sources**: Reference specific documents and chunks in your responses
3. **Be Comprehensive**: Use multiple tools when it would provide better answers
4. **Stay Focused**: Answer the user's specific question directly
5. **Acknowledge Limitations**: If you can't find relevant information, say so

## Response Format

Structure your responses as follows:

1. **Direct Answer**: Start with a clear, direct response to the user's question
2. **Supporting Evidence**: Provide details from the retrieved information
3. **Source Citations**: Reference the documents and chunks you used
4. **Additional Context**: Add relevant related information if helpful

## Tool Usage Examples

- User asks "What is machine learning?" → Use vector search
- User asks "How are Google and OpenAI connected?" → Use graph search
- User asks "Analyze the AI strategies of tech companies" → Use hybrid search
- User asks "Summarize the document about AI ethics" → Use document retrieval
- User asks "Who are Microsoft's AI partners?" → Use entity relationships

## Important Notes

- Always prioritize accuracy over speed
- If multiple tools could work, explain your choice
- Combine tools when it provides more complete answers
- Be honest about the limitations of your knowledge
- Focus on being helpful and informative

Remember: Your goal is to be the most helpful and accurate AI assistant possible by intelligently using the available tools to provide comprehensive, well-sourced responses."""

# ============================================================================
# Tool-Specific Prompts
# ============================================================================

VECTOR_SEARCH_PROMPT = """
You are performing a vector similarity search to find content semantically similar to the user's query.

Query: {query}

Focus on finding the most relevant document chunks that contain information related to this query. Look for:
- Direct mentions of the topic
- Related concepts and terminology
- Contextual information that would help answer the question

Return the most relevant chunks ranked by semantic similarity.
"""

GRAPH_SEARCH_PROMPT = """
You are performing a knowledge graph search to find entity relationships and connections.

Query: {query}

Focus on finding:
- Entities mentioned in the query
- Relationships between entities
- Connected entities that might be relevant
- Temporal relationships and changes over time

Explore the graph to find meaningful connections that would help answer the user's question.
"""

HYBRID_SEARCH_PROMPT = """
You are performing a hybrid search combining vector similarity and knowledge graph traversal.

Query: {query}

This search should:
1. Find semantically relevant content through vector search
2. Discover related entities and relationships through graph traversal
3. Combine and rank results intelligently
4. Provide comprehensive coverage of the topic

Use both approaches to give the most complete answer possible.
"""

# ============================================================================
# Response Templates
# ============================================================================

RESPONSE_TEMPLATES = {
    "no_results": """
I couldn't find any relevant information in the available documents to answer your question about "{query}". 

This could be because:
- The topic isn't covered in the current document collection
- The query might need to be rephrased
- The information might be in a different format than expected

Would you like to try rephrasing your question or asking about a different topic?
""",

    "partial_results": """
I found some relevant information about "{query}", but the results are limited. Here's what I found:

{content}

The available information might not be complete. Would you like me to search for related topics or try a different approach?
""",

    "comprehensive_results": """
Based on my search using {tools_used}, here's what I found about "{query}":

{content}

**Sources:**
{sources}

{additional_context}
""",

    "error_response": """
I encountered an error while searching for information about "{query}". 

Error: {error_message}

Please try rephrasing your question or contact support if the issue persists.
""",
}

# ============================================================================
# Context Templates
# ============================================================================

CONTEXT_TEMPLATES = {
    "document_context": """
**Document:** {title}
**Source:** {source}
**Relevant Section:** {content}
**Relevance Score:** {score:.2f}
""",

    "entity_context": """
**Entity:** {entity_name} ({entity_type})
**Relationships:** {relationships}
**Properties:** {properties}
""",

    "tool_usage": """
**Tools Used:**
{tool_list}

**Search Strategy:** {strategy_explanation}
""",
}

# ============================================================================
# Prompt Utilities
# ============================================================================

def format_system_prompt(user_context: Dict[str, Any] = None) -> str:
    """Format the system prompt with optional user context"""
    prompt = SYSTEM_PROMPT
    
    if user_context:
        # Add user-specific context if provided
        context_additions = []
        
        if user_context.get("user_preferences"):
            context_additions.append(f"User preferences: {user_context['user_preferences']}")
        
        if user_context.get("session_history"):
            context_additions.append("Consider the conversation history when responding.")
        
        if user_context.get("document_focus"):
            context_additions.append(f"Focus on documents related to: {user_context['document_focus']}")
        
        if context_additions:
            prompt += "\n\n## Additional Context\n" + "\n".join(context_additions)
    
    return prompt

def format_tool_prompt(tool_name: str, query: str, **kwargs) -> str:
    """Format tool-specific prompts"""
    prompt_map = {
        "vector_search": VECTOR_SEARCH_PROMPT,
        "graph_search": GRAPH_SEARCH_PROMPT,
        "hybrid_search": HYBRID_SEARCH_PROMPT,
    }
    
    if tool_name not in prompt_map:
        return f"Perform a {tool_name} for the query: {query}"
    
    return prompt_map[tool_name].format(query=query, **kwargs)

def format_response(
    template_name: str,
    query: str = "",
    content: str = "",
    tools_used: List[str] = None,
    sources: List[str] = None,
    error_message: str = "",
    additional_context: str = "",
    **kwargs
) -> str:
    """Format response using templates"""
    if template_name not in RESPONSE_TEMPLATES:
        return content or "No response template found."
    
    template = RESPONSE_TEMPLATES[template_name]
    
    # Format tools used
    tools_str = ", ".join(tools_used) if tools_used else "search tools"
    
    # Format sources
    sources_str = "\n".join(f"- {source}" for source in sources) if sources else "No specific sources cited"
    
    return template.format(
        query=query,
        content=content,
        tools_used=tools_str,
        sources=sources_str,
        error_message=error_message,
        additional_context=additional_context,
        **kwargs
    ).strip()

def create_context_summary(results: List[Dict[str, Any]], result_type: str = "mixed") -> str:
    """Create a context summary from search results"""
    if not results:
        return "No relevant information found."
    
    summaries = []
    
    for result in results:
        if result_type == "document" or "content" in result:
            # Document/chunk result
            summary = CONTEXT_TEMPLATES["document_context"].format(
                title=result.get("document_title", "Unknown Document"),
                source=result.get("document_source", "Unknown Source"),
                content=result.get("content", "")[:200] + "..." if len(result.get("content", "")) > 200 else result.get("content", ""),
                score=result.get("score", 0.0)
            )
        elif result_type == "entity" or "entity_name" in result:
            # Entity result
            relationships = ", ".join(result.get("relationships", []))[:100] + "..." if len(str(result.get("relationships", []))) > 100 else ", ".join(result.get("relationships", []))
            properties = str(result.get("properties", {}))[:100] + "..." if len(str(result.get("properties", {}))) > 100 else str(result.get("properties", {}))
            
            summary = CONTEXT_TEMPLATES["entity_context"].format(
                entity_name=result.get("entity_name", "Unknown Entity"),
                entity_type=result.get("entity_type", "Unknown Type"),
                relationships=relationships,
                properties=properties
            )
        else:
            # Generic result
            summary = f"- {str(result)[:200]}{'...' if len(str(result)) > 200 else ''}"
        
        summaries.append(summary)
    
    return "\n\n".join(summaries)

def explain_tool_usage(tools_used: List[str], query: str) -> str:
    """Explain why specific tools were used"""
    if not tools_used:
        return "No tools were used for this query."

    explanations = {
        "vector_search": "to find semantically similar content",
        "graph_search": "to explore entity relationships",
        "hybrid_search": "to combine semantic and relationship-based search",
        "document_retrieval": "to get complete document context",
        "entity_relationships": "to understand entity connections",
    }

    tool_explanations = []
    for tool in tools_used:
        explanation = explanations.get(tool, f"to perform {tool}")
        tool_explanations.append(f"- **{tool.replace('_', ' ').title()}**: {explanation}")

    strategy = f"For the query '{query}', I used multiple search approaches to provide comprehensive results."

    return CONTEXT_TEMPLATES["tool_usage"].format(
        tool_list="\n".join(tool_explanations),
        strategy_explanation=strategy
    )
