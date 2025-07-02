"""
LLM provider abstraction for the Hybrid RAG Agent
"""

import logging
from typing import Any, Dict, Optional
from pydantic_ai.models import Model, OpenAIModel, AnthropicModel

from .config import config

logger = logging.getLogger(__name__)

class LLMProviderError(Exception):
    """Exception raised for LLM provider errors"""
    pass

def get_llm_model() -> Model:
    """Get the configured LLM model"""
    provider = config.llm.provider.lower()
    
    try:
        if provider == "openai":
            return _get_openai_model()
        elif provider == "anthropic":
            return _get_anthropic_model()
        elif provider == "ollama":
            return _get_ollama_model()
        elif provider == "openrouter":
            return _get_openrouter_model()
        elif provider == "gemini":
            return _get_gemini_model()
        else:
            # Default to OpenAI-compatible
            logger.warning(f"Unknown provider '{provider}', defaulting to OpenAI-compatible")
            return _get_openai_compatible_model()
            
    except Exception as error:
        logger.error(f"Failed to initialize LLM provider '{provider}': {error}")
        raise LLMProviderError(f"Failed to initialize LLM provider: {error}")

def _get_openai_model() -> OpenAIModel:
    """Get OpenAI model"""
    model_config = {
        "model": config.llm.model,
        "api_key": config.llm.api_key,
    }
    
    # Only add base_url if it's not the default OpenAI URL
    if config.llm.base_url != "https://api.openai.com/v1":
        model_config["base_url"] = config.llm.base_url
    
    return OpenAIModel(**model_config)

def _get_anthropic_model() -> AnthropicModel:
    """Get Anthropic model"""
    return AnthropicModel(
        model=config.llm.model,
        api_key=config.llm.api_key,
    )

def _get_ollama_model() -> OpenAIModel:
    """Get Ollama model (OpenAI-compatible)"""
    return OpenAIModel(
        model=config.llm.model,
        base_url=config.llm.base_url,
        api_key="ollama",  # Ollama doesn't require a real API key
    )

def _get_openrouter_model() -> OpenAIModel:
    """Get OpenRouter model (OpenAI-compatible)"""
    return OpenAIModel(
        model=config.llm.model,
        api_key=config.llm.api_key,
        base_url=config.llm.base_url,
    )

def _get_gemini_model() -> OpenAIModel:
    """Get Gemini model (OpenAI-compatible via proxy)"""
    return OpenAIModel(
        model=config.llm.model,
        api_key=config.llm.api_key,
        base_url=config.llm.base_url,
    )

def _get_openai_compatible_model() -> OpenAIModel:
    """Get generic OpenAI-compatible model"""
    return OpenAIModel(
        model=config.llm.model,
        api_key=config.llm.api_key,
        base_url=config.llm.base_url,
    )

def get_model_info() -> Dict[str, Any]:
    """Get information about the current model configuration"""
    return {
        "provider": config.llm.provider,
        "model": config.llm.model,
        "base_url": config.llm.base_url,
        "temperature": config.llm.temperature,
        "max_tokens": config.llm.max_tokens,
    }

def validate_model_config() -> bool:
    """Validate the current model configuration"""
    try:
        # Try to get the model
        model = get_llm_model()
        
        # Basic validation
        if not config.llm.api_key and config.llm.provider != "ollama":
            logger.error("API key is required for most providers")
            return False
        
        if not config.llm.model:
            logger.error("Model name is required")
            return False
        
        logger.info(f"Model configuration validated: {config.llm.provider}/{config.llm.model}")
        return True
        
    except Exception as error:
        logger.error(f"Model configuration validation failed: {error}")
        return False
