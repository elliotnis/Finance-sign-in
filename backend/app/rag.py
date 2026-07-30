"""Small retrieval-augmented help agent for the sign-up flow.

This intentionally stays deterministic and local: the portal can answer the
common access/profile/session questions without sending student data to a
third-party model. The retrieved source snippets make the answer auditable and
leave room to replace the scorer with a hosted model later.
"""

import re


KNOWLEDGE = [
    {
        "id": "access",
        "title": "Portal access",
        "text": "Use your approved HKUST connect.ust.hk or ust.hk email. If the code does not arrive, check the address and ask a portal administrator to add the account to the Allowed Emails list.",
    },
    {
        "id": "profile",
        "title": "Profile and biography",
        "text": "Complete your name, student ID, programme, study year and graduation year before using sessions. Your biography is private by default; you can explicitly make it public in Profile so other students can find your credentials and optional LinkedIn link.",
    },
    {
        "id": "sessions",
        "title": "Tutoring sessions",
        "text": "Choose Register Session to browse open tutoring times. Hosts can select a start time and a duration rather than being limited to one hour. A session may be visible only to its selected FINA, QFIN or SGFN programme audience.",
    },
    {
        "id": "classes",
        "title": "Classes and events",
        "text": "Classes are shared events with a date, time, capacity, programme audience and optional attachments. Register from the Classes calendar; registered students receive confirmation when email notifications are configured.",
    },
    {
        "id": "linkedin",
        "title": "Finding a LinkedIn profile",
        "text": "Use the People directory to search public biographies and credentials. LinkedIn links are self-provided and only shown when the owner has made their biography public; the portal does not scrape LinkedIn.",
    },
]


def _tokens(text):
    return set(re.findall(r"[a-z0-9]{2,}", (text or "").lower()))


def answer_question(question):
    question = (question or "").strip()
    if not question:
        return {
            "answer": "Ask me about signing in, completing your profile, finding sessions, classes, or public biographies.",
            "sources": [],
        }
    query_tokens = _tokens(question)
    scored = []
    for entry in KNOWLEDGE:
        score = len(query_tokens & _tokens(entry["title"] + " " + entry["text"]))
        if score:
            scored.append((score, entry))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [entry for _, entry in scored[:2]]
    if not selected:
        return {
            "answer": "I could not find that in the sign-up guide. Try asking about access codes, profiles, sessions, classes, or the People directory.",
            "sources": [],
        }
    answer = " ".join(entry["text"] for entry in selected)
    return {
        "answer": answer,
        "sources": [{"id": entry["id"], "title": entry["title"]} for entry in selected],
    }
