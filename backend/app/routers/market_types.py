from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text

from app.database import get_db
from app.models.models import MarketType, Ticket, TicketStatus, Sport
from app.schemas.schemas import MarketTypeCreate, MarketTypeUpdate, MarketTypeOut, MarketTypeStat

router = APIRouter(prefix="/api/market-types", tags=["Typy sázek"])

@router.get("", response_model=List[MarketTypeOut])
def list_market_types(db: Session = Depends(get_db)):
    """Seznam všech aktivních typů sázek."""
    return db.query(MarketType).options(joinedload(MarketType.sports)).filter(MarketType.is_active == True).order_by(MarketType.name).all()

@router.get("/stats", response_model=List[MarketTypeStat])
def get_market_type_stats(db: Session = Depends(get_db)):
    """Seznam typů sázek s jejich statistikami (Win %, Profit)."""
    # Tento endpoint agreguje data z tabulky tickets
    results = []
    market_types = db.query(MarketType).all()
    
    for mt in market_types:
        tickets = db.query(Ticket).filter(Ticket.market_type_id == mt.id).all()
        bets_count = len(tickets)
        if bets_count == 0:
            results.append(MarketTypeStat(
                **mt.__dict__,
                bets_count=0,
                win_rate=0.0,
                profit=0.0
            ))
            continue
            
        wins = len([t for t in tickets if t.status == TicketStatus.won])
        half_wins = len([t for t in tickets if t.status == TicketStatus.half_win])
        
        # Win rate (poloviční výhra se počítá jako částečný úspěch? Zjednodušíme na (výhry + 0.5*half_wins) / celkem)
        win_rate = ((wins + (0.5 * half_wins)) / bets_count) * 100
        profit = sum([float(t.profit or 0) for t in tickets])
        
        stat = MarketTypeStat(
            id=mt.id,
            name=mt.name,
            description=mt.description,
            is_active=mt.is_active,
            bets_count=bets_count,
            win_rate=round(win_rate, 2),
            profit=round(profit, 2)
        )
        results.append(stat)
        
    return sorted(results, key=lambda x: x.bets_count, reverse=True)

@router.get("/top", response_model=List[MarketTypeOut])
def get_top_market_types(limit: int = 5, sport_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Vrátí X nejpoužívanějších typů sázek pro našeptávač, volitelně filtrované podle sportu."""
    query = db.query(
        Ticket.market_type_id, 
        func.count(Ticket.id).label('count')
    ).filter(Ticket.market_type_id != None)
    
    if sport_id:
        query = query.filter(Ticket.sport_id == sport_id)
        
    top_ids = query.group_by(Ticket.market_type_id).order_by(text('count DESC')).limit(limit).all()
    
    if not top_ids:
        # Fallback na abecední pokud nejsou data, filtrované podle sportu pokud je zadán
        fallback_query = db.query(MarketType).filter(MarketType.is_active == True)
        if sport_id:
            fallback_query = fallback_query.join(MarketType.sports).filter(Sport.id == sport_id)
        return fallback_query.limit(limit).all()
        
    ids = [t[0] for t in top_ids]
    return db.query(MarketType).filter(MarketType.id.in_(ids)).all()


@router.post("", response_model=MarketTypeOut)
def create_market_type(data: MarketTypeCreate, db: Session = Depends(get_db)):
    """Vytvořit nový typ sázky."""
    existing = db.query(MarketType).filter(MarketType.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tento typ sázky již existuje")
    
    # Create the market type without sport_ids
    mt_data = data.model_dump(exclude={"sport_ids"})
    mt = MarketType(**mt_data)
    
    # Handle sports association
    if data.sport_ids:
        sports = db.query(Sport).filter(Sport.id.in_(data.sport_ids)).all()
        mt.sports = sports
    else:
        # If no sports specified, default to all sports
        all_sports = db.query(Sport).all()
        mt.sports = all_sports
        
    db.add(mt)
    db.commit()
    db.refresh(mt)
    return mt

@router.put("/{mt_id}", response_model=MarketTypeOut)
def update_market_type(mt_id: int, data: MarketTypeUpdate, db: Session = Depends(get_db)):
    """Upravit typ sázky."""
    mt = db.query(MarketType).filter(MarketType.id == mt_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Typ sázky nenalezen")
        
    update_data = data.model_dump(exclude_unset=True, exclude={"sport_ids"})
    for key, value in update_data.items():
        setattr(mt, key, value)
        
    # Handle sports updates
    if data.sport_ids is not None:
        if data.sport_ids:
            sports = db.query(Sport).filter(Sport.id.in_(data.sport_ids)).all()
            mt.sports = sports
        else:
            # If explicit empty list, assign to all sports (default behavior)
            all_sports = db.query(Sport).all()
            mt.sports = all_sports
            
    db.commit()
    db.refresh(mt)
    return mt

@router.delete("/{mt_id}")
def delete_market_type(mt_id: int, db: Session = Depends(get_db)):
    """Smazat typ sázky (pokud nemá přiřazené tikety, jinak jen deaktivovat)."""
    mt = db.query(MarketType).filter(MarketType.id == mt_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Typ sázky nenalezen")
        
    has_tickets = db.query(Ticket).filter(Ticket.market_type_id == mt_id).first()
    if has_tickets:
        mt.is_active = False
        db.commit()
        return {"detail": "Typ sázky má přiřazené tikety, byl pouze deaktivován"}
        
    db.delete(mt)
    db.commit()
    return {"detail": "Typ sázky smazán"}
