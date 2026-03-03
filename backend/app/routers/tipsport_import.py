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
    TipsportScrapePreviewResponse,
    ScrapePreviewTicket,
)
from app.routers.tickets import create_ticket as _create_ticket
from app.routers.tickets import update_ticket as _update_ticket
from app.preview_store import create_preview_id, set_preview


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
    # Nejdřív respektovat explicitní stav z Tipsportu (ikona/status)
    # U live tiketů je "Možná výhra" = potenciální výhra, ne skutečná – tiket je stále open
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

    # Fallback když raw chybí: podle payout (skutečná výhra > 0 = won, 0 = lost, jinak open)
    try:
        if payout is not None:
            if Decimal(payout) > 0:
                return TicketStatus.won
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

    is_live = getattr(item, "is_live", None)
    if is_live is None:
        is_live = False

    # Bezpečný fallback pro stake – pokud by z nějakého důvodu přišel None,
    # považujeme ho za 0, aby tiket šel vytvořit a skončil v incomplete filtru.
    stake = item.stake if item.stake is not None else Decimal("0")

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
        stake=stake,
        payout=payout,
        profit=None,
        status=status.value,
        ticket_type=ticket_type,
        is_live=bool(is_live),
        source="manual",
    )


def _find_duplicate(
    db: Session,
    bookmaker_id: int,
    data: TicketCreate,
    tipsport_key: str | None,
    has_original_stake: bool,
    has_original_odds: bool,
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
    )

    # Pokud máme spolehlivě rozpoznaný vklad / kurz, použijeme je pro zpřesnění párování.
    # Když ne (stake=0 nebo odds jsou jen fallback 1.0), raději je vynecháme,
    # aby import nikdy nevynechal tiket jen kvůli chybě v parsování.
    try:
        if has_original_stake and data.stake is not None and Decimal(data.stake) > 0:
            query = query.filter(Ticket.stake == data.stake)
    except Exception:
        pass

    try:
        if has_original_odds and data.odds is not None:
            query = query.filter(Ticket.odds == data.odds)
    except Exception:
        pass

    if data.event_date:
        window_start = data.event_date - timedelta(minutes=10)
        window_end = data.event_date + timedelta(minutes=10)
        query = query.filter(
            Ticket.event_date >= window_start,
            Ticket.event_date <= window_end,
        )

    return query.first()


def _build_duplicate_update_payload(
    duplicate: Ticket,
    data: TicketCreate,
    item: TipsportScrapeTicketIn,
) -> dict:
    """
    Připraví payload pro synchronizaci existujícího tiketu s aktuálními daty z Tipsportu.
    Sdílená logika pro /scrape i /scrape/preview.
    """
    update_payload: dict = {}

    # status a is_live: přepsat z Tipsportu (Tipsport má vždy pravdu)
    dup_status = str(getattr(duplicate.status, "value", duplicate.status))
    if dup_status != data.status:
        update_payload["status"] = data.status
    item_is_live = getattr(item, "is_live", None)
    if item_is_live is not None and bool(duplicate.is_live) != bool(item_is_live):
        update_payload["is_live"] = bool(item_is_live)

    # sport: opravovat při změně
    if duplicate.sport_id != data.sport_id:
        update_payload["sport_id"] = data.sport_id

    # payout/odds: opravovat, pokud se liší nebo chybí
    try:
        if data.payout is not None and (
            duplicate.payout is None
            or Decimal(duplicate.payout) != Decimal(data.payout)
        ):
            update_payload["payout"] = data.payout
    except Exception:
        pass

    try:
        if data.odds is not None and (
            duplicate.odds is None
            or Decimal(duplicate.odds) != Decimal(data.odds)
        ):
            update_payload["odds"] = data.odds
    except Exception:
        pass

    # event_date: doplnit / srovnat podle Tipsport placed_at
    if data.event_date is not None:
        if duplicate.event_date is None:
            update_payload["event_date"] = data.event_date
        else:
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

    return update_payload


def _sync_duplicate_from_tipsport(
    db: Session,
    duplicate: Ticket,
    data: TicketCreate,
    item: TipsportScrapeTicketIn,
) -> Ticket | None:
    """
    Aplikuje změny z Tipsportu na existující tiket.

    Vrací aktualizovaný tiket, pokud došlo ke změně, jinak None.
    """
    update_payload = _build_duplicate_update_payload(duplicate, data, item)
    if not update_payload:
        return None
    return _update_ticket(
        ticket_id=duplicate.id,
        data=TicketUpdate(**update_payload),
        db=db,
    )


def _ticket_create_to_preview(db: Session, data: TicketCreate) -> ScrapePreviewTicket:
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
        is_live=data.is_live,
    )


@router.post("/scrape/preview", response_model=TipsportScrapePreviewResponse)
def scrape_preview(
    payload: TipsportScrapeRequest,
    db: Session = Depends(get_db),
):
    """
    Náhled importu: namapuje a vyfiltruje duplicity.

    Nové tikety vrací v náhledu (preview_id + new_tickets) a nic
    přímo neukládá. Pokud ale najde existující tiket (duplicitu),
    tiše ho v databázi zaktualizuje podle aktuálních dat z Tipsportu
    (status, is_live, sport, payout, odds, event_date, tipsport_key),
    aby se při každém spuštění importu opravily stavy tiketů.
    """
    tipsport_bookmaker_id = _get_tipsport_bookmaker_id(db)
    new_tickets: List[ScrapePreviewTicket] = []
    skipped_count = 0

    for item in payload.tickets:
        try:
            data = _build_ticket_create(db, tipsport_bookmaker_id, item)
            duplicate = _find_duplicate(
                db,
                tipsport_bookmaker_id,
                data,
                item.tipsport_key,
                has_original_stake=bool(item.stake is not None and item.stake > 0),
                has_original_odds=bool(item.odds is not None),
            )
            if duplicate:
                # Tichý \"upsert\" duplicity – stejné chování jako v /scrape endpointu,
                # jen bez zapisování do výsledků; pro uživatele se duplicate dál tváří
                # jako přeskočený v náhledu.
                try:
                    _sync_duplicate_from_tipsport(db, duplicate, data, item)
                except Exception:
                    # Chyba při synchronizaci jedné duplicity nesmí shodit celý náhled importu.
                    pass

                skipped_count += 1
                continue

            new_tickets.append(_ticket_create_to_preview(db, data))
        except (SQLAlchemyError, ValueError):
            continue

    preview_id = create_preview_id()
    set_preview(preview_id, [t.model_dump(mode="json") for t in new_tickets])
    return TipsportScrapePreviewResponse(
        preview_id=preview_id,
        new_tickets=new_tickets,
        skipped_count=skipped_count,
    )


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

            duplicate = _find_duplicate(
                db,
                tipsport_bookmaker_id,
                data,
                item.tipsport_key,
                has_original_stake=bool(item.stake is not None and item.stake > 0),
                has_original_odds=bool(item.odds is not None),
            )
            if duplicate:
                # Upsert: synchronizovat stav s Tipsportem (důležité pro LIVE – vždy nastavit status + is_live)
                updated = None
                try:
                    updated = _sync_duplicate_from_tipsport(db, duplicate, data, item)
                except Exception:
                    updated = None

                if updated is not None:
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

