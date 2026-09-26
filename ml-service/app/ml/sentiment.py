"""Ported 1:1 from ml/sentiment.ts."""

import re
from typing import Any, Optional

from app.lib.util import js_round

# ---------------------------------------------------------------------
# Lexicon-based sentiment analysis (no external NLP dependency — trades
# nuance for full transparency & zero network/model cost, appropriate for
# short HR ticket text).
# ---------------------------------------------------------------------
POSITIVE_WORDS = [
    "thanks", "thank", "great", "appreciate", "good", "love", "happy", "awesome",
    "excellent", "pleased", "glad", "wonderful", "helpful", "resolved", "perfect",
]
NEGATIVE_WORDS = [
    "angry", "frustrated", "unacceptable", "terrible", "worst", "awful", "broken",
    "never", "ignored", "delay", "delayed", "wrong", "mistake", "issue", "problem",
    "disappointed", "upset", "unfair", "harassment", "discriminat", "hostile",
    "complain", "complaint", "threat", "legal", "lawsuit", "quit", "resign",
]

CRITICAL_KEYWORDS = [
    "harassment", "discriminat", "hostile", "threat", "lawsuit", "legal action",
    "emergency", "unsafe", "assault", "suicide", "self harm",
]
HIGH_KEYWORDS = [
    "urgent", "immediately", "asap", "today", "unacceptable", "angry", "frustrated",
    "deadline", "escalate", "manager", "quit", "resign",
]

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "pto": ["pto", "vacation", "time off", "leave balance", "sick day", "paid leave"],
    "benefits": ["benefits", "health insurance", "dental", "vision", "enrollment", "401k", "401(k)", "retirement"],
    "payroll": ["payroll", "paycheck", "direct deposit", "salary", "pay stub", "tax form", "w-2", "w2", "garnish"],
    "it": ["laptop", "password", "vpn", "software", "access", "login", "wifi", "computer", "account locked"],
    "facilities": ["desk", "office", "parking", "badge", "building", "hvac", "air condition"],
    "conduct": ["harassment", "discriminat", "hostile", "bully", "conduct", "inappropriate"],
    "other": [],
}


def _tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^a-z0-9'\s]", " ", text.lower())
    return [w for w in re.split(r"\s+", cleaned) if w]


def analyze_sentiment(text: str) -> dict[str, Any]:
    words = _tokenize(text)
    pos = sum(1 for w in words if any(p in w for p in POSITIVE_WORDS))
    neg = sum(1 for w in words if any(n in w for n in NEGATIVE_WORDS))
    total = pos + neg
    raw = 0 if total == 0 else (pos - neg) / total
    score = js_round(raw * 1000) / 1000
    label = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
    return {"label": label, "score": score}


def detect_urgency(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in CRITICAL_KEYWORDS):
        return "critical"
    if any(k in lower for k in HIGH_KEYWORDS):
        return "high"
    sentiment = analyze_sentiment(text)
    return "medium" if sentiment["label"] == "negative" else "low"


def detect_category(text: str) -> str:
    lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(k in lower for k in keywords):
            return category
    return "other"


def decide_routing(urgency: str, sentiment: dict[str, Any], category: str) -> dict[str, Any]:
    if urgency == "critical" or category == "conduct":
        return {"escalate": True, "queue": "escalation", "reason": "Critical urgency or conduct-related content"}
    if urgency == "high" and sentiment["label"] == "negative":
        return {"escalate": True, "queue": "escalation", "reason": "High urgency combined with negative sentiment"}
    return {"escalate": False, "queue": "standard", "reason": "Within normal handling parameters"}


# ---------------------------------------------------------------------
# Tier-0 auto-resolution: a handful of self-service HR questions get an
# instant, personalized answer without a human ever touching the ticket.
# ---------------------------------------------------------------------
def attempt_tier0_resolution(text: str, employee: Optional[dict[str, Any]]) -> dict[str, Any]:
    if employee is None:
        return {"resolved": False}

    lower = text.lower()

    if re.search(r"(pto|vacation|time off).*(balance|left|remaining|how many)", lower) or re.search(
        r"(how many|what).*(pto|vacation days)", lower
    ):
        return {
            "resolved": True,
            "note": (
                f"You currently have {employee['pto_balance']:.1f} PTO days available "
                f"({employee['pto_used_ytd']:.1f} used year-to-date). You can submit a new PTO "
                "request from the Wellbeing or My Dashboard tab."
            ),
        }

    if "direct deposit" in lower or ("payroll" in lower and "when" in lower):
        return {
            "resolved": True,
            "note": (
                "Direct deposit runs on a biweekly schedule and funds typically post by 9am on "
                "payday. To update your bank details, go to Payroll Settings — changes submitted "
                "before Wednesday apply to the next cycle."
            ),
        }

    if "401k" in lower or "401(k)" in lower or "retirement match" in lower:
        return {
            "resolved": True,
            "note": (
                "The company matches 100% of your 401(k) contributions up to 4% of salary, with "
                "immediate vesting. You can adjust your contribution rate anytime through the "
                "benefits portal."
            ),
        }

    if "benefits" in lower and ("enroll" in lower or "when" in lower or "window" in lower):
        return {
            "resolved": True,
            "note": (
                "Open enrollment runs each year in November for coverage starting January 1st. "
                "Qualifying life events (marriage, birth, relocation) open a 30-day special "
                "enrollment window any time."
            ),
        }

    return {"resolved": False}
