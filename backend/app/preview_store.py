"""
Dočasné úložiště náhledů importu (preview_id -> list of tickets).
TTL 10 minut; v paměti.
"""
import time
import uuid
from typing import Any, List, Optional

_PREVIEW_STORE: dict[str, dict[str, Any]] = {}
_TTL_SECONDS = 600  # 10 min


def create_preview_id() -> str:
    return str(uuid.uuid4())


def set_preview(preview_id: str, tickets: List[dict]) -> None:
    _PREVIEW_STORE[preview_id] = {
        "tickets": tickets,
        "created_at": time.time(),
    }


def get_preview(preview_id: str) -> Optional[List[dict]]:
    data = _PREVIEW_STORE.get(preview_id)
    if not data:
        return None
    if (time.time() - data["created_at"]) > _TTL_SECONDS:
        del _PREVIEW_STORE[preview_id]
        return None
    return data["tickets"]
