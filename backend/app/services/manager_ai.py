"""
Manager AI Coaching Engine — performance-only context assembly + coaching generation.

CRITICAL: This service NEVER accesses wellbeing data (conversations, guided paths,
crisis events, stress ratings). The firewall is architectural, not just policy.
"""

import os
import json
import logging
import httpx
from sqlalchemy.orm import Session
from app.models.performance import PerformanceEvaluation
from app.models.org_profile import OrgProfile, RoleProfile
from app.models.toolkit import CoachingSession

logger = logging.getLogger(__name__)

BONSAI_API_KEY = os.getenv("BONSAI_API_KEY", "").strip()
BONSAI_BASE_URL = os.getenv("BONSAI_BASE_URL", "https://go.trybons.ai").strip().rstrip("/")
BONSAI_DEFAULT_MODEL = os.getenv("BONSAI_DEFAULT_MODEL", "anthropic/claude-sonnet-4.5").strip()


MANAGER_AI_SYSTEM_PROMPT = """You are a performance coaching assistant for managers, part of the Rafiki@Work platform by Shoulder2LeanOn.

STRICT RULES:
- Use ONLY the performance data provided in the context below. NEVER reference or infer employee wellbeing, emotional state, mental health, or personal circumstances.
- Generate structured coaching plans with these sections:
  1. SITUATION SUMMARY: Brief analysis of the performance data and the manager's concern
  2. CONVERSATION SCRIPT: Suggested opening, key questions to ask, topics to avoid
  3. ACTION OPTIONS: 3-5 concrete action steps the manager can take
  4. ESCALATION PATH: When and how to involve HR if needed
- Use a supportive coaching tone. No accusatory language. No diagnostic labels.
- You may suggest mentioning that confidential support resources are available to all employees, but NEVER imply the employee needs them or has any specific personal issue.
- Be culturally aware of East African workplace norms including respect for hierarchy, indirect communication styles, and community-oriented approaches.
- Reference Kenyan labor law (Employment Act 2007) when relevant to formal processes.

Respond in valid JSON with this structure:
{
  "situation_summary": "...",
  "conversation_script": "...",
  "action_options": ["...", "...", "..."],
  "escalation_path": "..."
}"""


def assemble_manager_context(
    db: Session,
    manager_user_id: int,
    employee_user_id: int,
    org_id: int,
) -> dict:
    """Gather ONLY performance domain data. NEVER wellbeing data.

    Assembles:
    - Performance evaluations (ratings, strengths, areas)
    - Org context (industry, work environment)
    - Role profiles (seniority band, work pattern)

    ZERO: conversations, guided paths, crisis events, stress ratings.
    """
    context = {
        "employee_user_id": employee_user_id,
        "evaluations": [],
        "org_context": {},
        "role_context": {},
    }

    # Load performance evaluations
    evaluations = (
        db.query(PerformanceEvaluation)
        .filter(
            PerformanceEvaluation.user_id == employee_user_id,
            PerformanceEvaluation.org_id == org_id,
        )
        .order_by(PerformanceEvaluation.created_at.desc())
        .limit(5)
        .all()
    )
    for ev in evaluations:
        context["evaluations"].append({
            "period": ev.evaluation_period,
            "rating": ev.overall_rating,
            "strengths": ev.strengths,
            "areas_for_improvement": ev.areas_for_improvement,
            "goals": ev.goals_for_next_period,
        })

    # Load org context
    org_profile = (
        db.query(OrgProfile)
        .filter(OrgProfile.org_id == org_id)
        .first()
    )
    if org_profile:
        context["org_context"] = {
            "industry": org_profile.industry,
            "work_environment": org_profile.work_environment,
        }

    # Load role profiles (all for the org — pick most relevant if needed)
    role_profiles = (
        db.query(RoleProfile)
        .filter(RoleProfile.org_id == org_id)
        .all()
    )
    if role_profiles:
        # Use first role profile as general context
        rp = role_profiles[0]
        context["role_context"] = {
            "seniority_band": rp.seniority_band,
            "work_pattern": rp.work_pattern,
            "stressor_profile": rp.stressor_profile,
        }

    return context


def _build_coaching_prompt(context: dict, concern: str) -> str:
    """Build the user prompt from assembled context and manager's concern."""
    parts = [f"MANAGER'S CONCERN: {concern}\n"]

    if context.get("evaluations"):
        parts.append("PERFORMANCE DATA:")
        for ev in context["evaluations"]:
            parts.append(f"  - Period: {ev['period']}, Rating: {ev['rating']}/5")
            if ev.get("strengths"):
                parts.append(f"    Strengths: {ev['strengths']}")
            if ev.get("areas_for_improvement"):
                parts.append(f"    Areas for improvement: {ev['areas_for_improvement']}")
            if ev.get("goals"):
                parts.append(f"    Goals: {ev['goals']}")
        parts.append("")

    if context.get("org_context"):
        oc = context["org_context"]
        parts.append(f"ORG CONTEXT: Industry={oc.get('industry', 'N/A')}, "
                      f"Environment={oc.get('work_environment', 'N/A')}")
        parts.append("")

    parts.append("Generate a coaching plan based on the above data and concern.")
    return "\n".join(parts)


def generate_coaching_plan(
    db: Session,
    manager_id: int,
    employee_user_id: int,
    org_id: int,
    concern: str,
    employee_name: str = "",
) -> dict:
    """AI-powered coaching plan from performance data only.

    Returns dict with: session_id, situation_summary, conversation_script,
    action_options, escalation_path.
    """
    # 1. Assemble performance-only context
    context = assemble_manager_context(db, manager_id, employee_user_id, org_id)

    # 2. Build prompts
    user_prompt = _build_coaching_prompt(context, concern)

    # 3. Call AI
    ai_response_text = ""
    structured = {}

    if BONSAI_API_KEY:
        try:
            bonsai_url = BONSAI_BASE_URL + "/v1/messages"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {BONSAI_API_KEY}",
                "anthropic-version": "2023-06-01",
            }
            payload = {
                "model": BONSAI_DEFAULT_MODEL,
                "max_tokens": 2048,
                "system": MANAGER_AI_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_prompt}],
            }

            with httpx.Client() as client:
                r = client.post(bonsai_url, headers=headers, json=payload, timeout=60)

            if r.status_code < 400:
                data = r.json()
                for block in (data.get("content") or []):
                    if isinstance(block, dict) and block.get("type") == "text":
                        ai_response_text += block.get("text", "")

                # Try to parse structured JSON from response
                try:
                    structured = json.loads(ai_response_text)
                except json.JSONDecodeError:
                    structured = {
                        "situation_summary": ai_response_text[:500],
                        "conversation_script": "",
                        "action_options": [],
                        "escalation_path": "",
                    }
            else:
                logger.warning("Bonsai coaching call failed: %d %s", r.status_code, r.text[:200])

        except Exception as e:
            logger.error("Coaching AI error: %s", e)

    # Fallback if AI unavailable
    if not structured:
        structured = _generate_fallback_plan(concern, context)
        ai_response_text = json.dumps(structured)

    # 4. Log the session
    session = CoachingSession(
        manager_id=manager_id,
        org_id=org_id,
        employee_member_id=employee_user_id,
        employee_name=employee_name,
        concern=concern,
        context_used=context,
        ai_response=ai_response_text,
        structured_response=structured,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "employee_name": employee_name,
        "situation_summary": structured.get("situation_summary", ""),
        "conversation_script": structured.get("conversation_script", ""),
        "action_options": structured.get("action_options", []),
        "escalation_path": structured.get("escalation_path", ""),
    }


def _generate_fallback_plan(concern: str, context: dict) -> dict:
    """Generate a basic coaching plan when AI is unavailable."""
    eval_summary = ""
    if context.get("evaluations"):
        ratings = [e["rating"] for e in context["evaluations"]]
        avg = sum(ratings) / len(ratings)
        eval_summary = f"Average performance rating: {avg:.1f}/5 across {len(ratings)} evaluation(s)."

    return {
        "situation_summary": (
            f"The manager has raised a concern: \"{concern}\". "
            f"{eval_summary} "
            "AI coaching is currently unavailable — please use the HR Toolkit modules for structured guidance."
        ),
        "conversation_script": (
            "Opening: 'I'd like to have a conversation about [topic]. I value your work and want to support you.'\n\n"
            "Key questions:\n"
            "- 'Can you help me understand your perspective on this?'\n"
            "- 'What challenges are you facing?'\n"
            "- 'How can I better support you?'\n\n"
            "Avoid: Making assumptions, using accusatory language, referencing personal matters."
        ),
        "action_options": [
            "Schedule a 1:1 conversation in a private setting",
            "Review relevant toolkit modules for structured guidance",
            "Set clear, measurable goals with a follow-up timeline",
            "Consider whether additional training or resources would help",
            "Document the conversation and agreed action items",
        ],
        "escalation_path": (
            "If the situation doesn't improve after 2-3 conversations, or if it involves "
            "policy violations, harassment, or legal concerns, escalate to HR immediately. "
            "Under the Kenya Employment Act 2007, formal disciplinary processes require "
            "written notice and fair hearing."
        ),
    }
