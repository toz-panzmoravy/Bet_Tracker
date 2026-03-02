"""
Analytics endpoint: agregované statistiky (KPI, podle sportu, podle typu sázky, trend profitu)
pro stránku Analytics s filtry (období, sázkovka, jen vyhodnocené).
"""
from decimal import Decimal
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Ticket, TicketStatus
from app.schemas import (
    AnalyticsSummary,
    AnalyticsKpis,
    AnalyticsSportItem,
    AnalyticsMarketItem,
    AnalyticsTrendPoint,
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

SETTLED_STATUSES = [
    TicketStatus.won,
    TicketStatus.lost,
    TicketStatus.void,
    TicketStatus.half_win,
    TicketStatus.half_loss,
]


def _build_analytics_query(db: Session, date_from=None, date_to=None, bookmaker_id=None, jen_vyhodnocene=None):
    """Vrátí query tiketů s aplikovanými filtry. Používá created_at pro období."""
    query = db.query(Ticket).options(
        joinedload(Ticket.sport),
        joinedload(Ticket.market_type_rel),
    )
    if date_from is not None:
        query = query.filter(Ticket.created_at >= date_from)
    if date_to is not None:
        # Zahrnout celý den: date_to 00:00 → konec dne 23:59:59
        end_of_day = date_to.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(Ticket.created_at <= end_of_day)
    if bookmaker_id is not None:
        query = query.filter(Ticket.bookmaker_id == bookmaker_id)
    if jen_vyhodnocene:
        query = query.filter(Ticket.status.in_(SETTLED_STATUSES))
    return query


@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(
    date_from: Optional[datetime] = Query(None, description="Od data (created_at)"),
    date_to: Optional[datetime] = Query(None, description="Do data (created_at)"),
    bookmaker_id: Optional[int] = Query(None, description="Filtr podle sázkovky"),
    jen_vyhodnocene: bool = Query(True, description="Pouze vyhodnocené tikety (won/lost/void)"),
    db: Session = Depends(get_db),
):
    """
    Agregované statistiky pro Analytics: KPI, podle sportu, podle sport+typ sázky, trend profitu.
    """
    query = _build_analytics_query(
        db,
        date_from=date_from,
        date_to=date_to,
        bookmaker_id=bookmaker_id,
        jen_vyhodnocene=jen_vyhodnocene,
    )
    tickets = query.all()

    # KPI
    settled = [t for t in tickets if t.status in SETTLED_STATUSES]
    won_count = sum(1 for t in settled if t.status == TicketStatus.won or t.status == TicketStatus.half_win)
    lost_count = sum(1 for t in settled if t.status == TicketStatus.lost or t.status == TicketStatus.half_loss)
    void_count = sum(1 for t in settled if t.status == TicketStatus.void)
    stake_total = sum(Decimal(str(t.stake or 0)) for t in settled)
    profit_total = sum(Decimal(str(t.profit or 0)) for t in settled)
    hitrate = (won_count / (won_count + lost_count) * 100) if (won_count + lost_count) > 0 else 0.0
    roi = (float(profit_total) / float(stake_total) * 100) if stake_total else 0.0

    kpis = AnalyticsKpis(
        tickets_count=len(tickets),
        won_count=won_count,
        lost_count=lost_count,
        void_count=void_count,
        stake_total=stake_total,
        profit_total=profit_total,
        roi_percent=round(roi, 2),
        hitrate_percent=round(hitrate, 2),
    )

    # by_sport
    by_sport_map = {}
    for t in tickets:
        sid = t.sport_id
        sname = t.sport.name if t.sport else "Neznámý"
        key = (sid, sname)
        if key not in by_sport_map:
            by_sport_map[key] = {
                "won": 0,
                "lost": 0,
                "void": 0,
                "stake": Decimal("0"),
                "profit": Decimal("0"),
                "count": 0,
            }
        by_sport_map[key]["count"] += 1
        if t.status in SETTLED_STATUSES:
            by_sport_map[key]["stake"] += Decimal(str(t.stake or 0))
            by_sport_map[key]["profit"] += Decimal(str(t.profit or 0))
            if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
                by_sport_map[key]["won"] += 1
            elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
                by_sport_map[key]["lost"] += 1
            else:
                by_sport_map[key]["void"] += 1

    by_sport = []
    for (sid, sname), d in by_sport_map.items():
        w, l = d["won"], d["lost"]
        hr = (w / (w + l) * 100) if (w + l) > 0 else 0.0
        st = d["stake"]
        ro = (float(d["profit"]) / float(st) * 100) if st else 0.0
        by_sport.append(
            AnalyticsSportItem(
                sport_id=sid,
                sport_name=sname,
                tickets_count=d["count"],
                won_count=d["won"],
                lost_count=d["lost"],
                void_count=d["void"],
                profit=d["profit"],
                roi_percent=round(ro, 2),
                hitrate_percent=round(hr, 2),
            )
        )
    by_sport.sort(key=lambda x: (float(x.profit), x.tickets_count), reverse=True)

    # by_market (sport + market_type)
    by_market_map = {}
    for t in tickets:
        sid = t.sport_id
        sname = t.sport.name if t.sport else "Neznámý"
        mid = t.market_type_id
        mname = t.market_type_rel.name if t.market_type_rel else "Neznámý"
        key = (sid, sname, mid, mname)
        if key not in by_market_map:
            by_market_map[key] = {
                "won": 0,
                "lost": 0,
                "void": 0,
                "stake": Decimal("0"),
                "profit": Decimal("0"),
                "count": 0,
            }
        by_market_map[key]["count"] += 1
        if t.status in SETTLED_STATUSES:
            by_market_map[key]["stake"] += Decimal(str(t.stake or 0))
            by_market_map[key]["profit"] += Decimal(str(t.profit or 0))
            if t.status == TicketStatus.won or t.status == TicketStatus.half_win:
                by_market_map[key]["won"] += 1
            elif t.status == TicketStatus.lost or t.status == TicketStatus.half_loss:
                by_market_map[key]["lost"] += 1
            else:
                by_market_map[key]["void"] += 1

    by_market = []
    for (sid, sname, mid, mname), d in by_market_map.items():
        w, l = d["won"], d["lost"]
        hr = (w / (w + l) * 100) if (w + l) > 0 else 0.0
        st = d["stake"]
        ro = (float(d["profit"]) / float(st) * 100) if st else 0.0
        by_market.append(
            AnalyticsMarketItem(
                sport_id=sid,
                sport_name=sname,
                market_type_id=mid,
                market_type_name=mname,
                tickets_count=d["count"],
                won_count=d["won"],
                lost_count=d["lost"],
                void_count=d["void"],
                stake=st,
                profit=d["profit"],
                roi_percent=round(ro, 2),
                hitrate_percent=round(hr, 2),
            )
        )

    # profit_trend (denní agregace, pouze vyhodnocené)
    daily = {}
    for t in settled:
        day = (t.created_at or t.event_date or datetime.min).strftime("%Y-%m-%d")
        if day == "1900-01-01":
            continue
        if day not in daily:
            daily[day] = {"profit": Decimal("0"), "count": 0}
        daily[day]["profit"] += t.profit or 0
        daily[day]["count"] += 1

    profit_trend = []
    cum = Decimal("0")
    for date_str in sorted(daily.keys()):
        cum += daily[date_str]["profit"]
        profit_trend.append(
            AnalyticsTrendPoint(
                date=date_str,
                profit=daily[date_str]["profit"],
                cumulative_profit=cum,
                bets_count=daily[date_str]["count"],
            )
        )

    return AnalyticsSummary(
        kpis=kpis,
        by_sport=by_sport,
        by_market=by_market,
        profit_trend=profit_trend,
    )
