from decimal import Decimal
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from app.models import Ticket, TicketStatus, Sport, MarketType
from app.schemas import (
    OverallStats, GroupedStat, TimeseriesPoint, StatsOverview
)

SETTLED_STATUSES = [
    TicketStatus.won, TicketStatus.lost,
    TicketStatus.void, TicketStatus.half_win, TicketStatus.half_loss,
]

WEEKDAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"]


def _build_filters(db: Session, query, filters: dict):
    """Aplikuje filtry na dotaz."""
    if filters.get("sport_id"):
        query = query.filter(Ticket.sport_id == filters["sport_id"])
    if filters.get("league_id"):
        query = query.filter(Ticket.league_id == filters["league_id"])
    if filters.get("bookmaker_id"):
        query = query.filter(Ticket.bookmaker_id == filters["bookmaker_id"])
    if filters.get("market_type_id"):
        query = query.filter(Ticket.market_type_id == filters["market_type_id"])
    if filters.get("is_live") is not None:
        query = query.filter(Ticket.is_live == filters["is_live"])
    if filters.get("status"):
        query = query.filter(Ticket.status == filters["status"])
    if filters.get("date_from"):
        query = query.filter(Ticket.created_at >= filters["date_from"])
    if filters.get("date_to"):
        query = query.filter(Ticket.created_at <= filters["date_to"])
    if filters.get("odds_min"):
        query = query.filter(Ticket.odds >= Decimal(str(filters["odds_min"])))
    if filters.get("odds_max"):
        query = query.filter(Ticket.odds <= Decimal(str(filters["odds_max"])))
    return query


def _get_filtered_tickets(db: Session, filters: dict):
    """Vrátí all + settled tikety s aplikovanými filtry."""
    query = db.query(Ticket)
    query = _build_filters(db, query, filters or {})
    all_bets = query.all()

    settled_bets = [t for t in all_bets if t.status in SETTLED_STATUSES]
    return all_bets, settled_bets


def _compute_streaks(settled_bets: list) -> tuple[int, int, int]:
    """Vypočítá aktuální, nejdelší winning a nejdelší losing streak."""
    if not settled_bets:
        return 0, 0, 0

    sorted_bets = sorted(settled_bets, key=lambda t: t.created_at or datetime.min)
    best_streak = worst_streak = current_streak = 0
    current_win = current_loss = 0

    for t in sorted_bets:
        if t.status == TicketStatus.won:
            current_win += 1
            current_loss = 0
            best_streak = max(best_streak, current_win)
            current_streak = current_win
        elif t.status == TicketStatus.lost:
            current_loss += 1
            current_win = 0
            worst_streak = max(worst_streak, current_loss)
            current_streak = -current_loss
        else:
            current_win = 0
            current_loss = 0
            current_streak = 0

    return current_streak, best_streak, worst_streak


def _compute_drawdown(settled_bets: list) -> tuple[Decimal, float]:
    """Vypočítá maximální drawdown (absolutní + procentuální)."""
    if not settled_bets:
        return Decimal("0"), 0.0

    sorted_bets = sorted(settled_bets, key=lambda t: t.created_at or datetime.min)
    cumulative = Decimal("0")
    peak = Decimal("0")
    max_dd = Decimal("0")

    for t in sorted_bets:
        cumulative += t.profit or 0
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd

    stake_total = sum(t.stake or 0 for t in settled_bets)
    dd_percent = float(max_dd) / float(stake_total) * 100 if stake_total else 0.0

    return max_dd, round(dd_percent, 2)


def get_overall_stats(db: Session, filters: dict = None) -> OverallStats:
    """Celkové agregované statistiky včetně streak a drawdown."""
    all_bets, settled_bets = _get_filtered_tickets(db, filters)

    if not all_bets:
        return OverallStats()

    bets_count = len(all_bets)
    stake_total = sum(t.stake or 0 for t in all_bets)
    profit_total = sum(t.profit or 0 for t in settled_bets)
    payout_total = sum(t.payout or 0 for t in settled_bets)
    avg_odds = sum(float(t.odds or 0) for t in all_bets) / bets_count if bets_count else 0

    won_count = sum(1 for t in settled_bets if t.status == TicketStatus.won)
    settled_count = len(settled_bets)
    hit_rate = (won_count / settled_count * 100) if settled_count else 0
    roi = (float(profit_total) / float(stake_total) * 100) if stake_total else 0

    current_streak, best_streak, worst_streak = _compute_streaks(settled_bets)
    max_dd, max_dd_pct = _compute_drawdown(settled_bets)

    return OverallStats(
        bets_count=bets_count,
        stake_total=Decimal(str(stake_total)),
        profit_total=Decimal(str(profit_total)),
        payout_total=Decimal(str(payout_total)),
        roi_percent=round(roi, 2),
        hit_rate_percent=round(hit_rate, 2),
        avg_odds=round(avg_odds, 2),
        current_streak=current_streak,
        best_streak=best_streak,
        worst_streak=worst_streak,
        max_drawdown=max_dd,
        max_drawdown_percent=max_dd_pct,
    )


def _group_tickets(tickets: list, key_fn) -> List[GroupedStat]:
    """Generický helper pro seskupení tiketů podle libovolného klíče."""
    groups = {}
    for t in tickets:
        key = key_fn(t)
        if key not in groups:
            groups[key] = {
                "bets": 0,
                "stake": Decimal("0"),
                "profit": Decimal("0"),
                "wins": 0,
                "losses": 0,
                "voids": 0,
                "odds_sum": 0.0
            }
        groups[key]["bets"] += 1
        groups[key]["stake"] += Decimal(str(t.stake or 0))
        groups[key]["odds_sum"] += float(t.odds or 0)

        if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
            groups[key]["wins"] += 1
        elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
            groups[key]["losses"] += 1
        elif t.status == TicketStatus.void:
            groups[key]["voids"] += 1

        if t.status in SETTLED_STATUSES:
            groups[key]["profit"] += Decimal(str(t.profit or 0))

    return [
        GroupedStat(
            label=name,
            bets_count=data["bets"],
            wins_count=data["wins"],
            losses_count=data["losses"],
            voids_count=data["voids"],
            stake_total=data["stake"],
            profit_total=data["profit"],
            roi_percent=round(float(data["profit"] / data["stake"] * 100), 2) if data["stake"] else 0,
            avg_odds=round(float(data["odds_sum"] / data["bets"]), 2) if data["bets"] > 0 else 0
        )
        for name, data in groups.items()
        if data["bets"] > 0
    ]


def _get_week_ranges() -> tuple[tuple[datetime, datetime], tuple[datetime, datetime]]:
    """Vrátí plovoucí rozsahy (start, end) pro posledních 7 dní a předchozích 7 dní."""
    now = datetime.now()
    # Konec aktuálního "týdne" (dnes)
    curr_end = now

    # Začátek aktuálního "týdne" (před 7 dny o půlnoci)
    curr_start = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Předchozí "týden" (-14 až -7 dní)
    last_end = curr_start - timedelta(seconds=1)
    last_start = (curr_start - timedelta(days=7))

    return (curr_start, curr_end), (last_start, last_end)


from app.models import Ticket, TicketStatus, Sport, MarketType, Bookmaker, League

def get_stats_by_sport(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle sportu."""
    query = db.query(Ticket).join(Sport)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    return _group_tickets(tickets, lambda t: t.sport.name if t.sport else "Neznámý")

def get_stats_by_bookmaker(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle sázkové kanceláře."""
    all_books = db.query(Bookmaker).all()
    groups = {b.name: {"bets": 0, "stake": Decimal("0"), "profit": Decimal("0"), "wins": 0, "losses": 0, "voids": 0, "odds_sum": 0.0} for b in all_books}

    query = db.query(Ticket).outerjoin(Bookmaker, Ticket.bookmaker_id == Bookmaker.id)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()

    for t in tickets:
        name = t.bookmaker.name if hasattr(t, 'bookmaker') and t.bookmaker else "Neznámý"
        if name not in groups:
            groups[name] = {"bets": 0, "stake": Decimal("0"), "profit": Decimal("0"), "wins": 0, "losses": 0, "voids": 0, "odds_sum": 0.0}
        
        groups[name]["bets"] += 1
        groups[name]["stake"] += Decimal(str(t.stake or 0))
        groups[name]["odds_sum"] += float(t.odds or 0)

        if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
            groups[name]["wins"] += 1
        elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
            groups[name]["losses"] += 1
        elif t.status == TicketStatus.void:
            groups[name]["voids"] += 1

        if t.status in SETTLED_STATUSES:
            groups[name]["profit"] += Decimal(str(t.profit or 0))

    return [
        GroupedStat(
            label=name,
            bets_count=data["bets"],
            wins_count=data["wins"],
            losses_count=data["losses"],
            voids_count=data["voids"],
            stake_total=data["stake"],
            profit_total=data["profit"],
            roi_percent=round(float(data["profit"] / data["stake"]) * 100, 2) if data["stake"] else 0,
            avg_odds=round(float(data["odds_sum"] / data["bets"]), 2) if data["bets"] > 0 else 0
        )
        for name, data in groups.items()
    ]

def get_stats_by_league(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle ligy."""
    query = db.query(Ticket).outerjoin(League, Ticket.league_id == League.id)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    return _group_tickets(tickets, lambda t: t.league.name if hasattr(t, 'league') and t.league else "Ostatní")


def get_stats_by_market(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle typu sázky (z tabulky MarketType)."""
    query = db.query(Ticket).join(MarketType)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    
    return _group_tickets(
        tickets, 
        lambda t: t.market_type_rel.name if t.market_type_rel else "Neznámý"
    )


def get_stats_by_odds_bucket(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI podle kurzového pásma."""
    filters = filters or {}
    query = db.query(Ticket)
    query = _build_filters(db, query, filters)
    tickets = query.all()

    buckets = [
        ("1.01–1.50", Decimal("1.01"), Decimal("1.50")),
        ("1.51–2.00", Decimal("1.51"), Decimal("2.00")),
        ("2.01–3.00", Decimal("2.01"), Decimal("3.00")),
        ("3.01–5.00", Decimal("3.01"), Decimal("5.00")),
        ("5.01+", Decimal("5.01"), Decimal("999")),
    ]

    groups = {name: {
        "bets": 0, "stake": Decimal("0"), "profit": Decimal("0"),
        "wins": 0, "losses": 0, "voids": 0, "odds_sum": 0.0
    } for name, _, _ in buckets}

    for t in tickets:
        for name, lo, hi in buckets:
            if lo <= Decimal(str(t.odds or 0)) <= hi:
                groups[name]["bets"] += 1
                groups[name]["stake"] += Decimal(str(t.stake or 0))
                groups[name]["odds_sum"] += float(t.odds or 0)

                if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
                    groups[name]["wins"] += 1
                elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
                    groups[name]["losses"] += 1
                elif t.status == TicketStatus.void:
                    groups[name]["voids"] += 1

                if t.status in SETTLED_STATUSES:
                    groups[name]["profit"] += Decimal(str(t.profit or 0))
                break

    return [
        GroupedStat(
            label=name,
            bets_count=groups[name]["bets"],
            wins_count=groups[name]["wins"],
            losses_count=groups[name]["losses"],
            voids_count=groups[name]["voids"],
            stake_total=groups[name]["stake"],
            profit_total=groups[name]["profit"],
            roi_percent=round(float(groups[name]["profit"]) / float(groups[name]["stake"]) * 100, 2) if groups[name]["stake"] else 0,
            avg_odds=round(groups[name]["odds_sum"] / groups[name]["bets"], 2) if groups[name]["bets"] > 0 else 0
        )
        for name, _, _ in buckets
        if groups[name]["bets"] > 0
    ]


def get_stats_by_month(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit po měsících (02 - 2026)."""
    query = db.query(Ticket)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()

    def month_label(t):
        if t.created_at:
            return t.created_at.strftime("%m - %Y")
        return "Neznámý"

    stats = _group_tickets(tickets, month_label)
    # Seřadíme od nejnovějšího
    try:
        stats.sort(key=lambda s: datetime.strptime(s.label, "%m - %Y") if s.label != "Neznámý" else datetime.min, reverse=True)
    except:
        pass
    return stats


def get_overview(db: Session, filters: dict = None) -> StatsOverview:
    """Kompletní přehled statistik."""
    (curr_start, curr_end), (last_start, last_end) = _get_week_ranges()

    curr_week_stats = get_overall_stats(db, {"date_from": curr_start, "date_to": curr_end})
    last_week_stats = get_overall_stats(db, {"date_from": last_start, "date_to": last_end})

    from app.schemas.schemas import WeeklyStats
    weekly = WeeklyStats(current_week=curr_week_stats, last_week=last_week_stats)

    return StatsOverview(
        overall=get_overall_stats(db, filters),
        weekly=weekly,
        by_sport=get_stats_by_sport(db, filters),
        by_bookmaker=get_stats_by_bookmaker(db, filters),
        by_league=get_stats_by_league(db, filters),
        by_market_type=get_stats_by_market(db, filters),
        by_odds_bucket=get_stats_by_odds_bucket(db, filters),
        by_month=get_stats_by_month(db, filters),
    )


def get_timeseries(db: Session, filters: dict = None, grouping: str = "daily") -> List[TimeseriesPoint]:
    """Profit v čase (denní/týdenní)."""
    filters = filters or {}
    query = db.query(Ticket).filter(
        Ticket.status.in_([
            TicketStatus.won, TicketStatus.lost,
            TicketStatus.half_win, TicketStatus.half_loss
        ])
    )
    query = _build_filters(db, query, filters)
    query = query.order_by(Ticket.created_at)
    tickets = query.all()

    daily = {}
    for t in tickets:
        day = t.created_at.strftime("%Y-%m-%d") if t.created_at else "Neznámé"
        if day not in daily:
            daily[day] = {"profit": Decimal("0"), "count": 0}
        daily[day]["profit"] += t.profit or 0
        daily[day]["count"] += 1

    result = []
    cumulative = Decimal("0")
    for date_str in sorted(daily.keys()):
        cumulative += daily[date_str]["profit"]
        result.append(TimeseriesPoint(
            date=date_str,
            profit=daily[date_str]["profit"],
            cumulative_profit=cumulative,
            bets_count=daily[date_str]["count"],
        ))

    return result
