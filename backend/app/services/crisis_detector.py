"""
Crisis detection + background sentiment/stress analysis service.

Two-tier approach:
1. Fast keyword scan on every message (~0ms)
2. If keywords found -> full OpenAI-based contextual analysis (~1-2s)
"""

import os
import json
import logging
import threading
import httpx
from uuid import UUID

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = (os.getenv("OPENAI_BASE_URL", "https://api.openai.com").strip().rstrip("/"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

# ── Crisis keywords (ported from uploads/text/main.py) ──

CRISIS_KEYWORDS = [
    "suicide", "kill myself", "want to die", "end my life", "no point living",
    "better off dead", "dont want to be here", "hurt myself", "self harm", "cutting",
    "jump off", "bridge height", "tall building", "overdose", "how many pills",
    "painless way", "end it all", "cant go on", "give up on life", "not worth living",
]

HIGH_RISK_PATTERNS = [
    "kill myself", "want to die", "end my life", "suicide",
    "better off dead", "end it all", "not worth living",
]

METHOD_PATTERNS = [
    "bridge", "height", "meters high", "how many pills",
    "overdose", "painless way", "jump off", "tall building",
]

DISTRESS_KEYWORDS = [
    "hopeless", "trapped", "burden", "worthless", "alone",
    "nobody cares", "cant take it", "lost my job", "fired",
    "no reason to live", "give up", "cant go on",
]

# 18-category topic list (ported from old codebase)
MENTAL_HEALTH_TOPICS = [
    "depression", "anxiety", "relationships", "family", "loneliness",
    "work_stress", "school_stress", "sleep_issues", "self_esteem", "grief",
    "trauma", "anger", "substance_use", "eating_concerns", "self_harm",
    "suicidal_thoughts", "financial_stress", "health_concerns",
]

# ── Safety analysis prompt (for Haiku) ──

SAFETY_ANALYSIS_PROMPT = """Analyze this message for self-harm or suicide risk. Consider context carefully — not every mention of these topics is a crisis.

Return ONLY valid JSON:
{
  "risk_level": "none|low|medium|high|critical",
  "reasoning": "brief explanation",
  "detected_patterns": ["list of concerning phrases found"],
  "recommended_action": "proceed|safety_check|crisis_response"
}

Rules:
- "none": No risk detected, normal conversation
- "low": Mild distress but no safety concern
- "medium": Moderate distress, gentle check-in appropriate
- "high": Significant distress, safety intervention needed
- "critical": Direct suicidal/self-harm language, immediate crisis response

- "proceed": Continue normally
- "safety_check": Add a gentle wellbeing check-in to the response
- "crisis_response": Override response with crisis support + helplines"""

SAFETY_INTERVENTION_PROMPTS = {
    "crisis_response": (
        "CRITICAL SAFETY OVERRIDE: The user may be in crisis. "
        "Do NOT answer their question factually. Instead:\n"
        "1. Acknowledge their pain with genuine empathy\n"
        "2. Let them know they are not alone\n"
        "3. Ask them to reach out to a crisis helpline immediately\n"
        "4. Share the helpline numbers provided below\n"
        "5. Stay with them — ask if they are safe right now\n"
        "Do NOT provide information about methods of self-harm."
    ),
    "safety_check": (
        "SAFETY NOTE: The user may be experiencing distress. "
        "Before addressing their question, gently check in on how they are feeling. "
        "Be warm, empathetic, and let them know support is available. "
        "Share the helpline numbers below if appropriate."
    ),
}


def quick_safety_screen(text: str) -> str:
    """
    Fast keyword scan. Returns risk level: none, low, medium, high, critical.
    ~0ms, no API call.
    """
    lower = text.lower()

    # Check for critical keywords (direct suicidal language)
    critical_found = [kw for kw in HIGH_RISK_PATTERNS if kw in lower]
    if critical_found:
        return "critical"

    # Check for method-seeking + distress combo
    method_found = any(kw in lower for kw in METHOD_PATTERNS)
    distress_found = any(kw in lower for kw in DISTRESS_KEYWORDS)

    if method_found and distress_found:
        return "high"
    if method_found:
        return "medium"

    # Check broader crisis keywords
    crisis_found = any(kw in lower for kw in CRISIS_KEYWORDS)
    if crisis_found:
        return "medium"

    if distress_found:
        return "low"

    return "none"


def analyze_safety(text: str, history: list | None = None) -> dict:
    """
    Full contextual safety analysis using OpenAI.
    Only called when quick_safety_screen finds something.
    Returns: {risk_level, detected_patterns, recommended_action, safety_message}
    """
    if not OPENAI_API_KEY:
        # Fallback to keyword-only analysis
        return _keyword_safety_result(text)

    # Build context from recent history
    history_text = ""
    if history:
        recent = history[-3:]
        history_text = "\n".join(f"{m['role'].upper()}: {m['content'][:200]}" for m in recent)

    prompt = f"{SAFETY_ANALYSIS_PROMPT}\n\nRecent conversation:\n{history_text}\n\nCurrent message: {text}"

    try:
        base = OPENAI_BASE_URL.rstrip("/")
        url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
        resp = httpx.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": OPENAI_MODEL,
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=10,
        )
        if resp.status_code == 200:
            result = resp.json()
            ai_text = (result.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""

            ai_text = ai_text.strip()
            if not ai_text:
                logger.warning("Safety analysis: empty response body, falling back")
                return _keyword_safety_result(text)

            if ai_text.startswith("```"):
                ai_text = ai_text.split("```")[1]
                if ai_text.startswith("json"):
                    ai_text = ai_text[4:]
                ai_text = ai_text.strip()

            parsed = json.loads(ai_text)
            action = parsed.get("recommended_action", "proceed")
            return {
                "risk_level": parsed.get("risk_level", "none"),
                "detected_patterns": parsed.get("detected_patterns", []),
                "recommended_action": action,
                "safety_message": SAFETY_INTERVENTION_PROMPTS.get(action, ""),
            }
    except Exception as e:
        logger.warning("Safety analysis API call failed: %s — falling back to keyword check", e)

    return _keyword_safety_result(text)


def _keyword_safety_result(text: str) -> dict:
    """Keyword-only safety result when API is unavailable."""
    level = quick_safety_screen(text)
    action_map = {
        "critical": "crisis_response",
        "high": "crisis_response",
        "medium": "safety_check",
        "low": "proceed",
        "none": "proceed",
    }
    action = action_map[level]
    return {
        "risk_level": level,
        "detected_patterns": [kw for kw in CRISIS_KEYWORDS + DISTRESS_KEYWORDS if kw in text.lower()],
        "recommended_action": action,
        "safety_message": SAFETY_INTERVENTION_PROMPTS.get(action, ""),
    }


def get_safety_prompt_injection(risk_level: str, helplines_text: str) -> str:
    """Returns text to prepend to system prompt when risk detected."""
    action_map = {
        "critical": "crisis_response",
        "high": "crisis_response",
        "medium": "safety_check",
    }
    action = action_map.get(risk_level)
    if not action:
        return ""

    prompt = SAFETY_INTERVENTION_PROMPTS.get(action, "")
    if helplines_text:
        prompt += f"\n\n{helplines_text}"
    return prompt


# ── Background sentiment/stress analysis ──

SENTIMENT_CLASSIFIER_PROMPT = """Analyze this conversation exchange between a user and an AI assistant. Return ONLY valid JSON:
{
  "stress_level": <1-5 integer>,
  "sentiment": <float from -1.0 to 1.0>,
  "sentiment_label": "positive|neutral|negative",
  "topics": ["list of relevant topics from: depression, anxiety, relationships, family, loneliness, work_stress, school_stress, sleep_issues, self_esteem, grief, trauma, anger, substance_use, eating_concerns, self_harm, suicidal_thoughts, financial_stress, health_concerns"]
}

Stress scale: 1=relaxed/positive, 2=mild concern, 3=moderate stress, 4=high stress, 5=severe distress
Sentiment: -1.0=very negative, 0=neutral, 1.0=very positive
Only include topics that are clearly present in the conversation."""


def analyze_sentiment_background(
    user_message: str,
    assistant_reply: str,
    user_id: UUID,
    org_id: UUID,
    session_id: str | None = None,
):
    """Fire-and-forget background sentiment analysis. Runs in a thread."""
    thread = threading.Thread(
        target=_run_sentiment_analysis,
        args=(user_message, assistant_reply, user_id, org_id, session_id),
        daemon=True,
    )
    thread.start()


def _run_sentiment_analysis(
    user_message: str,
    assistant_reply: str,
    user_id: UUID,
    org_id: UUID,
    session_id: str | None,
):
    """Actual sentiment analysis — runs in background thread."""
    try:
        if not OPENAI_API_KEY:
            return

        prompt = (
            f"{SENTIMENT_CLASSIFIER_PROMPT}\n\n"
            f"USER: {user_message[:500]}\n"
            f"ASSISTANT: {assistant_reply[:500]}"
        )

        base = OPENAI_BASE_URL.rstrip("/")
        url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
        resp = httpx.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": OPENAI_MODEL,
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=15,
        )

        if resp.status_code != 200:
            logger.warning("Sentiment analysis returned %d", resp.status_code)
            return

        result = resp.json()
        ai_text = (result.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""

        ai_text = ai_text.strip()
        if not ai_text:
            logger.warning("Sentiment analysis: empty response body, skipping")
            return

        # Strip markdown fences if Haiku wrapped the JSON
        if ai_text.startswith("```"):
            ai_text = ai_text.split("```")[1]
            if ai_text.startswith("json"):
                ai_text = ai_text[4:]
            ai_text = ai_text.strip()

        parsed = json.loads(ai_text)
        stress_level = max(1, min(5, int(parsed.get("stress_level", 1))))
        sentiment = max(-1.0, min(1.0, float(parsed.get("sentiment", 0))))
        sentiment_label = parsed.get("sentiment_label", "neutral")
        topics = parsed.get("topics", [])

        # Persist to DB
        from app.database import SessionLocal
        from app.models.wellbeing import ChatAnalytics, CrisisAlert

        db = SessionLocal()
        try:
            session_uuid = None
            if session_id:
                import uuid as uuid_mod
                try:
                    session_uuid = uuid_mod.UUID(str(session_id))
                except ValueError:
                    pass

            analytics = ChatAnalytics(
                session_id=session_uuid,
                user_id=user_id,
                org_id=org_id,
                stress_level=stress_level,
                sentiment=sentiment,
                sentiment_label=sentiment_label,
                topics=topics,
            )
            db.add(analytics)

            # High stress -> also create crisis alert
            if stress_level >= 4:
                alert = CrisisAlert(
                    user_id=user_id,
                    org_id=org_id,
                    session_id=session_uuid,
                    risk_level="high" if stress_level == 4 else "critical",
                    trigger_text=user_message[:500],
                    detected_patterns=topics,
                    status="open",
                )
                db.add(alert)

            db.commit()
            logger.info("Sentiment analytics saved: stress=%d sentiment=%.2f topics=%s", stress_level, sentiment, topics)
        except Exception as e:
            logger.error("Failed to persist sentiment analytics: %s", e)
            db.rollback()
        finally:
            db.close()

    except Exception as e:
        logger.error("Background sentiment analysis failed: %s", e)
