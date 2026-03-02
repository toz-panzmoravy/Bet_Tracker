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
    BetanoScrapeRequest,
    BetanoScrapeResponse,
    BetanoScrapeResultItem,
    BetanoScrapeTicketIn,
)
from app.routers.tickets import create_ticket as _create_ticket
from app.routers.tickets import update_ticket as _update_ticket


router = APIRouter(prefix="/api/import/betano", tags=["Import – Betano"])

_BETANO_KEY_PREFIX = "betano:"


def _get_betano_bookmaker_id(db: Session) -> int:
    """Najde ID sázkovky Betano (využívá seed; pokud chybí, vytvoří)."""
    betano = db.query(Bookmaker).filter(Bookmaker.name == "Betano").first()
    if not betano:
        betano = Bookmaker(name="Betano", currency="CZK")
        db.add(betano)
        db.commit()
        db.refresh(betano)
    return betano.id


def _map_sport_label_to_id(db: Session, label: str | None) -> int:
    """Převede textový název sportu z Betano na sport_id v DB."""
    if not label:
        label = "Ostatní"
    normalized = label.strip().lower()

    sport = (
        db.query(Sport)
        .filter(Sport.name.ilike(normalized))
        .first()
    )
    if not sport:
        mapping = {
            "fotbal": "Fotbal",
            "hokej": "Hokej",
            "basketbal": "Basketbal",
            "tenis": "Tenis",
        }
        target = mapping.get(normalized)
        if target:
            sport = db.query(Sport).filter(Sport.name == target).first()
    if not sport:
        sport = db.query(Sport).filter(Sport.name == "Ostatní").first()
        if not sport:
            sport = Sport(name="Ostatní", icon="🏆")
            db.add(sport)
            db.commit()
            db.refresh(sport)
    return sport.id


def _map_sport_icon_to_label(icon_id: str | None) -> str | None:
    """
    Hrubé mapování podle názvu ikonového souboru v Betano (ICEH = Hokej, BASK = Basketbal, TENN = Tenis).
    """
    if not icon_id:
        return None
    src = icon_id.lower()
    # Mapování podle souborů z Betano_sports:
    # /myaccount/web/img/ICEH...svg  -> Hokej
    # /myaccount/web/img/BASK...svg  -> Basketbal
    # /myaccount/web/img/TENN...svg  -> Tenis
    # /myaccount/web/img/ESPS...svg  -> Esport (případně později rozšíříme i na Fotbal)
    if "bask" in src:
        return "Basketbal"
    if "iceh" in src:
        return "Hokej"
    if "tenn" in src:
        return "Tenis"
    if "esps" in src:
        return "Esport"
    return None


def _map_status(raw: str | None, payout: Decimal | None) -> TicketStatus:
    """Převede surový status z Betano na TicketStatus."""
    # Primárně podle výhry
    try:
        if payout is not None and Decimal(payout) > 0:
            return TicketStatus.won
    except Exception:
        pass

    if raw:
        val = raw.strip().lower()
        if "výhry" in val or "vyhry" in val or "win" in val:
            return TicketStatus.won
        if "prohry" in val or "prohra" in val or "lost" in val:
            return TicketStatus.lost
        if "cash out" in val:
            # Cash out – typicky bráno jako vyhodnocený tiket s konkrétní výhrou
            return TicketStatus.won if payout and payout > 0 else TicketStatus.void

    if payout is not None:
        try:
            if Decimal(payout) == 0:
                return TicketStatus.lost
        except Exception:
            pass

    return TicketStatus.open


def _map_ticket_type(raw: str | None) -> str:
    """Vrátí 'aku' pokud text vypadá jako kombinace, jinak 'solo'."""
    if not raw:
        return "solo"
    val = raw.strip().lower()
    if "kombinace" in val or "combo" in val or "2kombinace" in val:
        return "aku"
    return "solo"


def _normalize_market_and_selection(
    market_label_raw: str | None, selection_raw: str | None
) -> tuple[str | None, str | None]:
    """
    Pro Betano: selection je typicky hodnota (např. 'Méně než 5.5'),
    market_label je popis (např. 'Počet gólů', 'Vítěz').
    Pokud máme jen selection, necháme market prázdný.
    """
    market = (market_label_raw or "").strip() or None
    selection = (selection_raw or "").strip() or None
    return market, selection


def _build_ticket_create(
    db: Session,
    betano_bookmaker_id: int,
    item: BetanoScrapeTicketIn,
) -> TicketCreate:
    """Namapuje jeden Betano tiket na TicketCreate."""
    sport_label = item.sport_label or _map_sport_icon_to_label(item.sport_icon_id)
    sport_id = _map_sport_label_to_id(db, sport_label)
    market_label, selection = _normalize_market_and_selection(
        item.market_label_raw, item.selection_raw
    )
    ticket_type = _map_ticket_type(item.ticket_type_raw)
    status = _map_status(item.status_raw, item.payout)

    odds = item.odds if item.odds is not None else Decimal("1.0")
    payout = item.payout
    betano_ref = None
    if item.betano_key:
        betano_ref = f"{_BETANO_KEY_PREFIX}{item.betano_key.strip()}"

    return TicketCreate(
        bookmaker_id=betano_bookmaker_id,
        sport_id=sport_id,
        league_id=None,
        market_type_id=None,
        parent_id=None,
        home_team=item.home_team.strip(),
        away_team=item.away_team.strip(),
        event_date=item.placed_at,
        market_label=market_label,
        selection=selection,
        odds=odds,
        stake=item.stake,
        payout=payout,
        profit=None,
        status=status.value,
        ticket_type=ticket_type,
        is_live=False,
        source="manual",
        ocr_image_path=betano_ref,
    )


def _find_duplicate(
    db: Session,
    bookmaker_id: int,
    data: TicketCreate,
    betano_key: str | None,
) -> Ticket | None:
    """
    Najde existující tiket – primárně podle betano_key, sekundárně podle kombinace
    bookmaker + týmy + stake + odds (+časové okno).
    """
    if betano_key:
        ref = f"{_BETANO_KEY_PREFIX}{betano_key.strip()}"
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
        window_start = data.event_date - timedelta(minutes=10)
        window_end = data.event_date + timedelta(minutes=10)
        query = query.filter(
            Ticket.event_date >= window_start,
            Ticket.event_date <= window_end,
        )

    hit = query.first()
    if hit:
        return hit

    # Fallback: zkúsit najít tiket bez filtru na event_date (pro staré tikety z OCR,
    # kde čas nemusí přesně odpovídat, ale kombinace týmů/stake/kurz sedí).
    fallback_query = db.query(Ticket).filter(
        Ticket.bookmaker_id == bookmaker_id,
        Ticket.home_team == data.home_team,
        Ticket.away_team == data.away_team,
        Ticket.stake == data.stake,
        Ticket.odds == data.odds,
    )

    return fallback_query.first()


@router.post("/scrape", response_model=BetanoScrapeResponse)
def import_from_scraper(
    payload: BetanoScrapeRequest,
    db: Session = Depends(get_db),
):
    """
    Import tiketů z Betano přes browser scraper.
    """
    betano_bookmaker_id = _get_betano_bookmaker_id(db)

    results: List[BetanoScrapeResultItem] = []
    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for idx, item in enumerate(payload.tickets):
        try:
            data = _build_ticket_create(db, betano_bookmaker_id, item)

            duplicate = _find_duplicate(db, betano_bookmaker_id, data, item.betano_key)
            if duplicate:
                update_payload = {}

                if duplicate.sport_id != data.sport_id:
                    update_payload["sport_id"] = data.sport_id

                if data.payout is not None and (
                    duplicate.payout is None
                    or Decimal(duplicate.payout) != Decimal(data.payout)
                ):
                    update_payload["payout"] = data.payout

                if (
                    duplicate.status is None
                    or str(getattr(duplicate.status, "value", duplicate.status))
                    != data.status
                ):
                    update_payload["status"] = data.status

                if data.odds is not None and (
                    duplicate.odds is None
                    or Decimal(duplicate.odds) != Decimal(data.odds)
                ):
                    update_payload["odds"] = data.odds

                if (
                    data.event_date is not None
                    and (duplicate.event_date is None or duplicate.event_date != data.event_date)
                ):
                    update_payload["event_date"] = data.event_date

                if item.betano_key:
                    ref = f"{_BETANO_KEY_PREFIX}{item.betano_key.strip()}"
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
                        BetanoScrapeResultItem(
                            index=idx,
                            status="updated",
                            ticket_id=updated.id,
                            message=None,
                        )
                    )
                else:
                    skipped_count += 1
                    results.append(
                        BetanoScrapeResultItem(
                            index=idx,
                            status="skipped",
                            ticket_id=duplicate.id,
                            message="Tiket již existuje a je bez změny.",
                        )
                    )
                continue

            created = _create_ticket(data=data, db=db)
            if item.betano_key:
                try:
                    ref = f"{_BETANO_KEY_PREFIX}{item.betano_key.strip()}"
                    _update_ticket(
                        ticket_id=created.id,
                        data=TicketUpdate(ocr_image_path=ref),
                        db=db,
                    )
                except Exception:
                    pass
            created_count += 1
            results.append(
                BetanoScrapeResultItem(
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
                BetanoScrapeResultItem(
                    index=idx,
                    status="error",
                    ticket_id=None,
                    message=str(exc),
                )
            )

    return BetanoScrapeResponse(
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=error_count,
        results=results,
    )

