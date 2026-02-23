from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field


# ─── Bookmaker ───────────────────────────────────────────

class BookmakerBase(BaseModel):
    name: str
    currency: str = "CZK"

class BookmakerOut(BookmakerBase):
    id: int
    class Config:
        from_attributes = True


# ─── Sport ───────────────────────────────────────────────

class SportBase(BaseModel):
    name: str
    icon: Optional[str] = None

class SportOut(SportBase):
    id: int
    class Config:
        from_attributes = True


# ─── League ──────────────────────────────────────────────

class LeagueBase(BaseModel):
    name: str
    sport_id: int
    country: Optional[str] = None

class LeagueOut(LeagueBase):
    id: int
    sport: Optional[SportOut] = None
    class Config:
        from_attributes = True


# ─── Market Type ──────────────────────────────────────────

class MarketTypeBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class MarketTypeCreate(MarketTypeBase):
    sport_ids: List[int] = []

class MarketTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sport_ids: Optional[List[int]] = None

class MarketTypeOut(MarketTypeBase):
    id: int
    sports: List[SportOut] = []
    class Config:
        from_attributes = True

class MarketTypeStat(MarketTypeOut):
    bets_count: int = 0
    win_rate: float = 0.0
    profit: Decimal = Decimal("0")


# ─── Ticket ──────────────────────────────────────────────

class TicketCreate(BaseModel):
    bookmaker_id: int
    sport_id: int
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    home_team: str
    away_team: str
    event_date: Optional[datetime] = None
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Decimal
    stake: Decimal
    payout: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    status: str = "open"
    ticket_type: str = "solo"
    is_live: bool = False
    source: str = "manual"


class TicketUpdate(BaseModel):
    bookmaker_id: Optional[int] = None
    sport_id: Optional[int] = None
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    home_team: Optional[str] = None
    away_team: Optional[str] = None
    event_date: Optional[datetime] = None
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Optional[Decimal] = None
    stake: Optional[Decimal] = None
    payout: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    status: Optional[str] = None
    is_live: Optional[bool] = None


class TicketOut(BaseModel):
    id: int
    bookmaker_id: int
    sport_id: int
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    home_team: str
    away_team: str
    event_date: Optional[datetime] = None
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Decimal
    stake: Decimal
    payout: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    status: str
    ticket_type: str
    is_live: bool
    source: str
    created_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None

    # Nested
    bookmaker: Optional[BookmakerOut] = None
    sport: Optional[SportOut] = None
    league: Optional[LeagueOut] = None
    market_type: Optional[MarketTypeOut] = Field(alias="market_type_rel", default=None)

    class Config:
        from_attributes = True
        populate_by_name = True


# ─── Stats ───────────────────────────────────────────────

class OverallStats(BaseModel):
    bets_count: int = 0
    stake_total: Decimal = Decimal("0")
    profit_total: Decimal = Decimal("0")
    payout_total: Decimal = Decimal("0")
    roi_percent: float = 0.0
    hit_rate_percent: float = 0.0
    avg_odds: float = 0.0
    current_streak: int = 0
    best_streak: int = 0
    worst_streak: int = 0
    max_drawdown: Decimal = Decimal("0")
    max_drawdown_percent: float = 0.0


class GroupedStat(BaseModel):
    label: str
    bets_count: int = 0
    wins_count: int = 0
    losses_count: int = 0
    voids_count: int = 0
    stake_total: Decimal = Decimal("0")
    profit_total: Decimal = Decimal("0")
    roi_percent: float = 0.0
    avg_odds: float = 0.0


class TimeseriesPoint(BaseModel):
    date: str
    profit: Decimal = Decimal("0")
    cumulative_profit: Decimal = Decimal("0")
    bets_count: int = 0


class WeeklyStats(BaseModel):
    current_week: OverallStats
    last_week: OverallStats


class StatsOverview(BaseModel):
    overall: OverallStats
    weekly: WeeklyStats
    by_sport: List[GroupedStat] = []
    by_bookmaker: List[GroupedStat] = []
    by_league: List[GroupedStat] = []
    by_market_type: List[GroupedStat] = []
    by_odds_bucket: List[GroupedStat] = []
    by_month: List[GroupedStat] = []


# ─── AI ──────────────────────────────────────────────────

class AiAnalyzeRequest(BaseModel):
    filters: Optional[dict] = None
    question: Optional[str] = None


class AiAnalyzeResponse(BaseModel):
    analysis_text: str
    used_filters: Optional[dict] = None
    aggregates_summary: Optional[dict] = None


class AiAnalysisOut(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    context: Optional[dict] = None
    model_name: Optional[str] = None
    response_text: Optional[str] = None

    class Config:
        from_attributes = True


# ─── OCR ─────────────────────────────────────────────────

class OcrParsedTicket(BaseModel):
    home_team: str = ""
    away_team: str = ""
    sport: str = ""
    league: str = ""
    market_label: str = ""
    selection: str = ""
    odds: Optional[Decimal] = None
    stake: Optional[Decimal] = None
    payout: Optional[Decimal] = None
    status: str = "open"
    is_live: bool = False


class OcrResponse(BaseModel):
    tickets: List[OcrParsedTicket] = []
    raw_text: str = ""
    confidence: Optional[float] = None
