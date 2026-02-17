from sqlalchemy.orm import Session
from app.models.guided_path import GuidedModule

SEED_BLUEPRINTS = [
    {
        "name": "Burnout Check",
        "category": "burnout_check",
        "description": "A quick self-check to explore burnout signals and identify one small relief action.",
        "duration_minutes": 5,
        "icon": "fire",
        "steps": [
            {
                "type": "rating",
                "message": "On a scale of 0-10, how drained do you feel right now? (0 = fully energised, 10 = completely exhausted)",
                "expected_input": "rating_0_10",
                "safety_check": False,
            },
            {
                "type": "prompt",
                "message": "Which area feels like the biggest drain right now?\n\n• Workload & deadlines\n• Emotional demands from others\n• Lack of control or autonomy\n• Feeling unrecognised\n• Poor boundaries between work and rest",
                "expected_input": "free_text",
                "safety_check": False,
            },
            {
                "type": "reflection",
                "message": "Imagine you could take back just 10%% of the energy that drain is costing you. What's one tiny thing you could do today — even something that takes under 2 minutes — to reclaim a small piece of that energy?",
                "expected_input": "free_text",
                "safety_check": False,
            },
            {
                "type": "rating",
                "message": "After reflecting on that, where are you now on the 0-10 scale?",
                "expected_input": "rating_0_10",
                "safety_check": False,
            },
        ],
        "triggers": ["burnout", "exhaustion", "drained"],
        "safety_checks": ["crisis_language"],
    },
    {
        "name": "Breathing Reset",
        "category": "breathing_reset",
        "description": "A guided breathing exercise to quickly reset your nervous system.",
        "duration_minutes": 3,
        "icon": "wind",
        "steps": [
            {
                "type": "intro",
                "message": "Let's do a quick breathing reset. This takes about 2 minutes and can help calm your nervous system. Find a comfortable position — sitting or standing is fine.",
                "expected_input": None,
                "safety_check": False,
            },
            {
                "type": "video",
                "message": "Follow along with this guided breathing exercise. Breathe in for 4 counts, hold for 4, out for 6.",
                "expected_input": None,
                "safety_check": False,
                "media_url": "https://www.youtube.com/watch?v=tEmt1Znux58",
            },
            {
                "type": "prompt",
                "message": "Take a moment to notice your body. Where do you feel the most tension right now? Shoulders, jaw, chest, stomach, or somewhere else?",
                "expected_input": "free_text",
                "safety_check": False,
            },
            {
                "type": "rating",
                "message": "How calm do you feel now compared to when you started? (0 = no change, 10 = much calmer)",
                "expected_input": "rating_0_10",
                "safety_check": False,
            },
        ],
        "triggers": ["anxiety", "panic", "breathing", "calm"],
        "safety_checks": [],
    },
    {
        "name": "Stress Decompress",
        "category": "stress_decompress",
        "description": "Name your stressor, reframe it, and release tension with a guided relaxation.",
        "duration_minutes": 7,
        "icon": "cloud",
        "steps": [
            {
                "type": "rating",
                "message": "Right now, how stressed do you feel? (0 = perfectly calm, 10 = overwhelmed)",
                "expected_input": "rating_0_10",
                "safety_check": False,
            },
            {
                "type": "input",
                "message": "In a few words, what's the main thing weighing on you right now? It could be a situation, a person, a deadline — whatever comes to mind first.",
                "expected_input": "free_text",
                "safety_check": True,
            },
            {
                "type": "reflection",
                "message": "Sometimes stress comes from what we imagine might happen rather than what's actually happening. Looking at the thing you described — what part of it is within your control, and what part isn't?",
                "expected_input": "free_text",
                "safety_check": False,
            },
            {
                "type": "audio",
                "message": "Let's release some of that tension. Listen to this short relaxation guide and let your shoulders drop.",
                "expected_input": None,
                "safety_check": False,
                "media_url": "https://upload.wikimedia.org/wikipedia/commons/2/21/Meditation_bell.ogg",
            },
            {
                "type": "rating",
                "message": "How do you feel now? (0 = no change, 10 = much better)",
                "expected_input": "rating_0_10",
                "safety_check": False,
            },
        ],
        "triggers": ["stress", "overwhelmed", "pressure"],
        "safety_checks": ["crisis_language"],
    },
]


def seed_canonical_modules(db: Session) -> list[dict]:
    """Seed the 3 canonical module blueprints as global modules (org_id=None).

    Skips modules that already exist by name. Returns list of created modules.
    """
    created = []
    for blueprint in SEED_BLUEPRINTS:
        existing = db.query(GuidedModule).filter(
            GuidedModule.org_id.is_(None),
            GuidedModule.name == blueprint["name"],
        ).first()
        if existing:
            continue

        module = GuidedModule(
            org_id=None,
            name=blueprint["name"],
            category=blueprint["category"],
            description=blueprint["description"],
            duration_minutes=blueprint["duration_minutes"],
            icon=blueprint["icon"],
            steps=blueprint["steps"],
            triggers=blueprint["triggers"],
            safety_checks=blueprint["safety_checks"],
            created_by=0,  # system
        )
        db.add(module)
        db.commit()
        db.refresh(module)
        created.append({
            "id": module.id,
            "name": module.name,
            "category": module.category,
        })

    return created
