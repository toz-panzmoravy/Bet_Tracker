from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.stats_service import get_overview, get_timeseries
from app.schemas import StatsOverview, TimeseriesPoint

router = APIRouter(prefix="/api/stats", tags=["Statistiky"])


@router.get("/overview", response_model=StatsOverview)
def stats_overview(
    sport_id: Optional[int] = None,
    league_id: Optional[int] = None,
    bookmaker_id: Optional[int] = None,
    market_type: Optional[str] = None,
    is_live: Optional[bool] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    odds_min: Optional[float] = None,
    odds_max: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """Agregované statistiky pro dashboard."""
    filters = {
        "sport_id": sport_id,
        "league_id": league_id,
        "bookmaker_id": bookmaker_id,
        # market_type se z API posílá jako string; ve službě podporujeme jak ID, tak jméno
        "market_type": market_type,
        "is_live": is_live,
        "status": status,
        "date_from": date_from,
        "date_to": date_to,
        "odds_min": odds_min,
        "odds_max": odds_max,
    }
    # Odstraníme None hodnoty
    filters = {k: v for k, v in filters.items() if v is not None}
    return get_overview(db, filters)


@router.get("/timeseries", response_model=List[TimeseriesPoint])
def stats_timeseries(
    sport_id: Optional[int] = None,
    league_id: Optional[int] = None,
    bookmaker_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    grouping: str = Query(default="daily"),
    db: Session = Depends(get_db),
):
    """Profit v čase pro graf."""
    filters = {
        "sport_id": sport_id,
        "league_id": league_id,
        "bookmaker_id": bookmaker_id,
        "date_from": date_from,
        "date_to": date_to,
    }
    filters = {k: v for k, v in filters.items() if v is not None}
    return get_timeseries(db, filters, grouping)
