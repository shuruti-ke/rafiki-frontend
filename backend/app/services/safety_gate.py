import re

BLOCKED_PHRASES = [
    "your job description",
    "HR told us",
    "your manager reported",
    "we've been monitoring",
    "your employer requires",
    "performance review shows",
    "disciplinary record",
    "we noticed from your data",
    "based on your browsing",
    "your supervisor mentioned",
    "according to company surveillance",
    "keystroke log",
]

DIAGNOSTIC_PATTERNS = [
    r"you (?:have|are suffering from|are diagnosed with) (?:depression|anxiety disorder|PTSD|bipolar|schizophrenia|OCD|ADHD)",
    r"your diagnosis (?:is|of)",
    r"you (?:need|require) (?:medication|psychiatric)",
    r"clinical diagnosis",
]


def check_composed_content(steps: list[dict]) -> tuple[bool, list[str]]:
    """Check adapted steps for unsafe content. Returns (is_safe, violations)."""
    violations = []

    for i, step in enumerate(steps):
        message = step.get("message", "").lower()

        # Check blocked phrases
        for phrase in BLOCKED_PHRASES:
            if phrase.lower() in message:
                violations.append(f"Step {i}: blocked phrase '{phrase}'")

        # Check diagnostic language
        for pattern in DIAGNOSTIC_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                violations.append(f"Step {i}: diagnostic language detected")

    is_safe = len(violations) == 0
    return is_safe, violations
