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


def _build_search_query(current_message: str, history: list[dict] | None) -> str:
    """
    Build a richer search query by pulling key details from recent
    conversation history. This handles cases like:
      - User said "hotels in Mombasa under 8000 KES" earlier
      - Then follows up with "give me a list of hotels that fit the budget"
    Without history enrichment, the follow-up produces poor search results.
    """
    if not history:
        return current_message

    # Grab the last few user messages for context (skip assistant messages)
    recent_user_msgs = []
    for msg in reversed(history[-10:]):
        if msg.get("role") == "user":
            recent_user_msgs.append(msg.get("content", ""))
            if len(recent_user_msgs) >= 3:
                break

    if not recent_user_msgs:
        return current_message

    # Combine recent context with current message (most recent first)
    recent_user_msgs.reverse()
    context_text = " ".join(recent_user_msgs)

    # If the current message is already detailed (>60 chars), use it as-is
    if len(current_message) > 60:
        return current_message

    # Otherwise, combine context + current message, capped for Tavily
    combined = f"{context_text} {current_message}".strip()
    return combined[:400]


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


def search_web(query: str, max_results: int = 5, history: list[dict] | None = None) -> str:
    """
    Search the web via Tavily and return formatted results.
    Returns empty string on error, missing API key, or no results.

    If history is provided, recent user messages are used to enrich the
    search query so vague follow-ups still produce good results.
    """
    client = _get_client()
    if not client:
        return ""

    # Enrich query with recent conversation context
    search_query = _build_search_query(query, history)
    logger.info("Web search query: %s", search_query[:200])

    try:
        response = client.search(
            query=search_query,
            max_results=max_results,
            search_depth="advanced",
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
