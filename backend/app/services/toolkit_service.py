"""
HR Toolkit service — CRUD for toolkit modules + seed defaults.
"""

import logging
from sqlalchemy.orm import Session
from app.models.toolkit import ToolkitModule

logger = logging.getLogger(__name__)


def list_modules(
    db: Session,
    org_id: int,
    category: str | None = None,
    active_only: bool = True,
) -> list[ToolkitModule]:
    """List toolkit modules available to an org (org-specific + platform defaults)."""
    q = db.query(ToolkitModule).filter(
        (ToolkitModule.org_id == org_id) | (ToolkitModule.org_id == None)
    )
    if active_only:
        q = q.filter(ToolkitModule.is_active == True)
    if category:
        q = q.filter(ToolkitModule.category == category)
    return q.order_by(ToolkitModule.category, ToolkitModule.title).all()


def get_module(db: Session, module_id: int, org_id: int) -> ToolkitModule | None:
    """Get a single module by ID, scoped to org or platform defaults."""
    return (
        db.query(ToolkitModule)
        .filter(
            ToolkitModule.id == module_id,
            (ToolkitModule.org_id == org_id) | (ToolkitModule.org_id == None),
        )
        .first()
    )


def create_module(db: Session, org_id: int, data: dict, created_by: int) -> ToolkitModule:
    """Create a new toolkit module for an org."""
    module = ToolkitModule(
        org_id=org_id,
        category=data["category"],
        title=data["title"],
        content=data.get("content", {}),
        language=data.get("language", "en"),
        created_by=created_by,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


def update_module(db: Session, module: ToolkitModule, data: dict) -> ToolkitModule:
    """Update an existing toolkit module."""
    for field, value in data.items():
        if value is not None and hasattr(module, field):
            setattr(module, field, value)
    module.version = (module.version or 1) + 1
    db.commit()
    db.refresh(module)
    return module


# --- Default Toolkit Seed Data ---

DEFAULT_MODULES = [
    {
        "category": "coaching",
        "title": "1:1 Meeting Preparation Guide",
        "content": {
            "sections": [
                {
                    "heading": "Before the Meeting",
                    "body": "Review the team member's recent objectives, completed tasks, and any feedback received. Prepare 2-3 specific items to discuss.",
                    "prompts": [
                        "What has this person accomplished since our last 1:1?",
                        "Are there any blockers I should ask about?",
                        "What development opportunities can I offer?",
                    ],
                },
                {
                    "heading": "During the Meeting",
                    "body": "Start with a check-in. Let them lead the agenda. Listen more than you speak. Take notes on action items.",
                    "prompts": [
                        "How are things going for you this week?",
                        "What's your biggest challenge right now?",
                        "How can I better support you?",
                    ],
                },
                {
                    "heading": "After the Meeting",
                    "body": "Send a summary of action items within 24 hours. Follow up on commitments you made. Note any concerns for future discussion.",
                    "prompts": [],
                },
            ]
        },
    },
    {
        "category": "conversation",
        "title": "Difficult Conversation Framework",
        "content": {
            "sections": [
                {
                    "heading": "Preparation",
                    "body": "Define the specific behavior or situation. Focus on observable facts, not assumptions. Identify the impact on the team or work.",
                    "prompts": [
                        "What specific behavior am I addressing?",
                        "What is the measurable impact?",
                        "What outcome do I want from this conversation?",
                    ],
                },
                {
                    "heading": "Opening the Conversation",
                    "body": "Use a direct but respectful opening. State the purpose clearly. Avoid softening the message so much that it gets lost.",
                    "prompts": [
                        "I'd like to discuss [specific topic] with you because it's important for [reason].",
                        "I've noticed [specific observation] and I want to understand your perspective.",
                    ],
                },
                {
                    "heading": "Listening & Exploring",
                    "body": "Ask open-ended questions. Listen without interrupting. Acknowledge their perspective before responding.",
                    "prompts": [
                        "Can you help me understand what happened from your point of view?",
                        "What challenges are you facing with this?",
                    ],
                },
                {
                    "heading": "Agreeing on Next Steps",
                    "body": "Collaboratively define clear, measurable action items. Set a follow-up date. Document the conversation.",
                    "prompts": [
                        "What do you think would be a good first step?",
                        "Let's agree on what success looks like by [date].",
                    ],
                },
            ]
        },
    },
    {
        "category": "pip",
        "title": "Performance Improvement Plan Template",
        "content": {
            "sections": [
                {
                    "heading": "Performance Gap Identification",
                    "body": "Clearly document the specific performance areas that need improvement. Reference objective metrics, evaluation data, and concrete examples.",
                    "prompts": [
                        "What specific standards are not being met?",
                        "What evidence supports this assessment?",
                        "How long has this gap existed?",
                    ],
                },
                {
                    "heading": "Improvement Goals",
                    "body": "Set SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound). Limit to 2-3 goals to maintain focus.",
                    "prompts": [],
                },
                {
                    "heading": "Support & Resources",
                    "body": "Define what support the organization will provide: training, mentoring, adjusted workload, regular check-ins.",
                    "prompts": [
                        "What training or resources does this person need?",
                        "Who can serve as a mentor or buddy?",
                        "What barriers should be removed?",
                    ],
                },
                {
                    "heading": "Timeline & Review",
                    "body": "Set a clear timeline (typically 30-90 days). Schedule regular check-ins (weekly recommended). Define success criteria.",
                    "prompts": [],
                },
                {
                    "heading": "Kenya Employment Act Compliance",
                    "body": "Under the Employment Act 2007, ensure: written notice of concerns is provided, employee has opportunity to respond, fair hearing process is followed, and all documentation is maintained. Consult HR before initiating formal proceedings.",
                    "prompts": [],
                },
            ]
        },
    },
    {
        "category": "development",
        "title": "Development Plan Builder",
        "content": {
            "sections": [
                {
                    "heading": "Current State Assessment",
                    "body": "Assess current skills, strengths, and areas for growth. Use performance evaluation data and self-assessment input.",
                    "prompts": [
                        "What are this person's top 3 strengths?",
                        "What skills would help them grow in their role?",
                        "What are their career aspirations?",
                    ],
                },
                {
                    "heading": "Development Goals",
                    "body": "Set 2-3 development goals aligned with both organizational needs and individual aspirations. Include skill-building, stretch assignments, and exposure opportunities.",
                    "prompts": [],
                },
                {
                    "heading": "Action Plan",
                    "body": "For each goal, define specific actions: courses, projects, mentoring, shadowing, conferences. Set realistic timelines.",
                    "prompts": [],
                },
                {
                    "heading": "Progress Tracking",
                    "body": "Schedule quarterly reviews. Celebrate milestones. Adjust the plan as needed based on changing priorities.",
                    "prompts": [],
                },
            ]
        },
    },
    {
        "category": "conflict",
        "title": "Conflict Resolution Framework",
        "content": {
            "sections": [
                {
                    "heading": "Assess the Situation",
                    "body": "Determine the nature and severity of the conflict. Is it interpersonal, task-related, or process-related? Speak to each party individually first.",
                    "prompts": [
                        "What is the core issue from each person's perspective?",
                        "How is this affecting work output and team morale?",
                        "Is this a recurring pattern or a one-off incident?",
                    ],
                },
                {
                    "heading": "Mediation Process",
                    "body": "Bring parties together in a neutral setting. Set ground rules (respect, no interruptions, focus on solutions). Let each person share their perspective.",
                    "prompts": [
                        "We're here to find a solution that works for everyone.",
                        "Please share your perspective on what happened.",
                        "What would a good resolution look like for you?",
                    ],
                },
                {
                    "heading": "Resolution & Follow-Up",
                    "body": "Agree on concrete actions. Document the agreement. Schedule a follow-up in 2 weeks to check progress.",
                    "prompts": [],
                },
                {
                    "heading": "East African Workplace Context",
                    "body": "Be aware of cultural norms around hierarchy, indirect communication, and community-oriented conflict resolution. In many East African workplaces, involving a respected elder or senior colleague can help. Respect cultural approaches while ensuring fair process.",
                    "prompts": [],
                },
            ]
        },
    },
    {
        "category": "compliance",
        "title": "Leave & EAP Routing Guide",
        "content": {
            "sections": [
                {
                    "heading": "Leave Entitlements (Kenya)",
                    "body": "Under the Employment Act 2007: Annual leave (21 days), Sick leave (with medical certificate), Maternity leave (3 months), Paternity leave (2 weeks). Always route specific leave questions to HR.",
                    "prompts": [],
                },
                {
                    "heading": "Employee Assistance Programme (EAP)",
                    "body": "If a team member appears to be struggling, you can mention that confidential support resources are available. Never diagnose, assume, or pressure someone to use EAP services.",
                    "prompts": [
                        "Just so you know, the company offers confidential support services if you ever want to explore them.",
                        "I want to make sure you know about the resources available to all employees.",
                    ],
                },
                {
                    "heading": "When to Escalate to HR",
                    "body": "Escalate to HR for: formal disciplinary matters, harassment or discrimination reports, extended absence management, accommodation requests, any legal or compliance concerns.",
                    "prompts": [],
                },
            ]
        },
    },
]


def seed_default_modules(db: Session) -> int:
    """Seed default platform-wide toolkit modules. Returns count of new modules created."""
    existing_titles = {
        m.title
        for m in db.query(ToolkitModule.title)
        .filter(ToolkitModule.org_id == None)
        .all()
    }

    created = 0
    for mod_data in DEFAULT_MODULES:
        if mod_data["title"] not in existing_titles:
            module = ToolkitModule(
                org_id=None,
                category=mod_data["category"],
                title=mod_data["title"],
                content=mod_data["content"],
                language="en",
                created_by=None,
                approved_by="platform_default",
            )
            db.add(module)
            created += 1

    if created:
        db.commit()
        logger.info("Seeded %d default toolkit modules", created)

    return created
