from datetime import timedelta, datetime
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bookmaker, Sport, Ticket, TicketStatus, TicketType
from app.schemas import (
    TicketCreate,
    TicketUpdate,
    TipsportScrapeRequest,
    TipsportScrapeResponse,
    TipsportScrapeResultItem,
    TipsportScrapeTicketIn,
    TipsportScrapeLegIn,
    TipsportScrapePreviewResponse,
    ScrapePreviewTicket,
    ScrapePreviewLeg,
)
from app.routers.tickets import create_ticket as _create_ticket
from app.routers.tickets import update_ticket as _update_ticket
from app.preview_store import create_preview_id, set_preview
from app.utils.sport_mapping import normalize_sport_label_for_db


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
    """Převede textový název sportu z Tipsportu na sport_id v DB (včetně aliasů z Ticket_Mapping)."""
    if not label:
        label = "Ostatní"
    name = normalize_sport_label_for_db(label.strip()) or label.strip()
    normalized = name.lower()

    # Zkus přesný název (case-insensitive)
    sport = (
        db.query(Sport)
        .filter(Sport.name.ilike(normalized))
        .first()
    )
    if not sport:
        # Mapování běžných variant (Tipsport, Betano, Fortuna mohou používat různé názvy)
        mapping = {
            "fotbal": "Fotbal",
            "soccer": "Fotbal",
            "hokej": "Hokej",
            "tenis": "Tenis",
            "basketbal": "Basketbal",
            "basketball": "Basketbal",
            "esport": "Esport",
            "házená": "Handball",
            "hazena": "Handball",
            "volejbal": "Volejbal",
            "ragby": "Rugby",
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
        if any(x in val for x in ("void", "vrácen", "vraceno", "vráceno", "zrušen", "zrusen", "refund", "ignored", "dropped")):
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

    is_live = False

    # Bezpečný fallback pro stake – pokud by z nějakého důvodu přišel None,
    # považujeme ho za 0, aby tiket šel vytvořit a skončil v incomplete filtru.
    stake = item.stake if item.stake is not None else Decimal("0")

    # AKU rodič: vždy jednotný popis (vklad a celkový kurz jsou na rodiči, děti jsou nohy)
    if ticket_type == "aku":
        legs = getattr(item, "legs", None) or []
        n = len(legs)
        home_team = "AKU"
        away_team = f"{n} sázek" if n else "Kombinace"
    else:
        home_team = item.home_team.strip()
        away_team = item.away_team.strip()

    event_date = getattr(item, "event_start_at", None) or item.placed_at
    ticket_href = getattr(item, "ticket_href", None) or None
    if ticket_href and isinstance(ticket_href, str) and ticket_href.strip():
        ticket_href = ticket_href.strip()
        if ticket_href.startswith("/"):
            ticket_href = "https://www.tipsport.cz" + ticket_href
    else:
        ticket_href = None
    return TicketCreate(
        bookmaker_id=tipsport_bookmaker_id,
        sport_id=sport_id,
        league_id=None,
        market_type_id=None,
        parent_id=None,
        home_team=home_team,
        away_team=away_team,
        event_date=event_date,
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
        bookmaker_ticket_url=ticket_href,
    )


def _build_child_ticket_create(
    db: Session,
    tipsport_bookmaker_id: int,
    parent_sport_id: int,
    parent_status: str,
    parent_placed_at,
    parent_is_live: bool,
    leg: TipsportScrapeLegIn,
    parent_id: int,
) -> TicketCreate:
    """Sestaví TicketCreate pro jednu nohu (dítě) AKU tiketu."""
    market_label, selection = _normalize_market_and_selection(
        leg.market_label_raw, leg.selection_raw
    )
    odds = leg.odds if leg.odds is not None else Decimal("1.0")
    return TicketCreate(
        bookmaker_id=tipsport_bookmaker_id,
        sport_id=parent_sport_id,
        league_id=None,
        market_type_id=None,
        parent_id=parent_id,
        home_team=leg.home_team.strip(),
        away_team=leg.away_team.strip(),
        event_date=parent_placed_at,
        market_label=market_label,
        selection=selection,
        odds=odds,
        stake=Decimal("0"),
        payout=None,
        profit=None,
        status=parent_status,
        ticket_type="solo",
        is_live=parent_is_live,
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


def _normalize_leg_pair(home: str | None, away: str | None) -> tuple[str, str]:
    """Normalizuje dvojici domácí–hosté pro porovnání (strip, prázdné řetězce)."""
    h = (home or "").strip()
    a = (away or "").strip()
    return (h, a)


def _find_duplicate_aku_by_legs(
    db: Session,
    bookmaker_id: int,
    legs: List[TipsportScrapeLegIn],
) -> Ticket | None:
    """
    Pro AKU tiket s nohami: najde existující AKU rodiče, jehož děti mají
    odpovídající dvojice (domácí, hosté) jako předané legs.

    - Ideální případ (rozbalený tiket): známe všechny nohy → porovnáváme
      přesnou shodu množiny dvojic (domácí, hosté).
    - Collapsed tiket (např. z Tipsport karty vidíme jen první zápas):
      známe jen část noh → hledáme rodiče, u kterého jsou všechny předané
      dvojice podmnožinou množiny (domácí, hosté) jeho dětí.

    Díky tomu:
    - když máme kompletní seznam noh, nedojde k falešnému sloučení různých AKU,
    - když máme jen část (např. jednu nohu), dokážeme stále spárovat typický
      případ jednoho AKU, aby uživatel nemusel znovu vyplňovat stejný tiket.
    """
    if not legs:
        return None
    incoming = [
        _normalize_leg_pair(leg.home_team, leg.away_team) for leg in legs
    ]
    incoming_set = set(incoming)
    n = len(incoming_set)

    parents = (
        db.query(Ticket)
        .filter(
            Ticket.bookmaker_id == bookmaker_id,
            Ticket.ticket_type == TicketType.aku,
            Ticket.parent_id.is_(None),
        )
        .all()
    )
    for parent in parents:
        children = (
            db.query(Ticket).filter(Ticket.parent_id == parent.id).all()
        )
        if not children:
            continue
        existing_pairs = {
            _normalize_leg_pair(c.home_team, c.away_team) for c in children
        }

        # 1) Plná informace – přesná shoda množiny noh
        if len(existing_pairs) == n and existing_pairs == incoming_set:
            return parent

        # 2) Částečná informace (např. známe jen první zápas) – všechny
        #    předané dvojice musí být podmnožinou existujících noh.
        if existing_pairs.issuperset(incoming_set):
            return parent
    return None


def _build_duplicate_update_payload(
    duplicate: Ticket,
    data: TicketCreate,
    item: TipsportScrapeTicketIn,
    overlay_sync: bool = False,
) -> dict:
    """
    Připraví payload pro synchronizaci existujícího tiketu s aktuálními daty z Tipsportu.
    overlay_sync=True: při syncu pro overlay neměnit status (zachovat open).
    """
    update_payload: dict = {}

    # status: přepsat z Tipsportu (Tipsport má vždy pravdu); při overlay_sync neměnit
    if not overlay_sync:
        dup_status = str(getattr(duplicate.status, "value", duplicate.status))
        if dup_status != data.status:
            update_payload["status"] = data.status

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

    # odkaz na tiket u Tipsportu (pro overlay)
    ticket_href = getattr(item, "ticket_href", None) or None
    if ticket_href and isinstance(ticket_href, str) and ticket_href.strip():
        u = ticket_href.strip()
        if u.startswith("/"):
            u = "https://www.tipsport.cz" + u
        if duplicate.bookmaker_ticket_url != u:
            update_payload["bookmaker_ticket_url"] = u

    return update_payload


def _sync_duplicate_from_tipsport(
    db: Session,
    duplicate: Ticket,
    data: TicketCreate,
    item: TipsportScrapeTicketIn,
    import_batch_id: str | None = None,
    import_batch_index: int | None = None,
    overlay_sync: bool = False,
) -> Ticket | None:
    """
    Aplikuje změny z Tipsportu na existující tiket (včetně pořadí a označení nově naimportovaných).
    """
    update_payload = _build_duplicate_update_payload(duplicate, data, item, overlay_sync=overlay_sync)
    if import_batch_id is not None:
        update_payload["import_batch_id"] = import_batch_id
    if import_batch_index is not None:
        update_payload["import_batch_index"] = import_batch_index
    update_payload["is_newly_imported"] = True
    if not update_payload:
        return None
    return _update_ticket(
        ticket_id=duplicate.id,
        data=TicketUpdate(**update_payload),
        db=db,
    )


def _ticket_create_to_preview(
    db: Session,
    data: TicketCreate,
    legs: List[ScrapePreviewLeg] | None = None,
    tipsport_key: str | None = None,
) -> ScrapePreviewTicket:
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
        legs=legs,
        tipsport_key=tipsport_key,
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
            if not duplicate and data.ticket_type == "aku" and getattr(item, "legs", None):
                duplicate = _find_duplicate_aku_by_legs(
                    db, tipsport_bookmaker_id, item.legs
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

            legs_preview: List[ScrapePreviewLeg] | None = None
            if getattr(item, "legs", None):
                legs_preview = [
                    ScrapePreviewLeg(
                        home_team=leg.home_team.strip(),
                        away_team=leg.away_team.strip(),
                        market_label=_normalize_market_and_selection(leg.market_label_raw, leg.selection_raw)[0],
                        selection=_normalize_market_and_selection(leg.market_label_raw, leg.selection_raw)[1],
                        odds=leg.odds if leg.odds is not None else Decimal("1.0"),
                    )
                    for leg in item.legs
                ]
            new_tickets.append(
                _ticket_create_to_preview(
                    db, data, legs=legs_preview,
                    tipsport_key=item.tipsport_key if getattr(item, "tipsport_key", None) else None,
                )
            )
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
    overlay_sync=True: sync pro overlay – při update neměnit status na won/lost (zachovat open).
    """
    tipsport_bookmaker_id = _get_tipsport_bookmaker_id(db)
    overlay_sync = getattr(payload, "overlay_sync", False) or False
    import_batch_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    results: List[TipsportScrapeResultItem] = []
    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for idx, item in enumerate(payload.tickets):
        try:
            data = _build_ticket_create(db, tipsport_bookmaker_id, item)
            data = data.model_copy(update={
                "import_batch_id": import_batch_id,
                "import_batch_index": idx,
                "is_newly_imported": True,
            })

            duplicate = _find_duplicate(
                db,
                tipsport_bookmaker_id,
                data,
                item.tipsport_key,
                has_original_stake=bool(item.stake is not None and item.stake > 0),
                has_original_odds=bool(item.odds is not None),
            )
            if not duplicate and data.ticket_type == "aku" and getattr(item, "legs", None):
                duplicate = _find_duplicate_aku_by_legs(
                    db, tipsport_bookmaker_id, item.legs
                )
            if duplicate:
                # Upsert: synchronizovat stav s Tipsportem + pořadí a označení z importu
                updated = None
                try:
                    updated = _sync_duplicate_from_tipsport(
                        db, duplicate, data, item,
                        import_batch_id=import_batch_id,
                        import_batch_index=idx,
                        overlay_sync=overlay_sync,
                    )
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

            # AKU s nohami: vytvořit děti (jednotlivé sázky) pod tímto rodičem
            legs = getattr(item, "legs", None) or []
            if data.ticket_type == "aku" and legs:
                status_val = data.status
                placed_at = data.event_date
                is_live = False
                for leg in legs:
                    child_data = _build_child_ticket_create(
                        db,
                        tipsport_bookmaker_id,
                        data.sport_id,
                        status_val,
                        placed_at,
                        is_live,
                        leg,
                        parent_id=created.id,
                    )
                    child_created = _create_ticket(data=child_data, db=db)
                    created_count += 1
                    results.append(
                        TipsportScrapeResultItem(
                            index=idx,
                            status="created",
                            ticket_id=child_created.id,
                            message="Noha AKU",
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

