"""Map any bouldering grade string onto Topout's 7 buckets.

Buckets: 0=V0-1, 1=V2, 2=V3, 3=V4, 4=V5, 5=V6, 6=V7+
"""
import re

BUCKETS = ['V0-1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7+']

# Font (Fontainebleau) -> V number. 6A≈V3 per the handoff; the rest follows the
# common conversion chart. Ranges are collapsed to the lower V grade.
FONT_TO_V = {
    '3': 0, '4': 0, '4+': 0, '5': 1, '5+': 2,
    '6A': 3, '6A+': 3, '6B': 4, '6B+': 4, '6C': 5, '6C+': 5,
    '7A': 6, '7A+': 7, '7B': 8, '7B+': 8, '7C': 9, '7C+': 10,
    '8A': 11, '8A+': 12, '8B': 13, '8B+': 14, '8C': 15, '8C+': 16, '9A': 17,
}

_V = re.compile(r'^V\s*(B|\d+)')          # V4, V4-5, V4+, VB
_FONT = re.compile(r'^(?:F(?:ONT)?\s*)?([3-9])\s*([ABC])?\s*(\+)?')


def v_to_bucket(v: int) -> int:
    if v <= 1:
        return 0
    return min(6, v - 1)


def grade_to_bucket(raw):
    """Return bucket index 0..6, or None if the grade isn't a boulder grade we know."""
    if raw is None:
        return None
    g = str(raw).strip().upper().replace('＋', '+')
    if not g:
        return None
    # Topout's own bucket labels
    if g in ('V0-1', 'V0-V1'):
        return 0
    if g == 'V7+':
        return 6
    m = _V.match(g)
    if m:
        n = m.group(1)
        return v_to_bucket(0 if n == 'B' else int(n))
    # Yosemite route grades (5.10a etc.) are not boulder grades
    if g.startswith('5.'):
        return None
    m = _FONT.match(g)
    if m:
        key = m.group(1) + (m.group(2) or '') + (m.group(3) or '')
        if key in FONT_TO_V:
            return v_to_bucket(FONT_TO_V[key])
        # e.g. "6" alone: treat as 6A
        if m.group(2) is None and (m.group(1) + 'A') in FONT_TO_V:
            return v_to_bucket(FONT_TO_V[m.group(1) + 'A'])
    return None
