from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel, Field

TicketStatusLiteral = Literal["open", "won", "lost", "void", "half_win", "half_loss"]


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
    bookmaker_id: Optional[int] = None
    sport_id: int
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    parent_id: Optional[int] = None  # AKU: nadřazený tiket (subtikety mají parent_id)
    home_team: str
    away_team: str
    event_date: Optional[datetime] = None
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Decimal
    stake: Decimal
    payout: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    status: TicketStatusLiteral = "open"
    ticket_type: str = "solo"
    is_live: bool = False
    source: str = "manual"


class TicketUpdate(BaseModel):
    bookmaker_id: Optional[int] = None
    sport_id: Optional[int] = None
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    parent_id: Optional[int] = None
    home_team: Optional[str] = None
    away_team: Optional[str] = None
    event_date: Optional[datetime] = None
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Optional[Decimal] = None
    stake: Optional[Decimal] = None
    payout: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    status: Optional[TicketStatusLiteral] = None
    ticket_type: Optional[str] = None
    is_live: Optional[bool] = None


class TicketOut(BaseModel):
    id: int
    bookmaker_id: Optional[int] = None
    sport_id: int
    league_id: Optional[int] = None
    market_type_id: Optional[int] = None
    parent_id: Optional[int] = None
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
    live_match_url: Optional[str] = None
    tipsport_match_id: Optional[str] = None
    last_live_at: Optional[datetime] = None
    last_live_snapshot: Optional[dict] = None

    # Nested
    bookmaker: Optional[BookmakerOut] = None
    sport: Optional[SportOut] = None
    league: Optional[LeagueOut] = None
    market_type: Optional[MarketTypeOut] = Field(alias="market_type_rel", default=None)

    class Config:
        from_attributes = True
        populate_by_name = True


class TicketListResponse(BaseModel):
    """Paginated list of tickets with total count."""
    items: List[TicketOut]
    total: int


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


# ─── App Settings / Bankroll ─────────────────────────────


class AppSettingsOut(BaseModel):
    bankroll: Decimal | None = None
    webhook_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class AppSettingsUpdate(BaseModel):
    bankroll: Decimal | None = None
    webhook_url: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


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
    aggregates: Optional[dict] = None
    model_name: Optional[str] = None
    response_text: Optional[str] = None
    status: Optional[str] = None
    error_message: Optional[str] = None

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
    ticket_type: str = "solo"  # "solo" | "aku" from Tipsport first line (AKU / SÓLO)


class OcrResponse(BaseModel):
    tickets: List[OcrParsedTicket] = []
    raw_text: str = ""
    confidence: Optional[float] = None


# ─── Tipsport Scraper Import ───────────────────────────────

class TipsportScrapeTicketIn(BaseModel):
    """
    Vstup pro import z browser scrapperu (Tipsport).
    Drží „syrové“ hodnoty přímo z HTML, backend je namapuje na TicketCreate.
    """
    home_team: str
    away_team: str
    tipsport_key: Optional[str] = None         # stabilní identifikátor z data-atid / href (idu:idb:hash)
    sport_label: Optional[str] = None          # např. „Basketbal“, „Fotbal“
    sport_icon_id: Optional[str] = None        # např. "#i173" z <use xlink:href>
    sport_class: Optional[str] = None          # fallback: CSS class z Tipsportu (např. "kVnpal")
    market_label_raw: Optional[str] = None     # např. „Vítěz zápasu“
    selection_raw: Optional[str] = None        # např. „Vítěz zápasu: Team Voca“
    ticket_type_raw: Optional[str] = None      # např. „AKU“ / „SÓLO“
    status_raw: Optional[str] = None           # např. „won“ / „lost“ nebo text/ikona z Tipsportu
    stake: Decimal
    payout: Optional[Decimal] = None
    odds: Optional[Decimal] = None
    placed_at: Optional[datetime] = None       # datum/čas podaní tiketu, pokud ho scrapper umí vytáhnout
    event_start_at: Optional[datetime] = None   # čas výkopu / začátku zápasu (z detailu tiketu); přednost před placed_at pro event_date
    is_live: Optional[bool] = False            # True pokud tiket obsahuje Live (běžící zápas)
    legs: Optional[List["TipsportScrapeLegIn"]] = None  # AKU: nohy (zápasy), pokud extension načte rozbalený tiket


class TipsportScrapeLegIn(BaseModel):
    """Jedna noha AKU tiketu (zápas + výběr + kurz)."""
    home_team: str
    away_team: str
    market_label_raw: Optional[str] = None
    selection_raw: Optional[str] = None
    odds: Optional[Decimal] = None


TipsportScrapeTicketIn.model_rebuild()


class TipsportScrapeRequest(BaseModel):
    tickets: List[TipsportScrapeTicketIn]


class TipsportScrapeResultItem(BaseModel):
    index: int
    status: str                 # "created" | "updated" | "skipped" | "error"
    ticket_id: Optional[int] = None
    message: Optional[str] = None


class TipsportScrapeResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: int
    results: List[TipsportScrapeResultItem]


class ScrapePreviewLeg(BaseModel):
    """Jedna noha AKU v náhledu."""
    home_team: str
    away_team: str
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Decimal


class ScrapePreviewTicket(BaseModel):
    """Jeden tiket pro náhled importu (frontend zobrazí a po úpravě uloží)."""
    home_team: str
    away_team: str
    sport_id: int
    sport_name: str
    market_label: Optional[str] = None
    selection: Optional[str] = None
    odds: Decimal
    stake: Decimal
    payout: Optional[Decimal] = None
    status: str
    bookmaker_id: int
    ticket_type: str = "solo"
    event_date: Optional[str] = None  # ISO string pro JSON
    is_live: bool = False
    legs: Optional[List[ScrapePreviewLeg]] = None  # AKU: nohy pro vytvoření dětí po uložení
    tipsport_key: Optional[str] = None  # pro extension: spárování s raw tiketem při ukládání z strip


class TipsportScrapePreviewResponse(BaseModel):
    preview_id: str
    new_tickets: List[ScrapePreviewTicket]
    skipped_count: int


# ─── Betano Scraper Import ──────────────────────────────────


class BetanoScrapeTicketIn(BaseModel):
    """
    Vstup pro import z browser scrapperu (Betano).
    Struktura podobná TipsportScrapeTicketIn, ale s betano_key.
    """

    home_team: str
    away_team: str
    betano_key: Optional[str] = None            # stabilní Bet ID z Betano (např. 2059418245)
    sport_label: Optional[str] = None           # např. „Hokej“, „Basketbal“
    sport_icon_id: Optional[str] = None         # např. cesta k ikoně /img/ICEH....
    market_label_raw: Optional[str] = None      # např. „Počet gólů“, „Vítěz“
    selection_raw: Optional[str] = None         # např. „Méně než 5.5“
    ticket_type_raw: Optional[str] = None       # např. „SOLO sázka“, „2kombinace“
    status_raw: Optional[str] = None            # např. „Výhry“, „Prohry“, „Cash out“
    stake: Decimal
    payout: Optional[Decimal] = None
    odds: Optional[Decimal] = None
    placed_at: Optional[datetime] = None        # datum/čas podaní tiketu
    event_start_at: Optional[datetime] = None   # čas výkopu / začátku zápasu (ze sidebaru nebo karty); přednost před placed_at pro event_date
    is_live: Optional[bool] = None              # True pokud je tiket označen jako Live na stránce Betano


class BetanoScrapeRequest(BaseModel):
    tickets: List[BetanoScrapeTicketIn]


class BetanoScrapeResultItem(BaseModel):
    index: int
    status: str                 # "created" | "updated" | "skipped" | "error"
    ticket_id: Optional[int] = None
    message: Optional[str] = None


class BetanoScrapeResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: int
    results: List[BetanoScrapeResultItem]


class BetanoScrapePreviewResponse(BaseModel):
    preview_id: str
    new_tickets: List[ScrapePreviewTicket]
    skipped_count: int


# ─── Fortuna Scraper Import ─────────────────────────────────

class FortunaScrapeTicketIn(BaseModel):
    """
    Vstup pro import z browser scrapperu (Fortuna ifortuna.cz).
    Data z betslip history: zápas, vklad, kurz, výhra, status (Solo/Ako), popis sázky.
    """
    home_team: str
    away_team: str
    fortuna_key: Optional[str] = None       # href nebo datetime+teams+stake pro dedupe
    market_label_raw: Optional[str] = None  # typ sázky (před dvojtečkou) nebo null u AKO
    selection_raw: Optional[str] = None      # hodnota (za dvojtečkou), např. "Ano"
    ticket_type_raw: Optional[str] = None   # "Solo" | "Ako"
    status_raw: Optional[str] = None        # "won" | "lost" | "waiting" | "void"
    stake: Decimal
    payout: Optional[Decimal] = None
    odds: Optional[Decimal] = None
    placed_at: Optional[datetime] = None
    event_start_at: Optional[datetime] = None   # čas výkopu; přednost před placed_at pro event_date
    is_live: Optional[bool] = False


class FortunaScrapeRequest(BaseModel):
    tickets: List[FortunaScrapeTicketIn]


class FortunaScrapeResultItem(BaseModel):
    index: int
    status: str
    ticket_id: Optional[int] = None
    message: Optional[str] = None


class FortunaScrapeResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: int
    results: List[FortunaScrapeResultItem]


class FortunaScrapePreviewResponse(BaseModel):
    preview_id: str
    new_tickets: List[ScrapePreviewTicket]
    skipped_count: int


# ─── Analytics ─────────────────────────────────────────────

class AnalyticsKpis(BaseModel):
    """Souhrnné KPI pro zvolené období."""
    tickets_count: int = 0
    won_count: int = 0
    lost_count: int = 0
    void_count: int = 0
    stake_total: Decimal = Decimal("0")
    profit_total: Decimal = Decimal("0")
    roi_percent: float = 0.0
    hitrate_percent: float = 0.0


class AnalyticsSportItem(BaseModel):
    """Agregace podle sportu."""
    sport_id: int
    sport_name: str
    tickets_count: int = 0
    won_count: int = 0
    lost_count: int = 0
    void_count: int = 0
    profit: Decimal = Decimal("0")
    roi_percent: float = 0.0
    hitrate_percent: float = 0.0


class AnalyticsMarketItem(BaseModel):
    """Agregace podle sportu + typu sázky (pro doporučení a grafy)."""
    sport_id: int
    sport_name: str
    market_type_id: Optional[int] = None
    market_type_name: str
    tickets_count: int = 0
    won_count: int = 0
    lost_count: int = 0
    void_count: int = 0
    stake: Decimal = Decimal("0")  # součet vkladů (pro slučování a ROI)
    profit: Decimal = Decimal("0")
    roi_percent: float = 0.0
    hitrate_percent: float = 0.0


class AnalyticsTrendPoint(BaseModel):
    """Bod časové řady profitu."""
    date: str
    profit: Decimal = Decimal("0")
    cumulative_profit: Decimal = Decimal("0")
    bets_count: int = 0


class AnalyticsDayItem(BaseModel):
    """Agregace podle dne v týdnu (0=pondělí … 6=neděle)."""
    day_of_week: int
    day_name: str
    tickets_count: int = 0
    won_count: int = 0
    lost_count: int = 0
    void_count: int = 0
    stake: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")
    roi_percent: float = 0.0
    hitrate_percent: float = 0.0


class AnalyticsSummary(BaseModel):
    """Odpověď endpointu /api/analytics/summary."""
    kpis: AnalyticsKpis
    by_sport: List[AnalyticsSportItem] = []
    by_market: List[AnalyticsMarketItem] = []
    by_day_of_week: List[AnalyticsDayItem] = []
    profit_trend: List[AnalyticsTrendPoint] = []


# ─── Live tracking ───────────────────────────────────────

class LiveLinkIn(BaseModel):
    """Payload od extension z detailu tiketu – propojení tiketu s URL live zápasu."""
    tipsport_key: str  # idu:idb:hash z Tipsportu
    live_match_url: str


class LiveTicketStateIn(BaseModel):
    """Payload od extension při odeslání scraped stavu live zápasu."""
    ticket_id: Optional[int] = None
    tipsport_match_id: Optional[str] = None
    live_match_url: Optional[str] = None
    scraped: Optional[dict] = None  # scoreText, fullText, etc.
