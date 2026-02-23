import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, DateTime,
    ForeignKey, Enum, Text, JSON, Table
)
from sqlalchemy.orm import relationship
from app.database import Base


# ─── Enums ───────────────────────────────────────────────

class TicketStatus(str, enum.Enum):
    open = "open"
    won = "won"
    lost = "lost"
    void = "void"
    half_win = "half_win"
    half_loss = "half_loss"


class TicketType(str, enum.Enum):
    solo = "solo"
    aku = "aku"
    system = "system"


class TicketSource(str, enum.Enum):
    manual = "manual"
    ocr = "ocr"


# ─── Lookup Tables ──────────────────────────────────────

class Bookmaker(Base):
    __tablename__ = "bookmakers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    currency = Column(String(10), default="CZK")

    tickets = relationship("Ticket", back_populates="bookmaker")


class Sport(Base):
    __tablename__ = "sports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    icon = Column(String(10), nullable=True)  # emoji

    leagues = relationship("League", back_populates="sport")
    tickets = relationship("Ticket", back_populates="sport")


class League(Base):
    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True, index=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    name = Column(String(200), nullable=False)
    country = Column(String(100), nullable=True)

    sport = relationship("Sport", back_populates="leagues")
    tickets = relationship("Ticket", back_populates="league")


# Association table for Market Types and Sports
market_type_sports = Table(
    "market_type_sports",
    Base.metadata,
    Column("market_type_id", Integer, ForeignKey("market_types.id"), primary_key=True),
    Column("sport_id", Integer, ForeignKey("sports.id"), primary_key=True)
)


class MarketType(Base):
    __tablename__ = "market_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)

    tickets = relationship("Ticket", back_populates="market_type_rel")
    sports = relationship("Sport", secondary=market_type_sports)


# ─── Main Table ──────────────────────────────────────────

class Ticket(Base):
    """
    Zjednodušený model: 1 tiket = 1 sázka (SÓLO).
    Obsahuje jak metadata tiketu, tak detail sázky.
    """
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)

    # Vazby
    bookmaker_id = Column(Integer, ForeignKey("bookmakers.id"), nullable=False)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=True)
    market_type_id = Column(Integer, ForeignKey("market_types.id"), nullable=True)

    # Event
    home_team = Column(String(200), nullable=False)
    away_team = Column(String(200), nullable=False)
    event_date = Column(DateTime, nullable=True)

    # Sázka
    market_label = Column(String(200), nullable=True)      # "Méně než 1.0", "Over 2.5"
    selection = Column(String(200), nullable=True)          # home, draw, over...
    odds = Column(Numeric(8, 2), nullable=False)
    stake = Column(Numeric(10, 2), nullable=False)
    payout = Column(Numeric(10, 2), nullable=True)
    profit = Column(Numeric(10, 2), nullable=True)

    # Metadata
    status = Column(Enum(TicketStatus), default=TicketStatus.open, nullable=False)
    ticket_type = Column(Enum(TicketType), default=TicketType.solo, nullable=False)
    is_live = Column(Boolean, default=False)
    source = Column(Enum(TicketSource), default=TicketSource.manual, nullable=False)
    ocr_image_path = Column(String(500), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    settled_at = Column(DateTime, nullable=True)

    # Relationships
    bookmaker = relationship("Bookmaker", back_populates="tickets")
    sport = relationship("Sport", back_populates="tickets")
    league = relationship("League", back_populates="tickets")
    market_type_rel = relationship("MarketType", back_populates="tickets")


# ─── AI Analyses ─────────────────────────────────────────

class AiAnalysis(Base):
    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    context = Column(JSON, nullable=True)         # použité filtry
    aggregates = Column(JSON, nullable=True)       # co se poslalo modelu
    model_name = Column(String(100), nullable=True)
    response_text = Column(Text, nullable=True)
