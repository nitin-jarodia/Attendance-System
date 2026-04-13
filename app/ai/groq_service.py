from collections.abc import Mapping

import httpx

from app.core.config import get_settings


settings = get_settings()
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqServiceError(RuntimeError):
    """Raised when the Groq API cannot be used successfully."""


async def generate_natural_language_summary(
    *,
    title: str,
    facts: Mapping[str, object],
    fallback_text: str,
) -> tuple[str, bool]:
    if not settings.groq_api_key:
        return fallback_text, True

    facts_text = "\n".join(f"- {key}: {value}" for key, value in facts.items())
    payload = {
        "model": settings.groq_model,
        "temperature": 0.2,
        "max_tokens": 120,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You write short, practical attendance insights for an attendance management dashboard. "
                    "Keep responses under 45 words, factual, and easy to scan."
                ),
            },
            {
                "role": "user",
                "content": f"{title}\n{facts_text}\nWrite one concise insight.",
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.groq_timeout_seconds) as client:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GroqServiceError("Groq request failed.") from exc

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )
    if not content:
        raise GroqServiceError("Groq response did not contain text.")

    return content, False
