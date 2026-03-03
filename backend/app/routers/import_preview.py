"""
Sdílený endpoint pro načtení náhledu importu (extension → frontend).
"""
from fastapi import APIRouter, HTTPException

from app.preview_store import get_preview

router = APIRouter(prefix="/api/import", tags=["Import"])


@router.get("/preview/{preview_id}")
def get_import_preview(preview_id: str):
    """
    Vrátí uložený seznam new_tickets pro dané preview_id (TTL 10 min).
    Používá se po otevření aplikace z extension s ?preview_id=...
    """
    tickets = get_preview(preview_id)
    if tickets is None:
        raise HTTPException(status_code=404, detail="Náhled vypršel nebo není k dispozici.")
    return {"tickets": tickets}
