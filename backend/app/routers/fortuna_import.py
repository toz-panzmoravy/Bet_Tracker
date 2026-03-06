from datetime import timedelta
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bookmaker, Sport, Ticket, TicketStatus
from app.schemas import (
    TicketCreate,
    TicketUpdate,
    FortunaScrapeRequest,
    FortunaScrapeResponse,
    FortunaScrapeResultItem,
    FortunaScrapeTicketIn,
    FortunaScrapePreviewResponse,
    ScrapePreviewTicket,
)
from app.routers.tickets import create_ticket as _create_ticket
from app.routers.tickets import update_ticket as _update_ticket
from app.preview_store import create_preview_id, set_preview


router = APIRouter(prefix="/api/import/fortuna", tags=["Import – Fortuna"])

_FORTUNA_KEY_PREFIX = "fortuna:"


def _get_fortuna_bookmaker_id(db: Session) -> int:
    """Najde ID sázkovky Fortuna (využívá seed; pokud chybí, vytvoří)."""
    fortuna = db.query(Bookmaker).filter(Bookmaker.name == "Fortuna").first()
    if not fortuna:
        fortuna = Bookmaker(name="Fortuna", currency="CZK")
        db.add(fortuna)
        db.commit()
        db.refresh(fortuna)
    return fortuna.id


def _map_sport_label_to_id(db: Session, _label: str | None) -> int:
    """Fortuna z overview neposílá sport – vždy Ostatní, pokud nepřidáme detekci."""
    sport = db.query(Sport).filter(Sport.name == "Ostatní").first()
    if not sport:
        sport = Sport(name="Ostatní", icon="🏆")
        db.add(sport)
        db.commit()
        db.refresh(sport)
    return sport.id


def _map_status(raw: str | None, payout: Decimal | None) -> TicketStatus:
    """Převede surový status z Fortuny (cic_ticket-win, cic_ticket-waiting, …) na TicketStatus. Otevřené nikdy neukládat jako lost kvůli payout=0."""
    val = (raw or "").strip().lower()
    if val in ("waiting", "open", "čeká", "nevyhodnoceno", "pending", ""):
        return TicketStatus.open
    if val:
        if val in ("won", "win", "výhra"):
            return TicketStatus.won
        if val in ("lost", "prohra"):
            return TicketStatus.lost
        if val in ("void", "vráceno"):
            return TicketStatus.void
    if payout is not None and Decimal(payout) > 0:
        return TicketStatus.won
    return TicketStatus.open


def _map_ticket_type(raw: str | None) -> str:
    """Solo vs Ako z textu Fortuny."""
    if not raw:
        return "solo"
    val = raw.strip().lower()
    if "ako" in val or "aku" in val:
        return "aku"
    return "solo"


def _normalize_market_and_selection(
    market_label_raw: str | None, selection_raw: str | None
) -> tuple[str | None, str | None]:
    """Pro Fortunu: selection je často za dvojtečkou v jednom řetězci (market: selection)."""
    market = (market_label_raw or "").strip() or None
    selection = (selection_raw or "").strip() or None
    return market, selection


def _build_ticket_create(
    db: Session,
    fortuna_bookmaker_id: int,
    item: FortunaScrapeTicketIn,
) -> TicketCreate:
    """Namapuje jeden Fortuna tiket na TicketCreate."""
    sport_id = _map_sport_label_to_id(db, None)
    market_label, selection = _normalize_market_and_selection(
        item.market_label_raw, item.selection_raw
    )
    ticket_type = _map_ticket_type(item.ticket_type_raw)
    status = _map_status(item.status_raw, item.payout)

    odds = item.odds if item.odds is not None else Decimal("1.0")
    payout = item.payout
    fortuna_ref = None
    if item.fortuna_key:
        fortuna_ref = f"{_FORTUNA_KEY_PREFIX}{item.fortuna_key.strip()}"

    is_live = getattr(item, "is_live", None)
    if is_live is None:
        is_live = False

    event_date = getattr(item, "event_start_at", None) or item.placed_at
    return TicketCreate(
        bookmaker_id=fortuna_bookmaker_id,
        sport_id=sport_id,
        league_id=None,
        market_type_id=None,
        parent_id=None,
        home_team=item.home_team.strip(),
        away_team=item.away_team.strip(),
        event_date=event_date,
        market_label=market_label,
        selection=selection,
        odds=odds,
        stake=item.stake,
        payout=payout,
        profit=None,
        status=status.value,
        ticket_type=ticket_type,
        is_live=is_live,
        source="manual",
        ocr_image_path=fortuna_ref,
    )


def _find_duplicate(
    db: Session,
    bookmaker_id: int,
    data: TicketCreate,
    fortuna_key: str | None,
) -> Ticket | None:
    """Najde existující tiket – primárně podle fortuna_key, sekundárně podle týmy + stake + odds."""
    if fortuna_key:
        ref = f"{_FORTUNA_KEY_PREFIX}{fortuna_key.strip()}"
        hit = (
            db.query(Ticket)
            .filter(
                Ticket.bookmaker_id == bookmaker_id,
                Ticket.ocr_image_path == ref,
            )
            .first()
        )
        if hit:
            return hit

    query = db.query(Ticket).filter(
        Ticket.bookmaker_id == bookmaker_id,
        Ticket.home_team == data.home_team,
        Ticket.away_team == data.away_team,
        Ticket.stake == data.stake,
        Ticket.odds == data.odds,
    )
    if data.event_date:
        window_start = data.event_date - timedelta(minutes=15)
        window_end = data.event_date + timedelta(minutes=15)
        query = query.filter(
            Ticket.event_date >= window_start,
            Ticket.event_date <= window_end,
        )
    hit = query.first()
    if hit:
        return hit
    return (
        db.query(Ticket)
        .filter(
            Ticket.bookmaker_id == bookmaker_id,
            Ticket.home_team == data.home_team,
            Ticket.away_team == data.away_team,
            Ticket.stake == data.stake,
            Ticket.odds == data.odds,
        )
        .first()
    )


def _ticket_create_to_preview_fortuna(db: Session, data: TicketCreate) -> ScrapePreviewTicket:
    sport = db.query(Sport).filter(Sport.id == data.sport_id).first()
    sport_name = sport.name if sport else "Neznámý"
    event_date_str = data.event_date.isoformat() if data.event_date else None
    return ScrapePreviewTicket(
        home_team=data.home_team,
        away_team=data.away_team,
        sport_id=data.sport_id,
        sport_name=sport_name,
        market_label=data.market_label,
        selection=data.selection,
        odds=data.odds,
        stake=data.stake,
        payout=data.payout,
        status=data.status,
        bookmaker_id=data.bookmaker_id,
        ticket_type=data.ticket_type,
        event_date=event_date_str,
    )


@router.post("/scrape/preview", response_model=FortunaScrapePreviewResponse)
def scrape_preview(
    payload: FortunaScrapeRequest,
    db: Session = Depends(get_db),
):
    """Náhled importu: namapuje a vyfiltruje duplicity, nic neukládá."""
    fortuna_bookmaker_id = _get_fortuna_bookmaker_id(db)
    new_tickets: List[ScrapePreviewTicket] = []
    skipped_count = 0

    for item in payload.tickets:
        try:
            data = _build_ticket_create(db, fortuna_bookmaker_id, item)
            duplicate = _find_duplicate(db, fortuna_bookmaker_id, data, item.fortuna_key)
            if duplicate:
                skipped_count += 1
                continue
            new_tickets.append(_ticket_create_to_preview_fortuna(db, data))
        except (SQLAlchemyError, ValueError):
            continue

    preview_id = create_preview_id()
    set_preview(preview_id, [t.model_dump(mode="json") for t in new_tickets])
    return FortunaScrapePreviewResponse(
        preview_id=preview_id,
        new_tickets=new_tickets,
        skipped_count=skipped_count,
    )


@router.post("/scrape", response_model=FortunaScrapeResponse)
def import_from_scraper(
    payload: FortunaScrapeRequest,
    db: Session = Depends(get_db),
):
    """Import tiketů z Fortuny (ifortuna.cz) přes browser scraper."""
    fortuna_bookmaker_id = _get_fortuna_bookmaker_id(db)

    results: List[FortunaScrapeResultItem] = []
    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for idx, item in enumerate(payload.tickets):
        try:
            data = _build_ticket_create(db, fortuna_bookmaker_id, item)

            duplicate = _find_duplicate(db, fortuna_bookmaker_id, data, item.fortuna_key)
            if duplicate:
                update_payload = {}
                if data.payout is not None and (
                    duplicate.payout is None or Decimal(duplicate.payout) != Decimal(data.payout)
                ):
                    update_payload["payout"] = data.payout
                if (
                    duplicate.status is None
                    or str(getattr(duplicate.status, "value", duplicate.status)) != data.status
                ):
                    update_payload["status"] = data.status
                if duplicate.is_live != data.is_live:
                    update_payload["is_live"] = data.is_live
                if data.odds is not None and (
                    duplicate.odds is None or Decimal(duplicate.odds) != Decimal(data.odds)
                ):
                    update_payload["odds"] = data.odds
                if (
                    data.event_date is not None
                    and (duplicate.event_date is None or duplicate.event_date != data.event_date)
                ):
                    update_payload["event_date"] = data.event_date
                if item.fortuna_key:
                    ref = f"{_FORTUNA_KEY_PREFIX}{item.fortuna_key.strip()}"
                    if duplicate.ocr_image_path != ref:
                        update_payload["ocr_image_path"] = ref

                if update_payload:
                    updated = _update_ticket(
                        ticket_id=duplicate.id,
                        data=TicketUpdate(**update_payload),
                        db=db,
                    )
                    updated_count += 1
                    results.append(
                        FortunaScrapeResultItem(
                            index=idx,
                            status="updated",
                            ticket_id=updated.id,
                            message=None,
                        )
                    )
                else:
                    skipped_count += 1
                    results.append(
                        FortunaScrapeResultItem(
                            index=idx,
                            status="skipped",
                            ticket_id=duplicate.id,
                            message="Tiket již existuje a je bez změny.",
                        )
                    )
                continue

            created = _create_ticket(data=data, db=db)
            if item.fortuna_key:
                try:
                    ref = f"{_FORTUNA_KEY_PREFIX}{item.fortuna_key.strip()}"
                    _update_ticket(
                        ticket_id=created.id,
                        data=TicketUpdate(ocr_image_path=ref),
                        db=db,
                    )
                except (SQLAlchemyError, ValueError):
                    pass
            created_count += 1
            results.append(
                FortunaScrapeResultItem(
                    index=idx,
                    status="created",
                    ticket_id=created.id,
                    message=None,
                )
            )
        except (SQLAlchemyError, ValueError) as exc:
            db.rollback()
            error_count += 1
            results.append(
                FortunaScrapeResultItem(
                    index=idx,
                    status="error",
                    ticket_id=None,
                    message=str(exc),
                )
            )

    return FortunaScrapeResponse(
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=error_count,
        results=results,
    )
