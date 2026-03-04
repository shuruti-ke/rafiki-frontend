"""
Rafiki@Work — Web Search Service (Tavily)

Provides real-time web search when the user's question requires
external information (hotels, prices, news, etc.).
Gracefully disabled when TAVILY_API_KEY is not set.
"""

import logging
import os

logger = logging.getLogger(__name__)

_tavily_client = None


def _get_client():
    global _tavily_client
    if _tavily_client is not None:
        return _tavily_client

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        logger.info("TAVILY_API_KEY not set — web search disabled")
        return None

    try:
        from tavily import TavilyClient
        _tavily_client = TavilyClient(api_key=api_key)
        return _tavily_client
    except Exception as e:
        logger.warning("Failed to initialize Tavily client: %s", e)
        return None


def search_web(query: str, max_results: int = 5) -> str:
    """
    Search the web via Tavily and return formatted results.
    Returns empty string on error, missing API key, or no results.
    """
    client = _get_client()
    if not client:
        return ""

    try:
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth="basic",
        )

        results = response.get("results", [])
        if not results:
            return ""

        parts = []
        for r in results:
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            content = r.get("content", "")
            parts.append(f"  - {title}\n    URL: {url}\n    {content}")

        return "\n".join(parts)
    except Exception as e:
        logger.warning("Web search failed for query '%s': %s", query[:80], e)
        return ""
