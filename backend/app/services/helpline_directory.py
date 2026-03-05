"""
Per-country crisis helpline directory.
Returns org-custom helplines first, then country-specific, then global fallback.
"""

HELPLINES = {
    "KE": [
        {"name": "Befrienders Kenya", "number": "0722 178 177", "country": "Kenya"},
    ],
    "ZA": [
        {"name": "SADAG", "number": "0800 567 567", "country": "South Africa"},
    ],
    "TZ": [
        {"name": "Mental Health Tanzania", "number": "+255 222 150 224", "country": "Tanzania"},
    ],
    "UG": [
        {"name": "PCAF Uganda", "number": "+256 414 258 780", "country": "Uganda"},
    ],
    "RW": [
        {"name": "Rwanda Mental Health", "number": "+250 788 308 690", "country": "Rwanda"},
    ],
    "NG": [
        {"name": "MANI", "number": "+234 809 111 6264", "country": "Nigeria"},
    ],
    "GH": [
        {"name": "Mental Health Authority", "number": "+233 302 662 928", "country": "Ghana"},
    ],
}

DEFAULT_HELPLINE = {"name": "Befrienders Worldwide", "number": "www.befrienders.org", "country": "International"}


def get_helplines(country_code: str | None = None, org_config: dict | None = None) -> list:
    """Return helplines: org custom first, then country-specific, then global fallback."""
    result = []

    # Org custom helplines first
    if org_config and org_config.get("custom_helplines"):
        result.extend(org_config["custom_helplines"])

    # Country-specific
    if country_code:
        code = country_code.upper().strip()
        if code in HELPLINES:
            result.extend(HELPLINES[code])

    # Always include global fallback
    result.append(DEFAULT_HELPLINE)
    return result


def format_helplines_for_prompt(helplines: list) -> str:
    """Format helplines for injection into system prompt."""
    if not helplines:
        return ""
    lines = ["CRISIS HELPLINES — share these with the user:"]
    for h in helplines:
        lines.append(f"  - {h['name']}: {h['number']} ({h.get('country', '')})")
    return "\n".join(lines)
