"""
Sdílený endpoint pro načtení náhledu importu (extension → frontend).
"""
from fastapi import APIRouter, Body, HTTPException

from app.preview_store import create_preview_id, get_preview, set_preview

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


@router.post("/preview")
def create_preview_from_tickets(body: dict = Body(...)):
    """
    Uloží seznam tiketů do preview store a vrátí preview_id.
    Používá extension po dokončení AKU stripů – předá jen sólové tikety
    a otevře BetTracker s tímto preview_id.
    Body: { "tickets": [ ScrapePreviewTicket, ... ] }
    """
    tickets = body.get("tickets")
    if not isinstance(tickets, list):
        raise HTTPException(status_code=400, detail="Tělo musí obsahovat pole 'tickets' (seznam objektů).")
    # Uložit jako list of dicts (stejný formát jako get_preview vrací)
    preview_id = create_preview_id()
    set_preview(preview_id, list(tickets))
    return {"preview_id": preview_id}
