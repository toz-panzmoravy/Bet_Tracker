from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Sport, League, Bookmaker
from app.schemas import SportOut, LeagueOut, BookmakerOut

router = APIRouter(prefix="/api/meta", tags=["Metadata"])


@router.get("/sports", response_model=List[SportOut])
def list_sports(db: Session = Depends(get_db)):
    return db.query(Sport).order_by(Sport.name).all()


@router.get("/leagues", response_model=List[LeagueOut])
def list_leagues(sport_id: int = None, db: Session = Depends(get_db)):
    query = db.query(League)
    if sport_id:
        query = query.filter(League.sport_id == sport_id)
    return query.order_by(League.name).all()


@router.get("/bookmakers", response_model=List[BookmakerOut])
def list_bookmakers(db: Session = Depends(get_db)):
    return db.query(Bookmaker).order_by(Bookmaker.name).all()
