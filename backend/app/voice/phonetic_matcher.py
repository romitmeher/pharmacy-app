"""
SmartPharm Backend — Phonetic Matcher for Indian Pharmaceutical Catalogs.
Strict compliance with SmartPharm PRD Phase 6:
- Normalizes spoken text and numerical strength transcriptions
- Phonetically aligns spoken voice queries to store medicine catalog
- Calculates explainable match confidence scores (0.0 to 1.0)
"""

import re
from difflib import SequenceMatcher
from typing import List, Dict, Optional, Tuple


# Common spoken numbers in Indian prescriptions and brand names
NUM_WORDS_MAP = {
    "six fifty": "650",
    "six hundred fifty": "650",
    "six hundred and fifty": "650",
    "five hundred": "500",
    "six twenty five": "625",
    "six hundred twenty five": "625",
    "two fifty": "250",
    "one twenty five": "125",
    "one thousand": "1000",
    "one hundred": "100",
    "eighty": "80",
    "seventy five": "75",
    "fifty": "50",
    "forty": "40",
    "twenty five": "25",
    "twenty": "20",
    "fifteen": "15",
    "ten": "10",
    "nine": "9",
    "eight": "8",
    "seven": "7",
    "six": "6",
    "five": "5",
    "four": "4",
    "three": "3",
    "two": "2",
    "one": "1",
}


def normalize_spoken_query(text: str) -> str:
    """
    Normalizes spoken voice text:
    - Converts spoken numbers (e.g. 'six fifty' -> '650')
    - Handles common pharma voice artifacts (e.g. 'pan d' -> 'pan-d')
    - Strips extraneous punctuation while preserving dosage formats
    """
    if not text:
        return ""

    normalized = text.lower().strip()

    # 1. Replace spoken numbers
    for words, digits in NUM_WORDS_MAP.items():
        pattern = r"\b" + re.escape(words) + r"\b"
        normalized = re.sub(pattern, digits, normalized)

    # 2. Fix spoken spaces in compound brand names
    compound_fixes = [
        (r"\bpan\s+d\b", "pan-d"),
        (r"\baugment\s+in\b", "augmentin"),
        (r"\bcombi\s+flam\b", "combiflam"),
        (r"\bmeftal\s+spas\b", "meftal-spas"),
        (r"\btelma\s+h\b", "telma-h"),
        (r"\bmontek\s+lc\b", "montek-lc"),
    ]
    for pattern, replacement in compound_fixes:
        normalized = re.sub(pattern, replacement, normalized)

    # Clean double spaces
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def phonetic_hash(word: str) -> str:
    """
    Simplified Metaphone/Soundex algorithm tailored for pharmaceutical terms.
    Maps phonetically equivalent Indian pharma consonants and vowels.
    """
    if not word:
        return ""

    w = word.lower().strip()
    # Normalize common phonemes
    w = re.sub(r"[^a-z0-9]", "", w)
    if not w:
        return ""

    # Phonetic replacements
    w = re.sub(r"ph", "f", w)
    w = re.sub(r"c([eiy])", r"s\1", w)
    w = re.sub(r"c", "k", w)
    w = re.sub(r"q", "k", w)
    w = re.sub(r"x", "ks", w)
    w = re.sub(r"z", "s", w)
    w = re.sub(r"th", "t", w)
    w = re.sub(r"dg", "j", w)
    w = re.sub(r"v", "w", w)
    w = re.sub(r"oo", "u", w)
    w = re.sub(r"ee", "i", w)

    # Drop adjacent duplicate consonants
    w = re.sub(r"([a-z])\1+", r"\1", w)
    return w


def calculate_match_score(query: str, target: str) -> float:
    """
    Calculate composite matching score combining:
    1. Direct fuzzy string similarity (SequenceMatcher)
    2. Phonetic representation similarity
    3. Token containment
    """
    if not query or not target:
        return 0.0

    q_clean = normalize_spoken_query(query)
    t_clean = normalize_spoken_query(target)

    # Exact match
    if q_clean == t_clean:
        return 1.0

    # Substring containment
    if q_clean in t_clean or t_clean in q_clean:
        len_ratio = min(len(q_clean), len(t_clean)) / max(len(q_clean), len(t_clean))
        return max(0.85, len_ratio)

    # Direct String Sequence Matching
    direct_ratio = SequenceMatcher(None, q_clean, t_clean).ratio()

    # Phonetic Matching
    q_phone = phonetic_hash(q_clean)
    t_phone = phonetic_hash(t_clean)
    phone_ratio = SequenceMatcher(None, q_phone, t_phone).ratio()

    # Token overlap
    q_tokens = set(q_clean.split())
    t_tokens = set(t_clean.split())
    overlap = len(q_tokens.intersection(t_tokens))
    token_ratio = (2.0 * overlap) / (len(q_tokens) + len(t_tokens)) if (q_tokens or t_tokens) else 0.0

    # Weighted composite score
    composite = (direct_ratio * 0.45) + (phone_ratio * 0.35) + (token_ratio * 0.20)
    return round(min(1.0, max(0.0, composite)), 3)


def match_medicine_from_catalog(query: str, catalog: List[Dict]) -> Optional[Tuple[Dict, float]]:
    """
    Find best matching medicine from the pharmacy catalog.
    Returns (medicine_dict, confidence_score) or None if below threshold (0.50).
    """
    if not query or not catalog:
        return None

    best_med = None
    best_score = 0.0

    for med in catalog:
        brand = med.get("brand_name", "")
        strength = med.get("strength", "")
        generic = med.get("generic_name", "")

        # Test against Brand + Strength
        candidate_name = f"{brand} {strength}".strip()
        score_brand = calculate_match_score(query, candidate_name)

        # Test against Generic
        score_generic = calculate_match_score(query, generic) if generic else 0.0

        max_score = max(score_brand, score_generic)

        if max_score > best_score:
            best_score = max_score
            best_med = med

    # Threshold for candidate identification (PRD Rule 9)
    if best_score >= 0.50:
        return best_med, best_score

    return None
