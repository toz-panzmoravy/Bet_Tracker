from decimal import Decimal
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from app.models import Ticket, TicketStatus, Sport
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
    if filters.get("market_type"):
        query = query.filter(Ticket.market_type == filters["market_type"])
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


def _compute_streaks(settled_bets: list) -> tuple[int, int]:
    """Vypočítá nejdelší winning a losing streak."""
    if not settled_bets:
        return 0, 0

    sorted_bets = sorted(settled_bets, key=lambda t: t.created_at or datetime.min)
    best_streak = worst_streak = 0
    current_win = current_loss = 0

    for t in sorted_bets:
        if t.status == TicketStatus.won:
            current_win += 1
            current_loss = 0
            best_streak = max(best_streak, current_win)
        elif t.status == TicketStatus.lost:
            current_loss += 1
            current_win = 0
            worst_streak = max(worst_streak, current_loss)
        else:
            current_win = 0
            current_loss = 0

    return best_streak, worst_streak


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

    best_streak, worst_streak = _compute_streaks(settled_bets)
    max_dd, max_dd_pct = _compute_drawdown(settled_bets)

    return OverallStats(
        bets_count=bets_count,
        stake_total=Decimal(str(stake_total)),
        profit_total=Decimal(str(profit_total)),
        payout_total=Decimal(str(payout_total)),
        roi_percent=round(roi, 2),
        hit_rate_percent=round(hit_rate, 2),
        avg_odds=round(avg_odds, 2),
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
        groups[key]["stake"] += t.stake or 0
        groups[key]["odds_sum"] += float(t.odds or 0)

        if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
            groups[key]["wins"] += 1
        elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
            groups[key]["losses"] += 1
        elif t.status == TicketStatus.void:
            groups[key]["voids"] += 1

        if t.status in SETTLED_STATUSES:
            groups[key]["profit"] += t.profit or 0

    return [
        GroupedStat(
            label=name,
            bets_count=data["bets"],
            wins_count=data["wins"],
            losses_count=data["losses"],
            voids_count=data["voids"],
            stake_total=data["stake"],
            profit_total=data["profit"],
            roi_percent=round(float(data["profit"]) / float(data["stake"]) * 100, 2) if data["stake"] else 0,
            avg_odds=round(data["odds_sum"] / data["bets"], 2) if data["bets"] > 0 else 0
        )
        for name, data in groups.items()
        if data["bets"] > 0
    ]


def _get_week_ranges() -> tuple[tuple[datetime, datetime], tuple[datetime, datetime]]:
    """Vrátí rozsahy (start, end) pro aktuální a minulý týden."""
    now = datetime.now()
    # Pondělí 00:00:00 aktuálního týdne
    curr_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    curr_start -= timedelta(days=now.weekday())

    # Neděle 23:59:59 aktuálního týdne
    curr_end = curr_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    # Minulý týden
    last_start = curr_start - timedelta(days=7)
    last_end = curr_end - timedelta(days=7)

    return (curr_start, curr_end), (last_start, last_end)


def get_stats_by_sport(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle sportu."""
    query = db.query(Ticket).join(Sport)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    return _group_tickets(tickets, lambda t: t.sport.name if t.sport else "Neznámý")


def get_stats_by_market(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI a profit podle typu marketu."""
    query = db.query(Ticket)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    return _group_tickets(tickets, lambda t: t.market_type or "Ostatní")


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
            if lo <= (t.odds or 0) <= hi:
                groups[name]["bets"] += 1
                groups[name]["stake"] += t.stake or 0
                groups[name]["odds_sum"] += float(t.odds or 0)

                if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
                    groups[name]["wins"] += 1
                elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
                    groups[name]["losses"] += 1
                elif t.status == TicketStatus.void:
                    groups[name]["voids"] += 1

                if t.status in SETTLED_STATUSES:
                    groups[name]["profit"] += t.profit or 0
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


def get_live_vs_prematch(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI porovnání Live vs Prematch."""
    query = db.query(Ticket)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()
    return _group_tickets(tickets, lambda t: "⚡ Live" if t.is_live else "📋 Prematch")


def get_stats_by_weekday(db: Session, filters: dict = None) -> List[GroupedStat]:
    """ROI podle dne v týdnu."""
    query = db.query(Ticket)
    query = _build_filters(db, query, filters or {})
    tickets = query.all()

    def weekday_label(t):
        if t.created_at:
            return WEEKDAY_NAMES[t.created_at.weekday()]
        return "Neznámý"

    stats = _group_tickets(tickets, weekday_label)
    # Seřadíme podle pořadí dnů
    day_order = {name: i for i, name in enumerate(WEEKDAY_NAMES)}
    stats.sort(key=lambda s: day_order.get(s.label, 99))
    return stats


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

    curr_week_stats = get_overall_stats(db, {"date_from": curr_start.isoformat(), "date_to": curr_end.isoformat()})
    last_week_stats = get_overall_stats(db, {"date_from": last_start.isoformat(), "date_to": last_end.isoformat()})

    from app.schemas.schemas import WeeklyStats
    weekly = WeeklyStats(current_week=curr_week_stats, last_week=last_week_stats)

    return StatsOverview(
        overall=get_overall_stats(db, filters),
        weekly=weekly,
        by_sport=get_stats_by_sport(db, filters),
        by_market_type=get_stats_by_market(db, filters),
        by_odds_bucket=get_stats_by_odds_bucket(db, filters),
        by_month=get_stats_by_month(db, filters),
        live_vs_prematch=get_live_vs_prematch(db, filters),
        by_weekday=get_stats_by_weekday(db, filters),
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
