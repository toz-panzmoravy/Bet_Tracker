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
    TipsportScrapeRequest,
    TipsportScrapeResponse,
    TipsportScrapeResultItem,
    TipsportScrapeTicketIn,
)
from app.routers.tickets import create_ticket as _create_ticket
from app.routers.tickets import update_ticket as _update_ticket


router = APIRouter(prefix="/api/import/tipsport", tags=["Import – Tipsport"])

_TIPSPORT_KEY_PREFIX = "tipsport:"


def _get_tipsport_bookmaker_id(db: Session) -> int:
    """Najde ID sázkovky Tipsport (využívá seed)."""
    tipsport = db.query(Bookmaker).filter(Bookmaker.name == "Tipsport").first()
    if not tipsport:
        # Pokud by z nějakého důvodu neexistoval, vytvoříme ho na místě
        tipsport = Bookmaker(name="Tipsport", currency="CZK")
        db.add(tipsport)
        db.commit()
        db.refresh(tipsport)
    return tipsport.id


def _map_sport_label_to_id(db: Session, label: str | None) -> int:
    """Převede textový název sportu z Tipsportu na sport_id v DB."""
    if not label:
        label = "Ostatní"
    normalized = label.strip().lower()

    # Zkus přesný název (case-insensitive)
    sport = (
        db.query(Sport)
        .filter(Sport.name.ilike(normalized))
        .first()
    )
    if not sport:
        # Jednoduché mapování běžných variant
        mapping = {
            "fotbal": "Fotbal",
            "soccer": "Fotbal",
            "hokej": "Hokej",
            "tenis": "Tenis",
            "basketbal": "Basketbal",
            "basketball": "Basketbal",
            "esport": "Esport",
        }
        target = mapping.get(normalized)
        if target:
            sport = db.query(Sport).filter(Sport.name == target).first()
    if not sport:
        sport = db.query(Sport).filter(Sport.name == "Ostatní").first()
        if not sport:
            # Fallback – pokud seed ještě nejel, vytvoříme Ostatní
            sport = Sport(name="Ostatní", icon="🏆")
            db.add(sport)
            db.commit()
            db.refresh(sport)
    return sport.id


def _map_status(raw: str | None, payout: Decimal | None) -> TicketStatus:
    """Převede surový status z Tipsportu na TicketStatus."""
    # Primárně: pokud je skutečná výhra > 0, je to výhra
    try:
        if payout is not None and Decimal(payout) > 0:
            return TicketStatus.won
    except Exception:
        pass

    # Pokud je v textu explicitní stav (včetně ikon jako "#i170")
    if raw:
        val = raw.strip().lower()
        # Ikony stavu dle Sports_div
        if "#i170" in val or "i170" in val:
            return TicketStatus.won
        if "#i243" in val or "i243" in val:
            return TicketStatus.void
        if "#i173" in val or "i173" in val:
            return TicketStatus.lost
        if "#i172" in val or "i172" in val:
            return TicketStatus.open
        if any(x in val for x in ("void", "vrácen", "vraceno", "vráceno", "zrušen", "zrusen", "refund")):
            return TicketStatus.void
        if any(x in val for x in ("open", "čeká", "ceka", "pending", "nezúčt", "nevyhod")):
            return TicketStatus.open
        if any(x in val for x in ("won", "výhra", "vyhr", "✔", "✅")):
            return TicketStatus.won
        if any(x in val for x in ("lost", "prohra", "✗", "❌")):
            return TicketStatus.lost

    # Fallback: payout == 0 typicky znamená prohra (pokud už je tiket vyhodnocen)
    if payout is not None:
        try:
            if Decimal(payout) == 0:
                return TicketStatus.lost
        except Exception:
            pass
    return TicketStatus.open


def _map_ticket_type(raw: str | None) -> str:
    """Vrátí 'aku' pokud text obsahuje AKU, jinak 'solo'."""
    if not raw:
        return "solo"
    val = raw.strip().lower()
    if "aku" in val:
        return "aku"
    return "solo"


def _normalize_market_and_selection(
    market_label_raw: str | None, selection_raw: str | None
) -> tuple[str | None, str | None]:
    """
    Pokud selection_raw obsahuje tvar 'X: Y' a market_label_raw není vyplněn,
    rozdělí na market_label='X' a selection='Y'.
    """
    market = (market_label_raw or "").strip() or None
    selection = (selection_raw or "").strip() or None
    if (not market) and selection and ":" in selection:
        left, right = selection.split(":", 1)
        market = left.strip() or None
        selection = right.strip() or None
    return market, selection


def _map_sport_icon_id_to_label(icon_id: str | None) -> str | None:
    """
    Mapování Tipsport SVG icon id (z <use xlink:href>) na český název sportu.
    Hodnoty icon_id se mohou časem měnit; neznámé vrací None.
    """
    if not icon_id:
        return None
    key = icon_id.strip()
    mapping = {
        # TODO: doplnit podle reálných ikon z Tipsportu (přes DevTools).
        # Příklady:
        # "#i173": "Esport",
        # "#iXXX": "Fotbal",
        # "#iYYY": "Basketbal",
    }
    return mapping.get(key)


def _map_sport_class_to_label(sport_class: str | None) -> str | None:
    """Fallback mapování podle CSS class z Tipsportu (viz Sports_div)."""
    if not sport_class:
        return None
    key = sport_class.strip()
    mapping = {
        "kVnpal": "Tenis",
        "jllVcZ": "Basketbal",
        "jnbgNp": "Fotbal",
        "gKUVDg": "Darts",
        "zxSYL": "Esport",
        "dmDmCn": "Hokej",
        "dmOtSE": "Rugby",
        "jsqJWx": "Lacros",
        "fZIZDk": "Handball",
    }
    return mapping.get(key)


def _build_ticket_create(
    db: Session,
    tipsport_bookmaker_id: int,
    item: TipsportScrapeTicketIn,
) -> TicketCreate:
    """Namapuje jeden scrapený tiket na TicketCreate."""
    sport_label = (
        item.sport_label
        or _map_sport_icon_id_to_label(item.sport_icon_id)
        or _map_sport_class_to_label(getattr(item, "sport_class", None))
    )
    sport_id = _map_sport_label_to_id(db, sport_label)
    market_label, selection = _normalize_market_and_selection(
        item.market_label_raw, item.selection_raw
    )
    ticket_type = _map_ticket_type(item.ticket_type_raw)
    status = _map_status(item.status_raw, item.payout)

    odds = item.odds if item.odds is not None else Decimal("1.0")
    payout = item.payout
    tipsport_ref = None
    if item.tipsport_key:
        tipsport_ref = f"{_TIPSPORT_KEY_PREFIX}{item.tipsport_key.strip()}"

    return TicketCreate(
        bookmaker_id=tipsport_bookmaker_id,
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
    )


def _find_duplicate(
    db: Session,
    bookmaker_id: int,
    data: TicketCreate,
    tipsport_key: str | None,
) -> Ticket | None:
    """
    Najde existující tiket podle kombinace bookmaker + týmy + stake + odds (+čas).
    Cílem je vyřadit zjevné duplicity, ne 100% unikátní klíč.
    """
    # Primární dedupe: stabilní Tipsport klíč uložený v ocr_image_path (bez migrace DB)
    if tipsport_key:
        ref = f"{_TIPSPORT_KEY_PREFIX}{tipsport_key.strip()}"
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

    return query.first()


@router.post("/scrape", response_model=TipsportScrapeResponse)
def import_from_scraper(
    payload: TipsportScrapeRequest,
    db: Session = Depends(get_db),
):
    """
    Import tiketů z Tipsportu přes browser scrapper.

    Očekává pole „syrových“ tiketů (bez sport_id / league_id / market_type_id).
    Backend:
    - namapuje textové hodnoty na interní ID,
    - zkontroluje duplicity podle kombinace bookmaker + týmy + stake + odds (+event_date),
    - nový tiket uloží přes standardní create_ticket logiku,
    - duplicity přeskočí.
    """
    tipsport_bookmaker_id = _get_tipsport_bookmaker_id(db)

    results: List[TipsportScrapeResultItem] = []
    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for idx, item in enumerate(payload.tickets):
        try:
            data = _build_ticket_create(db, tipsport_bookmaker_id, item)

            duplicate = _find_duplicate(db, tipsport_bookmaker_id, data, item.tipsport_key)
            if duplicate:
                # Upsert: pokud se liší sport/status/payout/odds, aktualizovat přes standardní update_ticket (přepočet profitu)
                update_payload = {}

                # sport: opravovat vždy, nebo alespoň když je Ostatní
                if duplicate.sport_id != data.sport_id:
                    update_payload["sport_id"] = data.sport_id

                # payout/status/odds: opravovat, pokud se liší nebo chybí
                if data.payout is not None and (duplicate.payout is None or Decimal(duplicate.payout) != Decimal(data.payout)):
                    update_payload["payout"] = data.payout
                if duplicate.status is None or str(getattr(duplicate.status, "value", duplicate.status)) != data.status:
                    update_payload["status"] = data.status
                if data.odds is not None and (duplicate.odds is None or Decimal(duplicate.odds) != Decimal(data.odds)):
                    update_payload["odds"] = data.odds

                # event_date: doplnit / srovnat podle Tipsport placed_at
                if data.event_date is not None:
                    if duplicate.event_date is None:
                        update_payload["event_date"] = data.event_date
                    else:
                        # Pokud se datum výrazně liší (jiný den), můžeme ho přepsat
                        try:
                            diff = abs(data.event_date - duplicate.event_date)
                            if diff > timedelta(hours=12):
                                update_payload["event_date"] = data.event_date
                        except Exception:
                            # Pokud by došlo k chybě při výpočtu diff, raději event_date neměnit
                            pass

                # uložit tipsport_key pro budoucí stabilní dedupe
                if item.tipsport_key:
                    ref = f"{_TIPSPORT_KEY_PREFIX}{item.tipsport_key.strip()}"
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
                        TipsportScrapeResultItem(
                            index=idx,
                            status="updated",
                            ticket_id=updated.id,
                            message=None,
                        )
                    )
                else:
                    skipped_count += 1
                    results.append(
                        TipsportScrapeResultItem(
                            index=idx,
                            status="skipped",
                            ticket_id=duplicate.id,
                            message="Tiket již existuje a je bez změny.",
                        )
                    )
                continue

            created = _create_ticket(data=data, db=db)
            # uložit tipsport_key do ocr_image_path (bez migrace DB)
            if item.tipsport_key:
                try:
                    ref = f"{_TIPSPORT_KEY_PREFIX}{item.tipsport_key.strip()}"
                    _update_ticket(
                        ticket_id=created.id,
                        data=TicketUpdate(ocr_image_path=ref),
                        db=db,
                    )
                except Exception:
                    pass
            created_count += 1
            results.append(
                TipsportScrapeResultItem(
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
                TipsportScrapeResultItem(
                    index=idx,
                    status="error",
                    ticket_id=None,
                    message=str(exc),
                )
            )

    return TipsportScrapeResponse(
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=error_count,
        results=results,
    )

